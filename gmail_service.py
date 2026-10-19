"""
Gmail Notification Service for Google Course Builder (#gcoursebuilder).
Sends automated role assignment and permission grant notifications via Google Gmail API.
"""

import os
import json
import base64
import urllib.parse
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

GMAIL_NOTIFICATIONS_LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "role_notifications.json")
SYSTEM_TAG = "#gcoursebuilder"

# Standard permission catalog with friendly labels and descriptions
PERMISSION_CATALOG = {
    "courses.view": {"label": "View Courses & Units", "desc": "Inspect course syllabi, accreditation details, and learning outcomes."},
    "courses.create": {"label": "Create & Edit Courses", "desc": "Build new courses and units in Course Builder, add modules and coursework."},
    "courses.publish": {"label": "Publish Courses to Catalog", "desc": "Publish draft courses to the live public catalog and admissions portal."},
    "grades.view": {"label": "View Student Grades & Transcripts", "desc": "Access academic performance, assessment results, GPA, and transcripts."},
    "grades.edit": {"label": "Grade Assessments & Units", "desc": "Enter scores, mark assignments, and record student competency evaluations."},
    "classroom.manage": {"label": "Manage Google Classroom", "desc": "Synchronize rosters, invite teachers/students, and link Classroom coursework."},
    "applications.view": {"label": "View Applications", "desc": "Read submitted student applications, declarations, and attached documents."},
    "applications.review": {"label": "Review & Decide Applications", "desc": "Approve, place on hold, or reject prospective student admissions applications."},
    "applications.export": {"label": "Export Application Records", "desc": "Download full JSON and document dossiers for admissions board audits."},
    "students.manage": {"label": "Manage Student Identifiers", "desc": "Issue official Student Numbers and manage student profile records."},
    "finance.view": {"label": "View Financial Ledgers", "desc": "Monitor tuition revenue, fee status, departmental budgets, and balance sheets."},
    "finance.approve": {"label": "Approve Budgets & Waivers", "desc": "Approve capital expenditures, tuition discounts, scholarship waivers, and refunds."},
    "tokens.manage": {"label": "Emergency Fund & Tokens", "desc": "Authorize and disburse student emergency food, housing, and transit tokens."},
    "events.manage": {"label": "Manage Events & RSVPs", "desc": "Schedule campus open days, academic orientations, and webinars."},
    "calendar.manage": {"label": "Administer Campus Calendar", "desc": "Manage institutional timetables, room bookings, examinations, and term dates."},
    "ai.customize": {"label": "Configure AI Knowledge & Tools", "desc": "Tune AI Advisor system guidelines, FAQ ground truth, tools, and boundaries."},
    "faqs.edit": {"label": "Manage FAQs & Knowledge Base", "desc": "Create and update university Q&A, safety protocols, and student guidance articles."},
    "messaging.staff": {"label": "Staff Communications Channel", "desc": "Access real-time internal staff messaging channels and institutional announcements."},
    "telemetry.view": {"label": "View Telemetry & Analytics", "desc": "Inspect telemetry events, error monitoring, and page conversion graphs."},
    "users.manage": {"label": "Manage User Profiles & Roles", "desc": "Assign system roles, audit account logins, and manage staff credentials."},
    "roles.manage": {"label": "Configure Role Permissions", "desc": "Grant and revoke specific permissions for each of the 11 system roles."},
    "sheets.sync": {"label": "Google Sheets 24/7 Sync", "desc": "Trigger bidirectional real-time data sync with Google Sheets master database."},
    "api_keys.manage": {"label": "Manage API Keys & Integrations", "desc": "Configure Gemini API keys, Firebase service accounts, and external credentials."},
    "campus_metrics.manage": {"label": "Manage Front Page Campus Metrics", "desc": "Adjust front page headline statistics and institutional metrics."}
}


def build_email_content(recipient_email: str, role_key: str, role_label: str, permissions: List[str], admin_email: Optional[str] = None) -> Dict[str, str]:
    """Generates a professional HTML and plain text email body detailing granted role and permissions."""
    subject = f"🎓 Role Granted: You have been assigned the {role_label} role [{SYSTEM_TAG}]"

    perm_items_html = []
    perm_items_text = []

    for p in permissions:
        info = PERMISSION_CATALOG.get(p, {"label": p, "desc": "System capability."})
        perm_items_html.append(f"""
            <li style="margin-bottom: 10px; padding: 10px 14px; background: #f8fafc; border-left: 3px solid #4285f4; border-radius: 4px;">
                <strong style="color: #1e293b; font-size: 14px;">{info['label']}</strong><br/>
                <span style="color: #64748b; font-size: 13px;">{info['desc']}</span>
            </li>
        """)
        perm_items_text.append(f"  * {info['label']}: {info['desc']}")

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; }}
            .card {{ max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }}
            .header {{ background: linear-gradient(135deg, #1a73e8 0%, #1557b0 100%); padding: 28px; color: #ffffff; text-align: left; }}
            .header h1 {{ margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }}
            .header p {{ margin: 6px 0 0 0; opacity: 0.9; font-size: 14px; }}
            .body {{ padding: 28px; }}
            .badge {{ display: inline-block; background: #e8f0fe; color: #1a73e8; font-weight: 700; font-size: 13px; padding: 5px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }}
            .action-btn {{ display: inline-block; background: #1a73e8; color: #ffffff !important; font-weight: 600; font-size: 15px; padding: 12px 26px; border-radius: 8px; text-decoration: none; margin-top: 20px; }}
            .footer {{ background: #f8fafc; padding: 20px 28px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="header">
                <h1>Google Course Builder</h1>
                <p>Role-Based Access Control System Notification</p>
            </div>
            <div class="body">
                <span class="badge">Role Assignment</span>
                <h2 style="margin: 0 0 14px 0; color: #0f172a; font-size: 20px;">Hello,</h2>
                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-top: 0;">
                    Your Google account (<strong>{recipient_email}</strong>) has been officially granted the 
                    <strong style="color: #1a73e8;">{role_label}</strong> role on Google Course Builder.
                </p>

                <h3 style="color: #0f172a; font-size: 16px; margin: 24px 0 12px 0;">Granted Permissions & Capabilities:</h3>
                <ul style="list-style: none; padding: 0; margin: 0;">
                    {''.join(perm_items_html) if perm_items_html else '<li style="color: #64748b;">Baseline supporter access.</li>'}
                </ul>

                <div style="margin-top: 28px; padding: 18px; background: #eff6ff; border-radius: 8px; border: 1px solid #bfdbfe;">
                    <strong style="color: #1e40af; font-size: 14px;">How to activate your access:</strong>
                    <p style="color: #1e3a8a; font-size: 13px; margin: 6px 0 0 0; line-height: 1.5;">
                        Simply log in with your Google Account using <strong>{recipient_email}</strong>. 
                        Your specific role and permissions will activate automatically upon sign-in.
                    </p>
                </div>

                <div style="text-align: center; margin-top: 24px;">
                    <a href="https://g-class-builder.vercel.app" class="action-btn">Launch Course Builder Studio</a>
                </div>
            </div>
            <div class="footer">
                Tag: <strong>{SYSTEM_TAG}</strong> &bull; Assigned by {admin_email or 'System Administrator'}<br/>
                This is an automated administrative notification from Google Course Builder LMS.
            </div>
        </div>
    </body>
    </html>
    """

    plain_content = f"""Hello,

Your Google account ({recipient_email}) has been granted the {role_label} role on Google Course Builder.

Granted Permissions:
{chr(10).join(perm_items_text) if perm_items_text else '  * Baseline supporter access.'}

How to activate:
Sign in to Google Course Builder using {recipient_email}. Your role and permissions will activate automatically.

Tag: {SYSTEM_TAG}
Assigned by: {admin_email or 'System Administrator'}
"""

    return {
        "subject": subject,
        "html": html_content,
        "plain": plain_content
    }


def send_role_notification_via_gmail(
    recipient_email: str,
    role_key: str,
    role_label: str,
    permissions: List[str],
    admin_email: Optional[str] = None
) -> Dict[str, Any]:
    """
    Sends an email using the Gmail API (users.messages.send) using authenticated Google OAuth credentials.
    If the Gmail API token is not yet authorized or returns an error, safely records the event and returns
    a direct 1-click Gmail Web compose link.
    """
    email_data = build_email_content(recipient_email, role_key, role_label, permissions, admin_email)
    
    # 1. Prepare MIME message
    mime_message = MIMEMultipart("alternative")
    mime_message["to"] = recipient_email
    if admin_email:
        mime_message["from"] = admin_email
    mime_message["subject"] = email_data["subject"]
    mime_message.attach(MIMEText(email_data["plain"], "plain", "utf-8"))
    mime_message.attach(MIMEText(email_data["html"], "html", "utf-8"))

    raw_encoded = base64.urlsafe_b64encode(mime_message.as_bytes()).decode("utf-8")

    sent = False
    send_method = "logged"
    error_msg = None
    response_payload = {}

    # 2. Attempt sending via Google Gmail API
    try:
        import teacher_auth
        # Try loading credentials for admin_email or any active session
        sender = admin_email
        creds = None
        if sender:
            creds = teacher_auth.load_credentials(sender)
        
        # If no specific admin creds, find the first valid stored teacher token
        if not creds and os.path.exists(teacher_auth.TEACHER_DIR):
            for fname in os.listdir(teacher_auth.TEACHER_DIR):
                if fname.endswith(".json") and not fname.startswith("_"):
                    fpath = os.path.join(teacher_auth.TEACHER_DIR, fname)
                    try:
                        with open(fpath, "r", encoding="utf-8") as f:
                            tdata = json.load(f)
                        from google.oauth2.credentials import Credentials
                        c = Credentials.from_authorized_user_info(tdata)
                        if c.valid or c.refresh_token:
                            creds = c
                            break
                    except Exception:
                        continue

        if creds:
            from googleapiclient.discovery import build
            from google.auth.transport.requests import Request
            if not creds.valid and creds.refresh_token:
                creds.refresh(Request())
            
            gmail_service = build("gmail", "v1", credentials=creds, cache_discovery=False)
            result = gmail_service.users().messages().send(
                userId="me",
                body={"raw": raw_encoded}
            ).execute()
            
            sent = True
            send_method = "gmail_api"
            response_payload = result
            print(f"[GMAIL API] Successfully sent role notification to {recipient_email}. Message ID: {result.get('id')}")
    except Exception as exc:
        error_msg = str(exc)
        print(f"[GMAIL API WARN] Direct Gmail API send could not complete: {exc}")

    # 3. Create a fallback 1-click web Gmail compose link
    compose_params = urllib.parse.urlencode({
        "view": "cm",
        "fs": "1",
        "to": recipient_email,
        "su": email_data["subject"],
        "body": email_data["plain"]
    })
    compose_url = f"https://mail.google.com/mail/?{compose_params}"

    # 4. Log to persistent notifications log
    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "recipient": recipient_email,
        "role": role_key,
        "role_label": role_label,
        "permissions_count": len(permissions),
        "sent": sent,
        "method": send_method,
        "admin_email": admin_email,
        "error": error_msg,
        "tag": SYSTEM_TAG
    }

    try:
        logs = []
        if os.path.exists(GMAIL_NOTIFICATIONS_LOG):
            with open(GMAIL_NOTIFICATIONS_LOG, "r", encoding="utf-8") as f:
                logs = json.load(f)
        logs.append(log_entry)
        with open(GMAIL_NOTIFICATIONS_LOG, "w", encoding="utf-8") as f:
            json.dump(logs, f, indent=2)
    except Exception as log_err:
        print(f"[GMAIL LOG WARN] Failed to update {GMAIL_NOTIFICATIONS_LOG}: {log_err}")

    return {
        "success": True,
        "sent": sent,
        "method": send_method,
        "recipient": recipient_email,
        "role": role_label,
        "messageId": response_payload.get("id"),
        "error": error_msg,
        "composeUrl": compose_url,
        "tag": SYSTEM_TAG,
        "subject": email_data["subject"]
    }


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python gmail_service.py <recipient_email> <role_key> [admin_email]")
        sys.exit(1)
    recip = sys.argv[1]
    rkey = sys.argv[2]
    adm = sys.argv[3] if len(sys.argv) > 3 else None
    
    # Baseline permissions lookup
    baseline_perms = []
    if rkey in ("teacher", "instructor"):
        baseline_perms = ["courses.view", "courses.create", "courses.publish", "grades.view", "grades.edit", "classroom.manage"]
    elif rkey in ("student", "learner"):
        baseline_perms = ["courses.view", "grades.view", "events.manage"]
    elif rkey in ("supporter",):
        baseline_perms = ["courses.view"]
    elif rkey in ("administration", "admin"):
        baseline_perms = ["courses.view", "applications.view", "applications.review", "students.manage", "users.manage"]

    res = send_role_notification_via_gmail(
        recipient_email=recip,
        role_key=rkey,
        role_label=rkey.capitalize(),
        permissions=baseline_perms,
        admin_email=adm
    )
    print(json.dumps(res, indent=2))
