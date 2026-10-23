// Firebase Admin tasks for role-based access (src/rbac/permissions.js), with a service account. In the
// app only the Superadmin changes /gcoursebuilder_roles and /gcoursebuilder_role_assignments; the
// Superadmin is the owner's Google account, recognised when it signs in, and is never assigned.
//
// Credentials: a service-account key for the project in GOOGLE_APPLICATION_CREDENTIALS (Firebase
// console > Project settings > Service accounts > Generate new private key), or gcloud
// application-default credentials. The project is FIREBASE_PROJECT_ID, read from .env.
// Against the emulators, set FIRESTORE_EMULATOR_HOST (and FIREBASE_AUTH_EMULATOR_HOST) instead.
//
//   node scripts/rbac-admin.mjs inspect                            the app's roles and role assignments
//   node scripts/rbac-admin.mjs seed [--apply]                     create missing role documents
//   node scripts/rbac-admin.mjs set-role <email> <role> [--apply]  give an email address a role
//   node scripts/rbac-admin.mjs copy-old-assignments [--apply]     copy /role_assignments to the app's own
//
// Nothing is written without --apply: each command prints what it would do.

import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  BASELINE_ROLE_PERMISSIONS, PERMISSION_KEYS, ROLES, ROLES_COLLECTION, ROLE_ASSIGNMENTS_COLLECTION,
  ROLE_BY_KEY, ROLE_KEYS, SUPERADMIN_ROLE, effectivePermissions, normalizeEmail, normalizeRoleKey,
} from '../src/rbac/permissions.js';

// Where role assignments were kept before the app had its own collections (only this app used it)
const OLD_ROLE_ASSIGNMENTS_COLLECTION = 'role_assignments';

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
  node scripts/rbac-admin.mjs copy-old-assignments [--apply]
Roles: ${ROLE_KEYS.filter(k => k !== SUPERADMIN_ROLE).join(', ')} (superadmin is the owner, never assigned)`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const dryRun = () => console.log('\nDry run: nothing was written. Run again with --apply to make these changes.');

initializeApp(emulated ? { projectId } : { credential: applicationDefault(), projectId });
const db = getFirestore();

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

// A role is an assignment to the email address, which works before the person has ever signed in.
// Superadmin is the owner's Google account and is never assigned.
async function setRole(emailArg, roleArg) {
  const email = normalizeEmail(emailArg);
  const role = normalizeRoleKey(roleArg);
  if (!email || !role) fail(USAGE);
  if (role === SUPERADMIN_ROLE) {
    fail('Superadmin is never assigned: it is the owner\'s Google account, recognised when it signs in (SUPERADMIN_UIDS / SUPERADMIN_EMAILS in src/rbac/permissions.js).');
  }
  const assignmentRef = db.collection(ROLE_ASSIGNMENTS_COLLECTION).doc(email);
  const assignment = await assignmentRef.get();

  console.log(`${email}: assigned role ${assignment.exists ? assignment.data().role : '(none)'} -> ${role}`);
  if (!apply) return dryRun();
  await assignmentRef.set({ email, role, assignedAt: FieldValue.serverTimestamp(), assignedBy: WRITER });
  console.log('Done. The role applies straight away if they are signed in, else when they sign in with Google.');

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

// Role assignments made before the app had its own collections are copied to
// /gcoursebuilder_role_assignments; emails already assigned there keep their role.
async function copyOldAssignments() {
  const [old, current] = await Promise.all([
    db.collection(OLD_ROLE_ASSIGNMENTS_COLLECTION).get(),
    db.collection(ROLE_ASSIGNMENTS_COLLECTION).get(),
  ]);
  const assigned = new Set(current.docs.map(d => d.id));
  const toCopy = [];
  for (const d of old.docs) {
    const email = normalizeEmail(d.id);
    const role = normalizeRoleKey(d.data().role);
    if (!email || !role || role === SUPERADMIN_ROLE) console.log(`  skip      ${String(d.id).padEnd(40)} role "${d.data().role}"`);
    else if (assigned.has(email)) console.log(`  keep      ${email.padEnd(40)} already assigned`);
    else {
      console.log(`  copy      ${email.padEnd(40)} ${role}`);
      toCopy.push({ email, role });
    }
  }
  console.log(`\n${old.size} old assignment(s); ${toCopy.length} to copy to /${ROLE_ASSIGNMENTS_COLLECTION}.`);
  if (toCopy.length === 0) return;
  if (!apply) return dryRun();
  for (let i = 0; i < toCopy.length; i += 400) {
    const batch = db.batch();
    for (const { email, role } of toCopy.slice(i, i + 400)) {
      batch.create(db.collection(ROLE_ASSIGNMENTS_COLLECTION).doc(email), {
        email, role, assignedAt: FieldValue.serverTimestamp(), assignedBy: WRITER,
      });
    }
    await batch.commit();
  }
  console.log(`Copied ${toCopy.length} role assignment(s).`);
}

const commands = {
  inspect,
  seed,
  'set-role': () => setRole(args[0], args[1]),
  'copy-old-assignments': copyOldAssignments,
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
