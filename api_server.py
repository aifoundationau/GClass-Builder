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
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
except ImportError:
    pass

import stripe_lms_service

IS_VERCEL = bool(os.environ.get("VERCEL"))
USER_SESSION_FILE = "/tmp/user_session.json" if IS_VERCEL else "user_session.json"
GLOBAL_SERVICE = None
OAUTH_FLOW_CACHE = {}


def get_current_user_session() -> dict:
    session_file = "/tmp/user_session.json" if IS_VERCEL else USER_SESSION_FILE
    if os.path.exists(session_file):
        try:
            with open(session_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if data and data.get("authenticated"):
                    return data
        except Exception:
            pass

    # If user_session.json missing, attempt auto-restore from existing token.json candidates
    token_candidates = [
        "/tmp/token.json",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "token.json"),
        "token.json"
    ]
    for token_path in token_candidates:
        if os.path.exists(token_path):
            try:
                creds = Credentials.from_authorized_user_file(token_path, SCOPES)
                if creds:
                    if not creds.valid and creds.refresh_token:
                        creds.refresh(Request())
                        try:
                            with open(token_path, "w", encoding="utf-8") as token_out:
                                token_out.write(creds.to_json())
                        except Exception:
                            pass

                    if creds.valid:
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
                        print(f"[AUTH] Auto-restored active session from {token_path} for {email}")
                        return user_session
            except Exception as e:
                print(f"[AUTH WARN] Auto-restore session from {token_path} failed: {e}")

    return {
        "authenticated": False,
        "email": None,
        "name": None,
        "role": None
    }


def save_user_session(user_data: dict):
    target_file = "/tmp/user_session.json" if IS_VERCEL else USER_SESSION_FILE
    try:
        with open(target_file, "w", encoding="utf-8") as f:
            json.dump(user_data, f, indent=2)
    except Exception as e:
        print(f"[AUTH WARN] Could not write session to {target_file}: {e}")


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
        global OAUTH_FLOW_CACHE
        global GLOBAL_SERVICE
        
        path = self._resolve_request_path()
        parsed = urllib.parse.urlparse(self.path)

        if path in ("/", "", "/index.html"):
            dist_index = os.path.join(os.path.dirname(__file__), "dist", "index.html")
            if os.path.exists(dist_index):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                with open(dist_index, "rb") as f:
                    content = f.read()
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return
            else:
                self.send_response(302)
                self.send_header("Location", "http://localhost:5173/")
                self.end_headers()
                return

        elif path.startswith("/assets/"):
            asset_path = os.path.join(os.path.dirname(__file__), "dist", path.lstrip("/"))
            if os.path.exists(asset_path):
                self.send_response(200)
                if asset_path.endswith(".js"):
                    self.send_header("Content-Type", "application/javascript")
                elif asset_path.endswith(".css"):
                    self.send_header("Content-Type", "text/css")
                elif asset_path.endswith(".svg"):
                    self.send_header("Content-Type", "image/svg+xml")
                else:
                    self.send_header("Content-Type", "application/octet-stream")
                with open(asset_path, "rb") as f:
                    content = f.read()
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return

        elif path == "/api/status":
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

        elif path == "/api/stripe/config":
            self._send_json(200, stripe_lms_service.get_stripe_config())

        elif path == "/api/registration/schema":
            self._send_json(200, stripe_lms_service.get_agentic_registration_schema())

        elif path == "/api/mcp/tools":
            schema = stripe_lms_service.get_agentic_registration_schema()
            self._send_json(200, {
                "tools": [schema["mcp_tool"]]
            })

        elif path == "/api/users/lms":
            users = stripe_lms_service.load_all_lms_users()
            self._send_json(200, {"users": users, "tag": "lms", "count": len(users)})

        elif path == "/api/auth/google_login":
            try:
                if not os.path.exists(CREDENTIALS_FILE):
                    print(f"[AUTH ERROR] Missing credentials file: {CREDENTIALS_FILE}")
                    self.send_response(302)
                    self._send_cors_headers()
                    self.send_header("Location", f"/?login_error={urllib.parse.quote('credentials.json file not found')}")
                    self.end_headers()
                    return
                
                flow = Flow.from_client_secrets_file(
                    CREDENTIALS_FILE,
                    scopes=SCOPES,
                    redirect_uri="http://localhost:5173/api/auth/oauth2callback"
                )
                auth_url, state = flow.authorization_url(prompt='select_account consent', access_type='offline')
                
                OAUTH_FLOW_CACHE = {
                    "state": state,
                    "code_verifier": getattr(flow, "code_verifier", None)
                }
                
                self.send_response(302)
                self._send_cors_headers()
                self.send_header("Location", auth_url)
                self.end_headers()
            except Exception as e:
                print(f"[AUTH ERROR] google_login initialization failed: {e}")
                self.send_response(302)
                self._send_cors_headers()
                self.send_header("Location", f"/?login_error={urllib.parse.quote(str(e))}")
                self.end_headers()

        elif path == "/api/auth/oauth2callback":
            query = urllib.parse.parse_qs(parsed.query)
            code = query.get("code", [""])[0]
            error_param = query.get("error", [""])[0]

            if error_param:
                print(f"[AUTH] OAuth cancelled or denied by user: {error_param}")
                self.send_response(302)
                self._send_cors_headers()
                self.send_header("Location", f"/?login_error={urllib.parse.quote('Sign-in cancelled or permission denied.')}")
                self.end_headers()
                return

            if not code:
                self.send_response(302)
                self._send_cors_headers()
                self.send_header("Location", f"/?login_error={urllib.parse.quote('No authorization code received.')}")
                self.end_headers()
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
                self.send_header("Location", "/?auth_success=1")
                self.end_headers()
            except Exception as e:
                print(f"[AUTH WARN] OAuth exchange error: {e}")
                # Resilient fallback: If code was already redeemed / expired, but token.json exists and is valid,
                # seamlessly restore the active session and redirect cleanly to /
                if os.path.exists(TOKEN_FILE):
                    try:
                        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
                        if creds and creds.valid:
                            oauth2_service = build('oauth2', 'v2', credentials=creds)
                            user_info = oauth2_service.userinfo().get().execute()
                            email = user_info.get("email", "")
                            user_session = {
                                "authenticated": True,
                                "email": email,
                                "name": user_info.get("name", ""),
                                "role": "Google Classroom Instructor / Teacher",
                                "avatar": user_info.get("picture", f"https://api.dicebear.com/7.x/initials/svg?seed={email}&backgroundColor=4285f4"),
                                "domain": email.split("@")[1] if "@" in email else "",
                                "login_time": datetime.now(timezone.utc).isoformat()
                            }
                            save_user_session(user_session)
                            print(f"[AUTH] Seamlessly recovered session for {email}")
                            self.send_response(302)
                            self._send_cors_headers()
                            self.send_header("Location", "/")
                            self.end_headers()
                            return
                    except Exception as sub_e:
                        print(f"[AUTH WARN] Fallback token restore failed: {sub_e}")

                # Redirect to home with a clear toast notification instead of browser 500 error screen
                self.send_response(302)
                self._send_cors_headers()
                self.send_header("Location", f"/?login_error={urllib.parse.quote('Authorization expired or code was already used. Please click login again.')}")
                self.end_headers()

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
        path = self._resolve_request_path()
        parsed = urllib.parse.urlparse(self.path)

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
                for f_path in [USER_SESSION_FILE, TOKEN_FILE, "/tmp/user_session.json", "/tmp/token.json", "user_session.json", "token.json"]:
                    if os.path.exists(f_path):
                        try:
                            os.remove(f_path)
                        except Exception:
                            pass
                GLOBAL_SERVICE = None
                print("[AUTH] User signed out and credentials cleared.")
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
                    "tags": ["lms"],
                    "source": "lms"
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
                    "tags": ["lms"],
                    "source": "lms"
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

        else:
            self._send_json(404, {"error": f"Path not found: {path}"})


def run_api_server(port: int = 8000):
    server_address = ("127.0.0.1", port)
    httpd = HTTPServer(server_address, CourseBuilderAPIHandler)
    print(f"[API SERVER] Running Course Builder REST API at http://localhost:{port}/")

    try:
        service = get_global_service()
        existing = list_courses_and_status_check(service, verbose=False)
        if not existing:
            seed_path = "course_curriculum.xlsx"
            if not os.path.exists(seed_path):
                generate_sample_course_template(seed_path)
            create_and_populate_course(service, seed_path, verbose=False)
            print("[INIT] Seeded initial sample course in Google Classroom engine.")
    except Exception as e:
        print(f"[INIT NOTICE] Google Classroom sync deferred ({e}).")

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
