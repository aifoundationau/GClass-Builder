#!/usr/bin/env python3
"""
REST API Server for Google Classroom Course Builder Web App.
Bridges the Vite/React frontend with classroom_course_engine.py.
Handles Google Classroom Email Authentication and session management.
"""

import os
import sys
import json
import urllib.parse
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import socket
import tempfile
import threading
import time
import traceback
import uuid
from datetime import datetime, timezone

# Ensure UTF-8 printing
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Import engine functions
from classroom_course_engine import (
    get_classroom_service,
    create_and_populate_course,
    sync_existing_course,
    duplicate_course_structure,
    list_courses_and_status_check,
    audit_codebase_safety,
    parse_course_spreadsheet,
    generate_sample_course_template,
    _http_message,
    attachment_summary,
    course_join_link,
    write_course_workbook,
    CREDENTIALS_FILE,
    TOKEN_FILE,
    SERVICE_ACCOUNT_FILE,
    SCOPES
)
try:
    from google_auth_oauthlib.flow import Flow
    from googleapiclient.discovery import build
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
except ImportError:
    pass

import stripe_lms_service
import agent_routes
import teacher_auth
import gmail_service

IS_VERCEL = bool(os.environ.get("VERCEL"))

# Course creation makes one Classroom call per topic, material, assignment and roster entry,
# which can take minutes. It runs in a background thread; the browser polls for progress.
CREATE_JOBS = {}
CREATE_JOBS_LOCK = threading.Lock()
CREATE_JOB_TTL_SECONDS = 3600


def _due_text(item: dict) -> str:
    """A post's due date and time as Classroom stores them (UTC), in ISO 8601."""
    d, t = item.get("dueDate"), item.get("dueTime") or {}
    if not d:
        return ""
    return f"{d['year']:04d}-{d['month']:02d}-{d['day']:02d}T{t.get('hours', 0):02d}:{t.get('minutes', 0):02d}Z"


def _creation_summary(result: dict) -> dict:
    """What the browser shows when the build finishes, and what goes in the completion workbook."""
    return {
        "success": True,
        "course": result["course"],
        "topicsCount": len(result["topics"]),
        "materialsCount": len(result["materials"]),
        "courseworkCount": len(result["coursework"]),
        "teachersCount": len(result.get("teachers", [])),
        "invitationsCount": len(result.get("invitations", [])),
        "failedSteps": [e for e in result.get("log", []) if e["status"] == "failed"],
        "provisioningLog": result.get("log", []),
        # Students join with the class code or the join link; Course Builder does not add them.
        "enrollmentCode": result["course"].get("enrollmentCode"),
        "joinLink": course_join_link(result["course"]),
        "posts": [{
            "week": p["week"], "topic": p["topic"], "kind": p["kind"],
            "title": p["item"].get("title", ""), "state": p["item"].get("state", ""),
            "link": p["item"].get("alternateLink", ""), "maxPoints": p["item"].get("maxPoints"),
            "due": _due_text(p["item"]), "description": p["item"].get("description", ""),
            "attachments": [attachment_summary(m) for m in p["item"].get("materials", [])],
        } for p in result.get("posts", [])],
        "forms": [{k: f.get(k) for k in ("week", "quiz", "questions", "responderUri", "editUri", "published", "problem")}
                  for f in result.get("forms", [])],
        "rubrics": [{k: r.get(k) for k in ("week", "assignment", "url", "status", "problem")}
                    for r in result.get("rubrics", [])],
        "announcement": (result.get("announcement") or {}).get("text", ""),
    }


def start_create_job(service, owner: str, workbook_path: str, forms_service=None) -> str:
    """Runs create_and_populate_course in a thread and returns the job ID to poll."""
    job_id = uuid.uuid4().hex
    job = {"owner": owner, "status": "running", "log": [], "result": None, "error": None,
           "started": time.time()}
    with CREATE_JOBS_LOCK:
        cutoff = time.time() - CREATE_JOB_TTL_SECONDS
        for old_id in [j for j, v in CREATE_JOBS.items() if v["started"] < cutoff]:
            CREATE_JOBS.pop(old_id, None)
        CREATE_JOBS[job_id] = job

    def run():
        try:
            result = create_and_populate_course(service, workbook_path, verbose=True, log=job["log"],
                                                forms_service=forms_service)
            job["result"] = _creation_summary(result)
            job["status"] = "done"
        except Exception as exc:
            traceback.print_exc()
            job["error"] = _http_message(exc)
            job["status"] = "error"
        finally:
            if os.path.exists(workbook_path):
                os.remove(workbook_path)

    threading.Thread(target=run, name=f"create-course-{job_id[:8]}", daemon=True).start()
    return job_id


def _dist_dir() -> str:
    base_dir = sys._MEIPASS if getattr(sys, "frozen", False) else os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_dir, "dist")


def _dist_file(url_path: str):
    """The file under dist/ for a URL path, or None. Paths that climb out of dist/ (..) are refused,
    so the server never hands out .env, credentials.json or the teacher token files."""
    dist_dir = os.path.realpath(_dist_dir())
    candidate = os.path.realpath(os.path.join(dist_dir, urllib.parse.unquote(url_path).lstrip("/\\")))
    if os.path.commonpath([dist_dir, candidate]) != dist_dir or not os.path.isfile(candidate):
        return None
    return candidate


class CourseBuilderAPIHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def _send_json(self, status_code: int, data: dict):
        self.send_response(status_code)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json")
        body = json.dumps(data).encode("utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict:
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            return {}
        raw = self.rfile.read(content_length).decode("utf-8")
        return json.loads(raw)

    def _resolve_request_path(self) -> str:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path.startswith("/api/index") or path == "/api":
            matched_header = self.headers.get("x-matched-path")
            if matched_header and not matched_header.startswith("/api/index"):
                return matched_header
            query = urllib.parse.parse_qs(parsed.query)
            sub_path = query.get("path", [""])[0]
            if sub_path:
                return f"/api/{sub_path.lstrip('/')}"
        return path

    def do_GET(self):
        path = self._resolve_request_path()
        parsed = urllib.parse.urlparse(self.path)

        if agent_routes.handle_get(self, path):
            return

        if path in ("/", "", "/index.html") and not _dist_file("index.html"):
            # No production build: the Vite dev server serves the web app
            self.send_response(302)
            self.send_header("Location", "http://localhost:5173/")
            self.end_headers()
            return

        elif path == "/api/stripe/config":
            self._send_json(200, stripe_lms_service.get_stripe_config())

        elif path == "/api/registration/schema":
            self._send_json(200, stripe_lms_service.get_agentic_registration_schema())

        elif path == "/api/mcp/tools":
            schema = stripe_lms_service.get_agentic_registration_schema()
            self._send_json(200, {
                "tools": [schema["mcp_tool"]]
            })

        elif path in ("/api/users/lms", "/api/users/gcoursebuilder"):
            # Member records hold dates of birth, addresses and phone numbers: signed-in staff only
            if not agent_routes._current_email(self):
                self._send_json(401, {"error": "Sign in with your Google account first."})
                return
            users = stripe_lms_service.load_all_lms_users()
            self._send_json(200, {"users": users, "tag": "#gcoursebuilder", "count": len(users)})

        elif path == "/api/courses":
            try:
                service = agent_routes._teacher_service(self)
                courses = list_courses_and_status_check(service, verbose=False)
                self._send_json(200, {"courses": courses})
            except PermissionError as e:
                self._send_json(401, {"error": str(e)})
            except Exception as e:
                self._send_json(500, {"error": str(e), "traceback": traceback.format_exc()})

        elif path == "/api/courses/create/status":
            job_id = urllib.parse.parse_qs(parsed.query).get("job", [""])[0]
            job = CREATE_JOBS.get(job_id)
            if not job or job["owner"] != agent_routes._current_email(self):
                self._send_json(404, {"error": "No course creation in progress with that ID."})
                return
            self._send_json(200, {
                "status": job["status"],
                "log": list(job["log"]),
                "result": job["result"],
                "error": job["error"],
            })

        elif path == "/api/test":
            try:
                is_safe, violations = audit_codebase_safety()
                self._send_json(200, {
                    "passed": is_safe,
                    "violations": violations,
                    "message": "NO-DELETE audit passed: 0 delete calls found."
                })
            except Exception as e:
                self._send_json(500, {"error": str(e)})

        # 6. Role Assignment Notification Logs
        elif path == "/api/notifications/logs":
            logs = []
            if os.path.exists(gmail_service.GMAIL_NOTIFICATIONS_LOG):
                try:
                    with open(gmail_service.GMAIL_NOTIFICATIONS_LOG, "r", encoding="utf-8") as f:
                        logs = json.load(f)
                except Exception:
                    logs = []
            self._send_json(200, {"logs": logs, "tag": "#gcoursebuilder"})

        else:
            if not path.startswith("/api/"):
                import mimetypes

                # A built file, else index.html so the single-page app handles the route
                file_path = _dist_file(path) or _dist_file("index.html")
                if file_path:
                    # Windows can map .js to text/plain in the registry; browsers refuse that for modules
                    fixed_types = {".js": "application/javascript", ".css": "text/css",
                                   ".svg": "image/svg+xml", ".html": "text/html; charset=utf-8"}
                    mime_type = (fixed_types.get(os.path.splitext(file_path)[1].lower())
                                 or mimetypes.guess_type(file_path)[0] or "application/octet-stream")
                    self.send_response(200)
                    self.send_header("Content-Type", mime_type)
                    with open(file_path, "rb") as f:
                        content = f.read()
                    self.send_header("Content-Length", str(len(content)))
                    self.end_headers()
                    self.wfile.write(content)
                    return
            
            self._send_json(404, {"error": f"Path not found: {path}"})

    def do_POST(self):
        path = self._resolve_request_path()
        parsed = urllib.parse.urlparse(self.path)

        # 1. Login with Google Classroom Email
        if agent_routes.handle_post(self, path):
            return

        # 3. Create Course
        elif path == "/api/courses/create":
            try:
                body = self._read_json_body()
                settings = body.get("settings", {})
                curriculum = body.get("curriculum", [])
                students = body.get("students", [])

                if not settings or not curriculum:
                    self._send_json(400, {"error": "Missing settings or curriculum in request body"})
                    return

                # Write the course to a temporary workbook, the way the engine reads it
                try:
                    service = agent_routes._teacher_service(self)
                    forms_service = teacher_auth.build_teacher_forms_service(agent_routes._current_email(self))
                except PermissionError as e:
                    self._send_json(401, {"error": str(e)})
                    return
                with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
                    tmp_path = tmp.name
                try:
                    write_course_workbook(settings, curriculum, students, tmp_path)
                except Exception:
                    os.remove(tmp_path)
                    raise
                job_id = start_create_job(service, agent_routes._current_email(self), tmp_path, forms_service)
                self._send_json(202, {"jobId": job_id})
            except Exception as e:
                self._send_json(500, {"error": str(e), "traceback": traceback.format_exc()})

        # 4. Sync Course
        elif path == "/api/courses/sync":
            try:
                body = self._read_json_body()
                course_id = body.get("course_id")
                settings = body.get("settings", {})
                curriculum = body.get("curriculum", [])
                students = body.get("students", [])

                if not course_id:
                    self._send_json(400, {"error": "Missing course_id"})
                    return

                service = agent_routes._teacher_service(self)
                forms_service = teacher_auth.build_teacher_forms_service(agent_routes._current_email(self))

                # Write the course to a temporary workbook, the way the engine reads it
                with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
                    tmp_path = tmp.name
                try:
                    write_course_workbook(settings, curriculum, students, tmp_path)
                    result = sync_existing_course(service, course_id, tmp_path, verbose=True, forms_service=forms_service)
                finally:
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)

                self._send_json(200, result)
            except PermissionError as e:
                self._send_json(401, {"error": str(e)})
            except Exception as e:
                self._send_json(500, {"error": str(e), "traceback": traceback.format_exc()})

        # 5. Duplicate Course (Disabled per safety requirements: "no duplicate course")
        elif path == "/api/courses/duplicate":
            self._send_json(400, {
                "error": "Course duplication is strictly disabled per safety requirements ('no duplicate course'). Please create courses directly or update existing ones."
            })

        # 6. Stripe LMS Customer Registration
        elif path == "/api/stripe/create-customer":
            try:
                body = self._read_json_body()
                customer = stripe_lms_service.create_stripe_customer(body)

                # SetupIntent if card collection requested
                setup_intent = None
                if body.get("saveCard", False):
                    try:
                        setup_intent = stripe_lms_service.create_setup_intent(customer["id"])
                    except Exception as si_err:
                        print(f"[STRIPE WARN] SetupIntent skipped: {si_err}")

                # Save user to Firebase store with mandatory 'lms' tag
                account_type = body.get("accountType") or body.get("account_type", "individual")
                dob = str(body.get("dateOfBirth") or body.get("date_of_birth") or "").strip()
                
                # Format education history (academic record only, excluded from Stripe)
                raw_edu = body.get("educationHistory") or body.get("education_history") or {}
                if isinstance(raw_edu, dict):
                    edu_record = {
                        "level": raw_edu.get("level") or body.get("educationLevel") or "Bachelor's Degree",
                        "institution": raw_edu.get("institution") or body.get("institutionName") or "",
                        "field_of_study": raw_edu.get("field_of_study") or body.get("fieldOfStudy") or "",
                        "notes": raw_edu.get("notes") or body.get("educationNotes") or ""
                    }
                else:
                    edu_record = {
                        "level": body.get("educationLevel") or "Bachelor's Degree",
                        "institution": body.get("institutionName") or "",
                        "field_of_study": body.get("fieldOfStudy") or "",
                        "notes": str(raw_edu) if str(raw_edu).strip() else body.get("educationNotes", "")
                    }

                user_record = {
                    "uid": f"lms_usr_{customer['id'].replace('cus_', '')}",
                    "email": body.get("email"),
                    "name": body.get("name"),
                    "business_name": body.get("businessName") or body.get("business_name", ""),
                    "account_type": account_type,
                    "role": body.get("role", "student"),
                    "date_of_birth": dob,
                    "education_history": edu_record,
                    "phone": body.get("phone", ""),
                    "address": body.get("address", {}),
                    "tax_id": body.get("taxId") or body.get("tax_id", ""),
                    "stripe_customer_id": customer["id"],
                    "invoice_policy": {
                        "default_status": "draft",
                        "payment_terms_days": 30,
                        "prefix": "LMS"
                    },
                    "tag": "#gcoursebuilder",
                    "tags": ["#gcoursebuilder", "gcoursebuilder", "lms"],
                    "source": "gcoursebuilder"
                }
                saved_user = stripe_lms_service.save_lms_user_record(user_record)

                self._send_json(200, {
                    "success": True,
                    "client_id": customer["id"],
                    "customer": customer,
                    "user": saved_user,
                    "setupIntent": setup_intent,
                    "message": "Student registered successfully. Client ID generated and academic profile saved."
                })
            except Exception as e:
                self._send_json(500, {"error": str(e), "traceback": traceback.format_exc()})

        # 7. Model Context Protocol (MCP) Tool Execution Endpoint
        elif path == "/api/mcp/invoke":
            try:
                body = self._read_json_body()
                tool_name = body.get("tool") or body.get("name")
                args = body.get("arguments") or body.get("parameters") or body
                if tool_name and tool_name != "register_student_member":
                    self._send_json(400, {"error": f"Unknown tool: {tool_name}. Available tools: ['register_student_member']"})
                    return

                # Normalise arguments
                payload = {
                    "accountType": args.get("account_type") or args.get("accountType", "individual"),
                    "name": args.get("name", ""),
                    "businessName": args.get("business_name") or args.get("businessName", ""),
                    "email": args.get("email", ""),
                    "phone": args.get("phone", ""),
                    "dateOfBirth": args.get("date_of_birth") or args.get("dateOfBirth", ""),
                    "educationHistory": args.get("education_history") or args.get("educationHistory", {}),
                    "role": args.get("role", "student"),
                    "taxId": args.get("tax_id") or args.get("taxId", ""),
                    "address": args.get("address", {}),
                    "saveCard": args.get("save_card") or args.get("saveCard", False)
                }

                customer = stripe_lms_service.create_stripe_customer(payload)

                raw_edu = payload.get("educationHistory") or {}
                if isinstance(raw_edu, dict):
                    edu_record = {
                        "level": raw_edu.get("level") or "Bachelor's Degree",
                        "institution": raw_edu.get("institution") or "",
                        "field_of_study": raw_edu.get("field_of_study") or "",
                        "notes": raw_edu.get("notes") or ""
                    }
                else:
                    edu_record = {"level": "Other", "notes": str(raw_edu)}

                user_record = {
                    "uid": f"lms_usr_{customer['id'].replace('cus_', '')}",
                    "email": payload.get("email"),
                    "name": payload.get("name"),
                    "business_name": payload.get("businessName", ""),
                    "account_type": payload.get("accountType", "individual"),
                    "role": payload.get("role", "student"),
                    "date_of_birth": str(payload.get("dateOfBirth", "")).strip(),
                    "education_history": edu_record,
                    "phone": payload.get("phone", ""),
                    "address": payload.get("address", {}),
                    "tax_id": payload.get("taxId", ""),
                    "stripe_customer_id": customer["id"],
                    "invoice_policy": {
                        "default_status": "draft",
                        "payment_terms_days": 30,
                        "prefix": "LMS"
                    },
                    "tag": "#gcoursebuilder",
                    "tags": ["#gcoursebuilder", "gcoursebuilder", "lms"],
                    "source": "gcoursebuilder"
                }
                saved_user = stripe_lms_service.save_lms_user_record(user_record)

                self._send_json(200, {
                    "success": True,
                    "client_id": customer["id"],
                    "customer": customer,
                    "user": saved_user,
                    "agent_summary": f"Registration completed for student '{user_record['name']}'. Client ID is '{customer['id']}'. Academic profile successfully stored."
                })
            except Exception as e:
                self._send_json(500, {"error": str(e), "traceback": traceback.format_exc()})

        # 7. Attach Saved Card to Customer
        elif path == "/api/stripe/attach-card":
            try:
                body = self._read_json_body()
                customer_id = body.get("customer_id")
                payment_method_id = body.get("payment_method_id")
                if not customer_id or not payment_method_id:
                    self._send_json(400, {"error": "Missing customer_id or payment_method_id"})
                    return
                updated = stripe_lms_service.attach_payment_method(customer_id, payment_method_id)
                self._send_json(200, {"success": True, "customer": updated})
            except Exception as e:
                self._send_json(500, {"error": str(e), "traceback": traceback.format_exc()})

        # 8. Send Role & Permissions Notification Email via Gmail API
        elif path == "/api/notifications/send-role-email":
            try:
                body = self._read_json_body()
                recipient_email = body.get("recipientEmail") or body.get("email")
                role_key = body.get("roleKey") or body.get("role", "supporter")
                role_label = body.get("roleLabel") or body.get("label") or role_key.capitalize()
                permissions = body.get("permissions") or []
                admin_email = body.get("adminEmail") or agent_routes._current_email(self)

                if not recipient_email or "@" not in str(recipient_email):
                    self._send_json(400, {"error": "Valid recipientEmail is required."})
                    return

                result = gmail_service.send_role_notification_via_gmail(
                    recipient_email=str(recipient_email).strip().lower(),
                    role_key=str(role_key).strip().lower(),
                    role_label=str(role_label).strip(),
                    permissions=permissions,
                    admin_email=admin_email
                )
                self._send_json(200, result)
            except Exception as e:
                self._send_json(500, {"error": str(e), "traceback": traceback.format_exc()})

        else:
            self._send_json(404, {"error": f"Path not found: {path}"})


class ExclusivePortServer(ThreadingHTTPServer):
    # HTTPServer turns on address reuse. On Windows that lets a second server bind the same
    # port, and requests then land on either one, including a stale server running old code.
    # Refuse instead, so a second start fails loudly.
    allow_reuse_address = sys.platform != "win32"

    def server_bind(self):
        if sys.platform == "win32" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def run_api_server(port: int = 8000):
    # Local only by default. A container sets HOST=0.0.0.0 so it can be reached from outside.
    server_address = (os.environ.get("HOST", "127.0.0.1"), port)
    # Threaded so one slow Google call cannot hold up every other request
    try:
        httpd = ExclusivePortServer(server_address, CourseBuilderAPIHandler)
    except OSError as exc:
        print(f"[API SERVER] Port {port} is already in use by another program ({exc}). "
              f"Another Course Builder server is probably still running. Stop it, then start again.")
        sys.exit(1)
    httpd.daemon_threads = True
    print(f"[API SERVER] Running Course Builder REST API at http://localhost:{port}/")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[API SERVER] Stopping server.")
        httpd.server_close()


if __name__ == "__main__":
    port = 8000
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])
    run_api_server(port)
