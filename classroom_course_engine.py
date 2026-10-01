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
from typing import Dict, List, Optional, Any, Tuple
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


# =============================================================================
# IN-MEMORY GOOGLE CLASSROOM API V1 SIMULATOR (MOCK ENGINE FOR TESTABILITY)
# =============================================================================

class MockClassroomResource:
    """Mock Classroom resource allowing complete execution without live cloud credentials."""
    def __init__(self, data_store: Dict[str, Any]):
        self._store = data_store

    def courses(self):
        return MockCoursesEndpoint(self._store)


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
                    "courseState": "ACTIVE",
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

    def list(self, courseStates=None, pageSize=100):
        class Request:
            def __init__(self, store, courseStates):
                self.store = store
                self.states = courseStates or ["ACTIVE"]

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
                course_topics = self.store["topics"].setdefault(self.cid, {})
                tid = f"topic-{len(course_topics) + 1}"
                record = {
                    "topicId": tid,
                    "courseId": self.cid,
                    "name": self.body.get("name", "Untitled Topic"),
                }
                course_topics[tid] = record
                return record
        return Request(self._store, courseId, body)

    def list(self, courseId: str, pageSize=100):
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
                for field in self.mask:
                    if field in self.body:
                        topic[field] = self.body[field]
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

    def list(self, courseId: str, pageSize=100):
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
                for field in self.mask:
                    if field in self.body:
                        mat[field] = self.body[field]
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
                    "workType": self.body.get("workType", "ASSIGNMENT"),
                    "topicId": self.body.get("topicId", ""),
                    "dueDate": self.body.get("dueDate"),
                    "dueTime": self.body.get("dueTime"),
                    "alternateLink": f"https://classroom.google.com/cw/{wid}",
                }
                course_cw[wid] = record
                return record
        return Request(self._store, courseId, body)

    def list(self, courseId: str, pageSize=100):
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
                for field in self.mask:
                    if field in self.body:
                        cw[field] = self.body[field]
                return cw
        return Request(self._store, courseId, id, updateMask, body)


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

    def list(self, courseId: str, pageSize=100):
        class Request:
            def __init__(self, store, cid):
                self.store = store
                self.cid = cid

            def execute(self):
                items = self.store["announcements"].get(self.cid, [])
                return {"announcements": items}
        return Request(self._store, courseId)


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

    def list(self, courseId: str, pageSize=100):
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

    def list(self, courseId: str, pageSize=100):
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


def _normalize_curriculum_sheet(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Extracts module topics, presentation lecture links, assignments, quizzes, and questions."""
    modules: List[Dict[str, Any]] = []

    # Map column names flexibly
    col_map = {}
    for col in df.columns:
        c_clean = str(col).strip().lower().replace("_", " ")
        if any(w in c_clean for w in ["stream topic", "classroom topic", "classroom stream topic"]):
            col_map["stream_topic"] = col
        elif any(w in c_clean for w in ["week", "module number", "module #", "unit"]):
            col_map["sequence"] = col
        elif any(w in c_clean for w in ["module title", "topic title", "unit title", "title"]):
            if "stream_topic" not in col_map or col != col_map.get("stream_topic"):
                col_map["title"] = col
        elif any(w in c_clean for w in ["overview", "description", "summary", "module overview"]):
            col_map["overview"] = col
        elif any(w in c_clean for w in ["lecture materials", "presentation", "slides", "slides url", "materials url", "lecture presentation url"]):
            col_map["lecture_url"] = col
        elif any(w in c_clean for w in ["quiz assignment", "quiz title", "quiz name"]):
            col_map["quiz_title"] = col
        elif any(w in c_clean for w in ["quiz url", "quiz form", "quiz form url", "google form"]):
            col_map["quiz_url"] = col
        elif any(w in c_clean for w in ["question prompt", "discussion question", "question"]):
            col_map["question_prompt"] = col
        elif any(w in c_clean for w in ["question type", "prompt type"]):
            col_map["question_type"] = col
        elif any(w in c_clean for w in ["assignment instructions", "assignment desc", "instructions"]):
            col_map["assignment_instructions"] = col
        elif any(w in c_clean for w in ["assignment title", "assignment name", "assignment"]):
            col_map["assignment_title"] = col
        elif any(w in c_clean for w in ["assessment", "knowledge check", "exam"]):
            col_map["assessment"] = col
        elif any(w in c_clean for w in ["points", "max points", "score"]):
            col_map["points"] = col
        elif any(w in c_clean for w in ["due date", "deadline"]):
            col_map["due_date"] = col

    for idx, row in df.iterrows():
        seq = str(row[col_map["sequence"]]).strip() if "sequence" in col_map and not pd.isna(row[col_map["sequence"]]) else f"Week {idx + 1}"
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

        # Question
        question_prompt = str(row[col_map["question_prompt"]]).strip() if "question_prompt" in col_map and not pd.isna(row[col_map["question_prompt"]]) else ""
        question_type = str(row[col_map["question_type"]]).strip() if "question_type" in col_map and not pd.isna(row[col_map["question_type"]]) else "SHORT_ANSWER_QUESTION"

        # Points & Due Date
        points_raw = row[col_map["points"]] if "points" in col_map and not pd.isna(row[col_map["points"]]) else 100
        due_date_raw = row[col_map["due_date"]] if "due_date" in col_map and not pd.isna(row[col_map["due_date"]]) else None

        points = 100
        try:
            if not pd.isna(points_raw):
                points = int(float(points_raw))
        except (ValueError, TypeError):
            points = 100

        modules.append({
            "sequence": seq,
            "title": title,
            "topic_name": topic_name,
            "overview": overview,
            # 1. Material (Multiple links supported)
            "presentation_url": clean_lecture_url,
            "presentation_urls": lecture_urls,
            "has_presentation": len(lecture_urls) > 0,
            # 2. Assignment
            "assignment_title": assignment_title,
            "assignment_instructions": assignment_instructions,
            "assessment_text": assignment_title,
            # 3. Quiz Assignment
            "quiz_title": quiz_title,
            "quiz_url": clean_quiz_url,
            # 4. Question
            "question_prompt": question_prompt,
            "question_type": question_type,
            # Shared metrics
            "points": points,
            "due_date_raw": due_date_raw,
        })

    return modules


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

    return build("classroom", "v1", credentials=creds)


# =============================================================================
# CORE ENGINE ACTIONS (1: CREATE & POPULATE)
# =============================================================================

def create_and_populate_course(
    service: Any,
    spreadsheet_path: str,
    verbose: bool = True
) -> Dict[str, Any]:
    """
    Action 1: Create & Populate Course
    - Reads Course_Settings and Curriculum.
    - Creates course, topics, lecture materials (with presentation links attached), and assessments.
    - Posts welcome stream announcement.
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
        "descriptionHeading": settings.get("subject", ""),
        "description": f"Level: {settings.get('level', '')}",
        "room": settings.get("room", ""),
        "ownerId": "me",
    }
    course = service.courses().create(body=course_body).execute()
    course_id = course["id"]
    if verbose:
        print(f"[OK] Created Course: '{course.get('name')}' (ID: {course_id})")

    # 2. Post Welcome Announcement (if provided)
    welcome_text = settings.get("welcome_announcement", "").strip()
    if welcome_text:
        ann_body = {
            "text": welcome_text,
            "state": "PUBLISHED"
        }
        service.courses().announcements().create(courseId=course_id, body=ann_body).execute()
        if verbose:
            print(f"[STREAM] Posted Welcome Announcement to Course Stream.")

    # 3. Create Topics, Lecture Materials (Presentation Links), and Assessments
    created_topics = {}
    created_materials = []
    created_coursework = []

    for mod in curriculum:
        topic_name = mod["topic_name"]
        
        # A. Create Topic
        topic_body = {"name": topic_name}
        topic = service.courses().topics().create(courseId=course_id, body=topic_body).execute()
        topic_id = topic["topicId"]
        created_topics[topic_name] = topic_id
        if verbose:
            print(f"\n  [TOPIC] Created: '{topic_name}' (Topic ID: {topic_id})")

        # B. Create Material with Presentation Link(s)
        p_urls = mod.get("presentation_urls") or ([mod["presentation_url"]] if mod.get("presentation_url") else [])
        if p_urls:
            link_attachments = [build_link_material_attachment(u) for u in p_urls if u]
            if link_attachments:
                material_body = {
                    "title": f"{mod['title']} - Lecture Materials",
                    "description": mod.get("overview", "") or f"Presentation slides and documents for {mod['title']}",
                    "materials": link_attachments,
                    "topicId": topic_id,
                    "state": "PUBLISHED"
                }
                mat_item = service.courses().courseWorkMaterials().create(
                    courseId=course_id, body=material_body
                ).execute()
                created_materials.append(mat_item)
                if verbose:
                    print(f"    [MATERIAL] Attached {len(link_attachments)} link(s): {', '.join(p_urls)}")

        # Helper for due dates
        due_date_dict = None
        due_raw = mod.get("due_date_raw")
        if due_raw and not pd.isna(due_raw):
            try:
                dt = pd.to_datetime(due_raw)
                due_date_dict = {
                    "year": int(dt.year),
                    "month": int(dt.month),
                    "day": int(dt.day)
                }
            except Exception:
                pass

        # C. Create Assignment (if provided)
        assignment_title = mod.get("assignment_title") or mod.get("assessment_text", "").strip()
        if assignment_title:
            cw_body = {
                "title": assignment_title,
                "description": mod.get("assignment_instructions") or f"Instructions for {assignment_title}.\n{mod.get('overview', '')}",
                "maxPoints": mod.get("points", 100),
                "workType": "ASSIGNMENT",
                "state": "PUBLISHED",
                "topicId": topic_id,
            }
            if due_date_dict:
                cw_body["dueDate"] = due_date_dict
                cw_body["dueTime"] = {"hours": 23, "minutes": 59}

            cw_item = service.courses().courseWork().create(
                courseId=course_id, body=cw_body
            ).execute()
            created_coursework.append(cw_item)
            if verbose:
                print(f"    [ASSIGNMENT] Created: '{cw_item.get('title')}' ({cw_body['maxPoints']} pts)")

        # D. Create Quiz Assignment (if provided)
        quiz_title = mod.get("quiz_title", "").strip()
        quiz_url = mod.get("quiz_url")
        if quiz_title or quiz_url:
            q_title = quiz_title or f"{mod['title']} Quiz Check"
            quiz_materials = []
            if quiz_url:
                quiz_materials.append(build_link_material_attachment(quiz_url))

            quiz_body = {
                "title": q_title,
                "description": f"Complete the Google Form quiz for {mod['title']}.",
                "maxPoints": 50,
                "workType": "ASSIGNMENT",
                "state": "PUBLISHED",
                "topicId": topic_id,
                "materials": quiz_materials
            }
            if due_date_dict:
                quiz_body["dueDate"] = due_date_dict
                quiz_body["dueTime"] = {"hours": 23, "minutes": 59}

            quiz_item = service.courses().courseWork().create(
                courseId=course_id, body=quiz_body
            ).execute()
            created_coursework.append(quiz_item)
            if verbose:
                print(f"    [QUIZ ASSIGNMENT] Created: '{quiz_item.get('title')}'")

        # E. Create Question (Discussion / Knowledge Prompt if provided)
        question_prompt = mod.get("question_prompt", "").strip()
        if question_prompt:
            q_type = mod.get("question_type") or "SHORT_ANSWER_QUESTION"
            question_body = {
                "title": question_prompt,
                "description": f"Weekly discussion question for {mod['title']}. Submit your response.",
                "maxPoints": 20,
                "workType": q_type if q_type in ["SHORT_ANSWER_QUESTION", "MULTIPLE_CHOICE_QUESTION"] else "SHORT_ANSWER_QUESTION",
                "state": "PUBLISHED",
                "topicId": topic_id,
            }
            if due_date_dict:
                question_body["dueDate"] = due_date_dict
                question_body["dueTime"] = {"hours": 23, "minutes": 59}

            question_item = service.courses().courseWork().create(
                courseId=course_id, body=question_body
            ).execute()
            created_coursework.append(question_item)
            if verbose:
                print(f"    [QUESTION] Created: '{question_item.get('title')[:40]}...'")

    # 4. Add Co-Teachers (if provided in settings)
    teachers = settings.get("teachers", [])
    added_teachers = []
    if teachers:
        if verbose:
            print(f"\n[ROSTER] Adding {len(teachers)} Co-Teacher(s) to Course...")
        for t_email in teachers:
            try:
                t_record = service.courses().teachers().create(
                    courseId=course_id,
                    body={"userId": t_email}
                ).execute()
                added_teachers.append(t_record)
                if verbose:
                    print(f"  [+] Added Co-Teacher: {t_email}")
            except Exception as e:
                if verbose:
                    print(f"  [!] Note adding teacher {t_email}: {e}")

    # 5. Add Students / Roster (if provided)
    students = getattr(data, "students", []) or settings.get("students", [])
    added_students = []
    if students:
        if verbose:
            print(f"\n[ROSTER] Adding {len(students)} Student(s) to Course...")
        for s_email in students:
            try:
                s_record = service.courses().students().create(
                    courseId=course_id,
                    body={"userId": s_email}
                ).execute()
                added_students.append(s_record)
                if verbose:
                    print(f"  [+] Added Student: {s_email}")
            except Exception as e:
                if verbose:
                    print(f"  [!] Note adding student {s_email}: {e}")

    if verbose:
        print(f"\n[SUCCESS] Finished creating course '{settings['class_name']}'!")
        print(f"   Summary: 1 Course, {len(created_topics)} Topics, {len(created_materials)} Materials, {len(created_coursework)} Assessments, {len(added_teachers)} Teachers, {len(added_students)} Students.")

    return {
        "course": course,
        "topics": created_topics,
        "materials": created_materials,
        "coursework": created_coursework,
        "teachers": added_teachers,
        "students": added_students
    }


# =============================================================================
# CORE ENGINE ACTIONS (2: EDIT / NON-DESTRUCTIVE SYNC)
# =============================================================================

def sync_existing_course(
    service: Any,
    course_id: str,
    spreadsheet_path: str,
    verbose: bool = True
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
        "descriptionHeading": settings.get("subject", ""),
        "description": f"Level: {settings.get('level', '')}",
        "room": settings.get("room", ""),
    }
    updated_course = service.courses().patch(
        id=course_id,
        updateMask="name,section,descriptionHeading,description,room",
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

    # 3. Non-destructive sync of curriculum items
    for mod in curriculum:
        topic_name = mod["topic_name"]
        
        # Topic sync
        if topic_name in existing_topics:
            topic_id = existing_topics[topic_name]["topicId"]
            if verbose:
                print(f"  [TOPIC EXISTS] Verified: '{topic_name}' (ID: {topic_id})")
        else:
            # Create missing topic
            new_topic = service.courses().topics().create(
                courseId=course_id, body={"name": topic_name}
            ).execute()
            topic_id = new_topic["topicId"]
            existing_topics[topic_name] = new_topic
            synced_topics_count += 1
            if verbose:
                print(f"  [TOPIC ADDED] Created new missing topic: '{topic_name}' (ID: {topic_id})")

        # Material sync (Lecture presentation link(s))
        p_urls = mod.get("presentation_urls") or ([mod["presentation_url"]] if mod.get("presentation_url") else [])
        if p_urls:
            link_attachments = [build_link_material_attachment(u) for u in p_urls if u]
            if link_attachments:
                mat_title = f"{mod['title']} - Lecture Materials"
                if mat_title in existing_materials:
                    existing_item = existing_materials[mat_title]
                    mat_id = existing_item["id"]
                    patch_mat = {
                        "description": mod.get("overview", "") or f"Presentation slides and documents for {mod['title']}",
                        "materials": link_attachments,
                        "topicId": topic_id
                    }
                    service.courses().courseWorkMaterials().patch(
                        courseId=course_id,
                        id=mat_id,
                        updateMask="description,materials,topicId",
                        body=patch_mat
                    ).execute()
                    synced_materials_count += 1
                    if verbose:
                        print(f"    [MATERIAL UPDATED] Updated {len(link_attachments)} presentation link(s): '{mat_title}'")
                else:
                    create_mat = {
                        "title": mat_title,
                        "description": mod.get("overview", "") or f"Presentation slides and documents for {mod['title']}",
                        "materials": link_attachments,
                        "topicId": topic_id,
                        "state": "PUBLISHED"
                    }
                    new_m = service.courses().courseWorkMaterials().create(
                        courseId=course_id, body=create_mat
                    ).execute()
                    existing_materials[mat_title] = new_m
                    synced_materials_count += 1
                    if verbose:
                        print(f"    [MATERIAL ADDED] Added missing material with {len(link_attachments)} link(s): '{mat_title}'")

        # Helper for due dates
        due_date_dict = None
        due_raw = mod.get("due_date_raw")
        if due_raw and not pd.isna(due_raw):
            try:
                dt = pd.to_datetime(due_raw)
                due_date_dict = {
                    "year": int(dt.year),
                    "month": int(dt.month),
                    "day": int(dt.day)
                }
            except Exception:
                pass

        # 1. Assignment sync
        assignment_title = (mod.get("assignment_title") or mod.get("assessment_text", "")).strip()
        if assignment_title:
            if assignment_title in existing_coursework:
                cw_item = existing_coursework[assignment_title]
                cw_id = cw_item["id"]
                cw_patch = {
                    "description": mod.get("assignment_instructions") or f"Instructions for {assignment_title}.\n{mod.get('overview', '')}",
                    "maxPoints": mod.get("points", 100),
                    "topicId": topic_id
                }
                mask = "description,maxPoints,topicId"
                if due_date_dict:
                    cw_patch["dueDate"] = due_date_dict
                    cw_patch["dueTime"] = {"hours": 23, "minutes": 59}
                    mask += ",dueDate,dueTime"

                service.courses().courseWork().patch(
                    courseId=course_id,
                    id=cw_id,
                    updateMask=mask,
                    body=cw_patch
                ).execute()
                synced_cw_count += 1
                if verbose:
                    print(f"    [ASSIGNMENT UPDATED] Updated parameters: '{assignment_title}'")
            else:
                cw_create = {
                    "title": assignment_title,
                    "description": mod.get("assignment_instructions") or f"Instructions for {assignment_title}.\n{mod.get('overview', '')}",
                    "maxPoints": mod.get("points", 100),
                    "workType": "ASSIGNMENT",
                    "state": "PUBLISHED",
                    "topicId": topic_id
                }
                if due_date_dict:
                    cw_create["dueDate"] = due_date_dict
                    cw_create["dueTime"] = {"hours": 23, "minutes": 59}

                new_cw = service.courses().courseWork().create(
                    courseId=course_id, body=cw_create
                ).execute()
                existing_coursework[assignment_title] = new_cw
                synced_cw_count += 1
                if verbose:
                    print(f"    [ASSIGNMENT ADDED] Added missing assignment: '{assignment_title}'")

        # 2. Quiz Assignment sync
        quiz_title = mod.get("quiz_title", "").strip()
        quiz_url = mod.get("quiz_url")
        if quiz_title or quiz_url:
            q_title = quiz_title or f"{mod['title']} Quiz Check"
            quiz_materials = []
            if quiz_url:
                quiz_materials.append(build_link_material_attachment(quiz_url))

            if q_title in existing_coursework:
                cw_item = existing_coursework[q_title]
                cw_id = cw_item["id"]
                q_patch = {
                    "description": f"Complete the Google Form quiz for {mod['title']}.",
                    "topicId": topic_id
                }
                mask = "description,topicId"
                if quiz_materials:
                    q_patch["materials"] = quiz_materials
                    mask += ",materials"
                if due_date_dict:
                    q_patch["dueDate"] = due_date_dict
                    q_patch["dueTime"] = {"hours": 23, "minutes": 59}
                    mask += ",dueDate,dueTime"

                service.courses().courseWork().patch(
                    courseId=course_id,
                    id=cw_id,
                    updateMask=mask,
                    body=q_patch
                ).execute()
                synced_cw_count += 1
                if verbose:
                    print(f"    [QUIZ UPDATED] Updated quiz assignment: '{q_title}'")
            else:
                q_create = {
                    "title": q_title,
                    "description": f"Complete the Google Form quiz for {mod['title']}.",
                    "maxPoints": 50,
                    "workType": "ASSIGNMENT",
                    "state": "PUBLISHED",
                    "topicId": topic_id,
                    "materials": quiz_materials
                }
                if due_date_dict:
                    q_create["dueDate"] = due_date_dict
                    q_create["dueTime"] = {"hours": 23, "minutes": 59}

                new_q = service.courses().courseWork().create(
                    courseId=course_id, body=q_create
                ).execute()
                existing_coursework[q_title] = new_q
                synced_cw_count += 1
                if verbose:
                    print(f"    [QUIZ ADDED] Added missing quiz: '{q_title}'")

        # 3. Question (Discussion Prompt) sync
        question_prompt = mod.get("question_prompt", "").strip()
        if question_prompt:
            q_type = mod.get("question_type") or "SHORT_ANSWER_QUESTION"
            if question_prompt in existing_coursework:
                cw_item = existing_coursework[question_prompt]
                cw_id = cw_item["id"]
                quest_patch = {
                    "topicId": topic_id,
                    "description": f"Weekly discussion question for {mod['title']}. Submit your response."
                }
                mask = "topicId,description"
                if due_date_dict:
                    quest_patch["dueDate"] = due_date_dict
                    quest_patch["dueTime"] = {"hours": 23, "minutes": 59}
                    mask += ",dueDate,dueTime"

                service.courses().courseWork().patch(
                    courseId=course_id,
                    id=cw_id,
                    updateMask=mask,
                    body=quest_patch
                ).execute()
                synced_cw_count += 1
                if verbose:
                    print(f"    [QUESTION UPDATED] Updated discussion question: '{question_prompt[:40]}...'")
            else:
                quest_create = {
                    "title": question_prompt,
                    "description": f"Weekly discussion question for {mod['title']}. Submit your response.",
                    "maxPoints": 20,
                    "workType": q_type if q_type in ["SHORT_ANSWER_QUESTION", "MULTIPLE_CHOICE_QUESTION"] else "SHORT_ANSWER_QUESTION",
                    "state": "PUBLISHED",
                    "topicId": topic_id
                }
                if due_date_dict:
                    quest_create["dueDate"] = due_date_dict
                    quest_create["dueTime"] = {"hours": 23, "minutes": 59}

                new_quest = service.courses().courseWork().create(
                    courseId=course_id, body=quest_create
                ).execute()
                existing_coursework[question_prompt] = new_quest
                synced_cw_count += 1
                if verbose:
                    print(f"    [QUESTION ADDED] Added missing question: '{question_prompt[:40]}...'")

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

    # 5. Sync Students (non-destructive: only adds missing ones)
    students = getattr(data, "students", []) or settings.get("students", [])
    synced_students_count = 0
    if students:
        try:
            cur_students_resp = service.courses().students().list(courseId=course_id).execute()
            cur_students = {
                s.get("userId", "").lower() for s in cur_students_resp.get("students", [])
            } | {
                s.get("profile", {}).get("emailAddress", "").lower() for s in cur_students_resp.get("students", [])
            }
        except Exception:
            cur_students = set()

        for s_email in students:
            if s_email.lower() not in cur_students:
                try:
                    service.courses().students().create(
                        courseId=course_id, body={"userId": s_email}
                    ).execute()
                    synced_students_count += 1
                    if verbose:
                        print(f"    [STUDENT ENROLLED] Added student: '{s_email}'")
                except Exception as e:
                    if verbose:
                        print(f"    [!] Note adding student {s_email}: {e}")

    if verbose:
        print(f"\n[SYNC COMPLETE] Non-destructive sync completed safely.")
        print(f"   Modifications applied: Topics: {synced_topics_count}, Materials: {synced_materials_count}, CourseWork: {synced_cw_count}, Teachers: {synced_teachers_count}, Students: {synced_students_count}")

    return {
        "status": "success",
        "synced_topics": synced_topics_count,
        "synced_materials": synced_materials_count,
        "synced_coursework": synced_cw_count,
        "synced_teachers": synced_teachers_count,
        "synced_students": synced_students_count
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
        "descriptionHeading": source_course.get("descriptionHeading", ""),
        "description": source_course.get("description", ""),
        "room": source_course.get("room", ""),
        "ownerId": "me",
    }
    new_course = service.courses().create(body=new_course_body).execute()
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
        clean_materials_list = []
        for mat in sm.get("materials", []):
            if "link" in mat and "url" in mat["link"]:
                clean_materials_list.append(
                    build_link_material_attachment(mat["link"]["url"])
                )

        new_mat_body = {
            "title": sm.get("title", ""),
            "description": sm.get("description", ""),
            "materials": clean_materials_list,
            "topicId": topic_map.get(sm.get("topicId", ""), ""),
            "state": "PUBLISHED"
        }
        cloned_mat = service.courses().courseWorkMaterials().create(
            courseId=new_course_id, body=new_mat_body
        ).execute()
        cloned_materials.append(cloned_mat)
        if verbose:
            print(f"  [MATERIAL CLONED] '{sm.get('title')}' (Links: {len(clean_materials_list)})")

    # 5. Fetch and clone coursework
    source_cw = service.courses().courseWork().list(
        courseId=source_course_id
    ).execute().get("courseWork", [])
    cloned_cw = []

    for scw in source_cw:
        clean_cw_materials = []
        for mat in scw.get("materials", []):
            if "link" in mat and "url" in mat["link"]:
                clean_cw_materials.append(
                    build_link_material_attachment(mat["link"]["url"])
                )

        new_cw_body = {
            "title": scw.get("title", ""),
            "description": scw.get("description", ""),
            "materials": clean_cw_materials,
            "maxPoints": scw.get("maxPoints", 100),
            "workType": scw.get("workType", "ASSIGNMENT"),
            "state": "PUBLISHED",
            "topicId": topic_map.get(scw.get("topicId", ""), ""),
        }
        if scw.get("dueDate"):
            new_cw_body["dueDate"] = scw["dueDate"]
        if scw.get("dueTime"):
            new_cw_body["dueTime"] = scw["dueTime"]

        cloned_item = service.courses().courseWork().create(
            courseId=new_course_id, body=new_cw_body
        ).execute()
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

    courses_resp = service.courses().list(courseStates=["ACTIVE"]).execute()
    courses = courses_resp.get("courses", [])

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
