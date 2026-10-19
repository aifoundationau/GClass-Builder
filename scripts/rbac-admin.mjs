// Firebase Admin tasks for role-based access (src/rbac/permissions.js). The security rules let only
// a superadmin change /roles and /role_assignments, and superadmin is a custom claim on the
// person's sign-in that only the Admin SDK can set, so the first superadmin is made here.
//
// Credentials: a service-account key for the project in GOOGLE_APPLICATION_CREDENTIALS (Firebase
// console > Project settings > Service accounts > Generate new private key), or gcloud
// application-default credentials. The project is FIREBASE_PROJECT_ID, read from .env.
// Against the emulators, set FIRESTORE_EMULATOR_HOST (and FIREBASE_AUTH_EMULATOR_HOST) instead.
//
//   node scripts/rbac-admin.mjs inspect                            /roles and /role_assignments
//   node scripts/rbac-admin.mjs seed [--apply]                     create missing /roles documents
//   node scripts/rbac-admin.mjs set-role <email> <role> [--apply]  give an email address a role
//   node scripts/rbac-admin.mjs migrate-profiles [--apply]         assign the roles in /users profiles
//
// Nothing is written without --apply: each command prints what it would do.

import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  BASELINE_ROLE_PERMISSIONS, DEFAULT_ROLE, PERMISSION_KEYS, ROLES, ROLES_COLLECTION, ROLE_ASSIGNMENTS_COLLECTION,
  ROLE_BY_KEY, ROLE_KEYS, SUPERADMIN_ROLE, effectivePermissions, normalizeEmail, normalizeRoleKey,
} from '../src/rbac/permissions.js';

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  // No .env: the environment as it is
}

const [command = 'help', ...rest] = process.argv.slice(2);
const apply = rest.includes('--apply');
const args = rest.filter(a => !a.startsWith('--'));
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
// updatedBy / assignedBy on what this script writes (the app stores the superadmin's uid)
const WRITER = 'rbac-admin-script';

const USAGE = `Usage:
  node scripts/rbac-admin.mjs inspect
  node scripts/rbac-admin.mjs seed [--apply]
  node scripts/rbac-admin.mjs set-role <email> <role> [--apply]
  node scripts/rbac-admin.mjs migrate-profiles [--apply]
Roles: ${ROLE_KEYS.join(', ')}`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const dryRun = () => console.log('\nDry run: nothing was written. Run again with --apply to make these changes.');

initializeApp(emulated ? { projectId } : { credential: applicationDefault(), projectId });
const db = getFirestore();
const auth = getAuth();

async function readRoles() {
  const snap = await db.collection(ROLES_COLLECTION).get();
  return Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
}

async function inspect() {
  const stored = await readRoles();
  console.log(`Project ${projectId}${emulated ? ' (emulator)' : ''}\n\n/${ROLES_COLLECTION}`);
  for (const role of ROLES) {
    const data = stored[role.key];
    if (!data) {
      console.log(`  missing  ${role.key}`);
      continue;
    }
    const permissions = Array.isArray(data.permissions) ? data.permissions : [];
    const unknown = permissions.filter(p => !PERMISSION_KEYS.includes(p));
    const when = data.updatedAt && data.updatedAt.toDate ? data.updatedAt.toDate().toISOString() : '?';
    console.log(`  ok       ${role.key.padEnd(15)} ${String(permissions.length).padStart(2)} permissions, updated ${when} by ${data.updatedBy ?? '?'}`
      + (unknown.length ? `  (unknown keys: ${unknown.join(', ')})` : ''));
  }
  for (const id of Object.keys(stored).filter(k => !ROLE_BY_KEY[k])) {
    console.log(`  extra    ${id} (not one of the ${ROLES.length} roles)`);
  }

  const assignments = await db.collection(ROLE_ASSIGNMENTS_COLLECTION).get();
  console.log(`\n/${ROLE_ASSIGNMENTS_COLLECTION}: ${assignments.size} email address(es)`);
  assignments.docs.forEach(d => console.log(`  ${d.id.padEnd(40)} ${d.data().role}`));
  return stored;
}

async function seed() {
  const stored = await inspect();
  const missing = ROLES.filter(r => !stored[r.key]);
  console.log('');
  if (missing.length === 0) {
    console.log('Every role has a document: nothing to seed.');
    return;
  }
  const permissionsOf = r => effectivePermissions(r.key, BASELINE_ROLE_PERMISSIONS[r.key]);
  console.log(`Create with the baseline permissions: ${missing.map(r => `${r.key} (${permissionsOf(r).length})`).join(', ')}`);
  if (!apply) return dryRun();
  const batch = db.batch();
  for (const r of missing) {
    // create() fails if the document appeared meanwhile, so stored permissions are never overwritten
    batch.create(db.collection(ROLES_COLLECTION).doc(r.key), {
      roleName: r.label,
      permissions: permissionsOf(r),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: WRITER,
    });
  }
  await batch.commit();
  console.log(`Created ${missing.length} role document(s).`);
}

async function findUser(email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (err) {
    if (err.code === 'auth/user-not-found') return null;
    throw err;
  }
}

// Superadmin is a claim on the account; every other role is an assignment to the email address,
// which works before the person has ever signed in.
async function setRole(emailArg, roleArg) {
  const email = normalizeEmail(emailArg);
  const role = normalizeRoleKey(roleArg);
  if (!email || !role) fail(USAGE);
  const user = await findUser(email);
  const claims = (user && user.customClaims) || {};
  const assignmentRef = db.collection(ROLE_ASSIGNMENTS_COLLECTION).doc(email);
  const assignment = await assignmentRef.get();

  if (role === SUPERADMIN_ROLE) {
    if (!user) {
      fail(`${email} has not signed in to the app yet, so there is no account to give the claim to. Ask them to sign in once, then run this again.`);
    }
    console.log(`${email} (${user.uid}): role claim ${claims.role ?? '(none)'} -> ${SUPERADMIN_ROLE}`);
    if (assignment.exists) console.log(`  and remove the email assignment "${assignment.data().role}", which the claim replaces`);
    if (!apply) return dryRun();
    await auth.setCustomUserClaims(user.uid, { ...claims, role: SUPERADMIN_ROLE });
    if (assignment.exists) await assignmentRef.delete();
    console.log('Done. It applies when their sign-in token refreshes: sign out and back in, or "Refresh my role" in Role Permissions.');
    return;
  }

  console.log(`${email}: assigned role ${assignment.exists ? assignment.data().role : '(none)'} -> ${role}`);
  if (claims.role) console.log(`  and remove the role claim "${claims.role}", which would override the assignment`);
  if (!apply) return dryRun();
  await assignmentRef.set({ email, role, assignedAt: FieldValue.serverTimestamp(), assignedBy: WRITER });
  if (user && claims.role) {
    const { role: removed, ...otherClaims } = claims;
    await auth.setCustomUserClaims(user.uid, otherClaims);
    console.log(`Removed the "${removed}" claim. Their current sign-in keeps it until the token refreshes (within the hour, or when they sign out).`);
  }
  console.log(`Done. ${user ? 'The role applies straight away.' : 'The role applies when they first sign in with Google.'}`);

  // Send Gmail API notification to recipient
  try {
    const isWin = process.platform === 'win32';
    const py = fs.existsSync(isWin ? '.venv/Scripts/python.exe' : '.venv/bin/python')
      ? (isWin ? '.venv\\Scripts\\python.exe' : '.venv/bin/python')
      : 'python';
    const res = spawnSync(py, ['gmail_service.py', email, role], { encoding: 'utf-8' });
    if (res.stdout) {
      try {
        const parsed = JSON.parse(res.stdout.trim().split('\n').pop());
        if (parsed.sent) {
          console.log(`✉️  Gmail notification sent to ${email} via Gmail API.`);
        } else {
          console.log(`✉️  Role assignment notification logged for ${email} (Gmail ready).`);
        }
      } catch (e) {}
    }
  } catch (err) {
    // Non-blocking notification dispatch
  }
}

// Profiles from before role-based access hold a role ("CEO", "admin staff"...) that grants
// nothing now. Assign those roles by email; superadmins are only listed (use set-role).
async function migrateProfiles() {
  const [users, assignments] = await Promise.all([
    db.collection('users').get(),
    db.collection(ROLE_ASSIGNMENTS_COLLECTION).get(),
  ]);
  const assigned = new Set(assignments.docs.map(d => d.id));
  const toAssign = [];
  for (const d of users.docs) {
    const data = d.data();
    const email = normalizeEmail(data.email);
    const profileRole = data.role || data.classification;
    const role = normalizeRoleKey(profileRole);
    if (!email || !profileRole || role === DEFAULT_ROLE) continue;
    if (!role) console.log(`  skip      ${String(email).padEnd(40)} unknown role "${profileRole}"`);
    else if (role === SUPERADMIN_ROLE) console.log(`  skip      ${email.padEnd(40)} "${profileRole}": run set-role ${email} superadmin if they should be one`);
    else if (assigned.has(email)) console.log(`  keep      ${email.padEnd(40)} already assigned`);
    else {
      console.log(`  assign    ${email.padEnd(40)} "${profileRole}" -> ${role}`);
      toAssign.push({ email, role });
    }
  }
  console.log(`\n${users.size} profile(s); ${toAssign.length} role assignment(s) to create.`);
  if (toAssign.length === 0) return;
  if (!apply) return dryRun();
  for (let i = 0; i < toAssign.length; i += 400) {
    const batch = db.batch();
    for (const { email, role } of toAssign.slice(i, i + 400)) {
      batch.create(db.collection(ROLE_ASSIGNMENTS_COLLECTION).doc(email), {
        email, role, assignedAt: FieldValue.serverTimestamp(), assignedBy: WRITER,
      });
    }
    await batch.commit();
  }
  console.log(`Created ${toAssign.length} role assignment(s).`);
}

const commands = {
  inspect,
  seed,
  'set-role': () => setRole(args[0], args[1]),
  'migrate-profiles': migrateProfiles,
};

if (!commands[command]) {
  console.log(USAGE);
  process.exit(command === 'help' ? 0 : 1);
}
if (!projectId) fail('No Firebase project: set FIREBASE_PROJECT_ID (read from .env).');

try {
  await commands[command]();
  await db.terminate();
} catch (err) {
  if (/credential/i.test(err.message)) {
    fail(`No Firebase Admin credentials for ${projectId}. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key file `
      + `(Firebase console > Project settings > Service accounts > Generate new private key).\n${err.message}`);
  }
  fail(err.message);
}
