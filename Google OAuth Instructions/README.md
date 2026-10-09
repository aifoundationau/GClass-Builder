# Google Classroom OAuth 2.0 Setup Guide
**Project:** Google Classroom Course Builder & Automation Studio  
**Organization:** AI Foundation Australia  
**Date:** October 2026  

---

## 📌 Executive Summary

This guide provides end-to-end instructions for configuring **Google Cloud OAuth 2.0 Credentials** for the **Google Classroom Course Builder**. This setup allows educators, administrators, and automated scripts to securely authenticate, create courses, upload weekly modules, attach lecture materials, post coursework, and invite student rosters via the Google Classroom API v1.

---

## 📋 Prerequisites

1. A **Google Cloud Account** with permission to create or manage Google Cloud Platform (GCP) projects.
2. A **Google Workspace** or **Personal Google Account** that has access to Google Classroom ([classroom.google.com](https://classroom.google.com)).
3. Local environment running Google Classroom Course Builder (Frontend on `http://localhost:5173`, API Server on `http://127.0.0.1:8000`).

---

## 🚀 Step 1: Create or Select Your Google Cloud Project

1. Navigate to the **[Google Cloud Console](https://console.cloud.google.com/)**.
2. Select your existing project (e.g., `gen-lang-client-0551298781`) or create a new one:
   * Click the project dropdown at the top navigation bar.
   * Click **New Project**.
   * **Project name:** `Google Course Builder` (or `AI Foundation Course Studio`).
   * Click **Create**.

---

## 🔌 Step 2: Enable the Google Classroom API

Google Classroom APIs are disabled by default on new GCP projects and must be enabled:

1. Open the **[Google Classroom API Library Page](https://console.cloud.google.com/apis/library/classroom.googleapis.com)**.
2. Ensure your target project is selected in the top bar.
3. Click the blue **ENABLE** button.
4. *(Optional but recommended)* Also ensure the **Google People API** or **OAuth2 API** is enabled for reading user profile avatars and names.

---

## 🛡️ Step 3: Configure the OAuth Consent Screen

1. Open **[APIs & Services > OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)**.
2. **Choose User Type:**
   * **External** *(Recommended for multi-domain access)*: Allows any Google account to sign in. During the *Testing* phase, you must add email addresses to the Test Users list.
   * **Internal** *(Google Workspace only)*: Only accounts within your Google Workspace domain (e.g., `@aifoundation.net.au`) can sign in. Bypasses test user whitelists and verification warnings.
3. Click **CREATE**.

### App Information:
* **App name:** `GCourse Builder`
* **User support email:** `support@aifoundation.net.au`
* **Developer contact email:** `support@aifoundation.net.au`
* Click **SAVE AND CONTINUE**.

### Scopes:
Click **ADD OR REMOVE SCOPES** and select the following Classroom and Identity scopes:
* `https://www.googleapis.com/auth/classroom.courses` — Manage and view courses.
* `https://www.googleapis.com/auth/classroom.topics` — Create and view stream topics.
* `https://www.googleapis.com/auth/classroom.coursework.students` — Create weekly assignments & quizzes.
* `https://www.googleapis.com/auth/classroom.courseworkmaterials` — Upload presentation slides & reference links.
* `https://www.googleapis.com/auth/classroom.announcements` — Publish stream announcements.
* `https://www.googleapis.com/auth/classroom.rosters.readonly` — View enrolled teachers and students.
* `openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/userinfo.profile`
* Click **UPDATE**, then click **SAVE AND CONTINUE**.

### Test Users (Crucial for External Testing):
* While the app's Publishing Status is **Testing**, Google will block any user not in this list with `Error 403: access_denied`.
* Click **+ ADD USERS**.
* Add:
  ```text
  support@aifoundation.net.au
  ```
  *(Add any additional personal Gmail accounts or tester emails here).*
* Click **SAVE AND CONTINUE** ➔ **BACK TO DASHBOARD**.

---

## 🔑 Step 4: Create OAuth 2.0 Web Client Credentials

1. Open **[APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)**.
2. Click **+ CREATE CREDENTIALS** at the top ➔ Select **OAuth client ID**.
3. **Application type:** Select **Web application**.
4. **Name:** `AI Foundation OAuth Test` (or `GCourse Builder Web`).
5. **Authorized JavaScript origins:**
   * Click **+ ADD URI** and add:
     ```text
     http://localhost:5173
     http://127.0.0.1:5173
     ```
6. **Authorized redirect URIs (MANDATORY):**
   * Click **+ ADD URI** and add:
     ```text
     http://localhost:5173/api/auth/oauth2callback
     ```
   * *Note:* Must match character-for-character. Do **not** add a trailing slash `/` at the end.
7. Click **CREATE**.
8. A modal will appear displaying your **Client ID** and **Client Secret**.
9. Click **DOWNLOAD JSON**.

---

## 📁 Step 5: Save Credentials in the Project

Rename the downloaded JSON file to `credentials.json` and place it in the root directory of the project:

**File location:**
`d:\Agy\google-course-builder\credentials.json`

The file structure should look like this:
```json
{
  "web": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "project_id": "your-gcp-project-id",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "YOUR_CLIENT_SECRET",
    "redirect_uris": [
      "http://localhost:5173/api/auth/oauth2callback"
    ]
  }
}
```

> [!CAUTION]
> **Git Security:** Ensure that `credentials.json` and `token.json` are listed in `.gitignore`. Never commit client secrets to public repositories.

---

## 🔄 Step 6: Testing Authentication Flow

1. Start the application:
   ```powershell
   npm run dev
   ```
2. Open **[http://localhost:5173](http://localhost:5173)** in your browser.
3. In the left navigation, click **Log In** ➔ **Sign in with Google Classroom**.
4. Choose your authorized test account (`support@aifoundation.net.au`).
5. If you see the warning: *"Google hasn't verified this app"*:
   * Click **Advanced** in the bottom-left corner.
   * Click **Go to GCourse Builder (unsafe)**.
   * Click **Continue** to approve permissions.
6. The browser will redirect back to `http://localhost:5173`, and you will see:
   * **● Logged In to Classroom**
   * Your name and email in the sidebar.
   * A persistent access token written to `token.json`.

---

## ⚠️ Troubleshooting Common OAuth Errors

| Error | Cause | Resolution |
| :--- | :--- | :--- |
| **`Error 403: access_denied`** | App is in "Testing" mode and the email is not in the Test Users list. | Go to GCP Console ➔ **OAuth consent screen** ➔ **Test users** ➔ Click **+ ADD USERS** and enter the email address. |
| **`Error 400: redirect_uri_mismatch`** | The redirect URI sent by the app doesn't match the GCP Console entry. | Ensure `http://localhost:5173/api/auth/oauth2callback` is added to **Authorized redirect URIs** in GCP Console with no typos or trailing slashes. |
| **`invalid_grant: Token has been expired or revoked`** | Stale OAuth refresh token. | Delete `token.json` from the root folder and log in again to generate a fresh token. |
| **`Access blocked: Authorization Error`** | Google Classroom API is not enabled in the project. | Go to **APIs & Services > Library**, search for **Google Classroom API**, and click **ENABLE**. |

---

## 🏷️ Relationship with LMS & Stripe (`tag: 'lms'`)

* **Google Classroom OAuth** is used for educators to sync, deploy, and inspect live Google Classroom courses.
* **Stripe & Firebase Registration** operates alongside Google OAuth:
  * Any user (student or organization) can register using the **Register** button.
  * Every record saved is stamped with `tags: ['lms']` and `invoice_policy: 'draft_review_first'`.
  * Public registration does **not** require Google Cloud verification.
