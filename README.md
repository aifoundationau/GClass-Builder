# Google Classroom Course Automation Engine (Google Course Builder)

A generic, automated course creation and synchronization engine built in Python using the official **Google Classroom API v1**. It enables teachers and curriculum designers to **Create**, **Edit/Sync**, and **Attach Lecture Presentations via Links**, while strictly enforcing a **NO-DELETE Safety Policy** and **no duplicate course** constraint.

---

## 🌟 Key Features

1. **🚀 Programmatic Course Creation (`courses.create`)**:
   - Creates full course structures including metadata, section, academic level, and physical/virtual room.
   - Publishes welcome stream announcements (`courses.announcements.create`).
   - Automatically builds weekly module topics (`courses.topics.create`).

2. **📦 5 Native Google Classroom Items per Week Block**:
   - **Topic**: `Classroom Stream Topic` (e.g. `Week 1: Foundations of Cloud Infrastructure`), `Module Title`, and `Module Overview / Description`.
   - **Material**: `Lecture Presentation URL (Google Slides / Web Document)` with preview & strictly omitted `title` inside `link`.
   - **Assignment**: `Assignment Title`, `Assignment Instructions`, `Points` (default 100), and `Due Date`.
   - **Quiz Assignment**: `Quiz Assignment Title` and `Quiz Form URL` (Google Forms).
   - **Question**: `Question Prompt` and `Question Type` (`SHORT_ANSWER_QUESTION` / `MULTIPLE_CHOICE_QUESTION`).

3. **📊 Single-Sheet Curriculum Format (`.xlsx`)**:
   - Sheet 1: `Course_Settings`
   - Sheet 2: `Curriculum` with all 5 items and metadata columns on one spreadsheet:
     - `Week`, `Classroom Stream Topic`, `Module Title`, `Module Overview / Description`, `Lecture Presentation URL (Google Slides / Web Document)`, `Assessment / Knowledge Check`, `Assignment Instructions`, `Quiz assignment`, `Quiz URL`, `Question`, `Question Type`, `Points`, `Due Date`.

4. **🎯 Focused 1-Module-at-a-Time UX Workflow**:
   - Instructors focus on **one week block at a time**.
   - Stepper controls (`Previous Week` / `Next Week`), `+ Add Week` module button, and module dropdown selector.
   - **Review All Modules Dropdown / Modal**: Instant high-level summary of all weeks with status badges for all 5 items and 1-click jump to edit.

5. **💾 Primary Actions**:
   - **Save**: Download spreadsheet (`.xlsx`) ready for Classroom API.
   - **Upload to Google Classroom**: Creates course, topics, materials, assignments, quizzes, and questions.
   - **Update Existing Course**: Safe, non-destructive sync using `.patch()`.

6. **🛡️ STRICT NO-DELETE Safety Policy & No Duplicate Course**:
   - **Zero Deletion Endpoints**: Neither `courses.delete`, `topics.delete`, `courseWork.delete`, nor `courseWorkMaterials.delete` are ever called.
   - Course duplication is strictly disabled to prevent clutter and duplicate records.
   - Built-in static AST audit (`audit_codebase_safety`) verifies zero `.delete()` invocations in the codebase.

---

## 💻 Web UI Dashboard (`npm run dev`)

The project includes a **fullstack visual studio web application** running on Vite + React with an integrated Python API engine.

### Key Web App Features:
- **🔑 Google Classroom Email Login**:
  - Sign in using any Google Classroom instructor email (`teacher@school.edu`, `@university.edu`, or Gmail).
  - Teacher profile display with avatar, institutional domain, and active Classroom authorization status.
  - Quick-connect presets for instant testing, plus full sign-out and account-switching support.
- **🚀 Course Studio (1-by-1 Module Editor)**:
  - Step through curriculum one week at a time.
  - Review all modules dropdown modal with status badges for all 5 item types.
  - Full support for Topic, Material, Assignment, Quiz Assignment, and Question.
  - Export & Import single `.xlsx` workbook containing all module blocks.
- **📚 Active Classroom Courses**:
  - Visual cards for active sections, 1-click copy for enrollment codes, and roster statistics.
- **🔄 Safe Course Update**:
  - Safely update module descriptions, points, and slide decks with 0 deletions.
- **🛡️ Safety & API Inspector**: Real-time AST audit and JSON payload viewer.

```text
├── classroom_course_engine.py   # Main automation engine CLI & API client
├── test_course_engine.py         # Unit & integration test suite (9 test cases)
├── requirements.txt             # Required Python dependencies
├── course_curriculum.xlsx       # Sample 2-sheet course spreadsheet
└── README.md                    # Documentation
```

---

## ⚙️ Installation & Setup

### 1. Prerequisites
- Python 3.10+ (tested with Python 3.14)
- Google Cloud Project with the **Google Classroom API** enabled (for live use)

### 2. Environment Setup
```bash
# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Authentication
The engine supports three modes:
- **OAuth 2.0 Client (Recommended for teachers)**: Download your OAuth client secret from Google Cloud Console as `credentials.json` in this directory. On first run, it prompts browser authorization and saves `token.json`.
- **Service Account**: Place `service_account.json` in this directory (with domain-wide delegation).
- **Offline / Simulator Mode (`--mock`)**: If no credentials file is present, the engine automatically falls back to an in-memory Google Classroom API v1 simulator for 100% offline testing.

---

## 📊 Spreadsheet Input Schema

The engine accepts standard Excel workbooks (`.xlsx`) containing two sheets:

### Sheet 1: `Course_Settings`
Supports both key-value and tabular layouts:
| Setting | Value / Example |
| :--- | :--- |
| `class_name` | CS101: Introduction to Cloud Computing |
| `section` | Cohort 1 - Fall |
| `subject` | Computer Science & Cloud Systems |
| `level` | Undergraduate (Introductory) |
| `room` | Virtual Lab Room A-12 |
| `welcome_announcement` | Welcome to CS101! Please review the syllabus and slide links. |

### Sheet 2: `Curriculum`
Defines weekly module syllabus, presentation links, and assessments:
| Week | Module Title | Module Overview | Lecture Materials | Assessments & Knowledge Checks | Points | Due Date |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Week 1 | Foundations of Cloud Infrastructure | Distributed systems & virtualization | `https://docs.google.com/presentation/d/...` | Quiz 1: Virtualization vs Containers | 100 | 2026-10-15 |
| Week 2 | Compute & Container Orchestration | Docker & Kubernetes management | `https://docs.google.com/presentation/d/...` | Lab Assignment: Deploying Microservices | 100 | 2026-10-22 |

Generate a ready-to-use template anytime:
```bash
python classroom_course_engine.py --generate-template --file my_course.xlsx
```

---

## 🚀 Usage

### Option A: Interactive Menu
Simply run the script with no arguments:
```bash
python classroom_course_engine.py
```
```text
=================================================================
  GOOGLE CLASSROOM COURSE AUTOMATION ENGINE (NO-DELETE SAFE)
=================================================================
  1. Create & Populate Course (from Spreadsheet)
  2. Edit / Non-Destructive Sync Existing Course
  3. Duplicate Course Structure to New Section
  4. List Courses & Status Check
  5. Generate Sample Course Spreadsheet Template
  6. Run Self-Test & Safety Audit
  7. Exit
=================================================================
```

### Option B: Scriptable CLI Flags
```bash
# 1. Generate spreadsheet template
python classroom_course_engine.py --generate-template --file course_curriculum.xlsx

# 2. Create and populate course
python classroom_course_engine.py --create --file course_curriculum.xlsx

# 3. Non-destructive sync for an existing course
python classroom_course_engine.py --sync --course-id <COURSE_ID> --file updated_curriculum.xlsx

# 4. Duplicate course to a new cohort
python classroom_course_engine.py --duplicate --course-id <COURSE_ID> --section "Cohort 2 - Winter"

# 5. List courses & inspect student rosters
python classroom_course_engine.py --list

# 6. Run built-in self-test & static safety audit
python classroom_course_engine.py --test
```

---

## 🔬 Testing & Verification

Run the comprehensive unit test suite:
```bash
python test_course_engine.py
```

### Test Suite Coverage:
- `test_01_ast_safety_audit_no_delete`: Static AST parse of engine guaranteeing zero `.delete` calls.
- `test_02_safety_guardrail_raises_exception`: Enforces `SafetyPolicyViolationError` on deletion attempts.
- `test_03_link_attachment_schema_strictly_omits_title`: Verifies omission of `title` in `link` material attachment per Google Classroom API v1 specs.
- `test_04_presentation_url_sanitization`: URL normalization and scheme validation.
- `test_05_spreadsheet_parsing`: Schema normalization for vertical & horizontal tables.
- `test_06_create_and_populate_course`: End-to-end Course, Topic, Presentation Material, and Coursework creation.
- `test_07_sync_existing_course_non_destructive`: Non-destructive update assertions.
- `test_08_duplicate_course_to_new_section`: Duplication and link preservation.
- `test_09_list_courses_status_check`: Course roster and item count metrics.
