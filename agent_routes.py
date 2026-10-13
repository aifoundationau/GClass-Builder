"""
HTTP routes for teacher sign-in, Classroom access, and the AI course agent.

api_server.py calls handle_get and handle_post first. Each returns True when it
has handled the request. Every Classroom call here runs as the signed-in teacher,
using that teacher's own stored credentials.
"""

import base64
import json
import os
import traceback
import urllib.parse
from typing import Any, Dict, List, Optional, Tuple

import classroom_api
import course_agent
import course_developer
import teacher_auth
from course_agent import AgentError
from classroom_api import ClassroomCallError
from standards import list_standards

# Google may return extra scopes the teacher already granted to this app. oauthlib
# rejects a token whose scopes differ from the request, so allow the superset.
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

REDIRECT_URI = "http://localhost:5173/api/auth/oauth2callback"
CREDENTIALS_FILE = "credentials.json"
# state -> PKCE code verifier, held until the Google callback arrives
PENDING_LOGINS: Dict[str, str] = {}


def _cookie_sid(handler) -> Optional[str]:
    return teacher_auth.parse_session_cookie(handler.headers.get("Cookie"))


def _current_email(handler) -> Optional[str]:
    return teacher_auth.email_for_session(_cookie_sid(handler))


def _teacher_service(handler):
    email = _current_email(handler)
    if not email:
        raise PermissionError("Sign in with your Google account first.")
    return teacher_auth.build_teacher_service(email)


def _redirect(handler, location: str, set_cookie: Optional[str] = None) -> None:
    handler.send_response(302)
    handler._send_cors_headers()
    handler.send_header("Location", location)
    if set_cookie:
        handler.send_header("Set-Cookie", set_cookie)
    handler.end_headers()


def _session_profile(handler) -> Dict[str, Any]:
    profile = teacher_auth.session_profile(_cookie_sid(handler))
    if profile:
        return profile
    return {"authenticated": False, "email": None, "name": None, "role": None}


def _error_status(exc: Exception) -> int:
    if isinstance(exc, PermissionError):
        return 401
    if isinstance(exc, (AgentError, ValueError)):
        return 400
    if isinstance(exc, ClassroomCallError):
        return 403
    return 500


def _fail(handler, exc: Exception) -> None:
    status = _error_status(exc)
    if status == 500:
        print("[ERROR] " + handler.path + ": " + str(exc), flush=True)
        print(traceback.format_exc(), flush=True)
    payload = {"error": str(exc)}
    if status == 500:
        payload["traceback"] = traceback.format_exc()
    handler._send_json(status, payload)


# ---------------------------------------------------------------------------
# Course developer helpers
# ---------------------------------------------------------------------------

def _require_teacher(handler) -> None:
    """Signed-in check for routes that do not need a Classroom client."""
    if not _current_email(handler):
        raise PermissionError("Sign in with your Google account first.")


def _query(handler) -> Dict[str, List[str]]:
    return urllib.parse.parse_qs(urllib.parse.urlparse(handler.path).query)


def _course_id(body: Dict[str, Any]) -> str:
    course_id = str(body.get("courseId") or "").strip()
    if not course_id:
        raise ValueError("Missing courseId.")
    return course_id


def _standards_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if str(item).strip()]


def _decoded_files(raw: Any) -> List[Tuple[str, bytes]]:
    """Decode [{name, data: base64}] from the browser. A bad entry is a 400, not a 500."""
    if not raw:
        return []
    if not isinstance(raw, list):
        raise ValueError("files must be a list.")
    files: List[Tuple[str, bytes]] = []
    for item in raw:
        if not isinstance(item, dict) or not item.get("name"):
            raise ValueError("Each file needs a name and base64 data.")
        files.append((str(item["name"]), base64.b64decode(item.get("data") or "")))
    return files


def _attachments_from_files(files: List[Tuple[str, bytes]]) -> List[Dict[str, str]]:
    """Read uploads to {name, text} for placement. Unreadable files stop the request.

    Placement sends each attachment to the AI as source text, so an error message
    must never be passed on as if it were document content.
    """
    attachments = []
    for name, data in files:
        try:
            text = course_agent.extract_source_text(name, data).strip()
        except AgentError:
            raise
        except Exception as exc:
            raise AgentError(f"Could not read '{name}': {exc}") from exc
        if text:
            attachments.append({"name": name, "text": text})
    return attachments


def _blocked_delete_pairs() -> List[Dict[str, str]]:
    return [{"resource": resource, "method": method}
            for resource in sorted(classroom_api.BLOCKED_DELETES)
            for method in sorted(classroom_api.BLOCKED_DELETES[resource])]


def _failed_result(resource: Any, method: Any, reason: str) -> Dict[str, Any]:
    return {"resource": resource, "method": method, "ok": False, "id": None, "error": reason}


def _run_developer_ops(service, ops: Any, course_id: str,
                       allowed_resources: Optional[frozenset] = None) -> List[Dict[str, Any]]:
    """Re-validate operations, run the valid ones, and report every refused one as a failed result.

    Every item in the request gets exactly one entry in the returned list, so the
    teacher sees what was refused and why.
    """
    cleaned, rejected = course_developer.validate_operations(ops, course_id)
    refused: List[Dict[str, Any]] = [
        _failed_result(item["resource"], item["method"], item["reason"] or "Refused.")
        for item in rejected
    ]
    if allowed_resources is not None:
        kept = []
        for item in cleaned:
            if item["resource"] in allowed_resources:
                kept.append(item)
            else:
                refused.append(_failed_result(
                    item["resource"], item["method"],
                    "Placements can only target topics, materials, assignments and announcements."))
        cleaned = kept
    results = course_developer.apply_operations(service, cleaned, course_id=course_id)
    return results + refused


# ---------------------------------------------------------------------------
# GET
# ---------------------------------------------------------------------------

def handle_get(handler, path: str) -> bool:
    try:
        if path == "/api/status":
            handler._send_json(200, {
                "status": "online",
                "no_delete_policy_enforced": True,
                "user": _session_profile(handler),
            })
        elif path == "/api/auth/me":
            handler._send_json(200, _session_profile(handler))
        elif path == "/api/auth/google_login":
            _start_google_login(handler)
        elif path == "/api/auth/oauth2callback":
            _finish_google_login(handler)
        elif path == "/api/standards":
            handler._send_json(200, {"standards": list_standards()})
        elif path == "/api/classroom/surface":
            handler._send_json(200, {"resources": classroom_api.describe_surface(),
                                     "blocked_deletes": _blocked_delete_pairs()})
        elif path == "/api/developer/steps":
            _require_teacher(handler)
            handler._send_json(200, {"steps": course_developer.list_steps()})
        elif path == "/api/developer/step-data":
            service = _teacher_service(handler)
            query = _query(handler)
            course_id = query.get("courseId", [""])[0].strip()
            step = query.get("step", [""])[0].strip()
            if not course_id:
                raise ValueError("Missing courseId.")
            handler._send_json(200, {"data": course_developer.load_step_data(service, course_id, step)})
        elif path == "/api/classroom/courses":
            service = _teacher_service(handler)
            courses = classroom_api.list_all(service, "courses", "courses", {"teacherId": "me"})
            handler._send_json(200, {"courses": courses})
        elif path == "/api/classroom/course":
            query = urllib.parse.parse_qs(urllib.parse.urlparse(handler.path).query)
            course_id = query.get("id", [""])[0]
            if not course_id:
                raise ValueError("Missing course id.")
            service = _teacher_service(handler)
            handler._send_json(200, course_agent.read_course_snapshot(service, course_id))
        else:
            return False
    except Exception as exc:
        _fail(handler, exc)
    return True


def _start_google_login(handler) -> None:
    from google_auth_oauthlib.flow import Flow

    if not os.path.exists(CREDENTIALS_FILE):
        _redirect(handler, "/?login_error=" + urllib.parse.quote("credentials.json file not found"))
        return
    flow = Flow.from_client_secrets_file(CREDENTIALS_FILE, scopes=teacher_auth.LOGIN_SCOPES,
                                         redirect_uri=REDIRECT_URI)
    auth_url, state = flow.authorization_url(prompt="select_account consent", access_type="offline")
    PENDING_LOGINS[state] = getattr(flow, "code_verifier", None) or ""
    _redirect(handler, auth_url)


def _finish_google_login(handler) -> None:
    from google_auth_oauthlib.flow import Flow
    from googleapiclient.discovery import build

    query = urllib.parse.parse_qs(urllib.parse.urlparse(handler.path).query)
    if query.get("error"):
        _redirect(handler, "/?login_error=" + urllib.parse.quote("Sign-in was cancelled or permission was denied."))
        return
    code = query.get("code", [""])[0]
    state = query.get("state", [""])[0]
    if not code or state not in PENDING_LOGINS:
        _redirect(handler, "/?login_error=" + urllib.parse.quote("Sign-in expired. Please click login again."))
        return
    try:
        flow = Flow.from_client_secrets_file(CREDENTIALS_FILE, scopes=teacher_auth.LOGIN_SCOPES,
                                             redirect_uri=REDIRECT_URI, state=state)
        flow.code_verifier = PENDING_LOGINS.pop(state) or None
        flow.fetch_token(code=code)
        creds = flow.credentials
        info = build("oauth2", "v2", credentials=creds, cache_discovery=False).userinfo().get().execute()
        email = str(info.get("email", "")).strip().lower()
        if not email:
            raise ValueError("Google did not return an email address for this account.")
        teacher_auth.save_credentials(email, creds.to_json())
        sid = teacher_auth.create_session(email, teacher_auth.profile_from_info(info))
        _redirect(handler, "/?auth_success=1", teacher_auth.session_cookie_header(sid))
    except Exception as exc:
        print(f"[AUTH] Google sign-in failed: {exc}", flush=True)
        _redirect(handler, "/?login_error=" + urllib.parse.quote("Google sign-in failed. Please try again."))


# ---------------------------------------------------------------------------
# POST
# ---------------------------------------------------------------------------

def handle_post(handler, path: str) -> bool:
    try:
        if path == "/api/auth/logout":
            teacher_auth.delete_session(_cookie_sid(handler))
            handler.send_response(200)
            handler._send_cors_headers()
            handler.send_header("Content-Type", "application/json")
            handler.send_header("Set-Cookie", teacher_auth.clear_cookie_header())
            body = json.dumps({"success": True, "authenticated": False}).encode("utf-8")
            handler.send_header("Content-Length", str(len(body)))
            handler.end_headers()
            handler.wfile.write(body)
        elif path == "/api/agent/plan":
            body = handler._read_json_body()
            files = [(f["name"], base64.b64decode(f["data"])) for f in body.get("files", [])]
            source = course_agent.combine_sources(body.get("text", ""), files)
            plan = course_agent.draft_plan(source, body.get("instructions", ""), body.get("standards", []))
            handler._send_json(200, {"plan": plan})
        elif path == "/api/agent/extract":
            body = handler._read_json_body()
            files = [(f["name"], base64.b64decode(f["data"])) for f in body.get("files", [])]
            handler._send_json(200, {"files": course_agent.extract_attachments(files)})
        elif path == "/api/agent/chat":
            body = handler._read_json_body()
            mode = body.get("mode", "create")
            summary = None
            if mode == "edit" and body.get("courseId"):
                service = _teacher_service(handler)
                snapshot = course_agent.read_course_snapshot(service, str(body["courseId"]))
                summary = course_agent._snapshot_for_prompt(snapshot)
            step = str(body.get("step") or "").strip() or None
            reply = course_agent.chat_reply(body.get("messages", []), mode, summary,
                                            body.get("attachments", []), body.get("plan"),
                                            body.get("standards", []), step_context=step)
            handler._send_json(200, {"reply": reply})
        elif path == "/api/agent/intake":
            body = handler._read_json_body()
            files = [(f["name"], base64.b64decode(f["data"])) for f in body.get("files", [])]
            source = course_agent.combine_sources(body.get("text", ""), files)
            snapshot = None
            if body.get("mode") == "edit":
                service = _teacher_service(handler)
                snapshot = course_agent.read_course_snapshot(service, str(body.get("courseId", "")))
            handler._send_json(200, course_agent.intake_sources(source, body.get("mode", "create"), snapshot))
        elif path == "/api/agent/revise":
            body = handler._read_json_body()
            plan = course_agent.revise_plan(body.get("plan") or {}, body.get("request", ""), body.get("standards", []))
            handler._send_json(200, {"plan": plan})
        elif path == "/api/agent/build":
            body = handler._read_json_body()
            service = _teacher_service(handler)
            result = course_agent.build_course(service, body.get("plan") or {}, body.get("students", []))
            handler._send_json(200, {
                "success": True,
                "course": result["course"],
                "topicsCount": len(result["topics"]),
                "materialsCount": len(result["materials"]),
                "courseworkCount": len(result["coursework"]),
                "invitationsCount": len(result.get("invitations", [])),
                "failedSteps": [e for e in result.get("log", []) if e["status"] == "failed"],
            })
        elif path == "/api/agent/edit/propose":
            body = handler._read_json_body()
            service = _teacher_service(handler)
            files = [(f["name"], base64.b64decode(f["data"])) for f in body.get("files", [])]
            context = course_agent.combine_sources(body.get("text", ""), files) if (body.get("text") or files) else ""
            if body.get("answers"):
                context += "\n\nTeacher's answers:\n" + str(body["answers"])
            proposal = course_agent.propose_edit(service, str(body.get("courseId", "")),
                                                 body.get("request", ""), body.get("standards", []), context)
            handler._send_json(200, proposal)
        elif path == "/api/agent/edit/apply":
            body = handler._read_json_body()
            service = _teacher_service(handler)
            course_id = str(body.get("courseId", ""))
            # Re-check the proposal against the live course, so stale or edited requests cannot write anything new.
            snapshot = course_agent.read_course_snapshot(service, course_id)
            ops = course_agent.validate_operations(body.get("operations", []), snapshot, course_id)
            results = course_agent.apply_operations(service, course_id, ops)
            handler._send_json(200, {"success": True, "applied": results})
        elif path == "/api/agent/edit/copy":
            # Only called after the teacher chooses "make a copy". Creates one new course,
            # then proposes changes against the copy's own items. Nothing is applied yet.
            from classroom_course_engine import duplicate_course_structure
            body = handler._read_json_body()
            service = _teacher_service(handler)
            course_id = str(body.get("courseId", ""))
            new_section = str(body.get("newSection", "")).strip()
            if not new_section:
                raise ValueError("Enter a section name for the copy.")
            duplicated = duplicate_course_structure(service, course_id, new_section, verbose=False)
            copy_id = duplicated["new_course"]["id"]
            proposal = course_agent.propose_edit(service, copy_id, body.get("request", ""), body.get("standards", []))
            handler._send_json(200, {"copy": duplicated["new_course"], "proposal": proposal})
        elif path == "/api/agent/link-notebook":
            body = handler._read_json_body()
            service = _teacher_service(handler)
            created = course_agent.link_notebook(service, str(body.get("courseId", "")),
                                                 body.get("url", ""), body.get("title") or "NotebookLM notebook",
                                                 topic_id=body.get("topicId"))
            handler._send_json(200, {"success": True, "material": created})
        elif path == "/api/developer/propose":
            body = handler._read_json_body()
            service = _teacher_service(handler)
            course_id = _course_id(body)
            files = _decoded_files(body.get("files"))
            text = str(body.get("text") or "")
            context = course_agent.combine_sources(text, files) if (text.strip() or files) else ""
            result = course_developer.propose_step(service, course_id, str(body.get("step") or ""),
                                                   str(body.get("request") or ""), context,
                                                   _standards_list(body.get("standards")))
            handler._send_json(200, result)
        elif path == "/api/developer/apply":
            body = handler._read_json_body()
            service = _teacher_service(handler)
            course_id = _course_id(body)
            results = _run_developer_ops(service, body.get("operations"), course_id)
            handler._send_json(200, {"results": results})
        elif path == "/api/developer/place":
            body = handler._read_json_body()
            service = _teacher_service(handler)
            course_id = _course_id(body)
            attachments = _attachments_from_files(_decoded_files(body.get("files")))
            result = course_developer.propose_placement(service, course_id, str(body.get("text") or ""),
                                                        attachments, _standards_list(body.get("standards")))
            handler._send_json(200, result)
        elif path == "/api/developer/place/apply":
            body = handler._read_json_body()
            service = _teacher_service(handler)
            course_id = _course_id(body)
            results = _run_developer_ops(service, body.get("placements"), course_id,
                                         allowed_resources=course_developer.PLACEMENT_RESOURCES)
            handler._send_json(200, {"results": results})
        else:
            return False
    except Exception as exc:
        _fail(handler, exc)
    return True
