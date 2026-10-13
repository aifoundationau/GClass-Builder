"""
Course developer engine.

Reads a Google Classroom course step by step, asks Gemini for a plan of changes,
checks every change against a strict rule set, and applies only the approved
changes. Deletions are never possible: every call goes through
classroom_api.call, which refuses delete methods.

Rules enforced by validate_operations (applied to AI output and to apply requests):
  - resource and method must be on the Classroom allowlist, and never delete
  - only create and patch are supported; read and reply methods are refused
  - add-on resources are refused (this app does not register a Classroom add-on)
  - resource must belong to the step, when a step is given
  - path ids are set from the request, and courseId is always the requested course
  - body keys outside BODY_FIELDS are dropped
  - courseWork, courseWorkMaterials and announcements are created as DRAFT unless
    the teacher ticked Publish on that one operation (the "publish" flag)
  - state DELETED is never sent
  - patch operations carry updateMask listing the body keys they change
  - patch on description, announcement text or materials merges with the current item
    at apply time, so existing text and materials are kept
  - courseWork and courseWorkMaterials must carry a topicId of a topic in the same course;
    a create without topicId is refused, and an unknown topicId is refused at apply time
  - announcements never carry topicId (it is stripped from body and params)
  - rubrics belong to one assignment: courses.courseWork.rubrics create and patch need a
    courseWorkId naming an assignment of the course; rubric fields are refused elsewhere
  - email addresses, photo URLs and guardian contact data are never sent to the model
"""

import json
import re
from typing import Any, Dict, FrozenSet, List, Optional, Tuple

import ai_model_router
import classroom_api
from standards import guidance_for

WRITE_METHODS = frozenset({"create", "patch"})

# Resources whose create/patch can carry a publish state.
PUBLISHABLE_RESOURCES = frozenset({
    "courses.courseWork",
    "courses.courseWorkMaterials",
    "courses.announcements",
})

# Stream items that must sit in a topic of the same course (topicId). A create with no
# topicId is refused. Announcements never carry topicId: Classroom does not accept it there.
TOPIC_RESOURCES = frozenset({"courses.courseWork", "courses.courseWorkMaterials"})

# Rubrics belong to exactly one assignment (courseWorkId). These body keys mark a rubric op.
RUBRIC_RESOURCE = "courses.courseWork.rubrics"
RUBRIC_BODY_FIELDS = frozenset({"criteria", "sourceSpreadsheetId"})

# Resources the placement agent may write to.
PLACEMENT_RESOURCES = frozenset({
    "courses.topics",
    "courses.courseWorkMaterials",
    "courses.announcements",
    "courses.courseWork",
})

# Only these invitation roles can be sent from here. Owner invitations transfer control.
INVITABLE_ROLES = frozenset({"STUDENT", "TEACHER"})

# Course states a patch may set. DECLINED and PROVISIONED are never set from here.
SETTABLE_COURSE_STATES = frozenset({"ACTIVE", "ARCHIVED"})

# Upper bounds to keep reads and prompts within limits.
MAX_NESTED_PARENTS = 50
MAX_CONTEXT_CHARS = 60000

# Contact details that are never sent to the model. Names and ids stay, because the model
# needs them to match a teacher's request to a person.
PRIVATE_FIELDS = frozenset({"emailAddress", "photoUrl", "invitedEmailAddress", "guardianProfile"})

# Patch operations never silently remove existing content. Text is appended to the current
# value, and materials are added to the current list (see _merged_body).
MERGE_TEXT_FIELDS: Dict[str, frozenset] = {
    "courses": frozenset({"description"}),
    "courses.announcements": frozenset({"text"}),
    "courses.courseWork": frozenset({"description"}),
    "courses.courseWorkMaterials": frozenset({"description"}),
}
MERGE_LIST_FIELDS: Dict[str, frozenset] = {
    "courses.announcements": frozenset({"materials"}),
    "courses.courseWork": frozenset({"materials"}),
    "courses.courseWorkMaterials": frozenset({"materials"}),
}

# Body fields the AI may set, per resource. Field names follow the Classroom v1 schemas.
BODY_FIELDS: Dict[str, frozenset] = {
    "courses": frozenset({"name", "section", "subject", "descriptionHeading", "description", "room", "courseState"}),
    "courses.aliases": frozenset({"alias"}),
    "courses.announcements": frozenset({"text", "state", "materials", "assigneeMode",
                                        "individualStudentsOptions"}),
    "courses.courseWork": frozenset({"title", "description", "maxPoints", "workType", "topicId",
                                     "dueDate", "dueTime", "state", "materials",
                                     "multipleChoiceQuestion", "assigneeMode",
                                     "individualStudentsOptions"}),
    "courses.courseWork.rubrics": frozenset({"criteria", "sourceSpreadsheetId"}),
    "courses.courseWork.studentSubmissions": frozenset({"assignedGrade", "draftGrade"}),
    "courses.courseWorkMaterials": frozenset({"title", "description", "topicId", "materials",
                                              "state", "assigneeMode", "individualStudentsOptions"}),
    "courses.students": frozenset({"userId"}),
    "courses.teachers": frozenset({"userId"}),
    "courses.topics": frozenset({"name"}),
    "courses.studentGroups": frozenset({"title"}),
    "courses.studentGroups.studentGroupMembers": frozenset({"userId"}),
    "invitations": frozenset({"userId", "courseId", "role"}),
    "userProfiles.guardianInvitations": frozenset({"invitedEmailAddress"}),
}

# Path parameters each write method needs. courseId (or id, for "courses") is always
# set from the request, so it is not listed here. Anything else must come from the AI plan.
PATH_PARAMS: Dict[str, Dict[str, Tuple[str, ...]]] = {
    "courses": {"patch": ("id",)},
    "courses.aliases": {"create": ()},
    "courses.announcements": {"create": (), "patch": ("id",)},
    "courses.courseWork": {"create": (), "patch": ("id",)},
    "courses.courseWork.rubrics": {"create": ("courseWorkId",), "patch": ("courseWorkId", "id")},
    "courses.courseWork.studentSubmissions": {"patch": ("courseWorkId", "id")},
    "courses.courseWorkMaterials": {"create": (), "patch": ("id",)},
    "courses.students": {"create": ()},
    "courses.teachers": {"create": ()},
    "courses.topics": {"create": (), "patch": ("id",)},
    "courses.studentGroups": {"create": (), "patch": ("id",)},
    "courses.studentGroups.studentGroupMembers": {"create": ("studentGroupId",)},
    "invitations": {"create": ()},
    "userProfiles.guardianInvitations": {"create": ("studentId",), "patch": ("studentId", "invitationId")},
}

# List response key for each resource that has a list method used for reads.
LIST_KEYS: Dict[str, str] = {
    "courses.aliases": "aliases",
    "courses.announcements": "announcements",
    "courses.courseWork": "courseWork",
    "courses.courseWork.rubrics": "rubrics",
    "courses.courseWork.studentSubmissions": "studentSubmissions",
    "courses.courseWorkMaterials": "courseWorkMaterial",
    "courses.students": "students",
    "courses.teachers": "teachers",
    "courses.topics": "topic",
    "courses.studentGroups": "studentGroups",
    "courses.studentGroups.studentGroupMembers": "studentGroupMembers",
    "invitations": "invitations",
    "userProfiles.guardians": "guardians",
    "userProfiles.guardianInvitations": "guardianInvitations",
}

# Resources that need a parent item to list. They are read after their parent resource.
NESTED_RESOURCES = frozenset({
    "courses.courseWork.rubrics",
    "courses.courseWork.studentSubmissions",
    "courses.studentGroups.studentGroupMembers",
    "userProfiles.guardians",
    "userProfiles.guardianInvitations",
})

ADDON_STEP_RESOURCES = [
    "courses.announcements.addOnAttachments",
    "courses.courseWork.addOnAttachments",
    "courses.courseWork.addOnAttachments.studentSubmissions",
    "courses.courseWorkMaterials.addOnAttachments",
    "courses.posts",
    "courses.posts.addOnAttachments",
    "courses.posts.addOnAttachments.studentSubmissions",
]

POLICY_TEXT = (
    "This app never deletes Google Classroom data. Deleting topics, work, materials, "
    "announcements, students, teachers, groups, invitations or guardians must be done by "
    "staff in the Google Classroom dashboard (https://classroom.google.com)."
)

# Every resource in classroom_api.ALLOWED_METHODS appears in exactly one step.
# The "policy" step has no resources; its blocked deletes come from BLOCKED_DELETES.
STEPS: List[Dict[str, Any]] = [
    {
        "key": "course",
        "title": "Course details",
        "description": "Course name, section, room and description, and course aliases.",
        "resources": ["courses", "courses.aliases"],
    },
    {
        "key": "topics",
        "title": "Topics",
        "description": "Units or topics that group materials and assignments.",
        "resources": ["courses.topics"],
    },
    {
        "key": "materials",
        "title": "Materials",
        "description": "Course materials such as readings, slides and links.",
        "resources": ["courses.courseWorkMaterials"],
    },
    {
        "key": "announcements",
        "title": "Announcements",
        "description": "Stream announcements to students.",
        "resources": ["courses.announcements"],
    },
    {
        "key": "assignments",
        "title": "Assignments and grading",
        "description": "Assignments, rubrics and student submission grades.",
        "resources": ["courses.courseWork", "courses.courseWork.rubrics",
                      "courses.courseWork.studentSubmissions"],
    },
    {
        "key": "people",
        "title": "People and groups",
        "description": "Students, teachers, student groups, invitations and guardians.",
        "resources": ["courses.students", "courses.teachers", "courses.studentGroups",
                      "courses.studentGroups.studentGroupMembers", "invitations",
                      "userProfiles", "userProfiles.guardians", "userProfiles.guardianInvitations"],
    },
    {
        "key": "notifications",
        "title": "Change notifications",
        "description": "Push notification registrations. Read only in this app.",
        "resources": ["registrations"],
    },
    {
        "key": "addons",
        "title": "Add-on attachments",
        "description": "Attachments from registered Classroom add-ons. Read only in this app, "
                       "because no add-on is registered here.",
        "resources": list(ADDON_STEP_RESOURCES),
    },
    {
        "key": "policy",
        "title": "Deletions and policy",
        "description": POLICY_TEXT,
        "resources": [],
    },
]

_STEP_INDEX: Dict[str, Dict[str, Any]] = {step["key"]: step for step in STEPS}
_STEP_OF_RESOURCE: Dict[str, str] = {
    resource: step["key"] for step in STEPS for resource in step["resources"]
}

SYSTEM_INSTRUCTION = (
    "You are a careful Google Classroom course developer. You plan changes as JSON only. "
    "You never propose deletions. You propose the smallest change that meets the request, "
    "and you never rewrite items that do not need to change."
)


# ---------------------------------------------------------------------------
# Step catalogue
# ---------------------------------------------------------------------------

def _step(step_key: str) -> Dict[str, Any]:
    if step_key not in _STEP_INDEX:
        raise ValueError(f"Unknown step '{step_key}'.")
    return _STEP_INDEX[step_key]


def _allowed(resource: str) -> frozenset:
    return classroom_api.ALLOWED_METHODS.get(resource, frozenset())


def _editable_methods(resource: str) -> List[str]:
    """Methods that this engine may propose for a resource: create and patch, with body fields."""
    if resource in classroom_api.ADDON_RESOURCES or resource not in BODY_FIELDS:
        return []
    methods = []
    for method in sorted(_allowed(resource)):
        if method not in WRITE_METHODS:
            continue
        if resource == "courses" and method != "patch":
            continue
        methods.append(method)
    return methods


def _blocked_deletes_for(resources: List[str]) -> List[Dict[str, str]]:
    blocked = []
    for resource in sorted(classroom_api.BLOCKED_DELETES):
        if resource in resources:
            for method in sorted(classroom_api.BLOCKED_DELETES[resource]):
                blocked.append({"resource": resource, "method": method})
    return blocked


def _all_blocked_deletes() -> List[Dict[str, str]]:
    return [{"resource": resource, "method": method}
            for resource in sorted(classroom_api.BLOCKED_DELETES)
            for method in sorted(classroom_api.BLOCKED_DELETES[resource])]


def list_steps() -> List[Dict[str, Any]]:
    """Return the steps with each resource expanded to its allowed methods."""
    result = []
    for step in STEPS:
        resources = [{"resource": resource, "methods": sorted(_allowed(resource))}
                     for resource in step["resources"]]
        if step["key"] == "policy":
            blocked = _all_blocked_deletes()
        else:
            blocked = _blocked_deletes_for(step["resources"])
        result.append({
            "key": step["key"],
            "title": step["title"],
            "description": step["description"],
            "resources": resources,
            "blocked_deletes": blocked,
            "can_propose": any(_editable_methods(r) for r in step["resources"]),
        })
    return result


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------

def _can_list(resource: str) -> bool:
    return "list" in _allowed(resource) and resource in LIST_KEYS


def _list_nested(service: Any, resource: str, parents: List[Dict[str, Any]],
                 make_params) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for parent in parents[:MAX_NESTED_PARENTS]:
        params = make_params(parent)
        if params is None:
            continue
        items.extend(classroom_api.list_all(service, resource, LIST_KEYS[resource], params))
    return items


def load_step_data(service: Any, course_id: str, step_key: str,
                   nested: bool = True, guardians: bool = True) -> Dict[str, List[Dict[str, Any]]]:
    """
    Read the current Classroom data for one step.

    Returns {resource_name: [items]}. Only get and list methods are used. Add-on
    resources return [] and their endpoints are never called. For the "course" step,
    the "course" key holds the course as a one-item list.

    nested=True also reads items under each parent (rubrics and submissions for each
    assignment, members for each group, guardians for each student), up to
    MAX_NESTED_PARENTS parents per resource. nested=False skips those reads.
    guardians=False skips the guardian and guardian invitation reads, even when nested=True.
    """
    step = _step(step_key)
    cid = str(course_id)
    data: Dict[str, List[Dict[str, Any]]] = {resource: [] for resource in step["resources"]}
    if step_key == "addons":
        return data

    if step_key == "course":
        course = classroom_api.call(service, "courses", "get", {"id": cid})
        data["course"] = [course] if course else []

    # Top-level lists are scoped by courseId (courses.* and invitations).
    for resource in step["resources"]:
        if resource in NESTED_RESOURCES or resource in classroom_api.ADDON_RESOURCES:
            continue
        if _can_list(resource):
            data[resource] = classroom_api.list_all(service, resource, LIST_KEYS[resource],
                                                    {"courseId": cid})

    if not nested:
        return data

    if "courses.courseWork" in data:
        works = data["courses.courseWork"]
        if "courses.courseWork.rubrics" in data and _can_list("courses.courseWork.rubrics"):
            data["courses.courseWork.rubrics"] = _list_nested(
                service, "courses.courseWork.rubrics", works,
                lambda w: {"courseId": cid, "courseWorkId": str(w["id"])} if w.get("id") else None)
        if "courses.courseWork.studentSubmissions" in data and _can_list(
                "courses.courseWork.studentSubmissions"):
            data["courses.courseWork.studentSubmissions"] = _list_nested(
                service, "courses.courseWork.studentSubmissions", works,
                lambda w: {"courseId": cid, "courseWorkId": str(w["id"])} if w.get("id") else None)

    if "courses.studentGroups" in data and "courses.studentGroups.studentGroupMembers" in data:
        if _can_list("courses.studentGroups.studentGroupMembers"):
            data["courses.studentGroups.studentGroupMembers"] = _list_nested(
                service, "courses.studentGroups.studentGroupMembers",
                data["courses.studentGroups"],
                lambda g: {"courseId": cid, "studentGroupId": str(g["id"])} if g.get("id") else None)

    if "courses.students" in data:
        students = data["courses.students"]

        def student_params(s):
            return {"studentId": str(s["userId"])} if s.get("userId") else None

        if guardians and "userProfiles.guardians" in data and _can_list("userProfiles.guardians"):
            data["userProfiles.guardians"] = _list_nested(
                service, "userProfiles.guardians", students, student_params)
        if guardians and "userProfiles.guardianInvitations" in data and _can_list(
                "userProfiles.guardianInvitations"):
            data["userProfiles.guardianInvitations"] = _list_nested(
                service, "userProfiles.guardianInvitations", students, student_params)

    return data


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def _course_id_from_op(op: Any) -> Optional[str]:
    if not isinstance(op, dict):
        return None
    params = op.get("params") if isinstance(op.get("params"), dict) else {}
    body = op.get("body") if isinstance(op.get("body"), dict) else {}
    if op.get("resource") == "courses":
        value = params.get("id")
    else:
        value = params.get("courseId") or body.get("courseId")
    return str(value) if value else None


def _path_params(resource: str, method: str, params: Any,
                 course_id: str) -> Tuple[Optional[Dict[str, str]], Optional[str]]:
    """Build the path params for one write call. Returns (params, error)."""
    needed = PATH_PARAMS.get(resource, {}).get(method)
    if needed is None:
        return None, f"'{resource}.{method}' is not supported by the course developer."
    source = params if isinstance(params, dict) else {}
    if resource == "courses":
        out = {"id": course_id}
    elif resource.startswith("courses."):
        out = {"courseId": course_id}
    else:
        out = {}
    for name in needed:
        if name in out:
            continue
        value = source.get(name)
        if value is None or str(value).strip() == "":
            return None, f"Missing '{name}' for {resource}.{method}."
        out[name] = str(value)
    return out, None


def _rejection(op: Any, reason: str) -> Dict[str, Any]:
    if isinstance(op, dict):
        resource = op.get("resource")
        method = op.get("method")
        proposed = str(op.get("reason") or "")
    else:
        resource, method, proposed = None, None, ""
    step = _STEP_OF_RESOURCE.get(resource) if isinstance(resource, str) else None
    return {"resource": resource, "method": method, "step": step,
            "reason": reason, "proposed_reason": proposed}


def _fetch_known_ids(service: Any, course_id: str) -> Dict[str, FrozenSet[str]]:
    """
    Read the ids that proposed operations may refer to: topic ids and assignment ids of one
    course. Called once per apply or planning run. Raises if Classroom cannot be read, so a
    failed read never lets an unchecked topicId or courseWorkId through.
    """
    cid = str(course_id)
    topics = classroom_api.list_all(service, "courses.topics", LIST_KEYS["courses.topics"], {"courseId": cid})
    works = classroom_api.list_all(service, "courses.courseWork", LIST_KEYS["courses.courseWork"], {"courseId": cid})
    return {
        "topics": frozenset(str(t["topicId"]) for t in topics if t.get("topicId")),
        "works": frozenset(str(w["id"]) for w in works if w.get("id")),
    }


def _validate_one(op: Any, course_id: str, step_key: Optional[str],
                  known_ids: Optional[Dict[str, FrozenSet[str]]] = None) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    if not isinstance(op, dict):
        return None, "Operation is not an object."
    resource = op.get("resource")
    method = op.get("method")
    if not isinstance(resource, str) or not isinstance(method, str):
        return None, "Operation needs a resource and a method."

    if method == "delete":
        return None, ("Deletes are not allowed in this app. Staff must delete items in the "
                      "Google Classroom dashboard.")
    if resource not in classroom_api.ALLOWED_METHODS:
        return None, f"Resource '{resource}' is not part of the Classroom API surface."
    if step_key is not None and resource not in _step(step_key)["resources"]:
        return None, f"Resource '{resource}' is not part of the '{step_key}' step."
    try:
        classroom_api.check_call(resource, method)
    except classroom_api.ClassroomCallError as exc:
        return None, str(exc)

    if resource in classroom_api.ADDON_RESOURCES:
        return None, "Add-on resources need a registered Classroom add-on and cannot be changed here."
    if method not in WRITE_METHODS:
        return None, f"'{resource}.{method}' is not supported here. Only create and patch changes are."
    if method not in _editable_methods(resource):
        return None, f"'{resource}.{method}' cannot be changed here."

    path, error = _path_params(resource, method, op.get("params"), course_id)
    if error:
        return None, error

    raw_body = op.get("body") if isinstance(op.get("body"), dict) else {}
    if resource == "courses.announcements":
        # Classroom rejects topicId on announcements, so it is removed before anything is sent.
        raw_body = {key: value for key, value in raw_body.items() if key != "topicId"}
    if resource != RUBRIC_RESOURCE and RUBRIC_BODY_FIELDS.intersection(raw_body):
        return None, "Rubrics can only be changed on an assignment's rubric (courses.courseWork.rubrics)."
    if resource == RUBRIC_RESOURCE and known_ids is not None and path["courseWorkId"] not in known_ids["works"]:
        return None, f"Assignment '{path['courseWorkId']}' does not exist in this course, so its rubric cannot be changed."
    fields = BODY_FIELDS[resource]
    body = {key: value for key, value in raw_body.items() if key in fields}

    if resource in TOPIC_RESOURCES:
        topic_id = body.get("topicId")
        if "topicId" in body and (not isinstance(topic_id, str) or not topic_id.strip()):
            return None, "topicId must name a topic in this course."
        if topic_id is None and method == "create":
            return None, ("A new assignment or material needs a topic in this course (topicId). "
                          "Create or choose a topic first.")
        if topic_id is not None and known_ids is not None and topic_id not in known_ids["topics"]:
            return None, f"Topic '{topic_id}' does not exist in this course."

    approved = op.get("publish") is True
    if resource in PUBLISHABLE_RESOURCES:
        if method == "create":
            body["state"] = "PUBLISHED" if approved else "DRAFT"
        elif "state" in body and not (approved and body["state"] == "PUBLISHED"):
            del body["state"]
    elif "state" in body:
        del body["state"]

    if resource == "courses" and "courseState" in body and body["courseState"] not in SETTABLE_COURSE_STATES:
        del body["courseState"]

    if resource == "invitations":
        if body.get("role") not in INVITABLE_ROLES:
            return None, "Invitations can only add students or teachers."
        body["courseId"] = course_id

    if not body:
        return None, "No supported fields to change."

    params = dict(path)
    if method == "patch":
        params["updateMask"] = ",".join(sorted(body))

    cleaned: Dict[str, Any] = {
        "resource": resource,
        "method": method,
        "params": params,
        "body": body,
        "reason": str(op.get("reason") or "")[:500],
        "step": _STEP_OF_RESOURCE.get(resource),
        "publish": bool(resource in PUBLISHABLE_RESOURCES and body.get("state") == "PUBLISHED"),
    }
    if isinstance(op.get("source"), str):
        cleaned["source"] = op["source"][:500]
    return cleaned, None


def validate_operations(ops: Any, course_id: str,
                        step_key: Optional[str] = None,
                        known_ids: Optional[Dict[str, FrozenSet[str]]] = None,
                        ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Check proposed operations against the rules. Returns (cleaned, rejected).

    cleaned items: {resource, method, params, body, reason, step, publish}.
    rejected items: {resource, method, step, reason, proposed_reason}.
    The "publish" flag on an input operation is the teacher's Publish tick. Only the
    apply path should carry it; propose_step and propose_placement strip it from AI output.

    known_ids comes from _fetch_known_ids: {"topics": ids, "works": ids} for the course.
    When it is given, a topicId must be a topic of this course and a rubric's courseWorkId
    must be an assignment of this course. When it is None, those existence checks are
    skipped here, and apply_operations runs them against live Classroom data before any write.
    """
    if not course_id:
        raise ValueError("course_id is required.")
    if ops is None:
        ops = []
    if not isinstance(ops, list):
        raise ValueError("operations must be a list.")
    cid = str(course_id)
    cleaned: List[Dict[str, Any]] = []
    rejected: List[Dict[str, Any]] = []
    if step_key is not None and step_key not in _STEP_INDEX:
        for op in ops:
            rejected.append(_rejection(op, f"Unknown step '{step_key}'."))
        return cleaned, rejected
    for op in ops:
        item, reason = _validate_one(op, cid, step_key, known_ids)
        if reason is not None:
            rejected.append(_rejection(op, reason))
        else:
            cleaned.append(item)
    return cleaned, rejected


def _without_publish(op: Any) -> Any:
    if isinstance(op, dict) and "publish" in op:
        op = {k: v for k, v in op.items() if k != "publish"}
    return op


# ---------------------------------------------------------------------------
# AI planning
# ---------------------------------------------------------------------------

def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + "\n[truncated]"


def _prompt_safe(value: Any) -> Any:
    """Copy of Classroom data with contact details and guardian contact data removed."""
    if isinstance(value, dict):
        return {key: _prompt_safe(item) for key, item in value.items() if key not in PRIVATE_FIELDS}
    if isinstance(value, list):
        return [_prompt_safe(item) for item in value]
    return value


def _wants_guardians(request: str) -> bool:
    return bool(re.search(r"guardian|parent|famil", request or "", re.IGNORECASE))


def _resource_brief(resource: str) -> str:
    methods = _editable_methods(resource)
    fields = ", ".join(sorted(BODY_FIELDS[resource]))
    lines = [f"- {resource}: methods {', '.join(methods)}. Body fields: {fields}."]
    for method in methods:
        needed = PATH_PARAMS.get(resource, {}).get(method, ())
        if resource == "courses":
            auto = "id (the course id, set automatically)"
        elif resource.startswith("courses."):
            auto = "courseId (set automatically)"
        else:
            auto = "none set automatically"
        extra = ", ".join(n for n in needed if not (resource == "courses" and n == "id"))
        lines.append(f"    {method} params: {auto}" + (f"; you supply: {extra}" if extra else ""))
    return "\n".join(lines)


def _step_prompt(step: Dict[str, Any], data: Dict[str, Any], request: str,
                 context_text: str, standards_text: str) -> str:
    resources = [r for r in step["resources"] if _editable_methods(r)]
    brief = "\n".join(_resource_brief(r) for r in resources)
    data_text = _truncate(json.dumps(_prompt_safe(data), ensure_ascii=False, default=str), MAX_CONTEXT_CHARS)
    parts = [
        f"Step: {step['title']}. {step['description']}",
        "Resources you may change in this step:",
        brief,
        "",
        "Rules:",
        '- Return JSON only: {"summary": "...", "operations": [{"resource": "...", "method": "create or patch", '
        '"params": {...}, "body": {...}, "reason": "..."}]}',
        "- Use only the resources, methods and body fields listed above. Never propose delete, get or list.",
        "- For patch, params hold the existing item id from the current data, and body holds only the fields that change.",
        "- For create, body holds the new item. Do not set state. New items are created as drafts.",
        "- Do not invent ids. If an item does not exist yet, create it.",
        "- Propose the smallest change that meets the request. Keep reasons to one sentence.",
    ]
    if standards_text:
        parts += ["", "Course design standards to apply:", standards_text]
    if context_text.strip():
        parts += ["", "Teacher supplied material:", _truncate(context_text, MAX_CONTEXT_CHARS)]
    parts += ["", "Teacher request:", request.strip(), "", "Current course data for this step:", data_text]
    return "\n".join(parts)


def _parse_plan(raw: Any, key: str) -> Tuple[str, List[Any]]:
    if not isinstance(raw, dict):
        return "", []
    summary = str(raw.get("summary") or "")
    ops = raw.get(key)
    return summary, ops if isinstance(ops, list) else []


def _standards_text(standards_keys: Optional[List[str]]) -> str:
    return guidance_for(list(standards_keys)) if standards_keys else ""


def propose_step(service: Any, course_id: str, step_key: str, request: str,
                 context_text: str = "", standards_keys: Optional[List[str]] = None) -> Dict[str, Any]:
    """Plan changes for one step. Returns {summary, operations, rejected}. Never applies anything."""
    step = _step(step_key)
    if not (request or "").strip():
        raise ValueError("Describe the change you want.")
    if not any(_editable_methods(r) for r in step["resources"]):
        return {"summary": f"The '{step['title']}' step is read only here. Use the Classroom dashboard for changes.",
                "operations": [], "rejected": []}
    data = load_step_data(service, course_id, step_key, nested=True,
                          guardians=_wants_guardians(request))
    prompt = _step_prompt(step, data, request, context_text or "", _standards_text(standards_keys))
    raw = ai_model_router.get_gemini_client().generate_json(prompt, system_instruction=SYSTEM_INSTRUCTION)
    summary, ops = _parse_plan(raw, "operations")
    ops = [_without_publish(op) for op in ops]
    cleaned, rejected = validate_operations(ops, course_id, step_key=step_key,
                                            known_ids=_fetch_known_ids(service, course_id))
    return {"summary": summary, "operations": cleaned, "rejected": rejected}


def _placement_snapshot(service: Any, course_id: str) -> Dict[str, List[Dict[str, Any]]]:
    snapshot: Dict[str, List[Dict[str, Any]]] = {}
    for key in ("course", "topics", "materials", "assignments", "announcements"):
        snapshot.update(load_step_data(service, course_id, key, nested=False))
    return snapshot


def _placement_prompt(snapshot: Dict[str, Any], sources: List[Tuple[str, str]],
                      standards_text: str) -> str:
    brief = "\n".join(_resource_brief(r) for r in sorted(PLACEMENT_RESOURCES) if _editable_methods(r))
    source_text = "\n\n".join(f"=== SOURCE: {name} ===\n{text}" for name, text in sources)
    data_text = _truncate(json.dumps(_prompt_safe(snapshot), ensure_ascii=False, default=str),
                          MAX_CONTEXT_CHARS // 2)
    parts = [
        "Place each part of the teacher's material into the right Classroom resource.",
        "Resources you may write to:",
        brief,
        "",
        "Rules:",
        '- Return JSON only: {"summary": "...", "placements": [{"resource": "...", "method": "create or patch", '
        '"params": {...}, "body": {...}, "reason": "...", "source": "source name: short quote"}]}',
        "- Prefer patch when an item with the same title already exists in the current course data. Use its id.",
        "- For patch, a field you set replaces the old value. Merge new text with the existing value so nothing is lost.",
        "- Use create for new items. Do not set state. New items are created as drafts.",
        "- Never propose delete. Use only the resources listed above.",
        "- Put assignments in courses.courseWork with workType ASSIGNMENT unless the source says otherwise.",
        "- Keep each reason to one sentence. Quote the source briefly.",
    ]
    if standards_text:
        parts += ["", "Course design standards to apply:", standards_text]
    parts += ["", "Current course data:", data_text, "", source_text]
    return "\n".join(parts)


def propose_placement(service: Any, course_id: str, text: str, attachments: List[Dict[str, str]],
                      standards_keys: Optional[List[str]] = None) -> Dict[str, Any]:
    """Plan where each part of pasted text or documents belongs. Returns {summary, placements, rejected}."""
    sources: List[Tuple[str, str]] = []
    if (text or "").strip():
        sources.append(("Pasted text", text))
    for index, attachment in enumerate(attachments or []):
        if not isinstance(attachment, dict):
            continue
        body_text = str(attachment.get("text") or "")
        if body_text.strip():
            name = str(attachment.get("name") or f"Document {index + 1}")
            sources.append((name, body_text))
    if not sources:
        raise ValueError("Add some text or a document to place.")

    snapshot = _placement_snapshot(service, course_id)
    prompt = _placement_prompt(snapshot, [(n, _truncate(t, MAX_CONTEXT_CHARS // max(1, len(sources))))
                                          for n, t in sources],
                               _standards_text(standards_keys))
    raw = ai_model_router.get_gemini_client().generate_json(prompt, system_instruction=SYSTEM_INSTRUCTION)
    summary, ops = _parse_plan(raw, "placements")
    ops = [_without_publish(op) for op in ops]
    cleaned, rejected = validate_operations(ops, course_id, step_key=None,
                                            known_ids=_fetch_known_ids(service, course_id))

    placements: List[Dict[str, Any]] = []
    for item in cleaned:
        if item["resource"] in PLACEMENT_RESOURCES:
            placements.append(item)
        else:
            rejected.append(_rejection(item, "Placements can only target topics, materials, "
                                             "assignments and announcements."))
    return {"summary": summary, "placements": placements, "rejected": rejected}


# ---------------------------------------------------------------------------
# Apply
# ---------------------------------------------------------------------------

def _response_id(response: Any) -> Optional[str]:
    if not isinstance(response, dict):
        return None
    for key in ("id", "userId", "invitationId", "alias", "courseId"):
        if response.get(key):
            return str(response[key])
    return None


def _dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _material_key(material: Any) -> Tuple[str, str]:
    """Identity of a Classroom material, so the same file or link is never added twice."""
    if isinstance(material, dict):
        drive = _dict(_dict(material.get("driveFile")).get("driveFile"))
        if drive.get("id"):
            return ("drive", str(drive["id"]))
        if _dict(material.get("link")).get("url"):
            return ("link", str(material["link"]["url"]))
        if _dict(material.get("youtubeVideo")).get("id"):
            return ("youtube", str(material["youtubeVideo"]["id"]))
        if _dict(material.get("form")).get("formUrl"):
            return ("form", str(material["form"]["formUrl"]))
    return ("raw", json.dumps(material, sort_keys=True, default=str))


def _merged_body(service: Any, item: Dict[str, Any], course_id: str) -> Dict[str, Any]:
    """
    Body to send for one validated operation. For a patch that touches text or materials,
    read the current item and keep what is there: new text is appended to the old text
    (unless the old text is already contained in the new), and new materials are added to
    the existing list without duplicates. Raises if the current item cannot be read, so a
    failed read never turns into a silent overwrite.
    """
    resource = item["resource"]
    body = dict(item["body"])
    text_fields = sorted(MERGE_TEXT_FIELDS.get(resource, frozenset()) & body.keys())
    list_fields = sorted(MERGE_LIST_FIELDS.get(resource, frozenset()) & body.keys())
    if item["method"] != "patch" or not (text_fields or list_fields):
        return body
    for field in list_fields:
        if not isinstance(body[field], list):
            raise ValueError(f"'{field}' must be a list.")
    if resource == "courses":
        get_params = {"id": course_id}
    else:
        get_params = {"courseId": course_id, "id": str(item["params"]["id"])}
    current = _dict(classroom_api.call(service, resource, "get", get_params))
    for field in text_fields:
        old = str(current.get(field) or "").strip()
        new = str(body[field])
        if old and old not in new:
            body[field] = f"{old}\n\n{new}"
    for field in list_fields:
        existing = list(current.get(field) or [])
        seen = {_material_key(material) for material in existing}
        added = []
        for material in body[field]:
            key = _material_key(material)
            if key not in seen:
                seen.add(key)
                added.append(material)
        body[field] = existing + added
    return body


def apply_operations(service: Any, operations: Any, course_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Re-validate and run each operation. Returns [{resource, method, ok, id, error}].

    Pass course_id from the signed-in request. Every operation is forced to that course.
    If course_id is None, each operation's own course id is used. Never raises for a
    single failing operation. Rejected operations are reported with ok=False.

    Topic ids and assignment ids are read once per course for the whole apply, so each
    topicId and rubric courseWorkId is checked against the course as it is in Classroom.
    """
    if operations is None:
        operations = []
    if not isinstance(operations, list):
        raise ValueError("operations must be a list.")
    results: List[Dict[str, Any]] = []
    known_by_course: Dict[str, Dict[str, FrozenSet[str]]] = {}
    for op in operations:
        resource = op.get("resource") if isinstance(op, dict) else None
        method = op.get("method") if isinstance(op, dict) else None
        cid = str(course_id) if course_id else _course_id_from_op(op)
        if not cid:
            results.append({"resource": resource, "method": method, "ok": False, "id": None,
                            "error": "No course id for this operation."})
            continue
        try:
            if cid not in known_by_course:
                known_by_course[cid] = _fetch_known_ids(service, cid)
        except Exception as exc:
            results.append({"resource": resource, "method": method, "ok": False, "id": None,
                            "error": f"Could not read the course topics and assignments: {exc}"})
            continue
        item, reason = _validate_one(op, cid, None, known_by_course[cid])
        if reason is not None:
            results.append({"resource": resource, "method": method, "ok": False, "id": None,
                            "error": reason})
            continue
        try:
            body = _merged_body(service, item, cid)
            response = classroom_api.call(service, item["resource"], item["method"],
                                          item["params"], body)
            results.append({"resource": item["resource"], "method": item["method"], "ok": True,
                            "id": _response_id(response), "error": None})
        except Exception as exc:  # one failing item must not stop the rest
            results.append({"resource": item["resource"], "method": item["method"], "ok": False,
                            "id": None, "error": str(exc) or exc.__class__.__name__})
    return results
