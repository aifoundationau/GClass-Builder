"""
AI course agent.

Three jobs:
1. Build: turn pasted text or uploaded files into a course plan, revise it with
   the teacher, then create the course in Classroom.
2. Edit: read an existing Classroom course and propose reviewable changes. Nothing
   is changed until the teacher approves the proposal.
3. Link: attach NotebookLM notebooks at course or unit level.

All AI calls use the low-cost model in ai_model_router. Edits are limited to
patch operations on an allowlist of fields. Deletions are never proposed.
"""

import io
import os
import re
import csv
import json
import tempfile
import zipfile
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse
from xml.etree import ElementTree

import classroom_api
from ai_model_router import get_gemini_client
from standards import guidance_for

from classroom_course_engine import NOTEBOOK_HOSTS, NOTEBOOK_HOSTS_TEXT, parse_due_datetime
MAX_SOURCE_CHARS = 60000

# Fields the AI may change on each resource. Anything else is rejected.
EDITABLE_FIELDS: Dict[str, frozenset] = {
    "courses": frozenset({"name", "section", "subject", "descriptionHeading", "description", "room"}),
    "courses.topics": frozenset({"name"}),
    "courses.announcements": frozenset({"text"}),
    "courses.courseWork": frozenset({"title", "description", "maxPoints", "dueDate", "dueTime"}),
    "courses.courseWorkMaterials": frozenset({"title", "description"}),
}


class AgentError(Exception):
    """A user-facing error from the course agent."""


# ---------------------------------------------------------------------------
# 1. Reading source material
# ---------------------------------------------------------------------------

def _docx_text(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        xml = z.read("word/document.xml")
    root = ElementTree.fromstring(xml)
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs = []
    for p in root.iter(f"{{{ns['w']}}}p"):
        runs = [t.text or "" for t in p.iter(f"{{{ns['w']}}}t")]
        paragraphs.append("".join(runs))
    return "\n".join(paragraphs)


def _pdf_text(data: bytes) -> str:
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def _sheet_text(data: bytes, filename: str) -> str:
    import pandas as pd
    if filename.lower().endswith(".csv"):
        return pd.read_csv(io.BytesIO(data)).to_csv(index=False)
    sheets = pd.read_excel(io.BytesIO(data), sheet_name=None)
    parts = []
    for name, frame in sheets.items():
        parts.append(f"## Sheet: {name}\n{frame.to_csv(index=False)}")
    return "\n\n".join(parts)


def extract_source_text(filename: str, data: bytes) -> str:
    """Return plain text from a supported upload."""
    lower = filename.lower()
    if lower.endswith((".txt", ".md")):
        return data.decode("utf-8", errors="replace")
    if lower.endswith(".docx"):
        return _docx_text(data)
    if lower.endswith(".pdf"):
        return _pdf_text(data)
    if lower.endswith((".csv", ".xlsx", ".xlsm")):
        return _sheet_text(data, filename)
    raise AgentError(f"Unsupported file type for '{filename}'. Use .txt, .md, .docx, .pdf, .csv, or .xlsx.")


def combine_sources(pasted_text: str, files: List[Tuple[str, bytes]]) -> str:
    """Join pasted text and uploaded files into one source block, capped to a safe size."""
    chunks = []
    if pasted_text and pasted_text.strip():
        chunks.append("## Pasted content\n" + pasted_text.strip())
    for filename, data in files:
        chunks.append(f"## File: {filename}\n" + extract_source_text(filename, data).strip())
    combined = "\n\n".join(chunks)
    return combined[:MAX_SOURCE_CHARS]


# ---------------------------------------------------------------------------
# NotebookLM links
# ---------------------------------------------------------------------------

def validate_notebook_url(url: Optional[str]) -> Optional[str]:
    """Accept only https links to a NotebookLM / Gemini notebook. Returns the cleaned URL or None."""
    if not url or not str(url).strip():
        return None
    cleaned = str(url).strip()
    parsed = urlparse(cleaned)
    if parsed.scheme != "https" or parsed.hostname not in NOTEBOOK_HOSTS:
        raise AgentError(f"'{cleaned}' is not a notebook link. It must start with {NOTEBOOK_HOSTS_TEXT}")
    return cleaned


# ---------------------------------------------------------------------------
# 2. Building a new course
# ---------------------------------------------------------------------------

PLAN_SCHEMA_HINT = """
Return ONLY JSON with this shape:
{
  "course": {"name": str, "section": str, "room": str, "description": str,
             "notebook_url": str|null},
  "units": [
    {"title": str, "overview": str, "notebook_url": str|null,
     "outcomes": [str],
     "lessons": [{"title": str, "url": str|null}],
     "assessments": [{"title": str, "instructions": str, "question": str,
                      "question_type": "SHORT_ANSWER_QUESTION"|"MULTIPLE_CHOICE_QUESTION",
                      "choices": [str],
                      "points": int, "due_date": "YYYY-MM-DD"|null}]}
  ]
}
Rules:
- Keep the teacher's own wording where the source has it. Do not invent facts.
- Every unit has at least one assessment.
- due_date is an ISO 8601 date (YYYY-MM-DD), or null if the teacher gave no date.
- A MULTIPLE_CHOICE_QUESTION lists at least 2 answer options in "choices". Otherwise use
  SHORT_ANSWER_QUESTION with an empty "choices" list.
- Use null for any link you do not have. Never make up URLs.
- Unit notebook_url and course notebook_url are only filled if the teacher gave a NotebookLM link.
"""


def _plan_prompt(source_text: str, instructions: str, standards_keys: List[str]) -> str:
    parts = [
        "You are an instructional designer building a course for a teacher to publish to Google Classroom.",
        PLAN_SCHEMA_HINT,
    ]
    guidance = guidance_for(standards_keys)
    if guidance:
        parts.append(guidance)
    if instructions and instructions.strip():
        parts.append("Teacher's instructions:\n" + instructions.strip())
    parts.append("SOURCE MATERIAL:\n" + source_text)
    return "\n\n".join(parts)


INTAKE_SCHEMA_HINT = """
Return ONLY JSON with this shape:
{"summary": str,
 "documents": [{"name": str, "kind": str, "destination": str}],
 "questions": [str]}
- documents: one entry per file or pasted section. kind is what it is (syllabus, lesson notes, assessment, slides, roster, other).
  destination is where it should go: a new unit, an existing unit or item title, an assessment, the course description, or 'ignore'.
- questions: 1 to 4 short questions for the teacher about how to sort or filter the information, for example
  which sections to leave out, which year or class it applies to, or whether to replace or add to existing items.
  Return an empty list if nothing is unclear.
"""


def intake_sources(source_text: str, mode: str, course_snapshot: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Read uploaded material and describe where it should go, with questions for the teacher."""
    if not source_text.strip():
        raise AgentError("Upload a document or paste some content first.")
    if mode == "create":
        target = "Build a new course from this material."
    else:
        snap = course_snapshot or {"course": {}, "topics": [], "courseWork": [], "courseWorkMaterials": [], "announcements": []}
        target = "Edit an existing course with this material. Current course items:\n" + _snapshot_for_prompt(snap)
    prompt = "\n\n".join([
        "You are a course assistant helping a teacher sort material before anything is changed.",
        INTAKE_SCHEMA_HINT,
        target,
        "MATERIAL:\n" + source_text,
    ])
    result = get_gemini_client().generate_json(prompt)
    return {
        "summary": result.get("summary", ""),
        "documents": result.get("documents", []),
        "questions": [q for q in result.get("questions", []) if isinstance(q, str) and q.strip()][:4],
    }


def draft_plan(source_text: str, instructions: str = "", standards_keys: Optional[List[str]] = None) -> Dict[str, Any]:
    """Create a course plan from source material."""
    if not source_text.strip():
        raise AgentError("No source material was provided.")
    prompt = _plan_prompt(source_text, instructions, standards_keys or [])
    plan = get_gemini_client().generate_json(prompt)
    return _normalise_plan(plan)


def revise_plan(plan: Dict[str, Any], teacher_request: str, standards_keys: Optional[List[str]] = None) -> Dict[str, Any]:
    """Apply the teacher's requested change to an existing plan."""
    if not teacher_request.strip():
        raise AgentError("Describe the change you want.")
    guidance = guidance_for(standards_keys or [])
    prompt = "\n\n".join([
        "You are revising a course plan for a teacher. Make only the change they asked for. Keep everything else the same.",
        PLAN_SCHEMA_HINT,
        guidance,
        "CURRENT PLAN:\n" + json.dumps(plan, ensure_ascii=False, indent=2),
        "TEACHER'S REQUEST:\n" + teacher_request.strip(),
    ])
    return _normalise_plan(get_gemini_client().generate_json(prompt))


def _normalise_plan(plan: Dict[str, Any]) -> Dict[str, Any]:
    """Fill defaults and check the links so the rest of the code can rely on the shape."""
    if not isinstance(plan, dict) or not isinstance(plan.get("units"), list) or not plan["units"]:
        raise AgentError("The AI did not return a course plan with units. Try again with more detail.")
    course = plan.get("course") or {}
    course.setdefault("name", "Untitled course")
    course["notebook_url"] = validate_notebook_url(course.get("notebook_url"))
    units = []
    for i, unit in enumerate(plan["units"]):
        unit.setdefault("title", f"Unit {i + 1}")
        unit.setdefault("overview", "")
        unit.setdefault("outcomes", [])
        unit.setdefault("lessons", [])
        unit.setdefault("assessments", [])
        unit["notebook_url"] = validate_notebook_url(unit.get("notebook_url"))
        for assessment in unit["assessments"]:
            if isinstance(assessment, dict):
                _normalise_assessment(assessment)
        units.append(unit)
    return {"course": course, "units": units}


def _normalise_assessment(assessment: Dict[str, Any]) -> None:
    """
    The AI's output is not trusted to be well formed, so the build cannot fail on it:
    a due date that is not ISO 8601 is dropped, and a multiple-choice question without
    2 choices becomes short answer. The teacher sees the result in the plan before building.
    """
    try:
        if parse_due_datetime(assessment.get("due_date")) is None:
            assessment["due_date"] = None
    except ValueError:
        assessment["due_date"] = None
    choices = [str(c).strip() for c in (assessment.get("choices") or []) if str(c).strip()]
    if assessment.get("question_type") == "MULTIPLE_CHOICE_QUESTION" and len(choices) < 2:
        assessment["question_type"] = "SHORT_ANSWER_QUESTION"
        choices = []
    assessment["choices"] = choices


def plan_to_curriculum(plan: Dict[str, Any]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Convert a plan into the settings and curriculum rows the existing engine reads."""
    course = plan["course"]
    settings = {
        "class_name": course.get("name", "Untitled course"),
        "section": course.get("section", ""),
        "room": course.get("room", ""),
        "description": course.get("description", ""),
    }
    curriculum = []
    for i, unit in enumerate(plan["units"]):
        seq = f"Week {i + 1}"
        assessment = (unit.get("assessments") or [{}])[0]
        # Lecture links: the unit's NotebookLM notebook, then any lesson links.
        links = [unit["notebook_url"]] if unit.get("notebook_url") else []
        links += [les["url"] for les in unit.get("lessons", []) if les.get("url")]
        overview = unit.get("overview", "")
        if unit.get("outcomes"):
            overview += "\n\nOutcomes:\n- " + "\n- ".join(unit["outcomes"])
        curriculum.append({
            "sequence": seq,
            "stream_topic": f"{seq}: {unit.get('title', '')}",
            "title": unit.get("title", ""),
            "overview": overview.strip(),
            "presentation_urls": links,
            "assignment_title": assessment.get("title", ""),
            "assignment_instructions": assessment.get("instructions", ""),
            "question_prompt": assessment.get("question", ""),
            "question_type": assessment.get("question_type", "SHORT_ANSWER_QUESTION"),
            "question_choices": assessment.get("choices") or [],
            "points": assessment.get("points", 100),
            "due_date": assessment.get("due_date") or "",
        })
    return settings, curriculum


def write_course_workbook(settings: Dict[str, Any], curriculum: List[Dict[str, Any]],
                          students: Optional[List[Any]], path: str) -> str:
    """Write the workbook the create/sync engine reads, with the same columns as the web app."""
    import classroom_course_engine

    return classroom_course_engine.write_course_workbook(settings, curriculum, students, path)


def build_course(service: Any, plan: Dict[str, Any], students: Optional[List[Any]] = None) -> Dict[str, Any]:
    """Create the course in Classroom from a finished plan, as the signed-in teacher."""
    from classroom_course_engine import create_and_populate_course

    settings, curriculum = plan_to_curriculum(plan)
    fd, path = tempfile.mkstemp(suffix=".xlsx")
    os.close(fd)
    try:
        write_course_workbook(settings, curriculum, students, path)
        return create_and_populate_course(service, path, verbose=True)
    finally:
        if os.path.exists(path):
            os.remove(path)


# ---------------------------------------------------------------------------
# 3. Editing an existing course
# ---------------------------------------------------------------------------

# Rubrics are read for at most this many assignments per snapshot, to bound the API calls.
MAX_RUBRIC_ASSIGNMENTS = 25


def _read_rubrics(service: Any, course_id: str, work: List[Dict[str, Any]]
                  ) -> Tuple[Dict[str, List[Dict[str, Any]]], bool, Dict[str, str]]:
    """
    Rubrics for each assignment, keyed by courseWork id.

    Returns (rubrics, capped, errors). A failed read for one assignment is recorded in errors
    and left out of rubrics (not stored as an empty list), so it is never mistaken for "no rubric".
    """
    rubrics: Dict[str, List[Dict[str, Any]]] = {}
    errors: Dict[str, str] = {}
    assignments = [w for w in work if w.get("id")]
    for w in assignments[:MAX_RUBRIC_ASSIGNMENTS]:
        work_id = str(w["id"])
        try:
            rubrics[work_id] = classroom_api.list_all(service, "courses.courseWork.rubrics", "rubrics",
                                                      {"courseId": course_id, "courseWorkId": work_id})
        except Exception as exc:  # one assignment's rubric read must not fail the whole snapshot
            errors[work_id] = str(exc) or type(exc).__name__
    return rubrics, len(assignments) > MAX_RUBRIC_ASSIGNMENTS, errors


def read_course_snapshot(service: Any, course_id: str) -> Dict[str, Any]:
    """
    Fetch the parts of a course the AI may need to edit.

    "rubrics" maps each courseWork id to its rubrics. "rubricsCapped" is True when the course
    has more than MAX_RUBRIC_ASSIGNMENTS assignments and only the first ones were read.
    "rubricErrors" maps a courseWork id to the error when its rubric could not be read.
    """
    course = classroom_api.call(service, "courses", "get", {"id": course_id})
    topics = classroom_api.list_all(service, "courses.topics", "topic", {"courseId": course_id})
    work = classroom_api.list_all(service, "courses.courseWork", "courseWork", {"courseId": course_id})
    materials = classroom_api.list_all(service, "courses.courseWorkMaterials", "courseWorkMaterial", {"courseId": course_id})
    announcements = classroom_api.list_all(service, "courses.announcements", "announcements", {"courseId": course_id})
    teachers = classroom_api.list_all(service, "courses.teachers", "teachers", {"courseId": course_id})
    students = classroom_api.list_all(service, "courses.students", "students", {"courseId": course_id})
    rubrics, capped, rubric_errors = _read_rubrics(service, course_id, work)
    return {"course": course, "topics": topics, "courseWork": work,
            "courseWorkMaterials": materials, "announcements": announcements,
            "teachers": teachers, "students": students,
            "rubrics": rubrics, "rubricsCapped": capped, "rubricErrors": rubric_errors}


def _snapshot_for_prompt(snapshot: Dict[str, Any]) -> str:
    keep = {
        "course": {k: snapshot["course"].get(k) for k in ("id", "name", "section", "room", "description", "descriptionHeading")},
        "topics": [{"id": t.get("topicId"), "name": t.get("name")} for t in snapshot["topics"]],
        "courseWork": [{"id": w.get("id"), "title": w.get("title"), "description": (w.get("description") or "")[:800],
                        "maxPoints": w.get("maxPoints"), "topicId": w.get("topicId")} for w in snapshot["courseWork"]],
        "courseWorkMaterials": [{"id": m.get("id"), "title": m.get("title"),
                                 "description": (m.get("description") or "")[:800], "topicId": m.get("topicId")}
                                for m in snapshot["courseWorkMaterials"]],
        "announcements": [{"id": a.get("id"), "text": (a.get("text") or "")[:800]} for a in snapshot["announcements"]],
    }
    return json.dumps(keep, ensure_ascii=False, indent=2)


EDIT_SCHEMA_HINT = """
Return ONLY JSON with this shape:
{"summary": str,
 "operations": [
   {"resource": "courses"|"courses.topics"|"courses.announcements"|"courses.courseWork"|"courses.courseWorkMaterials",
    "id": str, "reason": str,
    "fields": {<only the fields you change>}}
 ]}
Rules:
- Only change items that exist in the snapshot. Use their ids exactly.
- You may only change these fields: course: name, section, descriptionHeading, description, room;
  topic: name; announcement: text; courseWork: title, description, maxPoints, dueDate, dueTime;
  material: title, description.
- Do not add, remove, publish, or grade anything. Do not change due dates unless the teacher asked.
- Keep changes minimal and keep the teacher's wording unless they asked otherwise.
- If the request cannot be done with these fields, return an empty operations list and say why in summary.
"""


def propose_edit(service: Any, course_id: str, teacher_request: str,
                 standards_keys: Optional[List[str]] = None, extra_context: str = "") -> Dict[str, Any]:
    """Return a proposal of changes. Nothing is written to Classroom."""
    if not teacher_request.strip():
        raise AgentError("Describe the change you want to make.")
    snapshot = read_course_snapshot(service, course_id)
    parts = [
        "You are editing an existing Google Classroom course for a teacher. Propose the smallest set of changes that meets the request.",
        EDIT_SCHEMA_HINT,
        guidance_for(standards_keys or []),
        "COURSE SNAPSHOT:\n" + _snapshot_for_prompt(snapshot),
    ]
    if extra_context.strip():
        parts.append("UPLOADED MATERIAL AND TEACHER'S SORTING ANSWERS:\n" + extra_context.strip()[:MAX_SOURCE_CHARS])
    parts.append("TEACHER'S REQUEST:\n" + teacher_request.strip())
    prompt = "\n\n".join(p for p in parts if p)
    raw = get_gemini_client().generate_json(prompt)
    operations = validate_operations(raw.get("operations", []), snapshot, course_id)
    return {"summary": raw.get("summary", ""), "operations": operations, "courseId": course_id}


def validate_operations(ops: List[Dict[str, Any]], snapshot: Dict[str, Any], course_id: str) -> List[Dict[str, Any]]:
    """Keep only operations that target real items and touch allowed fields. Returns the cleaned list."""
    known = {
        "courses": {course_id},
        "courses.topics": {t.get("topicId") for t in snapshot["topics"]},
        "courses.announcements": {a.get("id") for a in snapshot["announcements"]},
        "courses.courseWork": {w.get("id") for w in snapshot["courseWork"]},
        "courses.courseWorkMaterials": {m.get("id") for m in snapshot["courseWorkMaterials"]},
    }
    cleaned = []
    for op in ops or []:
        resource = op.get("resource")
        item_id = str(op.get("id", ""))
        fields = op.get("fields") or {}
        if resource not in EDITABLE_FIELDS or item_id not in {str(x) for x in known.get(resource, set())}:
            continue
        allowed = {k: v for k, v in fields.items() if k in EDITABLE_FIELDS[resource] and v not in (None, "")}
        if not allowed:
            continue
        cleaned.append({"resource": resource, "id": item_id, "reason": op.get("reason", ""),
                        "fields": allowed})
    return cleaned


def apply_operations(service: Any, course_id: str, operations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Apply teacher-approved operations. Each one is a patch with an explicit updateMask."""
    results = []
    for op in operations:
        resource = op["resource"]
        if resource not in EDITABLE_FIELDS:
            raise AgentError(f"Resource '{resource}' cannot be edited by the agent.")
        fields = {k: v for k, v in op["fields"].items() if k in EDITABLE_FIELDS[resource]}
        if not fields:
            continue
        params: Dict[str, Any] = {"updateMask": ",".join(sorted(fields)), "id": op["id"]}
        if resource != "courses":
            params["courseId"] = course_id
        else:
            params["id"] = course_id
        updated = classroom_api.call(service, resource, "patch", params, body=fields)
        results.append({"resource": resource, "id": op["id"], "ok": True, "updated": updated.get("id", op["id"])})
    return results


def link_notebook(service: Any, course_id: str, notebook_url: str, title: str = "NotebookLM notebook",
                  topic_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Attach a NotebookLM notebook to a course as a course material.

    Every course material must sit in a topic of the same course, so topic_id is required
    and must name a topic of course_id.
    """
    url = validate_notebook_url(notebook_url)
    if not url:
        raise AgentError("Provide a NotebookLM link.")
    if not str(topic_id or "").strip():
        raise AgentError("Choose a topic for the notebook link.")
    topic_id = str(topic_id).strip()
    # Reading the topic first confirms it belongs to this course.
    classroom_api.call(service, "courses.topics", "get", {"courseId": course_id, "id": topic_id})
    body = {
        "title": title,
        "description": "Source notebook for this course (NotebookLM).",
        "materials": [{"link": {"url": url, "title": title}}],
        "state": "PUBLISHED",
        "topicId": topic_id,
    }
    return classroom_api.call(service, "courses.courseWorkMaterials", "create", {"courseId": course_id}, body=body)


# ---------------------------------------------------------------------------
# 4. Chat: the agent helps at every step, from outline to assessments
# ---------------------------------------------------------------------------

CHAT_SYSTEM = (
    "You are the AI Course Agent for teachers who build and edit Google Classroom courses. "
    "Write and improve course text: outlines, unit overviews, lesson notes, learning outcomes, "
    "assignments, quiz questions with answers, rubrics, and announcements. "
    "Work from the teacher's material and do not invent facts or links. "
    "When material is attached, first say briefly what each file contains and where it should go, "
    "then ask how to sort or filter it if that is unclear. Ask at most two short questions at a time. "
    "Keep replies practical and well structured, with short headings or lists."
)


def chat_reply(messages: List[Dict[str, str]], mode: str, course_summary: Optional[str] = None,
               attachments: Optional[List[Dict[str, str]]] = None, plan: Optional[Dict[str, Any]] = None,
               standards_keys: Optional[List[str]] = None, step_context: Optional[str] = None) -> str:
    """Return the agent's next message for a conversation with the teacher.

    step_context names the course-developer step the teacher is working on. It is
    added to the prompt so replies stay on that step.
    """
    if not messages or messages[-1].get("role") != "user":
        raise AgentError("Send a message first.")
    parts = [CHAT_SYSTEM,
             "You are editing an existing Google Classroom course." if mode == "edit"
             else "The teacher is building a new course."]
    if step_context and step_context.strip():
        parts.append("CURRENT STEP (keep the reply focused on this part of the course):\n"
                     + step_context.strip()[:2000])
    if course_summary:
        parts.append("CURRENT COURSE:\n" + course_summary)
    if plan:
        parts.append("CURRENT COURSE PLAN:\n" + json.dumps(plan, ensure_ascii=False)[:20000])
    guidance = guidance_for(standards_keys or [])
    if guidance:
        parts.append(guidance)
    if attachments:
        material = "\n\n".join(f"## {a.get('name', 'file')}\n{a.get('text', '')}" for a in attachments)
        parts.append("ATTACHED MATERIAL:\n" + material[:MAX_SOURCE_CHARS])
    transcript = "\n\n".join(
        f"{'Teacher' if m.get('role') == 'user' else 'Agent'}: {m.get('content', '')}" for m in messages[-30:]
    )
    parts.append("CONVERSATION:\n" + transcript + "\n\nAgent:")
    return get_gemini_client().generate_text("\n\n".join(parts), temperature=0.5).strip()


def extract_attachments(files: List[Tuple[str, bytes]]) -> List[Dict[str, str]]:
    """Read uploaded files to text. A file that cannot be read is reported, not dropped."""
    results = []
    for name, data in files:
        try:
            text = extract_source_text(name, data).strip()
        except Exception as exc:
            text = f"(could not read this file: {exc})"
        results.append({"name": name, "text": text[:MAX_SOURCE_CHARS]})
    return results
