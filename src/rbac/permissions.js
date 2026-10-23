// Role-based access control (RBAC) catalog: the 24 permissions, the 11 system roles and the
// baseline permissions each role is seeded with. Firestore keeps the live data, which the
// Superadmin edits in Role Permissions. The collections carry the app's tag, because roles and
// permissions belong to this app alone (other apps sharing the Firebase project have their own):
//
//   /gcoursebuilder_roles/{roleKey}            { roleName, permissions, updatedAt, updatedBy }
//   /gcoursebuilder_role_assignments/{email}   { email, role, assignedAt, assignedBy }   (email in lower case)
//
// The Superadmin is the owner, as in every app: one of the owner's Google accounts, recognised from
// the sign-in. Everyone else has the role the Superadmin assigned to their verified Google email,
// else supporter. firestore.rules repeats the role and permission keys and the owner's accounts
// (npm run check:rbac compares them), so change them in both places.
//
// Plain JavaScript with no Firebase imports, so scripts/ can use it from Node.

export const ROLES_COLLECTION = 'gcoursebuilder_roles';
export const ROLE_ASSIGNMENTS_COLLECTION = 'gcoursebuilder_role_assignments';

export const SUPERADMIN_ROLE = 'superadmin';
// Every new Google sign-in, and every account without an assignment, is a supporter until the
// Superadmin gives it a role
export const DEFAULT_ROLE = 'supporter';

// The owner's Google accounts: the Superadmin in every app sharing the Firebase project, matched
// by uid, or by email when Google has verified it. The same lists as lib/auth.js and isSuperAdmin()
// in firestore.rules. Never change them unless the owner asks.
export const SUPERADMIN_UIDS = ['ZK79FRQoVlYhsgvMibhi81dRUWj2', 'L5euSJAfNKdDOX6mT0qmrCGjUA53'];
export const SUPERADMIN_EMAILS = ['davidrobertson.info@gmail.com', 'support@aifoundation.net.au'];

export function isOwnerAccount({ uid, email, emailVerified } = {}) {
  return SUPERADMIN_UIDS.includes(uid)
    || (emailVerified === true && SUPERADMIN_EMAILS.includes(String(email || '').trim().toLowerCase()));
}

export const PERMISSION_GROUPS = [
  { key: 'academic', label: 'Academic & LMS' },
  { key: 'admissions', label: 'Admissions & Students' },
  { key: 'finance', label: 'Finance & Operations' },
  { key: 'communications', label: 'Communications & AI' },
  { key: 'governance', label: 'Administration & Governance' },
];

export const PERMISSIONS = [
  { key: 'courses.view', group: 'academic', label: 'View Courses & Units',
    description: 'Inspect full course syllabus, accreditation details, unit structures, and learning outcomes.' },
  { key: 'courses.create', group: 'academic', label: 'Create & Edit Courses',
    description: 'Build new courses and units in LMS Course Builder, add modules and learning outcomes.' },
  { key: 'courses.publish', group: 'academic', label: 'Publish Courses to Catalog',
    description: 'Publish draft courses to the live public university catalog and admissions portal.' },
  { key: 'grades.view', group: 'academic', label: 'View Student Grades & Transcripts',
    description: 'Access academic performance, assessment results, GPA, and student transcripts.' },
  { key: 'grades.edit', group: 'academic', label: 'Grade Assessments & Units',
    description: 'Enter scores, mark assignments, and record student competency evaluations.' },
  { key: 'classroom.manage', group: 'academic', label: 'Manage Google Classroom',
    description: 'Synchronize rosters, invite teachers/students, and link Google Classroom coursework.' },

  { key: 'applications.view', group: 'admissions', label: 'View Applications',
    description: 'Read submitted student applications, declarations, and attached documents.' },
  { key: 'applications.review', group: 'admissions', label: 'Review & Decide Applications',
    description: 'Approve, place on hold, or reject prospective student admissions applications.' },
  { key: 'applications.export', group: 'admissions', label: 'Export Application Records',
    description: 'Download full JSON and document dossiers for admissions board audits.' },
  { key: 'students.manage', group: 'admissions', label: 'Manage Student Identifiers',
    description: 'Issue official Student Numbers (STU-2026-XXXXX) and manage student profiles.' },

  { key: 'finance.view', group: 'finance', label: 'View Financial Ledgers',
    description: 'Monitor tuition revenue, fee status, departmental budgets, and balance sheets.' },
  { key: 'finance.approve', group: 'finance', label: 'Approve Budgets & Waivers',
    description: 'Approve capital expenditures, tuition discounts, scholarship waivers, and refunds.' },
  { key: 'tokens.manage', group: 'finance', label: 'Emergency Fund & Tokens',
    description: 'Authorize and disburse student emergency food, housing, and transit tokens.' },
  { key: 'events.manage', group: 'finance', label: 'Manage Events & RSVPs',
    description: 'Schedule campus open days, academic orientations, webinars, and track registrations.' },
  { key: 'calendar.manage', group: 'finance', label: 'Administer Campus Calendar',
    description: 'Manage institutional timetable, room bookings, examinations, and term dates.' },

  { key: 'ai.customize', group: 'communications', label: 'Configure AI Knowledge & Tools',
    description: 'Tune AI Advisor system guidelines, FAQ ground truth, tools, and response boundaries.' },
  { key: 'faqs.edit', group: 'communications', label: 'Manage FAQs & Knowledge Base',
    description: 'Create and update university Q&A, safety protocols, and student guidance articles.' },
  { key: 'messaging.staff', group: 'communications', label: 'Staff Communications Channel',
    description: 'Access real-time internal staff messaging channels and institutional announcements.' },
  { key: 'telemetry.view', group: 'communications', label: 'View Telemetry & Analytics',
    description: 'Inspect Firebase telemetry events, error monitoring, and page conversion graphs.' },

  { key: 'users.manage', group: 'governance', label: 'Manage User Profiles & Roles',
    description: 'Assign system roles, audit account logins, and manage staff credentials.' },
  { key: 'roles.manage', group: 'governance', label: 'Configure Role Permissions',
    description: 'Grant and revoke specific permissions for each of the 11 system roles.' },
  { key: 'sheets.sync', group: 'governance', label: 'Google Sheets 24/7 Sync',
    description: 'Trigger bidirectional real-time data sync with Google Sheets master database.' },
  { key: 'api_keys.manage', group: 'governance', label: 'Manage API Keys & Integrations',
    description: 'Configure Gemini API keys, Firebase service accounts, and external credentials.' },
  { key: 'campus_metrics.manage', group: 'governance', label: 'Manage Front Page Campus Metrics',
    description: 'Adjust front page headline statistics (Total Students, Employment Placement Rate, Total Faculty & Admin Staff).' },
];

export const PERMISSION_KEYS = PERMISSIONS.map(p => p.key);
export const PERMISSION_BY_KEY = Object.fromEntries(PERMISSIONS.map(p => [p.key, p]));

// Highest level first. The key is the Firestore document ID in gcoursebuilder_roles.
export const ROLES = [
  { key: 'superadmin', label: 'Superadmin', level: 100,
    description: 'Unrestricted access across every system, including role permissions. Always holds every permission.' },
  { key: 'chancellor', label: 'Chancellor', level: 90,
    description: 'Institutional oversight of academic standing, admissions and finance.' },
  { key: 'president', label: 'President', level: 85,
    description: 'Executive leadership across admissions decisions, finance approvals and campus operations.' },
  { key: 'ceo', label: 'CEO', level: 80,
    description: 'Executive operations, admissions decisions and budget approvals.' },
  { key: 'coo', label: 'COO', level: 75,
    description: 'Campus operations: events, calendar, staff communications and data sync.' },
  { key: 'cfo', label: 'CFO', level: 70,
    description: 'Finance leadership: ledgers, approvals and the emergency fund.' },
  { key: 'accounting', label: 'Accounting', level: 60,
    description: 'Day-to-day finance: ledgers, approvals and emergency tokens.' },
  { key: 'administration', label: 'Administration', level: 50,
    description: 'Admissions office, student records and user accounts, plus campus content.' },
  { key: 'teacher', label: 'Teacher', level: 40,
    description: 'Builds and teaches courses in Google Classroom and grades students.' },
  { key: 'student', label: 'Student', level: 30,
    description: 'Enrolled learner: courses, grades and campus events.' },
  { key: 'supporter', label: 'Supporter', level: 10,
    description: 'Default role for every new Google sign-in: can view courses.' },
];

export const ROLE_KEYS = ROLES.map(r => r.key);
export const ROLE_BY_KEY = Object.fromEntries(ROLES.map(r => [r.key, r]));
// Roles that can be given to an email address. Superadmin never is: it is the owner.
export const ASSIGNABLE_ROLE_KEYS = ROLE_KEYS.filter(k => k !== SUPERADMIN_ROLE);

// What /roles is seeded with when a document is missing. The Superadmin changes it from there.
export const BASELINE_ROLE_PERMISSIONS = {
  superadmin: PERMISSION_KEYS,
  chancellor: [
    'courses.view', 'grades.view', 'applications.view', 'finance.view', 'events.manage', 'calendar.manage',
    'messaging.staff', 'telemetry.view',
  ],
  president: [
    'courses.view', 'grades.view', 'applications.view', 'applications.review', 'finance.view', 'finance.approve',
    'events.manage', 'calendar.manage', 'messaging.staff', 'telemetry.view', 'sheets.sync',
  ],
  ceo: [
    'courses.view', 'applications.view', 'applications.review', 'finance.view', 'finance.approve', 'events.manage',
    'calendar.manage', 'messaging.staff', 'telemetry.view',
  ],
  coo: [
    'courses.view', 'applications.view', 'events.manage', 'calendar.manage', 'messaging.staff', 'telemetry.view',
    'sheets.sync',
  ],
  cfo: ['applications.view', 'finance.view', 'finance.approve', 'tokens.manage', 'messaging.staff', 'telemetry.view'],
  accounting: ['applications.view', 'finance.view', 'finance.approve', 'tokens.manage', 'messaging.staff'],
  administration: [
    'courses.view', 'applications.view', 'applications.review', 'applications.export', 'students.manage',
    'events.manage', 'calendar.manage', 'faqs.edit', 'messaging.staff', 'users.manage', 'sheets.sync',
    'campus_metrics.manage',
  ],
  teacher: [
    'courses.view', 'courses.create', 'courses.publish', 'grades.view', 'grades.edit', 'classroom.manage',
    'events.manage', 'messaging.staff',
  ],
  student: ['courses.view', 'grades.view', 'events.manage'],
  supporter: ['courses.view'],
};

// Older role names (profile categories, the registration form) and their role
const ROLE_ALIASES = {
  'super admin': 'superadmin',
  super_admin: 'superadmin',
  'admin staff': 'administration',
  admin: 'administration',
  administrator: 'administration',
  school_admin: 'administration',
  'financial team': 'accounting',
  finance: 'accounting',
  instructor: 'teacher',
};

// The role key for a stored or typed value ("CEO", "admin staff", "teacher"), or null if unknown
export function normalizeRoleKey(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  if (ROLE_BY_KEY[text]) return text;
  return ROLE_ALIASES[text] || null;
}

const EMAIL_PATTERN = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

// An email address as a /role_assignments document ID (trimmed, lower case), or null if invalid
export function normalizeEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

// A permission list in catalog order, without duplicates or unknown keys
export function sortPermissions(list) {
  const granted = new Set(list || []);
  return PERMISSION_KEYS.filter(k => granted.has(k));
}

// What a role may do given its stored list. Superadmin always has everything, so the role that
// edits permissions cannot lock itself out (firestore.rules does the same).
export function effectivePermissions(roleKey, stored) {
  return roleKey === SUPERADMIN_ROLE ? [...PERMISSION_KEYS] : sortPermissions(stored);
}
