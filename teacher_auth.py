"""
Per-teacher Google sign-in.

Each teacher signs in with their own Google account. Their OAuth credentials are
stored in TEACHER_DIR, one file per account, and a random session id in an
HttpOnly cookie maps back to that account. No credentials are shared between
teachers.
"""

import os
import json
import hashlib
import secrets
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from googleapiclient.http import HttpRequest

from classroom_api import CLASSROOM_SCOPES

TEACHER_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "teacher_tokens")
SESSIONS_FILE = os.path.join(TEACHER_DIR, "_sessions.json")
SESSION_COOKIE = "lms_sid"
GOOGLE_API_TIMEOUT_SECONDS = 60
GOOGLE_API_RETRIES = 4


class RetryingHttpRequest(HttpRequest):
    """
    Every Classroom call retries rate limits (429) and Google server errors (5xx) with
    exponential backoff, as Google recommends, so a busy moment does not fail a course
    half way through. Refusals (400, 403, 404, 409) are not retried.
    """

    def execute(self, http=None, num_retries=GOOGLE_API_RETRIES):
        return super().execute(http=http, num_retries=num_retries)

# Identity scopes plus Classroom. openid and email are needed to read the account.
LOGIN_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
] + CLASSROOM_SCOPES + [
    # Quizzes: Course Builder creates each quiz as a Google Form. drive.file only reaches
    # files this app created, not the rest of the teacher's Drive.
    "https://www.googleapis.com/auth/drive.file",
    # Rubrics: Classroom reads the rubric's Google Sheet when importing it.
    "https://www.googleapis.com/auth/spreadsheets.readonly",
]


def _ensure_dir() -> None:
    os.makedirs(TEACHER_DIR, exist_ok=True)


def _read_json(path: str, default: Any) -> Any:
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _write_json(path: str, data: Any) -> None:
    _ensure_dir()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def token_path_for(email: str) -> str:
    digest = hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()[:24]
    return os.path.join(TEACHER_DIR, f"{digest}.json")


def save_credentials(email: str, creds_json: str) -> None:
    """Store one teacher's OAuth credentials."""
    _ensure_dir()
    with open(token_path_for(email), "w", encoding="utf-8") as f:
        f.write(creds_json)


def load_credentials(email: str):
    """Return google Credentials for a teacher, refreshed if expired, or None."""
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request

    path = token_path_for(email)
    if not os.path.exists(path):
        return None
    # Refresh without a scope list. Google then renews the permissions already granted.
    # Sending a stored list that includes ungranted scopes gets rejected (invalid_scope).
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    data.pop("scopes", None)
    creds = Credentials.from_authorized_user_info(data)
    if not creds.valid and creds.refresh_token:
        from google.auth.exceptions import RefreshError
        try:
            creds.refresh(Request())
        except RefreshError:
            # Access revoked or the refresh token expired: the teacher must sign in again (a 401, not a 500)
            return None
        save_credentials(email, creds.to_json())
    return creds if creds.valid else None


def create_session(email: str, profile: Optional[Dict[str, Any]] = None) -> str:
    """Create a session id for a signed-in teacher and return it. The profile is kept so /api/auth/me needs no Google call."""
    sid = secrets.token_urlsafe(32)
    sessions = _read_json(SESSIONS_FILE, {})
    sessions[sid] = {"email": email.strip().lower(),
                     "profile": profile or {},
                     "created": datetime.now(timezone.utc).isoformat()}
    _write_json(SESSIONS_FILE, sessions)
    return sid


def session_profile(sid: Optional[str]) -> Optional[Dict[str, Any]]:
    """Return the teacher's profile for a session, or None if signed out."""
    if not sid:
        return None
    sessions = _read_json(SESSIONS_FILE, {})
    entry = sessions.get(sid)
    if not entry or not os.path.exists(token_path_for(entry["email"])):
        return None
    profile = entry.get("profile")
    if not profile:
        # Session made before profiles were stored: read it once from Google, then keep it
        creds = load_credentials(entry["email"])
        if creds is None:
            return None
        profile = profile_for(creds)
        entry["profile"] = profile
        sessions[sid] = entry
        _write_json(SESSIONS_FILE, sessions)
    return {**profile, "authenticated": True}


def email_for_session(sid: Optional[str]) -> Optional[str]:
    if not sid:
        return None
    entry = _read_json(SESSIONS_FILE, {}).get(sid)
    return entry["email"] if entry else None


def delete_session(sid: Optional[str]) -> None:
    if not sid:
        return
    sessions = _read_json(SESSIONS_FILE, {})
    if sessions.pop(sid, None) is not None:
        _write_json(SESSIONS_FILE, sessions)


def parse_session_cookie(cookie_header: Optional[str]) -> Optional[str]:
    """Pull the session id out of a Cookie header."""
    if not cookie_header:
        return None
    for part in cookie_header.split(";"):
        name, _, value = part.strip().partition("=")
        if name == SESSION_COOKIE:
            return value
    return None


def session_cookie_header(sid: str) -> str:
    return f"{SESSION_COOKIE}={sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000"


def clear_cookie_header() -> str:
    return f"{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"


def build_teacher_service(email: str):
    """Build a Classroom v1 client that acts as this teacher."""
    return _build_teacher_api(email, "classroom")


def build_teacher_forms_service(email: str):
    """Build a Google Forms v1 client that acts as this teacher (for creating quizzes)."""
    return _build_teacher_api(email, "forms")


def _build_teacher_api(email: str, api: str):
    import httplib2
    from google_auth_httplib2 import AuthorizedHttp
    from googleapiclient.discovery import build

    creds = load_credentials(email)
    if creds is None:
        raise PermissionError("Teacher sign-in has expired. Please sign in with Google again.")
    # Without a timeout a stalled Google connection hangs the request forever.
    http = AuthorizedHttp(creds, http=httplib2.Http(timeout=GOOGLE_API_TIMEOUT_SECONDS))
    return build(api, "v1", http=http, cache_discovery=False, requestBuilder=RetryingHttpRequest)


def profile_for(creds) -> Dict[str, Any]:
    """Return the teacher's name, email, and picture for the UI."""
    from googleapiclient.discovery import build

    info = build("oauth2", "v2", credentials=creds, cache_discovery=False).userinfo().get().execute()
    return profile_from_info(info)


def profile_from_info(info: Dict[str, Any]) -> Dict[str, Any]:
    """Build the UI profile from Google's userinfo response."""
    email = info.get("email", "")
    return {
        "authenticated": True,
        "email": email,
        "name": info.get("name", ""),
        "avatar": info.get("picture", ""),
        "domain": email.split("@")[1] if "@" in email else "",
        "role": "Google Classroom Teacher",
        "login_time": datetime.now(timezone.utc).isoformat(),
    }
