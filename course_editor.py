"""
The course editor in the Courses tab: change a Google Classroom course after it is created.

load_course reads everything the editor shows, drafts included. apply_edit makes one change
(or adds one item) with one Classroom call. Only fields Classroom lets teachers change are
accepted, and nothing is ever deleted (Course Builder's no-delete policy).

Google only lets an app change topics, posts and announcements that the same app created.
Items made in Classroom itself (or by another app) can still be read here and changed in
Classroom; the error for them says so. Attachments cannot be changed after a post is made.
"""

from typing import Any, Dict, List

import classroom_api
from classroom_course_engine import (
    MAX_DESCRIPTION,
    MAX_TITLE,
    HttpError,
    _clip,
    _create_with_attachments,
    _http_message,
    _http_status,
    _question_type_fields,
    _topic_name,
    make_attachment,
    parse_due_datetime,
)

COURSE_FIELDS = ("name", "section", "subject", "room", "descriptionHeading", "description", "courseState")
COURSE_STATES = ("ACTIVE", "ARCHIVED")
POST_KINDS = ("material", "assignment", "question")
STATES = ("PUBLISHED", "DRAFT")

NOT_OURS = ("Google only lets Course Builder change items that Course Builder created. This one was made in "
            "Google Classroom (or by another app), so change it in Classroom.")


class EditError(ValueError):
    """An edit Course Builder will not send, or one Classroom refused, in plain words."""


def load_course(service: Any, course_id: str) -> Dict[str, Any]:
    """Everything the editor shows for one course, including drafts."""
    from course_agent import _read_rubrics

    course_id = str(course_id or "").strip()
    if not course_id:
        raise EditError("Choose a course.")
    states = list(STATES)
    course = classroom_api.call(service, "courses", "get", {"id": course_id})
    work = classroom_api.list_all(service, "courses.courseWork", "courseWork",
                                  {"courseId": course_id, "courseWorkStates": states})
    rubrics, _, rubric_errors = _read_rubrics(service, course_id, work)
    return {
        "course": course,
        "topics": classroom_api.list_all(service, "courses.topics", "topic", {"courseId": course_id}),
        "courseWork": work,
        "courseWorkMaterials": classroom_api.list_all(service, "courses.courseWorkMaterials", "courseWorkMaterial",
                                                      {"courseId": course_id, "courseWorkMaterialStates": states}),
        "announcements": classroom_api.list_all(service, "courses.announcements", "announcements",
                                                {"courseId": course_id, "announcementStates": states}),
        "teachers": classroom_api.list_all(service, "courses.teachers", "teachers", {"courseId": course_id}),
        "students": classroom_api.list_all(service, "courses.students", "students", {"courseId": course_id}),
        "rubrics": rubrics,
        "rubricErrors": rubric_errors,
    }


def _text(fields: Dict[str, Any], key: str, limit: int, required: bool = False) -> str:
    value = _clip(fields.get(key, ""), limit)
    if required and not value:
        raise EditError(f"The {key} cannot be empty.")
    return value


def _state(fields: Dict[str, Any]) -> str:
    state = str(fields.get("state") or "PUBLISHED").upper()
    if state not in STATES:
        raise EditError("State must be PUBLISHED or DRAFT.")
    return state


def _points(fields: Dict[str, Any]) -> int:
    raw = fields.get("maxPoints")
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise EditError(f"Points must be a whole number of 0 or more, not '{raw}'.") from None
    if value < 0 or value != int(value):
        raise EditError(f"Points must be a whole number of 0 or more, not '{raw}'.")
    return int(value)


def _changes(fields: Dict[str, Any], allowed: Dict[str, Any]) -> Dict[str, Any]:
    """The requested changes among the allowed ones, as {field: value}. Unknown fields are refused."""
    unknown = sorted(set(fields) - set(allowed))
    if unknown:
        raise EditError(f"These cannot be changed here: {', '.join(unknown)}.")
    if not fields:
        raise EditError("Nothing to change.")
    return {key: allowed[key](fields) for key in fields}


def _patch(service: Any, resource: str, params: Dict[str, Any], changes: Dict[str, Any]) -> Dict[str, Any]:
    """Patch the given fields. A field set to None is cleared (named in the mask, left out of the body)."""
    body = {k: v for k, v in changes.items() if v is not None}
    return classroom_api.call(service, resource, "patch", {**params, "updateMask": ",".join(changes)}, body)


def _due_changes(fields: Dict[str, Any]) -> Dict[str, Any]:
    """dueDate and dueTime for an ISO 8601 due date, or both cleared for an empty one."""
    due = parse_due_datetime(fields.get("due"), "Due date")
    return {"dueDate": due["dueDate"], "dueTime": due["dueTime"]} if due else {"dueDate": None, "dueTime": None}


def _topic_id(fields: Dict[str, Any]):
    return str(fields.get("topicId") or "") or None  # None takes the item out of its topic


def apply_edit(service: Any, edit: Dict[str, Any]) -> Dict[str, Any]:
    """
    Make one change. edit = {courseId, kind, action ("update" or "create"), id (for update), fields}.
    kind: course, topic, announcement, material, assignment, question.
    Returns {"item": the item as Classroom now has it, "notes": [...]}.
    """
    course_id = str(edit.get("courseId") or "").strip()
    kind = edit.get("kind")
    action = edit.get("action") or "update"
    item_id = str(edit.get("id") or "").strip()
    fields = dict(edit.get("fields") or {})
    if not course_id:
        raise EditError("Choose a course.")
    if action not in ("update", "create"):
        raise EditError("Edits can only update or create. Course Builder never deletes anything.")
    if action == "update" and kind != "course" and not item_id:
        raise EditError("Which item? The edit has no id.")

    try:
        return _apply(service, course_id, kind, action, item_id, fields)
    except HttpError as exc:
        raise EditError(_refusal(exc)) from None
    except classroom_api.ClassroomCallError as exc:
        raise EditError(str(exc)) from None


def _refusal(exc: Exception) -> str:
    text = f"{getattr(exc, 'content', b'')!r} {exc}".lower()
    if "projectpermissiondenied" in text or "developer project" in text:
        return NOT_OURS
    if _http_status(exc) == 409 or "already exists" in text:
        return "A topic with that name is already in the course."
    return _http_message(exc)


def _apply(service: Any, course_id: str, kind: str, action: str, item_id: str,
           fields: Dict[str, Any]) -> Dict[str, Any]:
    if kind == "course":
        if action != "update":
            raise EditError("New courses are made in Course Studio.")

        def state(f):
            value = str(f.get("courseState") or "").upper()
            if value not in COURSE_STATES:
                raise EditError("A course can be Active or Archived.")
            return value

        allowed = {k: (lambda f, k=k: _text(f, k, 30000 if k == "description" else 3600)) for k in COURSE_FIELDS}
        allowed["name"] = lambda f: _text(f, "name", 750, required=True)
        allowed["courseState"] = state
        changes = _changes(fields, allowed)
        body = {k: v for k, v in changes.items()}
        item = classroom_api.call(service, "courses", "patch",
                                  {"id": course_id, "updateMask": ",".join(changes)}, body)
        return {"item": item, "notes": []}

    if kind == "topic":
        changes = _changes(fields, {"name": lambda f: _topic_name(_text(f, "name", 100, required=True))})
        if action == "create":
            item = classroom_api.call(service, "courses.topics", "create", {"courseId": course_id}, changes)
        else:
            item = _patch(service, "courses.topics", {"courseId": course_id, "id": item_id}, changes)
        return {"item": item, "notes": []}

    if kind == "announcement":
        allowed = {"text": lambda f: _text(f, "text", MAX_DESCRIPTION, required=True), "state": _state}
        changes = _changes(fields, allowed)
        if action == "create":
            changes.setdefault("state", "PUBLISHED")
            item = classroom_api.call(service, "courses.announcements", "create", {"courseId": course_id}, changes)
        else:
            item = _patch(service, "courses.announcements", {"courseId": course_id, "id": item_id}, changes)
        return {"item": item, "notes": []}

    if kind not in POST_KINDS:
        raise EditError(f"'{kind}' cannot be edited here.")

    allowed = {
        "title": lambda f: _text(f, "title", MAX_TITLE, required=True),
        "description": lambda f: _text(f, "description", MAX_DESCRIPTION),
        "topicId": _topic_id,
        "state": _state,
    }
    if kind != "material":
        allowed["maxPoints"] = _points
    links = fields.pop("links", None) if action == "create" else None
    choices = fields.pop("choices", None) if action == "create" and kind == "question" else None
    question_type = fields.pop("questionType", None) if action == "create" and kind == "question" else None
    due_fields = {"due": fields.pop("due")} if "due" in fields and kind != "material" else None
    changes = _changes(fields, allowed) if fields else {}
    if due_fields is not None:
        changes.update(_due_changes(due_fields))
    if not changes:
        raise EditError("Nothing to change.")

    resource = "courses.courseWorkMaterials" if kind == "material" else "courses.courseWork"
    if action == "update":
        if changes.get("state") == "DRAFT":
            raise EditError("A published item cannot go back to a draft.")
        item = _patch(service, resource, {"courseId": course_id, "id": item_id}, changes)
        return {"item": item, "notes": []}

    # Create: a new post, with its resources attached by type (Drive, YouTube, link)
    if "title" not in changes:
        raise EditError("The title cannot be empty.")
    body = {k: v for k, v in changes.items() if v is not None}
    if kind == "assignment":
        body["workType"] = "ASSIGNMENT"
    elif kind == "question":
        mcq = str(question_type or "").upper().startswith("MULTIPLE")
        option_list = [str(c).strip() for c in (choices or []) if str(c).strip()]
        if mcq and len(option_list) < 2:
            raise EditError("A multiple-choice question needs at least 2 choices.")
        body.update(_question_type_fields({
            "question_type": "MULTIPLE_CHOICE_QUESTION" if mcq else "SHORT_ANSWER_QUESTION",
            "question_choices": option_list}))
    attachments = [make_attachment(u) for u in (links or []) if str(u).strip()] if kind != "question" else []
    target = service.courses().courseWorkMaterials() if kind == "material" else service.courses().courseWork()
    item, as_link, left_out = _create_with_attachments(target, course_id, body, attachments)
    notes: List[str] = []
    if as_link:
        notes.append("Attached as a plain link instead: " + ", ".join(a.url for a in as_link))
    if left_out:
        notes.append("Could not be attached, so they are in the description under Resources: "
                     + ", ".join(f"{a.label} {a.url}" for a in left_out))
    return {"item": item, "notes": notes}
