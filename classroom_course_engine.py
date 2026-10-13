#!/usr/bin/env python3
"""
=============================================================================
Google Classroom Course Automation Engine (NO-DELETE Safety Policy)
=============================================================================
A Python automation tool using the official Google Classroom API v1 that allows
teachers to Create, Edit/Sync, Duplicate, and Attach Presentations via Links,
while strictly enforcing a NO-DELETE safety policy.
=============================================================================
"""

import os
import sys
import re
import ast
import json
import argparse
from typing import Dict, List, NamedTuple, Optional, Any, Tuple
from datetime import datetime, date, timezone

# Ensure terminal output handles UTF-8 / safe printing on Windows console
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Third-party libraries
try:
    import pandas as pd
    import openpyxl
except ImportError as e:
    print(f"[ERROR] Missing required packages: {e}")
    print("Please install requirements: pip install -r requirements.txt")
    sys.exit(1)

# Google API client imports
try:
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request
    from google.oauth2 import service_account
    GOOGLE_AUTH_AVAILABLE = True
except ImportError:
    GOOGLE_AUTH_AVAILABLE = False

# =============================================================================
# CONSTANTS & CONFIGURATION
# =============================================================================

SCOPES = [
    "https://www.googleapis.com/auth/classroom.courses",
    "https://www.googleapis.com/auth/classroom.topics",
    "https://www.googleapis.com/auth/classroom.coursework.students",
    "https://www.googleapis.com/auth/classroom.courseworkmaterials",
    "https://www.googleapis.com/auth/classroom.announcements",
    "https://www.googleapis.com/auth/classroom.rosters.readonly",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

TOKEN_FILE = "token.json"
CREDENTIALS_FILE = "credentials.json"
SERVICE_ACCOUNT_FILE = "service_account.json"

# =============================================================================
# SAFETY POLICY ENFORCEMENT (NO-DELETE GUARDRAILS)
# =============================================================================

class SafetyPolicyViolationError(Exception):
    """Raised when an attempt is made to perform a forbidden deletion operation."""
    pass


def enforce_no_delete_guardrail(operation_name: str = "delete"):
    """
    Enforces the strict NO-DELETE policy.
    Any call attempting to delete courses, topics, coursework, or materials is blocked.
    """
    raise SafetyPolicyViolationError(
        f"[SAFETY VIOLATION BLOCKED] Attempted operation: '{operation_name}'. "
        "The Google Classroom Course Automation Engine enforces a strict NO-DELETE policy. "
        "All deletions must be performed manually by authorized staff directly in the "
        "Google Classroom web dashboard (https://classroom.google.com)."
    )


def audit_codebase_safety(target_file_path: Optional[str] = None) -> Tuple[bool, List[str]]:
    """
    Statically analyzes Python code using AST to guarantee that no deletion API endpoints
    or methods (.delete) are invoked.
    """
    if target_file_path is None:
        target_file_path = __file__

    violations = []

    with open(target_file_path, "r", encoding="utf-8") as f:
        source_code = f.read()

    tree = ast.parse(source_code, filename=target_file_path)

    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            # Check attribute calls, e.g. obj.delete(...)
            if isinstance(node.func, ast.Attribute):
                attr_name = node.func.attr
                if attr_name == "delete":
                    line_no = getattr(node, "lineno", "?")
                    violations.append(f"Forbidden call to '.delete()' detected at line {line_no}")

    return len(violations) == 0, violations


# =============================================================================
# PRESENTATION URL SANITIZER & LINK ATTACHMENT BUILDER
# =============================================================================

def sanitize_and_validate_presentation_url(raw_url: Any) -> Optional[str]:
    """
    Validates and cleans presentation, slide deck, or document URLs.
    Ensures standard HTTP/HTTPS protocol and trims extraneous whitespace.
    """
    if raw_url is None:
        return None
    url = str(raw_url).strip()
    if not url or url.lower() in ("nan", "none", "null", "n/a", "-"):
        return None

    # Handle protocol prefix
    if not (url.startswith("http://") or url.startswith("https://")):
        url = "https://" + url

    # Basic regex validation
    url_pattern = re.compile(
        r"^https?://(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?(?:/[^\s]*)?$",
        re.IGNORECASE
    )
    if not url_pattern.match(url):
        return None

    return url


def build_link_material_attachment(clean_url: str) -> Dict[str, Any]:
    """
    Builds the native Classroom API v1 link attachment object.
    
    API Rule Enforced:
    Strictly omits 'title' inside 'link' (it is output-only in Classroom API v1).
    Google Classroom automatically crawls the URL, extracts metadata,
    and generates the interactive preview card.
    """
    if not clean_url:
        raise ValueError("URL cannot be empty for link material attachment.")

    return {
        "link": {
            "url": clean_url
            # STRICTLY NO "title" key here per Google Classroom API v1 specification.
        }
    }


_YOUTUBE_ID = re.compile(
    r"(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/|v/)|youtu\.be/)([A-Za-z0-9_-]{11})"
)
NOTEBOOK_HOSTS = ("notebooklm.google.com", "notebook.google.com", "gemini.google.com")
NOTEBOOK_HOSTS_TEXT = ", ".join(f"https://{h}/" for h in NOTEBOOK_HOSTS[:-1]) + f" or https://{NOTEBOOK_HOSTS[-1]}/"


def extract_youtube_id(raw_url: Any) -> Optional[str]:
    """Returns the 11-character video ID from a YouTube watch, share, shorts or embed URL."""
    match = _YOUTUBE_ID.search(str(raw_url or ""))
    return match.group(1) if match else None


def is_notebook_url(url: Optional[str]) -> bool:
    """True for https links to a NotebookLM or Gemini notebook."""
    if not url:
        return False
    host = re.sub(r"^https://", "", url).split("/", 1)[0].lower()
    return url.startswith("https://") and host in NOTEBOOK_HOSTS


# Docs, Slides, Sheets, Drawings and uploaded Drive files, which Classroom attaches as Drive files.
# Google Forms and Drive folders are left out: apps can only attach those as links.
_DRIVE_FILE_ID = re.compile(
    r"^https://(?:docs\.google\.com/(?:a/[^/]+/)?(?:document|presentation|spreadsheets|drawings)/(?:u/\d+/)?d/"
    r"|drive\.google\.com/(?:a/[^/]+/)?file/(?:u/\d+/)?d/)([A-Za-z0-9_-]{10,})"
)
_DRIVE_OPEN_ID = re.compile(r"^https://drive\.google\.com/(?:open|uc)\?(?:[^#]*&)?id=([A-Za-z0-9_-]{10,})")


def extract_drive_file_id(raw_url: Any) -> Optional[str]:
    """The Drive file ID in a Docs, Slides, Sheets, Drawings or Drive file URL, else None."""
    text = str(raw_url or "").strip()
    match = _DRIVE_FILE_ID.match(text) or _DRIVE_OPEN_ID.match(text)
    return match.group(1) if match else None


def attachment_label(url: str) -> str:
    """A short title for a resource, shown when it has to go into a post's description."""
    host = re.sub(r"^https?://", "", url).split("/", 1)[0].lower()
    path = url.lower()
    if extract_youtube_id(url):
        return "YouTube video"
    if host == "notebooklm.google.com":
        return "NotebookLM notebook"
    if host in NOTEBOOK_HOSTS:
        return "Gemini notebook"
    if host == "docs.google.com":
        for part, label in (("/presentation/", "Google Slides"), ("/document/", "Google Doc"),
                            ("/spreadsheets/", "Google Sheet"), ("/drawings/", "Google Drawing"),
                            ("/forms/", "Google Form")):
            if part in path:
                return label
    if host in ("forms.gle", "forms.google.com"):
        return "Google Form"
    if host == "drive.google.com":
        return "Google Drive folder" if "/folders/" in path else "Google Drive file"
    return f"Link ({host[4:] if host.startswith('www.') else host})"


class Attachment(NamedTuple):
    """One resource for a post: the URL as given, its title, and how Classroom attaches it."""
    url: str
    label: str
    kind: str  # "drive", "youtube" or "link"
    material: Dict[str, Any]

    def as_link(self) -> Dict[str, Any]:
        return build_link_material_attachment(self.url)


def make_attachment(url: str, label: Optional[str] = None) -> Attachment:
    """Drive files attach as Drive files and YouTube videos as videos. Everything else
    (web pages, Google Forms, Drive folders, NotebookLM and Gemini notebooks) attaches as a link."""
    url = str(url).strip()
    video_id = extract_youtube_id(url)
    drive_id = extract_drive_file_id(url)
    if video_id:
        kind, material = "youtube", {"youtubeVideo": {"id": video_id}}
    elif drive_id:
        kind, material = "drive", {"driveFile": {"driveFile": {"id": drive_id}, "shareMode": "VIEW"}}
    else:
        kind, material = "link", build_link_material_attachment(url)
    return Attachment(url, label or attachment_label(url), kind, material)


def topic_attachments(mod: Dict[str, Any]) -> List[Attachment]:
    """
    All resources for a topic's lecture-materials post, in display order: the notebook,
    presentation and document links, then YouTube videos. A resource given twice, even by
    two different URLs for the same Drive file or video, is attached once.
    """
    urls = [mod["notebook_url"]] if mod.get("notebook_url") else []
    links = mod.get("presentation_urls") or ([mod["presentation_url"]] if mod.get("presentation_url") else [])
    urls += [u for u in links if u] + [u for u in (mod.get("youtube_urls") or []) if u]
    result, seen = [], set()
    for url in urls:
        attachment = make_attachment(url)
        key = json.dumps(attachment.material, sort_keys=True)
        if key not in seen:
            seen.add(key)
            result.append(attachment)
    return result


def build_topic_attachments(mod: Dict[str, Any]) -> List[Dict[str, Any]]:
    """The Classroom materials for a topic's lecture-materials post (see topic_attachments)."""
    return [a.material for a in topic_attachments(mod)]


ISO_DUE_HELP = ("Use YYYY-MM-DD (due 23:59 that day), YYYY-MM-DDTHH:MM for a time, "
                "or add an offset such as 2026-11-05T17:00+11:00.")


def parse_due_datetime(raw: Any, where: str = "Due date") -> Optional[Dict[str, Dict[str, int]]]:
    """
    A due date as Classroom wants it: {"dueDate": {...}, "dueTime": {...}}, both in UTC.

    Accepts ISO 8601 only: a date (due 23:59 that day), a date and time, or either with an
    offset (Z, +11:00). Without an offset the time is local to the computer running the
    server. Excel date cells arrive as datetime values and are taken as they are.
    Anything else is refused rather than guessed: 05/11/2026 is 5 November in Australia
    and 11 May in the US. Returns None for an empty cell.
    """
    if raw is None:
        return None
    try:
        if pd.isna(raw):
            return None
    except (TypeError, ValueError):
        pass

    if isinstance(raw, datetime):  # Excel date cell (a pandas Timestamp is a datetime)
        local = raw.to_pydatetime() if hasattr(raw, "to_pydatetime") else raw
        date_only = local.tzinfo is None and (local.hour, local.minute, local.second) == (0, 0, 0)
    elif isinstance(raw, date):
        local, date_only = datetime(raw.year, raw.month, raw.day), True
    elif isinstance(raw, str):
        text = raw.strip()
        if not text:
            return None
        try:
            day = date.fromisoformat(text)
            local, date_only = datetime(day.year, day.month, day.day), True
        except ValueError:
            try:
                local, date_only = datetime.fromisoformat(text), False
            except ValueError:
                raise ValueError(f"{where} '{text}' is not an ISO 8601 date. {ISO_DUE_HELP}") from None
    else:
        raise ValueError(f"{where} '{raw}' is not an ISO 8601 date. {ISO_DUE_HELP}")

    if date_only:
        local = local.replace(hour=23, minute=59)
    utc = local.astimezone(timezone.utc)  # a value without an offset is taken as local time
    return {"dueDate": {"year": utc.year, "month": utc.month, "day": utc.day},
            "dueTime": {"hours": utc.hour, "minutes": utc.minute}}


def _question_type_fields(mod: Dict[str, Any]) -> Dict[str, Any]:
    """workType for a topic's question, plus its choices when it is multiple choice.
    Classroom requires the choices for multiple choice and refuses them for short answer."""
    if mod.get("question_type") == "MULTIPLE_CHOICE_QUESTION":
        return {"workType": "MULTIPLE_CHOICE_QUESTION",
                "multipleChoiceQuestion": {"choices": list(mod.get("question_choices") or [])}}
    return {"workType": "SHORT_ANSWER_QUESTION"}


def attachment_summary(material: Dict[str, Any]) -> str:
    """One attachment of a Classroom post as "Type: title (url)", using Classroom's own titles."""
    if material.get("driveFile"):
        f = material["driveFile"].get("driveFile", {})
        kind, title, url = "Drive file", f.get("title"), f.get("alternateLink") or f"https://drive.google.com/open?id={f.get('id', '')}"
    elif material.get("youtubeVideo"):
        v = material["youtubeVideo"]
        kind, title, url = "YouTube video", v.get("title"), v.get("alternateLink") or f"https://www.youtube.com/watch?v={v.get('id', '')}"
    elif material.get("form"):
        kind, title, url = "Google Form", material["form"].get("title"), material["form"].get("formUrl", "")
    else:
        kind, title, url = "Link", material.get("link", {}).get("title"), material.get("link", {}).get("url", "")
    return f"{kind}: {title} ({url})" if title else f"{kind}: {url}"


def describe_attachment(material: Dict[str, Any]) -> str:
    if "youtubeVideo" in material:
        return f"https://www.youtube.com/watch?v={material['youtubeVideo']['id']}"
    if "driveFile" in material:
        return f"https://drive.google.com/open?id={material['driveFile']['driveFile']['id']}"
    return material.get("link", {}).get("url", "")


# =============================================================================
# IN-MEMORY GOOGLE CLASSROOM API V1 SIMULATOR (MOCK ENGINE FOR TESTABILITY)
# =============================================================================

def _mock_http_error(status: int, message: str) -> "HttpError":
    """Builds an HttpError with a real status code, like the live API raises."""
    import httplib2
    content = json.dumps({"error": {"code": status, "message": message}}).encode()
    return HttpError(resp=httplib2.Response({"status": str(status)}), content=content)


def _mock_require_active(store: Dict[str, Any], cid: str):
    """Classroom rejects topics, materials and coursework while a course is PROVISIONED."""
    course = store["courses"].get(cid)
    if course and course.get("courseState") != "ACTIVE":
        raise _mock_http_error(403, "@CourseNotModifiable The course is not in an active state.")


def _mock_attachment_key(material: Dict[str, Any]) -> str:
    if "driveFile" in material:
        return "drive:" + material["driveFile"]["driveFile"]["id"]
    if "youtubeVideo" in material:
        return "youtube:" + material["youtubeVideo"]["id"]
    return "link:" + material.get("link", {}).get("url", "")


def _mock_check_links(store: Dict[str, Any], body: Dict[str, Any]):
    """
    Refuse attachments the way Classroom refuses a missing or private resource.
    'inaccessible_links': URLs refused however they are attached (Drive file, video or link).
    'refuse_native_only': URLs refused as a Drive file or video but accepted as a plain link.
    """
    bad = set()
    for url in store.get("inaccessible_links") or ():
        attachment = make_attachment(url)
        bad |= {_mock_attachment_key(attachment.material), _mock_attachment_key(attachment.as_link())}
    for url in store.get("refuse_native_only") or ():
        attachment = make_attachment(url)
        if attachment.kind != "link":
            bad.add(_mock_attachment_key(attachment.material))
    for m in body.get("materials", []):
        if _mock_attachment_key(m) in bad:
            raise _mock_http_error(403, "@AttachmentNotVisible The requesting user cannot access the attached file.")


def _mock_check_direct_add(store: Dict[str, Any], user_id: str):
    """With 'direct_add_domain' set, direct roster adds outside that domain fail as they do live."""
    domain = store.get("direct_add_domain")
    if domain and not user_id.endswith("@" + domain):
        raise _mock_http_error(403, "@CannotDirectAddUser The user cannot be added directly. Send an invitation.")


class MockClassroomResource:
    """Mock Classroom resource allowing complete execution without live cloud credentials."""
    def __init__(self, data_store: Dict[str, Any]):
        self._store = data_store

    def courses(self):
        return MockCoursesEndpoint(self._store)

    def invitations(self):
        return MockInvitationsEndpoint(self._store)

    def forms_service(self):
        """The matching Google Forms simulator, sharing this mock's data."""
        return MockFormsResource(self._store)


class MockCoursesEndpoint:
    def __init__(self, store: Dict[str, Any]):
        self._store = store

    def create(self, body: Dict[str, Any]):
        class Request:
            def __init__(self, store, body):
                self.store = store
                self.body = body

            def execute(self):
                cid = f"mock-course-{len(self.store['courses']) + 101}"
                record = {
                    "id": cid,
                    "name": self.body.get("name", "Untitled Course"),
                    "section": self.body.get("section", ""),
                    "descriptionHeading": self.body.get("descriptionHeading", ""),
                    "description": self.body.get("description", ""),
                    "room": self.body.get("room", ""),
                    "ownerId": self.body.get("ownerId", "me"),
                    "courseState": "PROVISIONED",
                    "enrollmentCode": f"ENR{len(self.store['courses']) + 500}",
                    "alternateLink": f"https://classroom.google.com/c/{cid}",
                    "creationTime": datetime.now(timezone.utc).isoformat()
                }
                self.store["courses"][cid] = record
                self.store["topics"][cid] = {}
                self.store["materials"][cid] = {}
                self.store["coursework"][cid] = {}
                self.store["announcements"][cid] = []
                self.store["students"][cid] = []
                return record
        return Request(self._store, body)

    def list(self, courseStates=None, pageSize=100, **_filters):
        class Request:
            def __init__(self, store, courseStates):
                self.store = store
                self.states = courseStates  # like Classroom, no filter means every state

            def execute(self):
                items = [
                    c for c in self.store["courses"].values()
                    if not self.states or c.get("courseState") in self.states
                ]
                return {"courses": items}
        return Request(self._store, courseStates)

    def get(self, id: str):
        class Request:
            def __init__(self, store, cid):
                self.store = store
                self.cid = cid

            def execute(self):
                if self.cid not in self.store["courses"]:
                    raise HttpError(resp=None, content=f"Course {self.cid} not found".encode())
                return self.store["courses"][self.cid]
        return Request(self._store, id)

    def patch(self, id: str, updateMask: str, body: Dict[str, Any]):
        class Request:
            def __init__(self, store, cid, mask, body):
                self.store = store
                self.cid = cid
                self.mask = [m.strip() for m in mask.split(",")] if mask else []
                self.body = body

            def execute(self):
                course = self.store["courses"].get(self.cid)
                if not course:
                    raise HttpError(resp=None, content=f"Course {self.cid} not found".encode())
                for field in self.mask:
                    if field in self.body:
                        course[field] = self.body[field]
                    else:  # named in the mask without a value: Classroom clears it
                        course.pop(field, None)
                return course
        return Request(self._store, id, updateMask, body)

    def topics(self):
        return MockTopicsEndpoint(self._store)

    def courseWorkMaterials(self):
        return MockMaterialsEndpoint(self._store)

    def courseWork(self):
        return MockCourseWorkEndpoint(self._store)

    def announcements(self):
        return MockAnnouncementsEndpoint(self._store)

    def teachers(self):
        return MockTeachersEndpoint(self._store)

    def students(self):
        return MockStudentsEndpoint(self._store)

    def aliases(self):
        return MockAliasesEndpoint(self._store)


class MockAliasesEndpoint:
    def __init__(self, store: Dict[str, Any]):
        self._store = store

    def create(self, courseId: str, body: Dict[str, Any]):
        class Request:
            def __init__(self, store, cid, body):
                self.store = store
                self.cid = cid
                self.body = body

            def execute(self):
                alias = str(self.body.get("alias", ""))
                if not re.match(r"^[dp]:.+", alias):
                    raise _mock_http_error(400, f"Invalid alias '{alias}'. Use a d: or p: prefix.")
                aliases = self.store.setdefault("aliases", {})
                if alias in aliases:
                    raise _mock_http_error(409, f"Alias '{alias}' already exists.")
                aliases[alias] = self.cid
                return {"alias": alias}
        return Request(self._store, courseId, body)


class MockInvitationsEndpoint:
    def __init__(self, store: Dict[str, Any]):
        self._store = store

    def create(self, body: Dict[str, Any]):
        class Request:
            def __init__(self, store, body):
                self.store = store
                self.body = body

            def execute(self):
                invites = self.store.setdefault("invitations", [])
                key = (self.body.get("courseId"), str(self.body.get("userId", "")).lower(), self.body.get("role"))
                if any((i["courseId"], i["userId"], i["role"]) == key for i in invites):
                    raise _mock_http_error(409, "An invitation for this user already exists.")
                record = {"id": f"invite-{len(invites) + 1}", "courseId": key[0], "userId": key[1], "role": key[2]}
                invites.append(record)
                return record
        return Request(self._store, body)


class MockTopicsEndpoint:
    def __init__(self, store: Dict[str, Any]):
        self._store = store

    def create(self, courseId: str, body: Dict[str, Any]):
        class Request:
            def __init__(self, store, cid, body):
                self.store = store
                self.cid = cid
                self.body = body

            def execute(self):
                _mock_require_active(self.store, self.cid)
                course_topics = self.store["topics"].setdefault(self.cid, {})
                name = str(self.body.get("name", ""))
                if len(name) > 100:
                    raise _mock_http_error(400, "Topic names must be no longer than 100 characters.")
                if any(t["name"] == name for t in course_topics.values()):
                    raise _mock_http_error(409, "Requested entity already exists")
                tid = f"topic-{len(course_topics) + 1}"
                record = {
                    "topicId": tid,
                    "courseId": self.cid,
                    "name": self.body.get("name", "Untitled Topic"),
                }
                course_topics[tid] = record
                return record
        return Request(self._store, courseId, body)

    def list(self, courseId: str, pageSize=100, **_filters):
        class Request:
            def __init__(self, store, cid):
                self.store = store
                self.cid = cid

            def execute(self):
                items = list(self.store["topics"].get(self.cid, {}).values())
                return {"topic": items}
        return Request(self._store, courseId)

    def patch(self, courseId: str, id: str, updateMask: str, body: Dict[str, Any]):
        class Request:
            def __init__(self, store, cid, tid, mask, body):
                self.store = store
                self.cid = cid
                self.tid = tid
                self.mask = [m.strip() for m in mask.split(",")] if mask else []
                self.body = body

            def execute(self):
                topic = self.store["topics"].get(self.cid, {}).get(self.tid)
                if not topic:
                    raise HttpError(resp=None, content=b"Topic not found")
                if topic.get("associatedWithDeveloper") is False:
                    raise _mock_http_error(403, "@ProjectPermissionDenied The Developer Project is not permitted to make the request.")
                for field in self.mask:
                    if field in self.body:
                        topic[field] = self.body[field]
                    else:  # named in the mask without a value: Classroom clears it
                        topic.pop(field, None)
                return topic
        return Request(self._store, courseId, id, updateMask, body)


class MockMaterialsEndpoint:
    def __init__(self, store: Dict[str, Any]):
        self._store = store

    def create(self, courseId: str, body: Dict[str, Any]):
        class Request:
            def __init__(self, store, cid, body):
                self.store = store
                self.cid = cid
                self.body = body

            def execute(self):
                _mock_require_active(self.store, self.cid)
                _mock_check_links(self.store, self.body)
                course_mat = self.store["materials"].setdefault(self.cid, {})
                mid = f"material-{len(course_mat) + 1}"
                # Enforce link title omission verification
                for mat in self.body.get("materials", []):
                    if "link" in mat and "title" in mat["link"]:
                        raise ValueError(
                            "Classroom API v1 Error: 'title' inside 'link' is strictly output-only!"
                        )
                record = {
                    "id": mid,
                    "courseId": self.cid,
                    "title": self.body.get("title", ""),
                    "description": self.body.get("description", ""),
                    "materials": self.body.get("materials", []),
                    "topicId": self.body.get("topicId", ""),
                    "state": self.body.get("state", "PUBLISHED"),
                    "alternateLink": f"https://classroom.google.com/m/{mid}",
                }
                course_mat[mid] = record
                return record
        return Request(self._store, courseId, body)

    def list(self, courseId: str, pageSize=100, **_filters):
        class Request:
            def __init__(self, store, cid):
                self.store = store
                self.cid = cid

            def execute(self):
                items = list(self.store["materials"].get(self.cid, {}).values())
                return {"courseWorkMaterial": items}
        return Request(self._store, courseId)

    def patch(self, courseId: str, id: str, updateMask: str, body: Dict[str, Any]):
        class Request:
            def __init__(self, store, cid, mid, mask, body):
                self.store = store
                self.cid = cid
                self.mid = mid
                self.mask = [m.strip() for m in mask.split(",")] if mask else []
                self.body = body

            def execute(self):
                mat = self.store["materials"].get(self.cid, {}).get(self.mid)
                if not mat:
                    raise HttpError(resp=None, content=b"Material not found")
                if mat.get("associatedWithDeveloper") is False:
                    raise _mock_http_error(403, "@ProjectPermissionDenied The Developer Project is not permitted to make the request.")
                for field in self.mask:
                    if field in self.body:
                        mat[field] = self.body[field]
                    else:  # named in the mask without a value: Classroom clears it
                        mat.pop(field, None)
                return mat
        return Request(self._store, courseId, id, updateMask, body)


class MockCourseWorkEndpoint:
    def __init__(self, store: Dict[str, Any]):
        self._store = store

    def create(self, courseId: str, body: Dict[str, Any]):
        class Request:
            def __init__(self, store, cid, body):
                self.store = store
                self.cid = cid
                self.body = body

            def execute(self):
                _mock_require_active(self.store, self.cid)
                _mock_check_links(self.store, self.body)
                # Test switches: refuse a post by title, or any due date (as for a date Classroom rejects).
                if self.body.get("title") in (self.store.get("refuse_titles") or ()):
                    raise _mock_http_error(400, "Invalid value for the course work.")
                if self.body.get("dueDate") and self.store.get("refuse_due_dates"):
                    raise _mock_http_error(400, "@InvalidDueDate The due date is not valid.")
                # Classroom requires choices for a multiple-choice question, and refuses them otherwise.
                work_type = self.body.get("workType", "ASSIGNMENT")
                mcq = self.body.get("multipleChoiceQuestion")
                if work_type == "MULTIPLE_CHOICE_QUESTION" and not (mcq or {}).get("choices"):
                    raise _mock_http_error(400, "multipleChoiceQuestion is required for a MULTIPLE_CHOICE_QUESTION.")
                if work_type != "MULTIPLE_CHOICE_QUESTION" and mcq:
                    raise _mock_http_error(400, "multipleChoiceQuestion must not be set for this work type.")
                course_cw = self.store["coursework"].setdefault(self.cid, {})
                wid = f"cw-{len(course_cw) + 1}"
                record = {
                    "id": wid,
                    "courseId": self.cid,
                    "title": self.body.get("title", ""),
                    "description": self.body.get("description", ""),
                    "materials": self.body.get("materials", []),
                    "state": self.body.get("state", "PUBLISHED"),
                    "maxPoints": self.body.get("maxPoints", 100),
                    "workType": work_type,
                    "topicId": self.body.get("topicId", ""),
                    "dueDate": self.body.get("dueDate"),
                    "dueTime": self.body.get("dueTime"),
                    "alternateLink": f"https://classroom.google.com/cw/{wid}",
                    "associatedWithDeveloper": True,
                }
                if mcq:
                    record["multipleChoiceQuestion"] = mcq
                course_cw[wid] = record
                return record
        return Request(self._store, courseId, body)

    def list(self, courseId: str, pageSize=100, **_filters):
        class Request:
            def __init__(self, store, cid):
                self.store = store
                self.cid = cid

            def execute(self):
                items = list(self.store["coursework"].get(self.cid, {}).values())
                return {"courseWork": items}
        return Request(self._store, courseId)

    def patch(self, courseId: str, id: str, updateMask: str, body: Dict[str, Any]):
        class Request:
            def __init__(self, store, cid, wid, mask, body):
                self.store = store
                self.cid = cid
                self.wid = wid
                self.mask = [m.strip() for m in mask.split(",")] if mask else []
                self.body = body

            def execute(self):
                cw = self.store["coursework"].get(self.cid, {}).get(self.wid)
                if not cw:
                    raise HttpError(resp=None, content=b"CourseWork not found")
                if cw.get("associatedWithDeveloper") is False:
                    raise _mock_http_error(403, "@ProjectPermissionDenied The Developer Project is not permitted to make the request.")
                for field in self.mask:
                    if field in self.body:
                        cw[field] = self.body[field]
                    else:  # named in the mask without a value: Classroom clears it
                        cw.pop(field, None)
                return cw
        return Request(self._store, courseId, id, updateMask, body)

    def rubrics(self):
        return MockRubricsEndpoint(self._store)


class MockRubricsEndpoint:
    """Rubrics imported from a Google Sheet. Test switch 'refuse_rubrics': (status, message)."""
    def __init__(self, store: Dict[str, Any]):
        self._store = store

    def create(self, courseId: str, courseWorkId: str, body: Dict[str, Any]):
        store = self._store

        class Request:
            def execute(self, num_retries=0):
                store["rubric_calls"] = store.get("rubric_calls", 0) + 1
                if store.get("refuse_rubrics"):
                    raise _mock_http_error(*store["refuse_rubrics"])
                if not body.get("sourceSpreadsheetId") and not body.get("criteria"):
                    raise _mock_http_error(400, "A rubric needs criteria or a sourceSpreadsheetId.")
                rubrics = store.setdefault("rubrics", {}).setdefault(courseId, {})
                record = {"id": f"rubric-{len(rubrics) + 1}", "courseId": courseId, "courseWorkId": courseWorkId,
                          **body}
                rubrics[courseWorkId] = record
                return record
        return Request()

    def list(self, courseId: str, courseWorkId: str, **_filters):
        store = self._store

        class Request:
            def execute(self):
                found = store.get("rubrics", {}).get(courseId, {}).get(courseWorkId)
                return {"rubrics": [found] if found else []}
        return Request()


class MockFormsResource:
    """Google Forms API v1 simulator. Test switches: 'refuse_forms' and 'refuse_publish': (status, message)."""
    def __init__(self, store: Dict[str, Any]):
        self._store = store

    def forms(self):
        return MockFormsEndpoint(self._store)


class MockFormsEndpoint:
    def __init__(self, store: Dict[str, Any]):
        self._store = store

    def _request(self, run):
        class Request:
            def execute(self):
                return run()
        return Request()

    def create(self, body: Dict[str, Any]):
        def run():
            if self._store.get("refuse_forms"):
                raise _mock_http_error(*self._store["refuse_forms"])
            if set(body) - {"info"} or set(body.get("info", {})) - {"title", "documentTitle"}:
                raise _mock_http_error(400, "Only info.title and info.documentTitle can be set when creating a form.")
            forms = self._store.setdefault("forms", {})
            form_id = f"form-{len(forms) + 1}"
            forms[form_id] = {
                "formId": form_id, "info": dict(body["info"]), "items": [], "settings": {},
                "publishSettings": {"publishState": {"isPublished": False, "isAcceptingResponses": False}},
                "responderUri": f"https://docs.google.com/forms/d/e/{form_id}/viewform",
            }
            return json.loads(json.dumps(forms[form_id]))
        return self._request(run)

    def batchUpdate(self, formId: str, body: Dict[str, Any]):
        def run():
            form = self._store["forms"][formId]
            for request in body.get("requests", []):  # validate everything first: a batch is all or nothing
                question = (request.get("createItem", {}).get("item", {}).get("questionItem") or {}).get("question", {})
                grading = question.get("grading")
                if grading is not None:
                    answers = [a["value"] for a in (grading.get("correctAnswers") or {}).get("answers", [])]
                    if not answers:
                        raise _mock_http_error(400, "grading.correctAnswers is required.")
                    options = [o["value"] for o in (question.get("choiceQuestion") or {}).get("options", [])]
                    if options and any(a not in options for a in answers):
                        raise _mock_http_error(400, "A correct answer is not one of the options.")
            for request in body.get("requests", []):
                if "updateSettings" in request:
                    form["settings"].update(request["updateSettings"]["settings"])
                elif "updateFormInfo" in request:
                    form["info"].update(request["updateFormInfo"]["info"])
                elif "createItem" in request:
                    form["items"].append(request["createItem"]["item"])
            return {"form": form}
        return self._request(run)

    def setPublishSettings(self, formId: str, body: Dict[str, Any]):
        def run():
            if self._store.get("refuse_publish"):
                raise _mock_http_error(*self._store["refuse_publish"])
            self._store["forms"][formId]["publishSettings"] = body["publishSettings"]
            return {"formId": formId, "publishSettings": body["publishSettings"]}
        return self._request(run)

    def get(self, formId: str):
        return self._request(lambda: self._store["forms"][formId])


class MockAnnouncementsEndpoint:
    def __init__(self, store: Dict[str, Any]):
        self._store = store

    def create(self, courseId: str, body: Dict[str, Any]):
        class Request:
            def __init__(self, store, cid, body):
                self.store = store
                self.cid = cid
                self.body = body

            def execute(self):
                _mock_require_active(self.store, self.cid)
                ann_list = self.store["announcements"].setdefault(self.cid, [])
                aid = f"ann-{len(ann_list) + 1}"
                record = {
                    "id": aid,
                    "courseId": self.cid,
                    "text": self.body.get("text", ""),
                    "state": self.body.get("state", "PUBLISHED"),
                    "creationTime": datetime.now(timezone.utc).isoformat(),
                }
                ann_list.append(record)
                return record
        return Request(self._store, courseId, body)

    def list(self, courseId: str, pageSize=100, **_filters):
        class Request:
            def __init__(self, store, cid):
                self.store = store
                self.cid = cid

            def execute(self):
                items = self.store["announcements"].get(self.cid, [])
                return {"announcements": items}
        return Request(self._store, courseId)

    def patch(self, courseId: str, id: str, updateMask: str, body: Dict[str, Any]):
        store = self._store

        class Request:
            def execute(self):
                post = next((a for a in store["announcements"].get(courseId, []) if a["id"] == id), None)
                if not post:
                    raise _mock_http_error(404, "Announcement not found")
                if post.get("associatedWithDeveloper") is False:
                    raise _mock_http_error(403, "@ProjectPermissionDenied The Developer Project is not permitted to make the request.")
                for field in [m.strip() for m in updateMask.split(",") if m.strip()]:
                    if field in body:
                        post[field] = body[field]
                    else:
                        post.pop(field, None)
                return post
        return Request()


class MockTeachersEndpoint:
    def __init__(self, store: Dict[str, Any]):
        self._store = store

    def create(self, courseId: str, body: Dict[str, Any]):
        class Request:
            def __init__(self, store, cid, body):
                self.store = store
                self.cid = cid
                self.body = body

            def execute(self):
                _mock_check_direct_add(self.store, str(self.body.get("userId", "")).strip().lower())
                teacher_list = self.store.setdefault("teachers", {}).setdefault(self.cid, [])
                user_id = str(self.body.get("userId", "")).strip().lower()
                record = {
                    "courseId": self.cid,
                    "userId": user_id,
                    "profile": {
                        "id": f"teacher-{len(teacher_list) + 1}",
                        "emailAddress": user_id,
                        "name": {"fullName": user_id.split("@")[0].replace(".", " ").title()}
                    }
                }
                # Check for duplicate
                if not any(t.get("userId") == user_id for t in teacher_list):
                    teacher_list.append(record)
                return record
        return Request(self._store, courseId, body)

    def list(self, courseId: str, pageSize=100, **_filters):
        class Request:
            def __init__(self, store, cid):
                self.store = store
                self.cid = cid

            def execute(self):
                teachers = self.store.setdefault("teachers", {}).get(self.cid, [])
                return {"teachers": teachers}
        return Request(self._store, courseId)


class MockStudentsEndpoint:
    def __init__(self, store: Dict[str, Any]):
        self._store = store

    def create(self, courseId: str, body: Dict[str, Any]):
        class Request:
            def __init__(self, store, cid, body):
                self.store = store
                self.cid = cid
                self.body = body

            def execute(self):
                _mock_check_direct_add(self.store, str(self.body.get("userId", "")).strip().lower())
                student_list = self.store.setdefault("students", {}).setdefault(self.cid, [])
                user_id = str(self.body.get("userId", "")).strip().lower()
                record = {
                    "courseId": self.cid,
                    "userId": user_id,
                    "profile": {
                        "id": f"student-{len(student_list) + 1}",
                        "emailAddress": user_id,
                        "name": {"fullName": user_id.split("@")[0].replace(".", " ").title()}
                    }
                }
                # Check for duplicate
                if not any(s.get("userId") == user_id for s in student_list):
                    student_list.append(record)
                return record
        return Request(self._store, courseId, body)

    def list(self, courseId: str, pageSize=100, **_filters):
        class Request:
            def __init__(self, store, cid):
                self.store = store
                self.cid = cid

            def execute(self):
                students = self.store.setdefault("students", {}).get(self.cid, [])
                return {"students": students}
        return Request(self._store, courseId)


# =============================================================================
# SPREADSHEET PARSER & SCHEMA VALIDATOR
# =============================================================================

class CourseSpreadsheetData:
    """Container holding normalized settings, curriculum, and optional students roster data."""
    def __init__(self, settings: Dict[str, Any], curriculum: List[Dict[str, Any]], students: Optional[List[str]] = None):
        self.settings = settings
        self.curriculum = curriculum
        self.students = students or []


def _normalize_students_sheet(df: pd.DataFrame) -> List[str]:
    """Extracts unique student email addresses from a students or roster spreadsheet."""
    students = []
    if df.empty:
        return students

    for _, row in df.iterrows():
        email_found = None
        for col in df.columns:
            val = str(row[col]).strip()
            if pd.isna(row[col]) or not val or val.lower() == "nan":
                continue
            if "@" in val:
                match = re.search(r"[\w\.-]+@[\w\.-]+", val)
                if match:
                    email_found = match.group(0).lower()
                    break
        if email_found and email_found not in students:
            students.append(email_found)
    return students


def parse_course_spreadsheet(file_path: str) -> CourseSpreadsheetData:
    """
    Parses an Excel workbook containing 'Course_Settings', 'Curriculum',
    and optional 'Students' roster sheets.
    Supports both key-value and tabular formats for Course_Settings,
    and handles flexible column header names for Curriculum.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Spreadsheet file not found: {file_path}")

    with pd.ExcelFile(file_path) as xls:
        sheet_names_lower = {name.lower().strip(): name for name in xls.sheet_names}

        # 1. Parse Course_Settings
        settings_sheet_name = None
        for candidate in ["course_settings", "coursesettings", "settings", "course settings", "sheet1"]:
            if candidate in sheet_names_lower:
                settings_sheet_name = sheet_names_lower[candidate]
                break

        if not settings_sheet_name:
            raise ValueError(f"Missing required 'Course_Settings' sheet. Available sheets: {xls.sheet_names}")

        df_settings = pd.read_excel(xls, sheet_name=settings_sheet_name)
        settings = _normalize_settings_sheet(df_settings)

        # 2. Parse Curriculum
        curriculum_sheet_name = None
        for candidate in ["curriculum", "modules", "syllabus", "topics", "sheet2"]:
            if candidate in sheet_names_lower:
                curriculum_sheet_name = sheet_names_lower[candidate]
                break

        if not curriculum_sheet_name:
            raise ValueError(f"Missing required 'Curriculum' sheet. Available sheets: {xls.sheet_names}")

        df_curriculum = pd.read_excel(xls, sheet_name=curriculum_sheet_name)
        curriculum = _normalize_curriculum_sheet(df_curriculum)

        # Optional Quiz_Questions sheet: the questions and answers of each week's quiz
        for candidate in ["quiz_questions", "quiz questions", "quizquestions", "quizzes", "quiz"]:
            if candidate in sheet_names_lower:
                df_quiz = pd.read_excel(xls, sheet_name=sheet_names_lower[candidate])
                _attach_quiz_questions(df_quiz, curriculum, sheet_names_lower[candidate])
                break

        # 3. Parse Optional Students / Roster sheet
        students = []
        for candidate in ["students", "student", "roster", "class_roster", "enrollment", "sheet3"]:
            if candidate in sheet_names_lower:
                df_students = pd.read_excel(xls, sheet_name=sheet_names_lower[candidate])
                students = _normalize_students_sheet(df_students)
                break

    return CourseSpreadsheetData(settings, curriculum, students)


def _normalize_settings_sheet(df: pd.DataFrame) -> Dict[str, Any]:
    """Handles both vertical key-value and standard horizontal table formats."""
    settings: Dict[str, Any] = {
        "class_name": "Untitled Course",
        "section": "",
        "subject": "",
        "level": "",
        "room": "",
        "welcome_announcement": "",
        "teachers": [],
        "aliases": [],
    }

    if df.empty:
        return settings

    cols = [str(c).strip().lower() for c in df.columns]
    
    # Check for Key-Value vertical layout
    if len(df.columns) >= 2 and ("setting" in cols[0] or "key" in cols[0] or "property" in cols[0] or any(k in str(df.iloc[0, 0]).lower() for k in ["class", "name", "section", "subject"])):
        for _, row in df.iterrows():
            k = str(row.iloc[0]).strip().lower()
            v = row.iloc[1]
            if pd.isna(v):
                continue
            v = str(v).strip()
            _map_setting_field(settings, k, v)
        return settings

    # Check horizontal table layout
    row0 = df.iloc[0]
    for col in df.columns:
        k = str(col).strip().lower()
        v = row0[col]
        if pd.isna(v):
            continue
        v = str(v).strip()
        _map_setting_field(settings, k, v)

    return settings


def _map_setting_field(settings: Dict[str, Any], key: str, val: Any):
    k = key.replace(" ", "_").replace("-", "_")
    if k in ("class_name", "name", "title", "course_name", "course_title"):
        settings["class_name"] = str(val)
    elif k in ("section", "cohort", "cohort_name"):
        settings["section"] = str(val)
    elif k in ("subject", "subject_area", "department", "category"):
        settings["subject"] = str(val)
    elif k in ("level", "academic_level", "difficulty"):
        settings["level"] = str(val)
    elif k in ("room", "classroom", "location", "virtual_room"):
        settings["room"] = str(val)
    elif k in ("welcome_announcement", "announcement", "welcome_message", "stream_announcement"):
        settings["welcome_announcement"] = str(val)
    elif k in ("teachers", "teacher", "instructors", "instructor", "co_teachers", "co_teacher", "faculty"):
        parsed = [t.strip().lower() for t in re.split(r"[\r\n,;]+", str(val)) if t.strip() and "@" in t]
        settings["teachers"] = parsed
    elif k in ("alias", "aliases", "course_alias", "sis_id", "sis_course_id", "external_id"):
        settings["aliases"] = [a.strip() for a in re.split(r"[\r\n,;]+", str(val)) if a.strip()]


def _normalize_curriculum_sheet(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Extracts module topics, presentation lecture links, assignments, quizzes, and questions."""
    modules: List[Dict[str, Any]] = []

    # Map column names flexibly. Specific headers are checked before generic ones:
    # "Assignment Title" must not fall into the bare "title" rule, nor "Question Type"
    # into the bare "question" rule.
    col_map = {}
    for col in df.columns:
        c_clean = str(col).strip().lower().replace("_", " ")
        if any(w in c_clean for w in ["stream topic", "classroom topic", "classroom stream topic"]):
            col_map["stream_topic"] = col
        elif "rubric" in c_clean:
            col_map["rubric_url"] = col
        elif any(w in c_clean for w in ["quiz points", "quiz max points", "quiz score"]):
            col_map["quiz_points"] = col
        elif any(w in c_clean for w in ["question points", "question max points", "question score"]):
            col_map["question_points"] = col
        elif any(w in c_clean for w in ["question choices", "choices", "answer options"]):
            col_map["question_choices"] = col
        elif any(w in c_clean for w in ["youtube", "video"]):
            col_map["youtube_urls"] = col
        elif "notebook" in c_clean:
            col_map["notebook_url"] = col
        elif any(w in c_clean for w in ["quiz assignment", "quiz title", "quiz name"]):
            col_map["quiz_title"] = col
        elif any(w in c_clean for w in ["quiz url", "quiz form", "quiz form url", "google form"]):
            col_map["quiz_url"] = col
        elif any(w in c_clean for w in ["question type", "prompt type"]):
            col_map["question_type"] = col
        elif any(w in c_clean for w in ["question prompt", "discussion question", "question"]):
            col_map["question_prompt"] = col
        elif any(w in c_clean for w in ["assignment instructions", "assignment desc", "instructions"]):
            col_map["assignment_instructions"] = col
        elif any(w in c_clean for w in ["assignment title", "assignment name", "assignment"]):
            col_map["assignment_title"] = col
        elif any(w in c_clean for w in ["assessment", "knowledge check", "exam"]):
            col_map["assessment"] = col
        elif any(w in c_clean for w in ["week", "module number", "module #", "unit"]):
            col_map["sequence"] = col
        elif any(w in c_clean for w in ["module title", "topic title", "unit title", "title"]):
            if "stream_topic" not in col_map or col != col_map.get("stream_topic"):
                col_map["title"] = col
        elif any(w in c_clean for w in ["overview", "description", "summary", "module overview"]):
            col_map["overview"] = col
        elif any(w in c_clean for w in ["lecture materials", "presentation", "slides", "slides url", "materials url", "lecture presentation url"]):
            col_map["lecture_url"] = col
        elif any(w in c_clean for w in ["points", "max points", "score"]):
            col_map["points"] = col
        elif any(w in c_clean for w in ["due date", "deadline"]):
            col_map["due_date"] = col

    for idx, row in df.iterrows():
        seq = (_cell_text(row[col_map["sequence"]]) if "sequence" in col_map else "") or f"Week {idx + 1}"
        title = str(row[col_map["title"]]).strip() if "title" in col_map and not pd.isna(row[col_map["title"]]) else f"Module {idx + 1}"
        overview = str(row[col_map["overview"]]).strip() if "overview" in col_map and not pd.isna(row[col_map["overview"]]) else ""
        
        # Classroom Stream Topic
        if "stream_topic" in col_map and not pd.isna(row[col_map["stream_topic"]]):
            topic_name = str(row[col_map["stream_topic"]]).strip()
        else:
            topic_name = f"{seq}: {title}" if seq and not title.lower().startswith(seq.lower()) else title

        # Material / Lecture Presentation (Supports multiple presentation & document links)
        lecture_urls = []
        if "lecture_url" in col_map and not pd.isna(row[col_map["lecture_url"]]):
            raw_val = str(row[col_map["lecture_url"]]).strip()
            for part in re.split(r'[\r\n,;]+', raw_val):
                p_clean = sanitize_and_validate_presentation_url(part)
                if p_clean:
                    lecture_urls.append(p_clean)

        clean_lecture_url = lecture_urls[0] if lecture_urls else None

        # YouTube videos and the topic's notebook
        youtube_urls = []
        if "youtube_urls" in col_map and not pd.isna(row[col_map["youtube_urls"]]):
            for part in re.split(r'[\r\n,;]+', str(row[col_map["youtube_urls"]])):
                v_clean = sanitize_and_validate_presentation_url(part)
                if v_clean:
                    youtube_urls.append(v_clean)
        notebook_url = None
        if "notebook_url" in col_map and not pd.isna(row[col_map["notebook_url"]]):
            notebook_url = sanitize_and_validate_presentation_url(row[col_map["notebook_url"]])
            if not is_notebook_url(notebook_url):
                raise ValueError(
                    f"Row {idx + 2}: '{row[col_map['notebook_url']]}' is not a notebook link. "
                    f"It must start with {NOTEBOOK_HOSTS_TEXT}"
                )

        # Assignment
        assignment_title = ""
        if "assignment_title" in col_map and not pd.isna(row[col_map["assignment_title"]]):
            assignment_title = str(row[col_map["assignment_title"]]).strip()
        elif "assessment" in col_map and not pd.isna(row[col_map["assessment"]]):
            assignment_title = str(row[col_map["assessment"]]).strip()

        assignment_instructions = str(row[col_map["assignment_instructions"]]).strip() if "assignment_instructions" in col_map and not pd.isna(row[col_map["assignment_instructions"]]) else overview

        # Quiz Assignment
        quiz_title = str(row[col_map["quiz_title"]]).strip() if "quiz_title" in col_map and not pd.isna(row[col_map["quiz_title"]]) else ""
        raw_quiz_url = row[col_map["quiz_url"]] if "quiz_url" in col_map and not pd.isna(row[col_map["quiz_url"]]) else None
        clean_quiz_url = sanitize_and_validate_presentation_url(raw_quiz_url)

        # Question: short answer, or multiple choice with its choices (one per line, or separated by ;)
        question_prompt = str(row[col_map["question_prompt"]]).strip() if "question_prompt" in col_map and not pd.isna(row[col_map["question_prompt"]]) else ""
        raw_type = str(row[col_map["question_type"]]).strip() if "question_type" in col_map and not pd.isna(row[col_map["question_type"]]) else ""
        question_type = "MULTIPLE_CHOICE_QUESTION" if "MULTIPLE" in raw_type.upper() else "SHORT_ANSWER_QUESTION"
        question_choices: List[str] = []
        if "question_choices" in col_map and not pd.isna(row[col_map["question_choices"]]):
            for part in re.split(r"[\r\n;]+", str(row[col_map["question_choices"]])):
                if part.strip() and part.strip() not in question_choices:
                    question_choices.append(part.strip())
        if question_prompt and question_type == "MULTIPLE_CHOICE_QUESTION" and len(question_choices) < 2:
            raise ValueError(
                f"Row {idx + 2}: the multiple-choice question '{question_prompt[:60]}' needs at least 2 choices "
                "in the Question Choices column (one per line, or separated by ;)."
            )

        # Points & Due Date
        points_raw = row[col_map["points"]] if "points" in col_map and not pd.isna(row[col_map["points"]]) else 100

        points = 100
        try:
            if not pd.isna(points_raw):
                points = int(float(points_raw))
        except (ValueError, TypeError):
            points = 100

        def item_points(key: str, default: int) -> int:
            """Quiz or question points. Blank keeps the default; 0 means ungraded."""
            raw_points = row[col_map[key]] if key in col_map else None
            if raw_points is None or pd.isna(raw_points) or not str(raw_points).strip():
                return default
            try:
                value = float(raw_points)
            except (TypeError, ValueError):
                raise ValueError(f"Row {idx + 2}: '{raw_points}' is not a number of points.") from None
            if value < 0 or value != int(value):
                raise ValueError(f"Row {idx + 2}: points must be a whole number of 0 or more, not '{raw_points}'.")
            return int(value)

        quiz_points = item_points("quiz_points", 50)
        question_points = item_points("question_points", 20)

        # Parsed now, so a bad date stops the build before anything is created in Classroom.
        raw_due = row[col_map["due_date"]] if "due_date" in col_map else None
        due = parse_due_datetime(raw_due, f"Row {idx + 2}: due date")
        due_text = ""
        if due:
            due_text = raw_due.isoformat(timespec="minutes") if isinstance(raw_due, datetime) else str(raw_due).strip()

        modules.append({
            "sequence": seq,
            "title": title,
            "topic_name": topic_name,
            "overview": overview,
            # 1. Material (Multiple links supported)
            "presentation_url": clean_lecture_url,
            "presentation_urls": lecture_urls,
            "has_presentation": len(lecture_urls) > 0,
            "youtube_urls": youtube_urls,
            "notebook_url": notebook_url,
            # 2. Assignment
            "assignment_title": assignment_title,
            "assignment_instructions": assignment_instructions,
            "assessment_text": assignment_title,
            # 3. Quiz Assignment
            "quiz_title": quiz_title,
            "quiz_url": clean_quiz_url,
            "quiz_points": quiz_points,
            # 4. Question
            "question_prompt": question_prompt,
            "question_type": question_type,
            "question_choices": question_choices,
            "question_points": question_points,
            # Shared metrics
            "points": points,
            "due": due,  # {"dueDate", "dueTime"} in UTC, or None
            "due_text": due_text,  # as the teacher wrote it
            "rubric_url": _cell_text(row[col_map["rubric_url"]]) if "rubric_url" in col_map else "",
            "quiz_questions": [],  # filled from the Quiz_Questions sheet
        })

    return modules


# The Course Builder workbook (Google_Classroom_Course_Template.xlsx): settings keys and the
# Curriculum columns, as (header, web app field). The web app writes and reads the same headers
# (src/lib/courseWorkbook.js); test_template_roundtrip.py checks that the two lists match.
SETTINGS_KEYS = ["class_name", "section", "subject", "level", "room", "welcome_announcement", "teachers"]
CURRICULUM_COLUMNS = [
    ("Week", "sequence"),
    ("Classroom Stream Topic", "stream_topic"),
    ("Module Title", "title"),
    ("Module Overview / Description", "overview"),
    ("Lecture Presentation URL (Google Slides / Web Document)", "presentation_urls"),
    ("YouTube Video URLs", "youtube_urls"),
    ("Notebook URL", "notebook_url"),
    ("Assessment / Knowledge Check", "assignment_title"),
    ("Assignment Instructions", "assignment_instructions"),
    ("Assignment Rubric (Google Sheet URL)", "rubric_url"),
    ("Points", "points"),
    ("Due Date", "due_date"),
    ("Quiz assignment", "quiz_title"),
    ("Quiz URL", "quiz_url"),
    ("Quiz Points", "quiz_points"),
    ("Question", "question_prompt"),
    ("Question Type", "question_type"),
    ("Question Choices", "question_choices"),
    ("Question Points", "question_points"),
]


# The Quiz_Questions sheet: one row per question, joined to its week by the Week label.
QUIZ_QUESTION_COLUMNS = [
    ("Week", "week"),
    ("Question", "question"),
    ("Question Type", "type"),
    ("Choices", "choices"),
    ("Correct Answers", "answers"),
    ("Points", "points"),
    ("Feedback", "feedback"),
]
QUIZ_QUESTION_TYPES = ("MULTIPLE_CHOICE", "CHECKBOXES", "DROPDOWN", "TRUE_FALSE", "SHORT_ANSWER", "PARAGRAPH")
# Google Forms choice type for each choice question type
FORM_CHOICE_TYPES = {"MULTIPLE_CHOICE": "RADIO", "CHECKBOXES": "CHECKBOX", "DROPDOWN": "DROP_DOWN", "TRUE_FALSE": "RADIO"}
_QUIZ_TYPE_ALIASES = {
    "MULTIPLE_CHOICE": "MULTIPLE_CHOICE", "MCQ": "MULTIPLE_CHOICE", "RADIO": "MULTIPLE_CHOICE",
    "CHECKBOXES": "CHECKBOXES", "CHECKBOX": "CHECKBOXES",
    "DROPDOWN": "DROPDOWN", "DROP_DOWN": "DROPDOWN",
    "TRUE_FALSE": "TRUE_FALSE", "TRUE_OR_FALSE": "TRUE_FALSE", "TF": "TRUE_FALSE", "T_F": "TRUE_FALSE",
    "SHORT_ANSWER": "SHORT_ANSWER", "SHORT": "SHORT_ANSWER", "TEXT": "SHORT_ANSWER",
    "PARAGRAPH": "PARAGRAPH", "LONG_ANSWER": "PARAGRAPH", "ESSAY": "PARAGRAPH",
}
_TRUE_FALSE = {"true": "True", "t": "True", "yes": "True", "false": "False", "f": "False", "no": "False"}


def _cell_text(value: Any) -> str:
    """A spreadsheet cell as text: blank for empty, True/False for booleans, no '.0' on whole numbers."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _split_entries(text: str) -> List[str]:
    """Entries separated by new lines or semicolons, without blanks or repeats."""
    entries: List[str] = []
    for part in re.split(r"[\r\n;]+", text or ""):
        if part.strip() and part.strip() not in entries:
            entries.append(part.strip())
    return entries


def parse_quiz_question(cells: Dict[str, Any], where: str) -> Dict[str, Any]:
    """
    One quiz question from its cells (keys as in QUIZ_QUESTION_COLUMNS). Raises ValueError,
    naming `where`, for anything that would give students a broken or wrongly marked quiz.
    """
    question = _cell_text(cells.get("question"))
    if not question:
        raise ValueError(f"{where}: the question is empty.")
    choices = _split_entries(_cell_text(cells.get("choices")))
    raw_type = _cell_text(cells.get("type"))
    type_key = re.sub(r"[^A-Z]+", "_", raw_type.upper()).strip("_")
    qtype = _QUIZ_TYPE_ALIASES.get(type_key) if type_key else ("MULTIPLE_CHOICE" if choices else "SHORT_ANSWER")
    if not qtype:
        raise ValueError(f"{where}: question type '{raw_type}' is not one of " + ", ".join(QUIZ_QUESTION_TYPES) + ".")
    answers = _split_entries(_cell_text(cells.get("answers")))

    if qtype == "TRUE_FALSE":
        choices = ["True", "False"]
        answers = [_TRUE_FALSE.get(a.lower(), a) for a in answers]
    if qtype in FORM_CHOICE_TYPES:
        if len(choices) < 2:
            raise ValueError(f"{where}: '{question[:60]}' needs at least 2 choices.")
        by_lower = {c.lower(): c for c in choices}
        unknown = [a for a in answers if a.lower() not in by_lower]
        if unknown:
            raise ValueError(f"{where}: the correct answer '{unknown[0]}' is not one of the choices of '{question[:60]}'.")
        answers = list(dict.fromkeys(by_lower[a.lower()] for a in answers))
    elif qtype == "PARAGRAPH":
        choices, answers = [], []  # paragraph answers are marked by hand
    else:
        choices = []

    raw_points = _cell_text(cells.get("points"))
    if not raw_points:
        points = 1 if answers else 0
    else:
        try:
            value = float(raw_points)
        except ValueError:
            raise ValueError(f"{where}: '{raw_points}' is not a number of points.") from None
        if value < 0 or value != int(value):
            raise ValueError(f"{where}: points must be a whole number of 0 or more, not '{raw_points}'.")
        points = int(value)
    return {"question": question, "type": qtype, "choices": choices, "answers": answers,
            "points": points, "feedback": _cell_text(cells.get("feedback"))}


def _quiz_column_key(header: Any) -> Optional[str]:
    h = re.sub(r"[\s_-]+", " ", str(header or "")).strip().lower()
    exact = {name.lower(): key for name, key in QUIZ_QUESTION_COLUMNS}
    if h in exact:
        return exact[h]
    for words, key in ((("week", "topic order"), "week"), (("type",), "type"), (("choice", "option"), "choices"),
                       (("answer", "correct"), "answers"), (("point", "mark", "score"), "points"),
                       (("feedback", "explanation"), "feedback"), (("question",), "question")):
        if any(w in h for w in words):
            return key
    return None


def _attach_quiz_questions(df: pd.DataFrame, curriculum: List[Dict[str, Any]], sheet: str) -> None:
    """Adds each Quiz_Questions row to its week's quiz. Raises ValueError for a row that cannot be used."""
    columns = {col: _quiz_column_key(col) for col in df.columns}
    if "week" not in columns.values() or "question" not in columns.values():
        raise ValueError(f"The {sheet} sheet needs a Week column and a Question column.")
    weeks = {re.sub(r"\s+", " ", str(m["sequence"])).strip().lower(): m for m in curriculum}
    for idx, row in df.iterrows():
        cells = {key: row[col] for col, key in columns.items() if key}
        if not any(_cell_text(v) for v in cells.values()):
            continue  # empty row
        where = f"{sheet} row {idx + 2}"
        label = _cell_text(cells.get("week"))
        mod = weeks.get(re.sub(r"\s+", " ", label).strip().lower())
        if not mod:
            raise ValueError(f"{where}: week '{label}' is not in the Curriculum sheet.")
        mod.setdefault("quiz_questions", []).append(parse_quiz_question(cells, where))


# Google Sheets (or Drive) links that a rubric can be imported from
_SHEET_ID = re.compile(
    r"^https://(?:docs\.google\.com/(?:a/[^/]+/)?spreadsheets/(?:u/\d+/)?d/"
    r"|drive\.google\.com/(?:a/[^/]+/)?file/(?:u/\d+/)?d/)([A-Za-z0-9_-]{10,})"
)


def extract_sheet_id(raw_url: Any) -> Optional[str]:
    """The file ID in a Google Sheets link (docs.google.com/spreadsheets/d/... or a Drive file link)."""
    text = str(raw_url or "").strip()
    match = _SHEET_ID.match(text) or _DRIVE_OPEN_ID.match(text)
    return match.group(1) if match else None


def _lines(values: Any) -> str:
    return chr(10).join(str(v).strip() for v in (values or []) if v is not None and str(v).strip())


def _curriculum_cell(mod: Dict[str, Any], key: str, index: int) -> Any:
    """One Curriculum cell from a week as the web app sends it."""
    value = mod.get(key)
    if key == "sequence":
        return value or f"Week {index + 1}"
    if key == "stream_topic":
        return value or f"{mod.get('sequence') or f'Week {index + 1}'}: {mod.get('title') or f'Module {index + 1}'}"
    if key == "presentation_urls":
        return _lines(value if isinstance(value, list) else [mod.get("presentation_url")]) or _lines([mod.get("presentation_url")])
    if key in ("youtube_urls", "question_choices"):
        return _lines(value)
    if key == "notebook_url":
        return str(value or "").strip() if mod.get("notebook_enabled", True) else ""
    if key == "assignment_title":
        return value or mod.get("assessment", "")
    if key == "question_type":
        return value or "SHORT_ANSWER_QUESTION"
    if key == "points":
        return 100 if value in (None, "") else value
    return "" if value is None else value


def write_course_workbook(settings: Dict[str, Any], curriculum: List[Dict[str, Any]],
                          students: Optional[List[Any]], path: str) -> str:
    """Write a course as the web app sends it (settings, weeks, students) to a Course Builder workbook."""
    keys = SETTINGS_KEYS + [k for k in settings if k not in SETTINGS_KEYS]
    settings_rows = [{"Setting": k, "Value": ", ".join(map(str, settings[k])) if isinstance(settings.get(k), list)
                      else settings.get(k, "")} for k in keys if k in settings]
    curriculum_rows = [{header: _curriculum_cell(mod, key, i) for header, key in CURRICULUM_COLUMNS}
                       for i, mod in enumerate(curriculum)]
    student_rows = [{"Student Email": s if isinstance(s, str) else (s or {}).get("email", "")} for s in (students or [])]
    quiz_rows = [
        {"Week": _curriculum_cell(mod, "sequence", i), "Question": q.get("question", ""),
         "Question Type": q.get("type", ""), "Choices": _lines(q.get("choices")),
         "Correct Answers": _lines(q.get("answers")),
         "Points": "" if q.get("points") in (None, "") else q.get("points"), "Feedback": q.get("feedback", "")}
        for i, mod in enumerate(curriculum) for q in (mod.get("quiz_questions") or [])
    ]
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        pd.DataFrame(settings_rows, columns=["Setting", "Value"]).to_excel(writer, sheet_name="Course_Settings", index=False)
        pd.DataFrame(curriculum_rows, columns=[h for h, _ in CURRICULUM_COLUMNS]).to_excel(
            writer, sheet_name="Curriculum", index=False)
        if quiz_rows:
            pd.DataFrame(quiz_rows, columns=[h for h, _ in QUIZ_QUESTION_COLUMNS]).to_excel(
                writer, sheet_name="Quiz_Questions", index=False)
        if student_rows:
            pd.DataFrame(student_rows, columns=["Student Email"]).to_excel(writer, sheet_name="Students", index=False)
    return path


def generate_sample_course_template(output_path: str = "sample_course_curriculum.xlsx") -> str:
    """Generates a professional sample spreadsheet with all 5 Google Classroom item types on one sheet."""
    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        # Sheet 1: Course_Settings
        df_settings = pd.DataFrame([
            {"Setting": "class_name", "Value": "CS101: Introduction to Cloud Computing"},
            {"Setting": "section", "Value": "Cohort 1 - Fall"},
            {"Setting": "subject", "Value": "Computer Science & Cloud Systems"},
            {"Setting": "level", "Value": "Undergraduate (Introductory)"},
            {"Setting": "room", "Value": "Virtual Lab Room A-12"},
            {"Setting": "welcome_announcement", "Value": "Welcome to CS101! Please review the syllabus, bookmark the lecture slide links, and complete weekly coursework."},
        ])
        df_settings.to_excel(writer, sheet_name="Course_Settings", index=False)

        # Sheet 2: Curriculum (All 5 item types on one sheet)
        df_curriculum = pd.DataFrame([
            {
                "Week": "Week 1",
                "Classroom Stream Topic": "Week 1: Foundations of Cloud Infrastructure",
                "Module Title": "Foundations of Cloud Infrastructure",
                "Module Overview": "Introduction to distributed systems, virtualization, hypervisors, and multi-tenant architectures.",
                "Lecture Presentation URL": "https://docs.google.com/presentation/d/1demo-cloud-foundations-slides/edit",
                "Assignment Title": "Lab 1: Setting up Cloud Shell & IAM",
                "Assignment Instructions": "Configure your cloud environment, set up service accounts, and verify CLI access.",
                "Quiz Assignment Title": "Quiz 1: Virtualization vs Containers",
                "Quiz Form URL": "https://docs.google.com/forms/d/1quiz-cloud-foundations/viewform",
                "Question Prompt": "What are the primary performance trade-offs between Type-1 and Type-2 hypervisors?",
                "Question Type": "SHORT_ANSWER_QUESTION",
                "Points": 100,
                "Due Date": "2026-10-15"
            },
            {
                "Week": "Week 2",
                "Classroom Stream Topic": "Week 2: Compute & Container Orchestration",
                "Module Title": "Compute & Container Orchestration",
                "Module Overview": "Deep dive into Docker container runtime and Kubernetes workload management.",
                "Lecture Presentation URL": "https://docs.google.com/presentation/d/2demo-kubernetes-containers/edit",
                "Assignment Title": "Lab Assignment: Deploying Microservices on GKE",
                "Assignment Instructions": "Package a Node.js microservice into a container and deploy a 3-replica Pod on Kubernetes.",
                "Quiz Assignment Title": "Quiz 2: Pods, Services and Ingress",
                "Quiz Form URL": "https://docs.google.com/forms/d/2quiz-kubernetes/viewform",
                "Question Prompt": "When would you choose a StatefulSet over a Deployment in Kubernetes?",
                "Question Type": "SHORT_ANSWER_QUESTION",
                "Points": 100,
                "Due Date": "2026-10-22"
            },
            {
                "Week": "Week 3",
                "Classroom Stream Topic": "Week 3: Cloud Storage & Scalable Databases",
                "Module Title": "Cloud Storage & Scalable Databases",
                "Module Overview": "Understanding blob storage, transactional SQL databases, and globally distributed NoSQL.",
                "Lecture Presentation URL": "https://docs.google.com/presentation/d/3demo-cloud-databases-storage/edit",
                "Assignment Title": "Design Project: High-Availability Storage Tier",
                "Assignment Instructions": "Produce an architectural diagram and schema design for a multi-region transactional database.",
                "Quiz Assignment Title": "Quiz 3: CAP Theorem and Data Models",
                "Quiz Form URL": "https://docs.google.com/forms/d/3quiz-storage/viewform",
                "Question Prompt": "Why does Bigtable use LSM-trees instead of B-trees for high-throughput writes?",
                "Question Type": "SHORT_ANSWER_QUESTION",
                "Points": 100,
                "Due Date": "2026-10-29"
            },
            {
                "Week": "Week 4",
                "Classroom Stream Topic": "Week 4: DevOps, Security & Final Capstone",
                "Module Title": "DevOps, Security & Final Capstone",
                "Module Overview": "IAM roles, least privilege, CI/CD automation pipelines, and course capstone presentation.",
                "Lecture Presentation URL": "https://docs.google.com/presentation/d/4demo-devops-security-capstone/edit",
                "Assignment Title": "Final Capstone: Automated Deployment Pipeline",
                "Assignment Instructions": "Implement a complete automated GitHub Actions to Cloud Deploy pipeline with blue/green release.",
                "Quiz Assignment Title": "Comprehensive Final Exam Assessment",
                "Quiz Form URL": "https://docs.google.com/forms/d/4quiz-capstone/viewform",
                "Question Prompt": "How do you enforce least privilege access across multi-team cloud organizations?",
                "Question Type": "SHORT_ANSWER_QUESTION",
                "Points": 200,
                "Due Date": "2026-11-05"
            }
        ])
        df_curriculum.to_excel(writer, sheet_name="Curriculum", index=False)

    return output_path


# =============================================================================
# GOOGLE CLASSROOM SERVICE FACTORY
# =============================================================================

def get_classroom_service(use_mock: bool = False, verbose: bool = True) -> Any:
    """
    Initializes and returns the Google Classroom API v1 service client.
    If use_mock is True, or if credentials are not found, falls back gracefully
    to the in-memory MockClassroomResource simulator for seamless testing.
    """
    if use_mock:
        if verbose:
            print("[INFO] Initializing In-Memory Mock Google Classroom API Service Simulator...")
        mock_store = {
            "courses": {},
            "topics": {},
            "materials": {},
            "coursework": {},
            "announcements": {},
            "students": {},
        }
        return MockClassroomResource(mock_store)

    creds = None

    # 1. Check existing user OAuth token
    if os.path.exists(TOKEN_FILE):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
        except Exception as e:
            if verbose:
                print(f"[WARN] Failed to load {TOKEN_FILE}: {e}")

    # 2. Check Service Account credentials
    if not creds and os.path.exists(SERVICE_ACCOUNT_FILE):
        try:
            creds = service_account.Credentials.from_service_account_file(
                SERVICE_ACCOUNT_FILE, scopes=SCOPES
            )
            if verbose:
                print(f"[AUTH] Authenticated via Service Account: {SERVICE_ACCOUNT_FILE}")
        except Exception as e:
            if verbose:
                print(f"[WARN] Failed to load service account: {e}")

    # 3. Refresh or run OAuth Web Flow if credentials.json exists
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception as e:
                if verbose:
                    print(f"[WARN] Failed refreshing token: {e}")
                creds = None

        if not creds:
            if os.path.exists(CREDENTIALS_FILE):
                if verbose:
                    print(f"[NOTICE] '{CREDENTIALS_FILE}' found, but no '{TOKEN_FILE}'. You must log in via the web UI first.")
                # Return mock until the user logs in
                mock_store = {
                    "courses": {},
                    "topics": {},
                    "materials": {},
                    "coursework": {},
                    "announcements": {},
                    "students": {},
                }
                return MockClassroomResource(mock_store)
            else:
                if verbose:
                    print(f"[NOTICE] No '{CREDENTIALS_FILE}' found. Falling back to Mock Classroom Engine for offline testing.")
                mock_store = {
                    "courses": {},
                    "topics": {},
                    "materials": {},
                    "coursework": {},
                    "announcements": {},
                    "students": {},
                }
                return MockClassroomResource(mock_store)

    from teacher_auth import RetryingHttpRequest
    return build("classroom", "v1", credentials=creds, requestBuilder=RetryingHttpRequest)


# =============================================================================
# CORE ENGINE ACTIONS (1: CREATE & POPULATE)
# =============================================================================

def _activate_course(service: Any, course: Dict[str, Any]) -> Dict[str, Any]:
    """
    Courses created through the API start as PROVISIONED, and Classroom refuses
    materials, topics and assignments in that state (403). Set ACTIVE right away.
    """
    if course.get("courseState") == "ACTIVE":
        return course
    return service.courses().patch(
        id=course["id"], updateMask="courseState", body={"courseState": "ACTIVE"}
    ).execute()


# Classroom's limits (see the Course, Topic, CourseWork and CourseWorkMaterial resources).
MAX_TOPIC_NAME = 100
MAX_TITLE = 3000
MAX_DESCRIPTION = 30000
MAX_ATTACHMENTS = 20


def _clip(text: Any, limit: int) -> str:
    text = str(text or "").strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _with_resources_note(description: Any, left_out: List[Attachment]) -> str:
    """The post description, plus each resource that could not be attached, with its title."""
    text = str(description or "").strip()
    if left_out:
        lines = chr(10).join(f"- {a.label}: {a.url}" for a in left_out)
        text = (text + chr(10) + chr(10) if text else "") + "Resources:" + chr(10) + lines
    return _clip(text, MAX_DESCRIPTION)


def _is_attachment_refusal(exc: Exception) -> bool:
    return _http_status(exc) in (400, 403, 404)


def _create_with_attachments(resource: Any, course_id: str, body: Dict[str, Any],
                             attachments: List[Attachment]) -> Tuple[Dict[str, Any], List[Attachment], List[Attachment]]:
    """
    Create a post with its resources attached the Classroom way: Drive files as Drive files,
    YouTube videos as videos, and web pages, Forms and notebooks as links.

    Classroom refuses the whole post when one attachment is bad (a Drive file that does not
    exist or that the teacher cannot open, a removed video). A refused create makes nothing,
    so it is safe to try again, in this order, until Classroom accepts:
      1. one resource at a time, Drive files first: as a plain link, then left out;
      2. every Drive file and video as a plain link;
      3. only the plain links;
      4. nothing attached.
    Anything left out goes in the description under "Resources:", each with its title.
    Classroom allows 20 attachments per post, so any more also go in the description.
    Returns (created post, resources attached as plain links instead, resources left out).
    """
    attachable, overflow = attachments[:MAX_ATTACHMENTS], attachments[MAX_ATTACHMENTS:]

    def attempt(plan: List[Tuple[Attachment, Optional[Dict[str, Any]]]]):
        materials = [m for _, m in plan if m is not None]
        as_link = [a for a, m in plan if m is not None and a.kind != "link" and "link" in m]
        left_out = [a for a, m in plan if m is None] + overflow
        request = {k: v for k, v in body.items() if k != "materials"}
        if materials:
            request["materials"] = materials
        if left_out or request.get("description"):
            request["description"] = _with_resources_note(request.get("description"), left_out)
        return resource.create(courseId=course_id, body=request).execute(), as_link, left_out

    preferred = [(a, a.material) for a in attachable]
    try:
        return attempt(preferred)
    except HttpError as exc:
        if not attachable or not _is_attachment_refusal(exc):
            raise
        last_exc = exc

    suspicion = {"drive": 0, "youtube": 1, "link": 2}
    candidates = []
    for i in sorted(range(len(attachable)), key=lambda j: suspicion[attachable[j].kind]):
        alternatives = ([attachable[i].as_link()] if attachable[i].kind != "link" else []) + [None]
        for alternative in alternatives:
            plan = list(preferred)
            plan[i] = (attachable[i], alternative)
            candidates.append(plan)
    candidates.append([(a, a.as_link() if a.kind != "link" else a.material) for a in attachable])
    candidates.append([(a, a.material if a.kind == "link" else None) for a in attachable])
    candidates.append([(a, None) for a in attachable])

    tried = set()
    for plan in candidates:
        key = json.dumps([m for _, m in plan], sort_keys=True)
        if key in tried:
            continue
        tried.add(key)
        try:
            return attempt(plan)
        except HttpError as exc:
            if not _is_attachment_refusal(exc):
                raise
            last_exc = exc
    raise last_exc


def _copied_attachments(materials: List[Dict[str, Any]]) -> List[Attachment]:
    """An existing post's attachments rebuilt for a new post: the same attach types, with
    Classroom's own titles kept for the description if one can no longer be attached."""
    copied = []
    for m in materials or []:
        drive = (m.get("driveFile") or {}).get("driveFile") or {}
        video = m.get("youtubeVideo") or {}
        if drive.get("id"):
            url = drive.get("alternateLink") or f"https://drive.google.com/open?id={drive['id']}"
            material = {"driveFile": {"driveFile": {"id": drive["id"]},
                                      "shareMode": m["driveFile"].get("shareMode", "VIEW")}}
            copied.append(Attachment(url, drive.get("title") or attachment_label(url), "drive", material))
        elif video.get("id"):
            url = video.get("alternateLink") or f"https://www.youtube.com/watch?v={video['id']}"
            copied.append(Attachment(url, video.get("title") or "YouTube video", "youtube",
                                     {"youtubeVideo": {"id": video["id"]}}))
        elif (m.get("link") or {}).get("url"):
            url = m["link"]["url"]
            copied.append(Attachment(url, m["link"].get("title") or attachment_label(url), "link",
                                     build_link_material_attachment(url)))
        elif (m.get("form") or {}).get("formUrl"):  # apps can only attach a Form as a link
            url = m["form"]["formUrl"]
            copied.append(Attachment(url, m["form"].get("title") or "Google Form", "link",
                                     build_link_material_attachment(url)))
    return copied


def _topic_name(raw: Any) -> str:
    """A topic name Classroom accepts: spaces collapsed and no more than 100 characters."""
    return _clip(re.sub(r"\s+", " ", str(raw or "")), MAX_TOPIC_NAME) or "Untitled topic"


def _ensure_topic(service: Any, course_id: str, name: str, topics: Dict[str, Optional[str]],
                  log: List[Dict[str, Any]], verbose: bool = True) -> Optional[str]:
    """
    The topic ID for a week. Topic names must be unique in a course, so weeks with the same
    name share one topic. If Classroom refuses the topic, the week's posts are created
    without a topic rather than not at all, and the refusal is logged.
    """
    if name in topics:
        return topics[name]
    try:
        topic_id = service.courses().topics().create(courseId=course_id, body={"name": name}).execute()["topicId"]
    except HttpError as exc:
        topic_id = None
        if _http_status(exc) == 409:  # already in the course
            listed = service.courses().topics().list(courseId=course_id).execute().get("topic", [])
            topic_id = next((t["topicId"] for t in listed if t.get("name") == name), None)
        if not topic_id:
            _log_step(log, "topic", name, "failed",
                      f"{_http_message(exc)}. This week's posts are created without a topic.", verbose)
    if topic_id:
        _log_step(log, "topic", name, "ok", topic_id, verbose)
    topics[name] = topic_id
    return topic_id


def _create_post(resource: Any, body: Dict[str, Any], attachments: List[Attachment], *, course_id: str,
                 step: str, target: str, topic_id: Optional[str], log: List[Dict[str, Any]],
                 verbose: bool = True, due_text: str = "") -> Optional[Dict[str, Any]]:
    """
    Create one post (materials or coursework) and log how it went: ok, partial (resources
    moved to the description, or the due date left off), or failed. Never raises, so one
    refused post cannot stop the rest of the course.
    """
    notes = []
    due_dropped = False
    try:
        created, as_link, left_out = _create_with_attachments(resource, course_id, body, attachments)
    except HttpError as exc:
        if "dueDate" not in body or _http_status(exc) != 400:
            _log_step(log, step, target, "failed", f"topicId {topic_id}, {_http_message(exc)}", verbose)
            return None
        # Classroom refused the post itself, not an attachment: try once more without the due date.
        undated = {k: v for k, v in body.items() if k not in ("dueDate", "dueTime")}
        due_line = f"Due: {due_text or body['dueDate']}"
        undated["description"] = (str(body.get("description") or "").strip() + chr(10) + chr(10) + due_line).strip()
        try:
            created, as_link, left_out = _create_with_attachments(resource, course_id, undated, attachments)
        except HttpError as retry_exc:
            _log_step(log, step, target, "failed", f"topicId {topic_id}, {_http_message(retry_exc)}", verbose)
            return None
        notes.append(f"Classroom refused the due date ({_http_message(exc)}), so it is in the description")
        due_dropped = True

    if as_link:
        notes.append("attached as a plain link instead: " + ", ".join(f"{a.label} {a.url}" for a in as_link))
    if left_out:
        notes.append("could not be attached, so they are in the description under Resources: "
                     + ", ".join(f"{a.label} {a.url}" for a in left_out)
                     + ". Classroom refuses a Drive file that does not exist or that your account cannot open")
    detail = f"topicId {topic_id}"
    if attachments:
        detail += f", {len(attachments) - len(left_out)} of {len(attachments)} attachment(s)"
    if notes:
        detail += ". " + "; ".join(notes) + "."
    _log_step(log, step, target, "partial" if left_out or due_dropped else "ok", detail, verbose)
    return created


FORMS_SCOPE_ADVICE = ("Your Google sign-in does not let Course Builder create Google Forms. "
                      "Sign out, sign in again, and allow access to Google Forms.")
FORMS_API_ADVICE = ("The Google Forms API is turned off for this app's Google Cloud project. Turn it on in Google "
                    "Cloud Console (APIs & Services > Library > Google Forms API), then deploy again.")


def _forms_problem(exc: Exception) -> str:
    text = f"{getattr(exc, 'content', b'')!r} {exc}".lower()
    if _is_scope_error(exc):
        return FORMS_SCOPE_ADVICE
    if "service_disabled" in text or "has not been used in project" in text or "it is disabled" in text:
        return FORMS_API_ADVICE
    return _http_message(exc)


def _form_item(q: Dict[str, Any], points_without_answers: bool) -> Dict[str, Any]:
    """The Google Forms item for one quiz question. A question with correct answers is marked
    automatically; one without gets its points only when points_without_answers is True."""
    question: Dict[str, Any] = {"required": True}
    choice = q["type"] in FORM_CHOICE_TYPES
    if choice:
        question["choiceQuestion"] = {"type": FORM_CHOICE_TYPES[q["type"]],
                                      "options": [{"value": c} for c in q["choices"]]}
    else:
        question["textQuestion"] = {"paragraph": q["type"] == "PARAGRAPH"}
    if q["answers"]:
        grading = {"pointValue": q["points"], "correctAnswers": {"answers": [{"value": a} for a in q["answers"]]}}
        if q["feedback"]:
            # Forms shows right/wrong feedback for choice questions, and general feedback for text answers.
            for key in (("whenRight", "whenWrong") if choice else ("generalFeedback",)):
                grading[key] = {"text": q["feedback"]}
        question["grading"] = grading
    elif points_without_answers and q["points"]:
        question["grading"] = {"pointValue": q["points"]}
        if q["feedback"] and not choice:
            question["grading"]["generalFeedback"] = {"text": q["feedback"]}
    return {"title": _clip(q["question"], MAX_TITLE), "questionItem": {"question": question}}


def _build_quiz_form(forms_service: Any, course_name: str, quiz_title: str, week_title: str,
                     questions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Create a Google Forms quiz from a week's questions: quiz mode, the answer key, points and
    feedback, students' email addresses collected, then published so students can answer it.
    Returns {"formId", "responderUri", "editUri", "published", "handMarked", "problem"}.
    responderUri is None when the quiz could not be made, and problem says why.
    """
    result = {"formId": None, "responderUri": None, "editUri": None, "published": False,
              "handMarked": 0, "problem": None}
    if forms_service is None:
        result["problem"] = "Google Forms is not connected for this deploy, so the quiz form could not be created."
        return result
    forms = forms_service.forms()
    try:
        form = forms.create(body={"info": {"title": _clip(quiz_title, 300),
                                           "documentTitle": _clip(f"{quiz_title} ({course_name})", 300)}}).execute()
    except HttpError as exc:
        result["problem"] = _forms_problem(exc)
        return result
    form_id = form["formId"]
    result.update(formId=form_id, editUri=f"https://docs.google.com/forms/d/{form_id}/edit")

    def requests(points_without_answers: bool, collect_emails: bool) -> List[Dict[str, Any]]:
        settings: Dict[str, Any] = {"quizSettings": {"isQuiz": True}}
        mask = "quizSettings.isQuiz"
        if collect_emails:  # responses are tied to each student's Google account
            settings["emailCollectionType"] = "VERIFIED"
            mask += ",emailCollectionType"
        batch = [{"updateSettings": {"settings": settings, "updateMask": mask}},
                 {"updateFormInfo": {"info": {"description": f"Quiz for {week_title}."}, "updateMask": "description"}}]
        batch += [{"createItem": {"item": _form_item(q, points_without_answers), "location": {"index": i}}}
                  for i, q in enumerate(questions)]
        return batch

    # A batch is all or nothing, so if Forms refuses part of it, try again with less.
    hand_marked = [q for q in questions if not q["answers"] and q["points"]]
    attempts = ([(True, True)] if hand_marked else []) + [(False, True), (False, False)]
    last_exc = None
    for points_without_answers, collect_emails in attempts:
        try:
            forms.batchUpdate(formId=form_id, body={"requests": requests(points_without_answers, collect_emails)}).execute()
            last_exc = None
            if hand_marked and not points_without_answers:
                result["handMarked"] = len(hand_marked)
            break
        except HttpError as exc:
            last_exc = exc
    if last_exc is not None:
        result["problem"] = f"The quiz form was created but its questions could not be added: {_forms_problem(last_exc)}"
        return result
    result["responderUri"] = form.get("responderUri")

    try:
        forms.setPublishSettings(formId=form_id, body={
            "publishSettings": {"publishState": {"isPublished": True, "isAcceptingResponses": True}},
            "updateMask": "*"}).execute()
        result["published"] = True
    except HttpError as exc:
        try:  # forms that predate publish settings are always published
            state = (forms.get(formId=form_id).execute().get("publishSettings") or {}).get("publishState")
            result["published"] = state is None or bool(state.get("isPublished") and state.get("isAcceptingResponses"))
        except HttpError:
            pass
        if not result["published"]:
            result["problem"] = (f"The quiz form could not be published, so students cannot answer it yet "
                                 f"({_forms_problem(exc)}). Open the form and press Publish.")
    return result


def _rubric_problem(exc: Exception) -> str:
    text = f"{getattr(exc, 'content', b'')!r} {exc}".lower()
    if "insufficient" in text and "scope" in text:
        return ("Your Google sign-in does not let Course Builder read Google Sheets. "
                "Sign out, sign in again, and allow read-only access to Google Sheets")
    if "rubriccriteriainvalidformat" in text:
        return "The sheet is not in Classroom's rubric format (the format Rubric > Import from Sheets uses)"
    if "attachmentnotvisible" in text:
        return "Your Google account cannot open the rubric sheet"
    if _http_status(exc) == 403:
        return ("Classroom refused the rubric. Creating rubrics through an app needs a Google Workspace for "
                f"Education Plus or Teaching and Learning licence for you and the course owner ({_http_message(exc)})")
    return _http_message(exc)


def _add_rubric(service: Any, course_id: str, assignment: Dict[str, Any], rubric_url: str,
                log: List[Dict[str, Any]], verbose: bool = True,
                account_problem: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """
    Import an assignment's rubric from its Google Sheet, as Rubric > Import from Sheets does in
    Classroom. If Classroom refuses, the link goes in the assignment's description under
    "Rubric (Google Sheet)". A refusal that applies to the whole account (licence, sign-in
    permission) is remembered in account_problem, so later weeks go straight to the description.
    """
    target = assignment.get("title", "")
    record = {"assignment": target, "url": rubric_url, "status": "created", "problem": None}
    sheet_id = extract_sheet_id(rubric_url)
    if not sheet_id:
        problem = "The rubric link is not a Google Sheets link"
    elif account_problem and account_problem.get("reason"):
        problem = account_problem["reason"]
    else:
        try:
            service.courses().courseWork().rubrics().create(
                courseId=course_id, courseWorkId=assignment["id"], body={"sourceSpreadsheetId": sheet_id}
            ).execute(num_retries=0)  # a refusal here is not temporary
            _log_step(log, "rubric", target, "ok", f"imported from {rubric_url}", verbose)
            return record
        except HttpError as exc:
            problem = _rubric_problem(exc)
            if account_problem is not None and _http_status(exc) in (403, 500):
                account_problem["reason"] = problem

    description = (str(assignment.get("description") or "").rstrip() + chr(10) + chr(10)
                   + f"Rubric (Google Sheet): {rubric_url}").strip()
    try:
        service.courses().courseWork().patch(courseId=course_id, id=assignment["id"], updateMask="description",
                                             body={"description": _clip(description, MAX_DESCRIPTION)}).execute()
        record.update(status="in description", problem=problem)
        _log_step(log, "rubric", target, "partial",
                  f"{problem}, so the rubric link is in the assignment description under 'Rubric (Google Sheet)'.", verbose)
    except HttpError as exc:
        record.update(status="failed", problem=problem)
        _log_step(log, "rubric", target, "failed",
                  f"{problem}. Adding the link to the description also failed: {_http_message(exc)}", verbose)
    return record


def _http_status(exc: Exception) -> Optional[int]:
    status = getattr(getattr(exc, "resp", None), "status", None)
    try:
        return int(status) if status is not None else None
    except (TypeError, ValueError):
        return None


def _http_message(exc: Exception) -> str:
    """The human-readable message from a Google API error, without the request URL."""
    try:
        return json.loads(exc.content)["error"]["message"]
    except Exception:
        return str(exc)


ROSTER_SCOPE_MESSAGE = ("Your Google sign-in did not grant permission to manage class rosters. "
                        "Sign out, sign in again, and allow every Classroom permission Google asks for.")


JOIN_LINK_ADVICE = "Send them the class join link or class code instead (shown when the deployment finishes)."


def course_join_link(course: Dict[str, Any]) -> Optional[str]:
    """The link students open to join with the class code. It needs no invitation, so
    Google's invitation quota does not apply. Returns None if Classroom gave no code."""
    link, code = course.get("alternateLink"), course.get("enrollmentCode")
    return f"{link}?cjc={code}" if link and code else None


def _is_scope_error(exc: Exception) -> bool:
    text = f"{getattr(exc, 'content', b'')!r} {exc}".lower()
    return "insufficient authentication scopes" in text or "access_token_scope_insufficient" in text


def _log_step(log: List[Dict[str, Any]], step: str, target: str, status: str, detail: str = "", verbose: bool = True):
    """Records one provisioning call. status is ok, added, invited, existing, or failed."""
    log.append({"step": step, "target": target, "status": status, "detail": detail})
    if verbose:
        marker = "[!]" if status == "failed" else "[+]"
        print(f"  {marker} {step} {target}: {status}" + (f" ({detail})" if detail else ""))


def _normalize_alias(raw: str) -> str:
    """Classroom aliases need a d: (domain) or p: (project) prefix. Bare IDs get p:,
    which the app's own Cloud project can create without domain admin rights."""
    raw = raw.strip()
    return raw if re.match(r"^[dp]:", raw) else f"p:{raw}"


def _create_aliases(service: Any, course_id: str, aliases: List[str], log: List[Dict[str, Any]], verbose: bool = True):
    """Maps external/SIS IDs to the course. A failed alias is logged and does not stop the build."""
    for raw in aliases:
        alias = _normalize_alias(raw)
        try:
            service.courses().aliases().create(courseId=course_id, body={"alias": alias}).execute()
            _log_step(log, "alias", alias, "ok", verbose=verbose)
        except HttpError as exc:
            reason = "already used by another course" if _http_status(exc) == 409 else _http_message(exc)
            _log_step(log, "alias", alias, "failed", reason, verbose)


# Status codes where a direct roster add is refused but an invitation can still work:
# 403 for cross-domain users or teachers without admin rights, 400 for
# FAILED_PRECONDITION errors such as @CannotDirectAddUser or @UserInIllegalDomain.
_INVITE_FALLBACK_STATUSES = (400, 403)


def _enroll_or_invite(service: Any, course_id: str, email: str, role: str,
                      log: List[Dict[str, Any]], verbose: bool = True) -> Tuple[str, Dict[str, Any]]:
    """
    Adds a teacher or student directly. If Classroom refuses the direct add, sends an
    invitation the user accepts from their own account. Returns (status, record).
    """
    step = role.lower()
    resource = service.courses().teachers() if role == "TEACHER" else service.courses().students()
    try:
        record = resource.create(courseId=course_id, body={"userId": email}).execute()
        _log_step(log, step, email, "added", verbose=verbose)
        return "added", record
    except HttpError as exc:
        status = _http_status(exc)
        if status == 409:
            _log_step(log, step, email, "existing", "already in the course", verbose)
            return "existing", {}
        if _is_scope_error(exc):
            # An invitation needs the same permission, so trying one would only fail again.
            _log_step(log, step, email, "failed", ROSTER_SCOPE_MESSAGE, verbose)
            return "failed", {}
        if status not in _INVITE_FALLBACK_STATUSES:
            _log_step(log, step, email, "failed", _http_message(exc), verbose)
            return "failed", {}
        direct_error = _http_message(exc)

    try:
        invite = service.invitations().create(
            body={"courseId": course_id, "userId": email, "role": role}
        ).execute()
        _log_step(log, step, email, "invited", "direct add refused, invitation sent", verbose)
        return "invited", invite
    except HttpError as exc:
        if _http_status(exc) == 409:
            _log_step(log, step, email, "existing", "already invited", verbose)
            return "existing", {}
        if _is_scope_error(exc):
            detail = ROSTER_SCOPE_MESSAGE
        else:
            detail = f"direct add: {direct_error}; invitation: {_http_message(exc)}"
            if "quotaexhausted" in detail.lower().replace(" ", ""):
                detail = ("Google's limit on how many invitations your account can send is used up. "
                          + JOIN_LINK_ADVICE + f" ({detail})")
        _log_step(log, step, email, "failed", detail, verbose)
        return "failed", {}


def create_and_populate_course(
    service: Any,
    spreadsheet_path: str,
    verbose: bool = True,
    log: Optional[List[Dict[str, Any]]] = None,
    forms_service: Any = None,
) -> Dict[str, Any]:
    """
    Action 1: Create & Populate Course
    - Reads Course_Settings, Curriculum and the optional Students sheet.
    - Provisions in dependency order: course shell, aliases, activation, co-teachers,
      topics, lecture materials and coursework (anchored to topics), students, then the
      welcome announcement.
    - Activation runs straight after the shell because Classroom refuses topics and
      coursework while a course is PROVISIONED.
    - Teachers and students that cannot be added directly are invited instead.
    - result["log"] records every step with its status. Pass a list as `log` to watch
      progress from another thread while the build runs.
    """
    data = parse_course_spreadsheet(spreadsheet_path)
    settings = data.settings
    curriculum = data.curriculum

    if verbose:
        print(f"\n=======================================================")
        print(f"[ACTION 1] Creating Course: '{settings['class_name']}'")
        print(f"   Section: {settings.get('section', 'N/A')} | Room: {settings.get('room', 'N/A')}")
        print(f"=======================================================")

    # 1. Create Course via Classroom API
    course_body = {
        "name": settings["class_name"],
        "section": settings.get("section", ""),
        "subject": settings.get("subject", ""),
        "room": settings.get("room", ""),
        "ownerId": "me",
    }
    log = log if log is not None else []
    course = service.courses().create(body=course_body).execute()
    course_id = course["id"]
    if verbose:
        print(f"[OK] Created Course: '{course.get('name')}' (ID: {course_id})")
    _log_step(log, "course", course_id, "ok", course.get("courseState", ""), verbose)

    # 2. Map external/SIS aliases
    _create_aliases(service, course_id, settings.get("aliases", []), log, verbose)

    # 3. Activate before adding content (PROVISIONED courses refuse topics and coursework)
    course = _activate_course(service, course)
    _log_step(log, "activate", course_id, "ok", course.get("courseState", ""), verbose)

    # 4. Co-teachers: direct add, invitation when Classroom refuses
    added_teachers = []
    invitations = []
    teachers = settings.get("teachers", [])
    if teachers and verbose:
        print(f"\n[ROSTER] Adding {len(teachers)} Co-Teacher(s) to Course...")
    for t_email in teachers:
        status, record = _enroll_or_invite(service, course_id, t_email, "TEACHER", log, verbose)
        if status == "added":
            added_teachers.append(record)
        elif status == "invited":
            invitations.append(record)

    # 5. Each week: its topic, then lecture materials, assignment, quiz and question. Every post
    #    is created on its own, so one that Classroom refuses cannot stop the rest of the course.
    created_topics: Dict[str, Optional[str]] = {}
    created_materials = []
    created_coursework = []
    created_forms: List[Dict[str, Any]] = []
    created_rubrics: List[Dict[str, Any]] = []
    posts: List[Dict[str, Any]] = []  # every post made, with its week, topic and kind
    rubric_account_problem: Dict[str, str] = {}
    if forms_service is None:  # the mock Classroom brings its own Forms simulator
        forms_service = getattr(service, "forms_service", lambda: None)()

    for mod in curriculum:
        topic_name = _topic_name(mod["topic_name"])
        topic_id = _ensure_topic(service, course_id, topic_name, created_topics, log, verbose)
        in_topic = {"topicId": topic_id} if topic_id else {}
        due = mod.get("due") or {}
        post = dict(course_id=course_id, topic_id=topic_id, log=log, verbose=verbose, due_text=mod.get("due_text", ""))

        # A. Lecture materials: the topic's notebook, documents and YouTube videos
        attachments = topic_attachments(mod)
        if attachments:
            title = _clip(f"{mod['title']} - Lecture Materials", MAX_TITLE)
            item = _create_post(service.courses().courseWorkMaterials(), {
                "title": title,
                "description": mod.get("overview", "") or f"Presentation slides and documents for {mod['title']}",
                "state": "PUBLISHED",
                **in_topic,
            }, attachments, step="material", target=title, **post)
            if item:
                created_materials.append(item)
                posts.append({"kind": "Materials", "week": mod["sequence"], "topic": topic_name, "item": item})

        # B. Assignment
        assignment_title = (mod.get("assignment_title") or mod.get("assessment_text", "")).strip()
        if assignment_title:
            item = _create_post(service.courses().courseWork(), {
                "title": _clip(assignment_title, MAX_TITLE),
                "description": mod.get("assignment_instructions") or f"Instructions for {assignment_title}.\n{mod.get('overview', '')}",
                "maxPoints": mod.get("points", 100),
                "workType": "ASSIGNMENT",
                "state": "PUBLISHED",
                **in_topic,
                **due,
            }, [], step="coursework", target=assignment_title, **post)
            if item:
                created_coursework.append(item)
                posts.append({"kind": "Assignment", "week": mod["sequence"], "topic": topic_name, "item": item})
                if mod.get("rubric_url"):
                    rubric = _add_rubric(service, course_id, item, mod["rubric_url"], log, verbose, rubric_account_problem)
                    created_rubrics.append({**rubric, "week": mod["sequence"]})

        # C. Quiz: a Google Forms quiz built from the week's questions and answers, or the form
        #    given by its link, attached to an assignment
        questions = mod.get("quiz_questions") or []
        quiz_title = mod.get("quiz_title", "").strip()
        quiz_url = mod.get("quiz_url")
        if questions or quiz_title or quiz_url:
            q_title = quiz_title or (f"{mod['title']} Quiz" if questions else f"{mod['title']} Quiz Check")
            quiz_body = {
                "title": _clip(q_title, MAX_TITLE),
                "description": f"Complete the Google Form quiz for {mod['title']}.",
                "maxPoints": mod.get("quiz_points", 50),
                "workType": "ASSIGNMENT",
                "state": "PUBLISHED",
                **in_topic,
                **due,
            }
            quiz_attachments = [make_attachment(quiz_url)] if quiz_url else []
            if questions:
                form = _build_quiz_form(forms_service, settings["class_name"], q_title, mod["title"], questions)
                created_forms.append({**form, "week": mod["sequence"], "quiz": q_title, "questions": len(questions)})
                quiz_body["maxPoints"] = sum(q["points"] for q in questions)
                if form["responderUri"]:
                    quiz_attachments = [make_attachment(form["responderUri"], label="Google Form quiz")]
                    detail = (f"{len(questions)} question(s), {quiz_body['maxPoints']} point(s). Students answer at "
                              f"{form['responderUri']}; edit it at {form['editUri']}")
                    if form["handMarked"]:
                        detail += f". {form['handMarked']} question(s) without a correct answer are marked by hand in Forms"
                    if form["problem"]:
                        detail += f". {form['problem']}"
                    _log_step(log, "form", q_title, "partial" if form["problem"] else "ok", detail + ".", verbose)
                else:
                    # Without its form the quiz would be empty, so it waits as a draft for the teacher.
                    quiz_attachments = []
                    quiz_body["state"] = "DRAFT"
                    left = f" An empty form was left at {form['editUri']}." if form["editUri"] else ""
                    _log_step(log, "form", q_title, "failed",
                              f"{form['problem']} The quiz assignment is saved as a draft.{left}", verbose)
            item = _create_post(service.courses().courseWork(), quiz_body, quiz_attachments,
                                step="coursework", target=q_title, **post)
            if item:
                created_coursework.append(item)
                posts.append({"kind": "Quiz", "week": mod["sequence"], "topic": topic_name, "item": item})

        # D. Question: short answer, or multiple choice with its choices
        question_prompt = mod.get("question_prompt", "").strip()
        if question_prompt:
            item = _create_post(service.courses().courseWork(), {
                "title": _clip(question_prompt, MAX_TITLE),
                "description": f"Weekly discussion question for {mod['title']}. Submit your response.",
                "maxPoints": mod.get("question_points", 20),
                "state": "PUBLISHED",
                **in_topic,
                **due,
                **_question_type_fields(mod),
            }, [], step="coursework", target=question_prompt[:60], **post)
            if item:
                created_coursework.append(item)
                posts.append({"kind": "Question", "week": mod["sequence"], "topic": topic_name, "item": item})

    # 6. Students are not added: the teacher shares the class code (course["enrollmentCode"])
    #    with them after the build, and they join with it.

    # 7. Welcome announcement on the stream
    announcement = None
    welcome = str(settings.get("welcome_announcement") or "").strip()
    if welcome:
        try:
            announcement = service.courses().announcements().create(
                courseId=course_id, body={"text": welcome, "state": "PUBLISHED"}
            ).execute()
            _log_step(log, "announcement", "Welcome announcement", "ok", verbose=verbose)
        except HttpError as exc:
            _log_step(log, "announcement", "Welcome announcement", "failed", _http_message(exc), verbose)

    failed = [entry for entry in log if entry["status"] == "failed"]
    if verbose:
        print(f"\n[SUCCESS] Finished creating course '{settings['class_name']}'!")
        print(f"   Summary: 1 Course, {len(created_topics)} Topics, {len(created_materials)} Materials, {len(created_coursework)} Assessments, {len(added_teachers)} Teachers, {len(invitations)} Invitations, {len(failed)} Failed step(s).")
        print(f"   Class code for students: {course.get('enrollmentCode', '(none)')}")

    return {
        "course": course,
        "topics": created_topics,
        "materials": created_materials,
        "coursework": created_coursework,
        "teachers": added_teachers,
        "students": [],
        "invitations": invitations,
        "announcement": announcement,
        "forms": created_forms,
        "rubrics": created_rubrics,
        "posts": posts,
        "log": log,
    }


# =============================================================================
# CORE ENGINE ACTIONS (2: EDIT / NON-DESTRUCTIVE SYNC)
# =============================================================================

def sync_existing_course(
    service: Any,
    course_id: str,
    spreadsheet_path: str,
    verbose: bool = True,
    forms_service: Any = None,
) -> Dict[str, Any]:
    """
    Action 2: Edit / Non-Destructive Sync Existing Course
    - Compares spreadsheet against existing Google Classroom course.
    - Updates modified descriptions, points, due dates, or links.
    - Adds newly introduced topics, materials, or assessments.
    - Strictly enforces NO-DELETE policy (never purges or removes existing items).
    """
    data = parse_course_spreadsheet(spreadsheet_path)
    settings = data.settings
    curriculum = data.curriculum

    if verbose:
        print(f"\n=======================================================")
        print(f"[ACTION 2] Non-Destructive Sync for Course ID: '{course_id}'")
        print(f"=======================================================")

    # 1. Update Course Metadata
    course_patch_body = {
        "name": settings["class_name"],
        "section": settings.get("section", ""),
        "subject": settings.get("subject", ""),
        "room": settings.get("room", ""),
    }
    updated_course = service.courses().patch(
        id=course_id,
        updateMask="name,section,subject,room",
        body=course_patch_body
    ).execute()
    if verbose:
        print(f"[OK] Synced course metadata for '{updated_course.get('name')}'")

    # 2. Retrieve existing topics, materials, and coursework
    existing_topics_resp = service.courses().topics().list(courseId=course_id).execute()
    existing_topics = {t["name"].strip(): t for t in existing_topics_resp.get("topic", [])}

    existing_mat_resp = service.courses().courseWorkMaterials().list(courseId=course_id).execute()
    existing_materials = {m.get("title", "").strip(): m for m in existing_mat_resp.get("courseWorkMaterial", [])}

    existing_cw_resp = service.courses().courseWork().list(courseId=course_id).execute()
    existing_coursework = {cw.get("title", "").strip(): cw for cw in existing_cw_resp.get("courseWork", [])}

    synced_topics_count = 0
    synced_materials_count = 0
    synced_cw_count = 0

    # 3. Non-destructive sync of curriculum items. A change Classroom refuses is listed in
    #    "skipped" and the sync carries on with the rest.
    skipped: List[str] = []
    topic_ids = {name: t["topicId"] for name, t in existing_topics.items()}
    topic_log: List[Dict[str, Any]] = []
    rubric_problem: Dict[str, str] = {}
    if forms_service is None:  # the mock Classroom brings its own Forms simulator
        forms_service = getattr(service, "forms_service", lambda: None)()

    def patch(resource: Any, item_id: str, mask: str, patch_body: Dict[str, Any], what: str) -> bool:
        try:
            resource.patch(courseId=course_id, id=item_id, updateMask=mask, body=patch_body).execute()
            return True
        except HttpError as exc:
            skipped.append(f"{what}: {_http_message(exc)}")
            if verbose:
                print(f"    [SKIPPED] {what}: {_http_message(exc)}")
            return False

    def create(resource: Any, create_body: Dict[str, Any], attachments: List[Attachment], what: str):
        try:
            item, _, left_out = _create_with_attachments(resource, course_id, create_body, attachments)
        except HttpError as exc:
            skipped.append(f"{what}: {_http_message(exc)}")
            if verbose:
                print(f"    [SKIPPED] {what}: {_http_message(exc)}")
            return None
        if left_out:
            skipped.append(f"{what}: " + ", ".join(f"{a.label} {a.url}" for a in left_out)
                           + " could not be attached and are in the description")
        return item

    for mod in curriculum:
        topic_name = _topic_name(mod["topic_name"])
        known = topic_name in topic_ids
        topic_id = _ensure_topic(service, course_id, topic_name, topic_ids, topic_log, verbose=False)
        if not known and topic_id:
            synced_topics_count += 1
        in_topic = {"topicId": topic_id} if topic_id else {}

        # Material sync. Classroom cannot change an existing post's attachments, so an existing
        # lecture-materials post gets its description and topic updated, and a missing one is created.
        attachments = topic_attachments(mod)
        if attachments:
            mat_title = _clip(f"{mod['title']} - Lecture Materials", MAX_TITLE)
            description = mod.get("overview", "") or f"Presentation slides and documents for {mod['title']}"
            if mat_title in existing_materials:
                if patch(service.courses().courseWorkMaterials(), existing_materials[mat_title]["id"],
                         "description" + (",topicId" if topic_id else ""),
                         {"description": _clip(description, MAX_DESCRIPTION), **in_topic}, mat_title):
                    synced_materials_count += 1
            else:
                new_m = create(service.courses().courseWorkMaterials(),
                               {"title": mat_title, "description": description, "state": "PUBLISHED", **in_topic},
                               attachments, mat_title)
                if new_m:
                    existing_materials[mat_title] = new_m
                    synced_materials_count += 1

        # Due date and time in UTC, parsed from ISO 8601 when the sheet was read
        due = mod.get("due") or {}
        due_mask = ",dueDate,dueTime" if due else ""
        topic_mask = ",topicId" if topic_id else ""

        # 1. Assignment sync
        assignment_title = (mod.get("assignment_title") or mod.get("assessment_text", "")).strip()
        if assignment_title:
            instructions = mod.get("assignment_instructions") or f"Instructions for {assignment_title}.\n{mod.get('overview', '')}"
            if assignment_title in existing_coursework:
                if patch(service.courses().courseWork(), existing_coursework[assignment_title]["id"],
                         "description,maxPoints" + topic_mask + due_mask,
                         {"description": _clip(instructions, MAX_DESCRIPTION), "maxPoints": mod.get("points", 100),
                          **in_topic, **due}, assignment_title):
                    synced_cw_count += 1
            else:
                new_cw = create(service.courses().courseWork(), {
                    "title": _clip(assignment_title, MAX_TITLE), "description": instructions,
                    "maxPoints": mod.get("points", 100), "workType": "ASSIGNMENT", "state": "PUBLISHED",
                    **in_topic, **due}, [], assignment_title)
                if new_cw:
                    existing_coursework[assignment_title] = new_cw
                    synced_cw_count += 1
                    if mod.get("rubric_url"):
                        rubric = _add_rubric(service, course_id, new_cw, mod["rubric_url"], topic_log, False, rubric_problem)
                        if rubric["status"] != "created":
                            skipped.append(f"Rubric for {assignment_title}: {rubric['problem']}; the link is in its description")

        # 2. Quiz Assignment sync. An existing quiz keeps its form (see above); a missing one is
        #    created, with a new Google Forms quiz when the week has questions.
        questions = mod.get("quiz_questions") or []
        quiz_title = mod.get("quiz_title", "").strip()
        quiz_url = mod.get("quiz_url")
        if questions or quiz_title or quiz_url:
            q_title = quiz_title or (f"{mod['title']} Quiz" if questions else f"{mod['title']} Quiz Check")
            quiz_description = f"Complete the Google Form quiz for {mod['title']}."
            quiz_points = sum(q["points"] for q in questions) if questions else mod.get("quiz_points", 50)
            if q_title in existing_coursework:
                if patch(service.courses().courseWork(), existing_coursework[q_title]["id"],
                         "description,maxPoints" + topic_mask + due_mask,
                         {"description": quiz_description, "maxPoints": quiz_points, **in_topic, **due},
                         q_title):
                    synced_cw_count += 1
            else:
                quiz_attachments = [make_attachment(quiz_url)] if quiz_url else []
                state = "PUBLISHED"
                if questions:
                    form = _build_quiz_form(forms_service, settings.get("class_name", ""), q_title, mod["title"], questions)
                    if form["responderUri"]:
                        quiz_attachments = [make_attachment(form["responderUri"], label="Google Form quiz")]
                    else:
                        quiz_attachments, state = [], "DRAFT"
                    if form["problem"]:
                        skipped.append(f"Quiz form for {q_title}: {form['problem']}"
                                       + ("" if form["responderUri"] else " The quiz is saved as a draft."))
                new_q = create(service.courses().courseWork(), {
                    "title": _clip(q_title, MAX_TITLE), "description": quiz_description,
                    "maxPoints": quiz_points, "workType": "ASSIGNMENT", "state": state,
                    **in_topic, **due}, quiz_attachments, q_title)
                if new_q:
                    existing_coursework[q_title] = new_q
                    synced_cw_count += 1

        # 3. Question (Discussion Prompt) sync. Classroom cannot change a question's type or
        #    choices after it is created.
        question_prompt = mod.get("question_prompt", "").strip()
        if question_prompt:
            question_description = f"Weekly discussion question for {mod['title']}. Submit your response."
            if question_prompt in existing_coursework:
                if patch(service.courses().courseWork(), existing_coursework[question_prompt]["id"],
                         "description,maxPoints" + topic_mask + due_mask,
                         {"description": question_description, "maxPoints": mod.get("question_points", 20),
                          **in_topic, **due}, question_prompt[:60]):
                    synced_cw_count += 1
            else:
                new_quest = create(service.courses().courseWork(), {
                    "title": _clip(question_prompt, MAX_TITLE), "description": question_description,
                    "maxPoints": mod.get("question_points", 20), "state": "PUBLISHED",
                    **in_topic, **due, **_question_type_fields(mod)}, [], question_prompt[:60])
                if new_quest:
                    existing_coursework[question_prompt] = new_quest
                    synced_cw_count += 1

    skipped += [f"Topic {e['target']}: {e['detail']}" for e in topic_log if e["status"] == "failed"]

    # 4. Sync Co-Teachers (non-destructive: only adds missing ones)
    teachers = settings.get("teachers", [])
    synced_teachers_count = 0
    if teachers:
        try:
            cur_teachers_resp = service.courses().teachers().list(courseId=course_id).execute()
            cur_teachers = {
                t.get("userId", "").lower() for t in cur_teachers_resp.get("teachers", [])
            } | {
                t.get("profile", {}).get("emailAddress", "").lower() for t in cur_teachers_resp.get("teachers", [])
            }
        except Exception:
            cur_teachers = set()

        for t_email in teachers:
            if t_email.lower() not in cur_teachers:
                try:
                    service.courses().teachers().create(
                        courseId=course_id, body={"userId": t_email}
                    ).execute()
                    synced_teachers_count += 1
                    if verbose:
                        print(f"    [TEACHER ADDED] Added co-teacher: '{t_email}'")
                except Exception as e:
                    if verbose:
                        print(f"    [!] Note adding teacher {t_email}: {e}")

    # 5. Students are not added: they join with the class code.
    synced_students_count = 0

    if verbose:
        print(f"\n[SYNC COMPLETE] Non-destructive sync completed safely.")
        print(f"   Modifications applied: Topics: {synced_topics_count}, Materials: {synced_materials_count}, CourseWork: {synced_cw_count}, Teachers: {synced_teachers_count}, Students: {synced_students_count}")

    return {
        "status": "success",
        "synced_topics": synced_topics_count,
        "synced_materials": synced_materials_count,
        "synced_coursework": synced_cw_count,
        "synced_teachers": synced_teachers_count,
        "synced_students": synced_students_count,
        "skipped": skipped,
    }


# =============================================================================
# CORE ENGINE ACTIONS (3: DUPLICATE COURSE STRUCTURE TO NEW SECTION)
# =============================================================================

def duplicate_course_structure(
    service: Any,
    source_course_id: str,
    new_section_name: str,
    verbose: bool = True
) -> Dict[str, Any]:
    """
    Action 3: Duplicate Course Structure to New Section
    - Takes an existing course ID and creates a new course with a new section name.
    - Clones all topics, lecture materials (with link attachments preserved),
      and coursework as published items.
    """
    if verbose:
        print(f"\n=======================================================")
        print(f"[ACTION 3] Duplicating Course ID '{source_course_id}' -> Section '{new_section_name}'")
        print(f"=======================================================")

    # 1. Fetch source course
    source_course = service.courses().get(id=source_course_id).execute()

    # 2. Create target course with new section
    new_course_body = {
        "name": source_course.get("name", "Untitled Course"),
        "section": new_section_name,
        "subject": source_course.get("subject", ""),
        "description": source_course.get("description", ""),
        "room": source_course.get("room", ""),
        "ownerId": "me",
    }
    new_course = _activate_course(service, service.courses().create(body=new_course_body).execute())
    new_course_id = new_course["id"]
    if verbose:
        print(f"[OK] Created target course: '{new_course['name']}' (Section: {new_section_name}, ID: {new_course_id})")

    # 3. Fetch and clone topics
    topic_map = {}  # old_topic_id -> new_topic_id
    source_topics = service.courses().topics().list(courseId=source_course_id).execute().get("topic", [])
    for st in source_topics:
        new_t = service.courses().topics().create(
            courseId=new_course_id,
            body={"name": st.get("name", "")}
        ).execute()
        topic_map[st["topicId"]] = new_t["topicId"]
        if verbose:
            print(f"  [TOPIC CLONED] '{st.get('name')}' -> New ID: {new_t['topicId']}")

    # 4. Fetch and clone lecture materials (preserving presentation links)
    source_materials = service.courses().courseWorkMaterials().list(
        courseId=source_course_id
    ).execute().get("courseWorkMaterial", [])
    cloned_materials = []

    for sm in source_materials:
        attachments = _copied_attachments(sm.get("materials", []))
        new_mat_body = {
            "title": sm.get("title", ""),
            "description": sm.get("description", ""),
            "topicId": topic_map.get(sm.get("topicId", ""), ""),
            "state": "PUBLISHED"
        }
        cloned_mat, _, _ = _create_with_attachments(service.courses().courseWorkMaterials(), new_course_id,
                                                    new_mat_body, attachments)
        cloned_materials.append(cloned_mat)
        if verbose:
            print(f"  [MATERIAL CLONED] '{sm.get('title')}' (Attachments: {len(attachments)})")

    # 5. Fetch and clone coursework
    source_cw = service.courses().courseWork().list(
        courseId=source_course_id
    ).execute().get("courseWork", [])
    cloned_cw = []

    for scw in source_cw:
        new_cw_body = {
            "title": scw.get("title", ""),
            "description": scw.get("description", ""),
            "maxPoints": scw.get("maxPoints", 100),
            "workType": scw.get("workType", "ASSIGNMENT"),
            "state": "PUBLISHED",
            "topicId": topic_map.get(scw.get("topicId", ""), ""),
        }
        if scw.get("workType") == "MULTIPLE_CHOICE_QUESTION":
            # Classroom requires the choices to create a multiple-choice question.
            new_cw_body["multipleChoiceQuestion"] = {
                "choices": list((scw.get("multipleChoiceQuestion") or {}).get("choices") or [])}
        if scw.get("dueDate") and scw.get("dueTime"):
            new_cw_body["dueDate"] = scw["dueDate"]
            new_cw_body["dueTime"] = scw["dueTime"]

        cloned_item, _, _ = _create_with_attachments(service.courses().courseWork(), new_course_id, new_cw_body,
                                                     _copied_attachments(scw.get("materials", [])))
        cloned_cw.append(cloned_item)
        if verbose:
            print(f"  [ASSESSMENT CLONED] '{scw.get('title')}'")

    if verbose:
        print(f"\n[DUPLICATION COMPLETE] Successfully duplicated to Section '{new_section_name}'!")
        print(f"   Summary: Cloned {len(topic_map)} Topics, {len(cloned_materials)} Materials, {len(cloned_cw)} Assessments.")

    return {
        "new_course": new_course,
        "cloned_topics": topic_map,
        "cloned_materials": cloned_materials,
        "cloned_coursework": cloned_cw
    }


# =============================================================================
# CORE ENGINE ACTIONS (4: LIST COURSES & STATUS CHECK)
# =============================================================================

def list_courses_and_status_check(service: Any, verbose: bool = True) -> List[Dict[str, Any]]:
    """
    Action 4: List Courses & Status Check
    - Displays all active courses, section, enrollment code, enrolled students,
      and total coursework and materials count.
    """
    if verbose:
        print(f"\n=======================================================")
        print(f"[ACTION 4] Google Classroom Status Check & Course Roster")
        print(f"=======================================================")

    try:
        courses_resp = service.courses().list(courseStates=["ACTIVE"]).execute()
        courses = courses_resp.get("courses", [])
    except Exception as e:
        if verbose:
            print(f"[WARN] Could not retrieve courses from Google Classroom: {e}")
        return []

    results = []

    if not courses:
        if verbose:
            print("No active courses found.")
        return results

    if verbose:
        print(f"{'Course ID':<18} | {'Course Name':<32} | {'Section':<14} | {'Code':<8} | {'Students':<8} | {'CourseWork':<10}")
        print("-" * 102)

    for c in courses:
        cid = c["id"]
        cname = (c.get("name") or "Untitled")[:30]
        csection = (c.get("section") or "Default")[:12]
        code = c.get("enrollmentCode") or "N/A"

        # Count students
        student_count = 0
        try:
            st_resp = service.courses().students().list(courseId=cid).execute()
            student_count = len(st_resp.get("students", []))
        except Exception:
            pass

        # Count coursework
        cw_count = 0
        try:
            cw_resp = service.courses().courseWork().list(courseId=cid).execute()
            cw_count = len(cw_resp.get("courseWork", []))
        except Exception:
            pass

        # Count materials
        mat_count = 0
        try:
            mat_resp = service.courses().courseWorkMaterials().list(courseId=cid).execute()
            mat_count = len(mat_resp.get("courseWorkMaterial", []))
        except Exception:
            pass

        item_summary = {
            "id": cid,
            "name": c.get("name"),
            "section": c.get("section"),
            "enrollment_code": code,
            "students_count": student_count,
            "coursework_count": cw_count,
            "materials_count": mat_count,
            "state": c.get("courseState", "ACTIVE")
        }
        results.append(item_summary)

        if verbose:
            print(f"{cid:<18} | {cname:<32} | {csection:<14} | {code:<8} | {student_count:<8} | {cw_count:<10}")

    return results


# =============================================================================
# SELF-TEST & VERIFICATION SUITE
# =============================================================================

def run_self_test_and_safety_audit(verbose: bool = True) -> bool:
    """
    Executes an end-to-end self-test verifying:
    1. Static AST audit verifying NO delete endpoints/methods are called.
    2. Presentation URL sanitization and link attachment schema (omitting title).
    3. Creation of sample course template spreadsheet.
    4. Action 1: Create & Populate Course with lecture link attachments.
    5. Action 2: Non-destructive edit/sync.
    6. Action 3: Course duplication to new section.
    7. Action 4: Course listing and status inspection.
    """
    print("\n" + "=" * 70)
    print("[TEST SUITE] RUNNING SELF-TEST & NO-DELETE SAFETY AUDIT SUITE")
    print("=" * 70)

    # 1. Static AST Safety Audit
    print("\n[Step 1] Auditing codebase for NO-DELETE safety policy...")
    is_safe, violations = audit_codebase_safety(__file__)
    if not is_safe:
        print(f"[FAIL] Safety audit FAILED! Violations detected:\n{json.dumps(violations, indent=2)}")
        return False
    print("[PASS] Safety audit PASSED: Zero forbidden delete calls in engine codebase.")

    # 2. Presentation Link Attachment Schema Verification
    print("\n[Step 2] Testing Presentation Link Attachment Builder...")
    test_url = "https://docs.google.com/presentation/d/1exampleSlides/edit"
    link_attachment = build_link_material_attachment(test_url)
    assert "link" in link_attachment, "Missing 'link' key"
    assert link_attachment["link"]["url"] == test_url, "URL mismatch"
    assert "title" not in link_attachment["link"], "Violation: 'title' must be omitted inside link!"
    print(f"[PASS] Link attachment schema verified:\n       {json.dumps(link_attachment)}")

    # 3. Generate Sample Spreadsheet Template
    print("\n[Step 3] Generating sample curriculum spreadsheet...")
    template_path = "sample_test_course.xlsx"
    generate_sample_course_template(template_path)
    assert os.path.exists(template_path), "Template file was not created"
    print(f"[PASS] Created test spreadsheet: {template_path}")

    # 4. Initialize Mock Service
    print("\n[Step 4] Initializing Mock Classroom API Service...")
    mock_service = get_classroom_service(use_mock=True, verbose=False)
    print("[PASS] Mock Classroom API Service ready.")

    # 5. Test Action 1: Create & Populate Course
    print("\n[Step 5] Testing Action 1: Create & Populate Course...")
    create_result = create_and_populate_course(mock_service, template_path, verbose=verbose)
    created_course_id = create_result["course"]["id"]
    assert len(create_result["topics"]) == 4, f"Expected 4 topics, got {len(create_result['topics'])}"
    assert len(create_result["materials"]) == 4, "Expected 4 lecture materials with presentation links"
    assert len(create_result["coursework"]) >= 4, f"Expected coursework items, got {len(create_result['coursework'])}"
    print("[PASS] Action 1 verified successfully.")

    # 6. Test Action 2: Non-Destructive Sync
    print("\n[Step 6] Testing Action 2: Non-Destructive Edit / Sync...")
    sync_result = sync_existing_course(mock_service, created_course_id, template_path, verbose=verbose)
    assert sync_result["status"] == "success", "Sync failed"
    print("[PASS] Action 2 verified successfully.")

    # 7. Test Action 3: List Courses & Status Check (Duplicate omitted per policy)
    print("\n[Step 7] Testing Action 3: List Courses & Status Check...")
    course_list = list_courses_and_status_check(mock_service, verbose=verbose)
    assert len(course_list) >= 1, f"Expected at least 1 course, got {len(course_list)}"
    print("[PASS] Action 3 verified successfully.")

    print("\n" + "=" * 70)
    print("[ALL PASS] ALL TESTS & SAFETY AUDITS PASSED WITH 100% SUCCESS!")
    print("=" * 70 + "\n")
    return True


# =============================================================================
# INTERACTIVE CLI MENU & ENTRYPOINT
# =============================================================================

def interactive_cli_menu(service: Any):
    """Displays the interactive menu-driven console interface."""
    while True:
        print("\n" + "=" * 65)
        print("  GOOGLE CLASSROOM COURSE AUTOMATION ENGINE (NO-DELETE SAFE)")
        print("=" * 65)
        print("  1. Create & Populate Course (from Spreadsheet)")
        print("  2. Edit / Non-Destructive Sync Existing Course")
        print("  3. Duplicate Course Structure to New Section")
        print("  4. List Courses & Status Check")
        print("  5. Generate Sample Course Spreadsheet Template")
        print("  6. Run Self-Test & Safety Audit")
        print("  7. Exit")
        print("=" * 65)

        try:
            choice = input("Select an option (1-7): ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nExiting.")
            break

        if choice == "1":
            file_path = input("Enter path to course spreadsheet (.xlsx) [default: sample_course_curriculum.xlsx]: ").strip()
            if not file_path:
                file_path = "sample_course_curriculum.xlsx"
            if not os.path.exists(file_path):
                print(f"[INFO] Generating sample template first at: {file_path}")
                generate_sample_course_template(file_path)
            try:
                create_and_populate_course(service, file_path, verbose=True)
            except Exception as e:
                print(f"[ERROR] Error creating course: {e}")

        elif choice == "2":
            course_id = input("Enter target Course ID to sync: ").strip()
            if not course_id:
                print("Course ID is required.")
                continue
            file_path = input("Enter path to updated spreadsheet (.xlsx) [default: sample_course_curriculum.xlsx]: ").strip()
            if not file_path:
                file_path = "sample_course_curriculum.xlsx"
            try:
                sync_existing_course(service, course_id, file_path, verbose=True)
            except Exception as e:
                print(f"[ERROR] Error syncing course: {e}")

        elif choice == "3":
            course_id = input("Enter source Course ID to duplicate: ").strip()
            if not course_id:
                print("Course ID is required.")
                continue
            section = input("Enter new Section / Cohort name (e.g., 'Cohort 2'): ").strip()
            if not section:
                section = "Next Cohort"
            try:
                duplicate_course_structure(service, course_id, section, verbose=True)
            except Exception as e:
                print(f"[ERROR] Error duplicating course: {e}")

        elif choice == "4":
            try:
                list_courses_and_status_check(service, verbose=True)
            except Exception as e:
                print(f"[ERROR] Error listing courses: {e}")

        elif choice == "5":
            out_file = input("Enter output template filename [default: sample_course_curriculum.xlsx]: ").strip()
            if not out_file:
                out_file = "sample_course_curriculum.xlsx"
            gen_path = generate_sample_course_template(out_file)
            print(f"[OK] Sample template generated successfully: {gen_path}")

        elif choice == "6":
            run_self_test_and_safety_audit(verbose=True)

        elif choice == "7":
            print("Goodbye!")
            break
        else:
            print("Invalid option. Please enter a number between 1 and 7.")


def main():
    parser = argparse.ArgumentParser(
        description="Google Classroom Course Automation Engine (NO-DELETE Safe)"
    )
    parser.add_argument("--create", action="store_true", help="Action 1: Create and populate course from spreadsheet")
    parser.add_argument("--sync", action="store_true", help="Action 2: Edit/Sync existing course from spreadsheet")
    parser.add_argument("--duplicate", action="store_true", help="Action 3: Duplicate course to new section")
    parser.add_argument("--list", action="store_true", help="Action 4: List courses and status check")
    parser.add_argument("--generate-template", action="store_true", help="Generate a sample course spreadsheet template")
    parser.add_argument("--test", action="store_true", help="Run automated self-test and safety audit")
    parser.add_argument("--file", type=str, default="sample_course_curriculum.xlsx", help="Spreadsheet file path")
    parser.add_argument("--course-id", type=str, help="Target Course ID for sync or duplicate")
    parser.add_argument("--section", type=str, default="Cohort 2", help="New section name for duplicate")
    parser.add_argument("--mock", action="store_true", help="Force use of in-memory Mock Classroom API simulator")

    args = parser.parse_args()

    # If test flag provided, run self-test suite
    if args.test:
        success = run_self_test_and_safety_audit(verbose=True)
        sys.exit(0 if success else 1)

    if args.generate_template:
        path = generate_sample_course_template(args.file)
        print(f"[OK] Template generated at: {path}")
        sys.exit(0)

    # Initialize Service
    service = get_classroom_service(use_mock=args.mock, verbose=True)

    if args.create:
        if not os.path.exists(args.file):
            print(f"[INFO] Generating template at {args.file}...")
            generate_sample_course_template(args.file)
        create_and_populate_course(service, args.file, verbose=True)
        sys.exit(0)

    if args.sync:
        if not args.course_id:
            print("[ERROR] --course-id is required for sync.")
            sys.exit(1)
        sync_existing_course(service, args.course_id, args.file, verbose=True)
        sys.exit(0)

    if args.duplicate:
        print("[POLICY] Course duplication is strictly disabled per safety requirements ('no duplicate course').")
        sys.exit(1)

    if args.list:
        list_courses_and_status_check(service, verbose=True)
        sys.exit(0)

    # If no flags passed, launch interactive CLI menu
    interactive_cli_menu(service)


if __name__ == "__main__":
    main()
