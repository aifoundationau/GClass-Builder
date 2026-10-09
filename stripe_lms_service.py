#!/usr/bin/env python3
"""
Stripe & Firebase Registration Service for LMS Course Builder.
Handles Customer creation, Card SetupIntents, Draft Invoice Policy,
and Firebase Firestore synchronization with mandatory 'lms' tag.
"""

import os
import json
import urllib.request
import urllib.parse
import uuid
from datetime import datetime, timezone

# 1. Environment loader
def load_env():
    env_file = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_file):
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    if k and k not in os.environ:
                        os.environ[k] = v

load_env()

STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_PUBLIC_KEY = os.environ.get("STRIPE_PUBLIC_KEY") or os.environ.get("VITE_STRIPE_PUBLIC_KEY", "")
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID") or os.environ.get("VITE_FIREBASE_PROJECT_ID", "lms-course-builder")
FIREBASE_USERS_FILE = os.path.join(os.path.dirname(__file__), "lms_firebase_users.json")


def _stripe_api_request(endpoint: str, data: dict = None, method: str = "POST") -> dict:
    """Performs HTTP requests to Stripe API using urllib (zero external dependencies)."""
    if not STRIPE_SECRET_KEY:
        raise ValueError("Missing STRIPE_SECRET_KEY in environment or .env file.")

    url = f"https://api.stripe.com/v1/{endpoint.lstrip('/')}"
    headers = {
        "Authorization": f"Bearer {STRIPE_SECRET_KEY}",
        "Content-Type": "application/x-www-form-urlencoded"
    }

    encoded_data = None
    if data:
        encoded_data = urllib.parse.urlencode(data).encode("utf-8")

    req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            err_json = json.loads(err_body)
            err_msg = err_json.get("error", {}).get("message", err_body)
        except Exception:
            err_msg = err_body
        raise RuntimeError(f"Stripe API error ({e.code}): {err_msg}")


def get_stripe_config() -> dict:
    """Returns public config for frontend checkout / registration."""
    return {
        "publishableKey": STRIPE_PUBLIC_KEY,
        "invoicePrefix": "LMS",
        "defaultInvoiceStatus": "draft",
        "paymentTermsDays": 30,
        "tag": "lms"
    }


def get_agentic_registration_schema() -> dict:
    """
    Returns an agnostic AI Agent questionnaire schema and MCP tool definition.
    Enables any LLM agent (Gemini, Claude, GPT, LangChain, AutoGen, etc.) to:
    1. Ask user questions sequentially in natural language.
    2. Validate and map responses to standardized student registration data.
    3. Programmatically execute registration via MCP tool or REST API.
    """
    return {
        "protocol": "Model Context Protocol (MCP) & Agnostic Agent Onboarding",
        "version": "1.1.0",
        "system_name": "LMS Student Onboarding Engine",
        "agent_instructions": (
            "You are an AI enrollment counselor for the LMS platform. "
            "Interview the applicant by asking the following questions sequentially. "
            "Validate each answer before proceeding. "
            "Once all questions are answered, formulate the JSON payload and execute the register_student_member MCP tool."
        ),
        "conversational_flow": [
            {
                "step": 1,
                "field": "account_type",
                "agent_question": "Are you enrolling as an Individual student/instructor or on behalf of an Organization (school/institution)?",
                "type": "string",
                "default": "individual",
                "allowed_values": ["individual", "organization"]
            },
            {
                "step": 2,
                "field": "name",
                "agent_question": "What is your full legal name (or primary contact name)?",
                "type": "string",
                "required": True
            },
            {
                "step": 3,
                "field": "business_name",
                "agent_question": "What is your organization or school name?",
                "type": "string",
                "required_if": {"account_type": "organization"}
            },
            {
                "step": 4,
                "field": "email",
                "agent_question": "What is your email address for course access and notifications?",
                "type": "string",
                "format": "email",
                "required": True
            },
            {
                "step": 5,
                "field": "phone",
                "agent_question": "What is your contact phone number?",
                "type": "string",
                "required": False
            },
            {
                "step": 6,
                "field": "date_of_birth",
                "agent_question": "What is your date of birth? (Please provide in YYYY-MM-DD format for academic record verification)",
                "type": "string",
                "format": "date",
                "required": True,
                "note": "Archived in LMS academic database only; excluded from Stripe payment processing."
            },
            {
                "step": 7,
                "field": "education_history",
                "agent_question": "What is your education history? (Please mention your highest qualification, institution name, and field of study)",
                "type": "object",
                "required": False,
                "note": "Archived in LMS academic database only; excluded from Stripe payment processing.",
                "subfields": {
                    "level": "Highest education qualification (e.g., High School, Bachelor's Degree, Master's Degree, Doctorate, Diploma, Other)",
                    "institution": "University, college, or school name",
                    "field_of_study": "Major, degree subject, or specialization",
                    "notes": "Graduation year or additional credentials"
                }
            },
            {
                "step": 8,
                "field": "role",
                "agent_question": "What role are you registering for? (student, instructor, or school_admin)",
                "type": "string",
                "default": "student",
                "allowed_values": ["student", "instructor", "school_admin"]
            },
            {
                "step": 9,
                "field": "address",
                "agent_question": "What is your billing / residential address (Street, City, State, Postcode, and Country)?",
                "type": "object",
                "required": True,
                "subfields": ["line1", "line2", "city", "state", "postal_code", "country"]
            },
            {
                "step": 10,
                "field": "save_card",
                "agent_question": "Would you like to authorize a credit or debit card on file for future course enrollments? (yes/no)",
                "type": "boolean",
                "default": False
            }
        ],
        "mcp_tool": {
            "name": "register_student_member",
            "description": "Registers a new student member into the LMS system with Date of Birth, Education History, and billing address, generating their Client ID (Stripe Customer ID) and creating the student record.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "account_type": {
                        "type": "string",
                        "enum": ["individual", "organization"],
                        "description": "Account type: 'individual' for students/teachers, 'organization' for institutions."
                    },
                    "name": {
                        "type": "string",
                        "description": "Full name of the student or contact person."
                    },
                    "business_name": {
                        "type": "string",
                        "description": "School or business name if registering as an organization."
                    },
                    "email": {
                        "type": "string",
                        "format": "email",
                        "description": "Primary email address."
                    },
                    "phone": {
                        "type": "string",
                        "description": "Contact phone number."
                    },
                    "date_of_birth": {
                        "type": "string",
                        "format": "date",
                        "description": "Student date of birth in YYYY-MM-DD format (student record only)."
                    },
                    "education_history": {
                        "type": "object",
                        "description": "Student academic history and background (student record only).",
                        "properties": {
                            "level": {"type": "string", "description": "Highest education level (e.g. Bachelor's Degree)."},
                            "institution": {"type": "string", "description": "Institution name."},
                            "field_of_study": {"type": "string", "description": "Degree subject or major."},
                            "notes": {"type": "string", "description": "Graduation year or credential details."}
                        }
                    },
                    "role": {
                        "type": "string",
                        "enum": ["student", "instructor", "school_admin"],
                        "default": "student",
                        "description": "Assigned LMS member role."
                    },
                    "tax_id": {
                        "type": "string",
                        "description": "Optional tax or business identification number."
                    },
                    "address": {
                        "type": "object",
                        "required": ["line1", "city", "postal_code"],
                        "properties": {
                            "line1": {"type": "string", "description": "Street address line 1."},
                            "line2": {"type": "string", "description": "Street address line 2 or unit."},
                            "city": {"type": "string", "description": "City or suburb."},
                            "state": {"type": "string", "description": "State or province."},
                            "postal_code": {"type": "string", "description": "Postal or ZIP code."},
                            "country": {"type": "string", "default": "AU", "description": "Two-letter ISO country code (AU, US, etc.)."}
                        }
                    },
                    "save_card": {
                        "type": "boolean",
                        "default": False,
                        "description": "Whether to initiate an off-session card saving SetupIntent."
                    }
                },
                "required": ["name", "email", "address"]
            }
        }
    }


def create_stripe_customer(payload: dict) -> dict:
    """
    Creates a Stripe Customer matching all specifications:
    - accountType: 'individual' or 'organization'
    - full billing address
    - invoice_prefix: 'LMS'
    - pay_immediately: false (enforcing draft invoice check policy)
    - metadata: tag='lms', role, account_type, etc.
    """
    account_type = payload.get("accountType", "individual")
    name = (payload.get("name") or "").strip()
    business_name = (payload.get("businessName") or "").strip()
    email = (payload.get("email") or "").strip()
    phone = (payload.get("phone") or "").strip()
    role = payload.get("role", "student")
    address = payload.get("address", {})
    tax_id = (payload.get("taxId") or "").strip()

    customer_name = business_name if (account_type == "organization" and business_name) else name

    # Stripe requires invoice_prefix to be unique per customer (3-12 uppercase alphanumeric characters)
    unique_prefix = f"LMS{uuid.uuid4().hex[:4].upper()}"

    params = {
        "name": customer_name,
        "email": email,
        "phone": phone,
        "invoice_prefix": unique_prefix,
        "metadata[tag]": "lms",
        "metadata[system]": "lms",
        "metadata[base_prefix]": "LMS",
        "metadata[account_type]": account_type,
        "metadata[role]": role,
        "metadata[invoice_policy]": "draft_review_first",
        "metadata[default_terms_days]": "30"
    }

    if business_name:
        params["metadata[business_name]"] = business_name
    if account_type == "organization" and name:
        params["metadata[contact_person]"] = name

    # Billing Address
    if isinstance(address, dict):
        if address.get("line1"):
            params["address[line1]"] = str(address["line1"]).strip()
        if address.get("line2"):
            params["address[line2]"] = str(address["line2"]).strip()
        if address.get("city"):
            params["address[city]"] = str(address["city"]).strip()
        if address.get("state"):
            params["address[state]"] = str(address["state"]).strip()
        if address.get("postal_code"):
            params["address[postal_code]"] = str(address["postal_code"]).strip()
        if address.get("country"):
            params["address[country]"] = str(address["country"]).strip().upper()

    # Tax ID (optional)
    if tax_id:
        # Pass in tax metadata
        params["metadata[tax_id]"] = tax_id

    customer = _stripe_api_request("customers", params)
    return customer


def create_setup_intent(customer_id: str) -> dict:
    """Creates a SetupIntent to securely collect and store credit/debit card on file."""
    params = {
        "customer": customer_id,
        "usage": "off_session",
        "metadata[tag]": "lms",
        "metadata[purpose]": "lms_card_on_file"
    }
    return _stripe_api_request("setup_intents", params)


def attach_payment_method(customer_id: str, payment_method_id: str) -> dict:
    """Attaches a payment method and marks it as default for invoices."""
    _stripe_api_request(f"payment_methods/{payment_method_id}/attach", {"customer": customer_id})
    # Set as default for invoices
    return _stripe_api_request(f"customers/{customer_id}", {
        "invoice_settings[default_payment_method]": payment_method_id
    })


# 2. Firebase Database Sync (tagged with 'lms')
def load_all_lms_users() -> list:
    """Reads all users tagged with 'lms' from the local persistent Firestore cache."""
    if not os.path.exists(FIREBASE_USERS_FILE):
        return []
    try:
        with open(FIREBASE_USERS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            # Filter specifically for tag 'lms'
            return [u for u in data if "lms" in u.get("tags", [])]
    except Exception:
        return []


def save_lms_user_record(user_record: dict) -> dict:
    """
    Saves a registered user to the Firebase Firestore store with tag 'lms'.
    Ensures that any system accessing 'lms' items can index and use this record.
    """
    # Enforce mandatory 'lms' tag
    tags = list(set(user_record.get("tags", []) + ["lms"]))
    user_record["tags"] = tags
    user_record["source"] = "lms"
    user_record["updated_at"] = datetime.now(timezone.utc).isoformat()

    existing_users = []
    if os.path.exists(FIREBASE_USERS_FILE):
        try:
            with open(FIREBASE_USERS_FILE, "r", encoding="utf-8") as f:
                existing_users = json.load(f)
        except Exception:
            existing_users = []

    # Update if email or uid exists, else append
    matched = False
    for i, u in enumerate(existing_users):
        if (user_record.get("uid") and u.get("uid") == user_record.get("uid")) or \
           (user_record.get("email") and u.get("email") == user_record.get("email")):
            existing_users[i] = user_record
            matched = True
            break
    if not matched:
        existing_users.append(user_record)

    with open(FIREBASE_USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(existing_users, f, indent=2)

    # Optional: Write to live Firestore REST API if Firebase REST endpoint is enabled
    _sync_to_live_firestore(user_record)

    return user_record


def _sync_to_live_firestore(user_record: dict):
    """Syncs to Firestore REST API if Google/Firebase access token is present."""
    # Best-effort live Firestore write
    try:
        token = os.environ.get("FIREBASE_ACCESS_TOKEN")
        proj_id = FIREBASE_PROJECT_ID
        if token and proj_id:
            uid = user_record.get("uid", uuid.uuid4().hex)
            url = f"https://firestore.googleapis.com/v1/projects/{proj_id}/databases/(default)/documents/users/{uid}"
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            # Convert fields to Firestore format
            fields = {}
            for k, v in user_record.items():
                if isinstance(v, str):
                    fields[k] = {"stringValue": v}
                elif isinstance(v, list):
                    fields[k] = {"arrayValue": {"values": [{"stringValue": str(item)} for item in v]}}
                elif isinstance(v, dict):
                    fields[k] = {"stringValue": json.dumps(v)}
            body = json.dumps({"fields": fields}).encode("utf-8")
            req = urllib.request.Request(url, data=body, headers=headers, method="PATCH")
            urllib.request.urlopen(req)
    except Exception:
        pass
