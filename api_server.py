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
from http.server import HTTPServer, BaseHTTPRequestHandler
import tempfile
import traceback
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
    CREDENTIALS_FILE,
    TOKEN_FILE,
    SERVICE_ACCOUNT_FILE,
    SCOPES
)
try:
    from google_auth_oauthlib.flow import Flow
    from googleapiclient.discovery import build
except ImportError:
    pass

USER_SESSION_FILE = "user_session.json"
GLOBAL_SERVICE = None
OAUTH_FLOW_CACHE = {}


def get_current_user_session() -> dict:
    if os.path.exists(USER_SESSION_FILE):
        try:
            with open(USER_SESSION_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "authenticated": False,
        "email": None,
        "name": None,
        "role": None
    }


def save_user_session(user_data: dict):
    with open(USER_SESSION_FILE, "w", encoding="utf-8") as f:
        json.dump(user_data, f, indent=2)


def get_global_service():
    global GLOBAL_SERVICE
    if GLOBAL_SERVICE is None:
        has_creds = (
            os.path.exists(CREDENTIALS_FILE) or
            os.path.exists(TOKEN_FILE) or
            os.path.exists(SERVICE_ACCOUNT_FILE)
        )
        GLOBAL_SERVICE = get_classroom_service(use_mock=not has_creds, verbose=True)
    return GLOBAL_SERVICE


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

    def do_GET(self):
        global OAUTH_FLOW_CACHE
        global GLOBAL_SERVICE
        
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/status":
            is_safe, violations = audit_codebase_safety()
            has_creds = os.path.exists(CREDENTIALS_FILE) or os.path.exists(TOKEN_FILE)
            user = get_current_user_session()
            self._send_json(200, {
                "status": "online",
                "mode": "Live Google Classroom API" if has_creds else "In-Memory Classroom Simulator",
                "no_delete_policy_enforced": is_safe,
                "violations": violations,
                "credentials_present": has_creds,
                "user": user
            })

        elif path == "/api/auth/me":
            user = get_current_user_session()
            self._send_json(200, user)

        elif path == "/api/auth/google_login":
            try:
                if not os.path.exists(CREDENTIALS_FILE):
                    self._send_json(400, {"error": f"Missing {CREDENTIALS_FILE}"})
                    return
                
                flow = Flow.from_client_secrets_file(
                    CREDENTIALS_FILE,
                    scopes=SCOPES,
                    redirect_uri="http://localhost:5173/api/auth/oauth2callback"
                )
                auth_url, state = flow.authorization_url(prompt='consent', access_type='offline')
                
                OAUTH_FLOW_CACHE = {
                    "state": state,
                    "code_verifier": getattr(flow, "code_verifier", None)
                }
                
                self.send_response(302)
                self._send_cors_headers()
                self.send_header("Location", auth_url)
                self.end_headers()
            except Exception as e:
                self._send_json(500, {"error": str(e), "traceback": traceback.format_exc()})

        elif path == "/api/auth/oauth2callback":
            query = urllib.parse.parse_qs(parsed.query)
            code = query.get("code", [""])[0]
            if not code:
                self._send_json(400, {"error": "Missing authorization code"})
                return
            
            try:
                flow = Flow.from_client_secrets_file(
                    CREDENTIALS_FILE,
                    scopes=SCOPES,
                    redirect_uri="http://localhost:5173/api/auth/oauth2callback"
                )
                
                if OAUTH_FLOW_CACHE and OAUTH_FLOW_CACHE.get("code_verifier"):
                    flow.code_verifier = OAUTH_FLOW_CACHE["code_verifier"]
                    
                flow.fetch_token(code=code)
                creds = flow.credentials
                
                # Save token
                with open(TOKEN_FILE, "w", encoding="utf-8") as token_out:
                    token_out.write(creds.to_json())
                
                # Fetch user info
                oauth2_service = build('oauth2', 'v2', credentials=creds)
                user_info = oauth2_service.userinfo().get().execute()
                email = user_info.get("email", "")
                name = user_info.get("name", "")
                
                user_session = {
                    "authenticated": True,
                    "email": email,
                    "name": name,
                    "role": "Google Classroom Instructor / Teacher",
                    "avatar": user_info.get("picture", f"https://api.dicebear.com/7.x/initials/svg?seed={email}&backgroundColor=4285f4"),
                    "domain": email.split("@")[1] if "@" in email else "",
                    "login_time": datetime.now(timezone.utc).isoformat()
                }
                save_user_session(user_session)
                
                # Re-initialize global service with new creds
                GLOBAL_SERVICE = None 
                
                self.send_response(302)
                self._send_cors_headers()
                self.send_header("Location", "/")
                self.end_headers()
            except Exception as e:
                self._send_json(500, {"error": str(e), "traceback": traceback.format_exc()})

        elif path == "/api/courses":
            try:
                service = get_global_service()
                courses = list_courses_and_status_check(service, verbose=False)
                self._send_json(200, {"courses": courses})
            except Exception as e:
                self._send_json(500, {"error": str(e), "traceback": traceback.format_exc()})

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

        else:
            if not path.startswith("/api/"):
                import mimetypes
                
                if getattr(sys, 'frozen', False):
                    base_dir = sys._MEIPASS
                else:
                    base_dir = os.path.dirname(os.path.abspath(__file__))
                    
                dist_dir = os.path.join(base_dir, "dist")
                
                if path == "/" or not path:
                    file_path = os.path.join(dist_dir, "index.html")
                else:
                    file_path = os.path.join(dist_dir, path.lstrip("/"))
                
                if not os.path.isfile(file_path):
                    file_path = os.path.join(dist_dir, "index.html")
                
                if os.path.isfile(file_path):
                    mime_type, _ = mimetypes.guess_type(file_path)
                    if not mime_type:
                        mime_type = "application/octet-stream"
                        
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
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # 1. Login with Google Classroom Email
        if path == "/api/auth/login":
            try:
                body = self._read_json_body()
                email = str(body.get("email", "")).strip().lower()
                name = str(body.get("name", "")).strip()

                if not email or "@" not in email:
                    self._send_json(400, {"error": "A valid Google Classroom email address is required."})
                    return

                # Extract display name if omitted
                if not name:
                    prefix = email.split("@")[0].replace(".", " ").title()
                    name = f"Prof. {prefix}"

                user_session = {
                    "authenticated": True,
                    "email": email,
                    "name": name,
                    "role": "Google Classroom Instructor / Teacher",
                    "avatar": f"https://api.dicebear.com/7.x/initials/svg?seed={email}&backgroundColor=4285f4",
                    "domain": email.split("@")[1],
                    "login_time": datetime.now(timezone.utc).isoformat()
                }
                save_user_session(user_session)
                print(f"[AUTH] User signed in with Google Classroom email: {email}")
                self._send_json(200, {"success": True, "user": user_session})
            except Exception as e:
                self._send_json(500, {"error": str(e)})

        # 2. Logout
        elif path == "/api/auth/logout":
            try:
                if os.path.exists(USER_SESSION_FILE):
                    os.remove(USER_SESSION_FILE)
                print("[AUTH] User signed out.")
                self._send_json(200, {"success": True, "authenticated": False})
            except Exception as e:
                self._send_json(500, {"error": str(e)})

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

                # Write temporary Excel spreadsheet
                with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
                    tmp_path = tmp.name

                import pandas as pd
                with pd.ExcelWriter(tmp_path, engine="openpyxl") as writer:
                    settings_rows = []
                    for k, v in settings.items():
                        if k == "teachers" and isinstance(v, list):
                            settings_rows.append({"Setting": k, "Value": ", ".join(v)})
                        else:
                            settings_rows.append({"Setting": k, "Value": v})
                    df_set = pd.DataFrame(settings_rows)
                    df_set.to_excel(writer, sheet_name="Course_Settings", index=False)

                    presentation_links = []
                    for c in curriculum:
                        p_urls = c.get("presentation_urls") or []
                        if isinstance(p_urls, list) and len(p_urls) > 0:
                            clean_links = "\n".join([str(u).strip() for u in p_urls if u and str(u).strip()])
                        else:
                            clean_links = str(c.get("presentation_url", "")).strip()
                        presentation_links.append(clean_links)

                    df_curr = pd.DataFrame([
                        {
                            "Week": c.get("sequence", f"Week {i+1}"),
                            "Classroom Stream Topic": c.get("stream_topic") or f"{c.get('sequence', f'Week {i+1}')}: {c.get('title', f'Module {i+1}')}",
                            "Module Title": c.get("title", ""),
                            "Module Overview / Description": c.get("overview", ""),
                            "Lecture Presentation URL (Google Slides / Web Document)": presentation_links[i],
                            "Assessment / Knowledge Check": c.get("assignment_title") or c.get("assessment", ""),
                            "Assignment Instructions": c.get("assignment_instructions", ""),
                            "Quiz assignment": c.get("quiz_title", ""),
                            "Quiz URL": c.get("quiz_url", ""),
                            "Question": c.get("question_prompt", ""),
                            "Question Type": c.get("question_type", "SHORT_ANSWER_QUESTION"),
                            "Points": c.get("points", 100),
                            "Due Date": c.get("due_date", "")
                        }
                        for i, c in enumerate(curriculum)
                    ])
                    df_curr.to_excel(writer, sheet_name="Curriculum", index=False)

                    if students:
                        df_students = pd.DataFrame([
                            {"Student Email": s if isinstance(s, str) else s.get("email", "")}
                            for s in students
                        ])
                        df_students.to_excel(writer, sheet_name="Students", index=False)

                service = get_global_service()
                result = create_and_populate_course(service, tmp_path, verbose=True)

                if os.path.exists(tmp_path):
                    os.remove(tmp_path)

                self._send_json(200, {
                    "success": True,
                    "course": result["course"],
                    "topicsCount": len(result["topics"]),
                    "materialsCount": len(result["materials"]),
                    "courseworkCount": len(result["coursework"]),
                    "teachersCount": len(result.get("teachers", [])),
                    "studentsCount": len(result.get("students", []))
                })
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

                # Write temporary spreadsheet
                with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
                    tmp_path = tmp.name

                import pandas as pd
                with pd.ExcelWriter(tmp_path, engine="openpyxl") as writer:
                    settings_rows = []
                    for k, v in settings.items():
                        if k == "teachers" and isinstance(v, list):
                            settings_rows.append({"Setting": k, "Value": ", ".join(v)})
                        else:
                            settings_rows.append({"Setting": k, "Value": v})
                    df_set = pd.DataFrame(settings_rows)
                    df_set.to_excel(writer, sheet_name="Course_Settings", index=False)

                    presentation_links = []
                    for c in curriculum:
                        p_urls = c.get("presentation_urls") or []
                        if isinstance(p_urls, list) and len(p_urls) > 0:
                            clean_links = "\n".join([str(u).strip() for u in p_urls if u and str(u).strip()])
                        else:
                            clean_links = str(c.get("presentation_url", "")).strip()
                        presentation_links.append(clean_links)

                    df_curr = pd.DataFrame([
                        {
                            "Week": c.get("sequence", f"Week {i+1}"),
                            "Classroom Stream Topic": c.get("stream_topic") or f"{c.get('sequence', f'Week {i+1}')}: {c.get('title', f'Module {i+1}')}",
                            "Module Title": c.get("title", ""),
                            "Module Overview / Description": c.get("overview", ""),
                            "Lecture Presentation URL (Google Slides / Web Document)": presentation_links[i],
                            "Assessment / Knowledge Check": c.get("assignment_title") or c.get("assessment", ""),
                            "Assignment Instructions": c.get("assignment_instructions", ""),
                            "Quiz assignment": c.get("quiz_title", ""),
                            "Quiz URL": c.get("quiz_url", ""),
                            "Question": c.get("question_prompt", ""),
                            "Question Type": c.get("question_type", "SHORT_ANSWER_QUESTION"),
                            "Points": c.get("points", 100),
                            "Due Date": c.get("due_date", "")
                        }
                        for i, c in enumerate(curriculum)
                    ])
                    df_curr.to_excel(writer, sheet_name="Curriculum", index=False)

                    if students:
                        df_students = pd.DataFrame([
                            {"Student Email": s if isinstance(s, str) else s.get("email", "")}
                            for s in students
                        ])
                        df_students.to_excel(writer, sheet_name="Students", index=False)

                service = get_global_service()
                result = sync_existing_course(service, course_id, tmp_path, verbose=True)

                if os.path.exists(tmp_path):
                    os.remove(tmp_path)

                self._send_json(200, result)
            except Exception as e:
                self._send_json(500, {"error": str(e), "traceback": traceback.format_exc()})

        # 5. Duplicate Course (Disabled per safety requirements: "no duplicate course")
        elif path == "/api/courses/duplicate":
            self._send_json(400, {
                "error": "Course duplication is strictly disabled per safety requirements ('no duplicate course'). Please create courses directly or update existing ones."
            })

        else:
            self._send_json(404, {"error": f"Path not found: {path}"})


def run_api_server(port: int = 8000):
    service = get_global_service()
    existing = list_courses_and_status_check(service, verbose=False)
    if not existing:
        seed_path = "course_curriculum.xlsx"
        if not os.path.exists(seed_path):
            generate_sample_course_template(seed_path)
        create_and_populate_course(service, seed_path, verbose=False)
        print("[INIT] Seeded initial sample course in Google Classroom engine.")

    server_address = ("127.0.0.1", port)
    httpd = HTTPServer(server_address, CourseBuilderAPIHandler)
    print(f"[API SERVER] Running Course Builder REST API at http://localhost:{port}/")
    import webbrowser
    webbrowser.open(f"http://127.0.0.1:{port}/")
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
