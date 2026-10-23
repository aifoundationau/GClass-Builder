// Tests firestore.rules against the Firestore emulator (needs Java 21+). Uses a demo project, so
// nothing real is read or written. firestore.rules here is a copy of the shared rules every app uses
// (npm run check:rbac compares it with the AI Foundation folder): these checks cover this app's
// roles, and the profile and token protections it relies on.
//
//   npm run test:rules
//   (firebase emulators:exec --only firestore --project demo-gcoursebuilder "node scripts/test-firestore-rules.mjs")

import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import {
  BASELINE_ROLE_PERMISSIONS, PERMISSION_KEYS, ROLES, ROLES_COLLECTION, ROLE_ASSIGNMENTS_COLLECTION, ROLE_BY_KEY,
  SUPERADMIN_EMAILS, SUPERADMIN_UIDS,
} from '../src/rbac/permissions.js';

const env = await initializeTestEnvironment({
  projectId: 'demo-gcoursebuilder',
  firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
});

const checks = [];
const check = async (name, fn) => { await fn(); checks.push(name); };

// A signed-in Google user: verified email, and any extra claims given
const as = (uid, { email = `${uid}@example.com`, verified = true, ...claims } = {}) => env.authenticatedContext(uid, {
  email, email_verified: verified, ...claims,
}).firestore();

const OWNER = SUPERADMIN_UIDS[0];
const superadmin = as(OWNER, { email: SUPERADMIN_EMAILS[0] }); // the owner
const office = as('ad'); // assigned "administration" by email below
const teacher = as('te'); // assigned "teacher" by email below
const newcomer = as('su'); // no assignment: supporter
const anonymous = env.unauthenticatedContext().firestore();

const roleDoc = (key, permissions, uid) => ({
  roleName: ROLE_BY_KEY[key].label, permissions, updatedAt: serverTimestamp(), updatedBy: uid,
});
const assignment = (email, role, uid) => ({ email, role, assignedAt: serverTimestamp(), assignedBy: uid });
const assignments = db => collection(db, ROLE_ASSIGNMENTS_COLLECTION);

async function reset() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const r of ROLES) {
      await setDoc(doc(db, ROLES_COLLECTION, r.key), {
        roleName: r.label, permissions: BASELINE_ROLE_PERMISSIONS[r.key], updatedAt: new Date(), updatedBy: 'seed',
      });
    }
    await setDoc(doc(db, ROLE_ASSIGNMENTS_COLLECTION, 'ad@example.com'), { email: 'ad@example.com', role: 'administration', assignedAt: new Date(), assignedBy: OWNER });
    await setDoc(doc(db, ROLE_ASSIGNMENTS_COLLECTION, 'te@example.com'), { email: 'te@example.com', role: 'teacher', assignedAt: new Date(), assignedBy: OWNER });
    for (const uid of [OWNER, 'ad', 'te', 'su']) {
      await setDoc(doc(db, 'users', uid), { email: `${uid}@example.com`, role: 'supporter', status: 'supporter', token_balance: 40 });
    }
  });
}

await reset();

await check('only the owner writes the roles', async () => {
  const teacherPermissions = ['courses.view', 'courses.create'];
  await assertSucceeds(setDoc(doc(superadmin, ROLES_COLLECTION, 'teacher'), roleDoc('teacher', teacherPermissions, OWNER)));
  await assertFails(setDoc(doc(teacher, ROLES_COLLECTION, 'teacher'), roleDoc('teacher', PERMISSION_KEYS, 'te')));
  await assertFails(setDoc(doc(newcomer, ROLES_COLLECTION, 'supporter'), roleDoc('supporter', PERMISSION_KEYS, 'su')));
  await assertFails(setDoc(doc(anonymous, ROLES_COLLECTION, 'supporter'), roleDoc('supporter', [], 'x')));
  // roles.manage is not enough: writes need the owner
  await assertSucceeds(setDoc(doc(superadmin, ROLES_COLLECTION, 'administration'), roleDoc('administration', ['roles.manage', 'users.manage'], OWNER)));
  await assertFails(setDoc(doc(office, ROLES_COLLECTION, 'teacher'), roleDoc('teacher', PERMISSION_KEYS, 'ad')));
});

await check('the owner is recognised by uid or verified email; a role claim grants nothing', async () => {
  const byEmail = as('owner-other-uid', { email: SUPERADMIN_EMAILS[1] });
  await assertSucceeds(setDoc(doc(byEmail, ROLES_COLLECTION, 'student'), roleDoc('student', ['courses.view'], 'owner-other-uid')));
  const unverified = as('owner-unverified', { email: SUPERADMIN_EMAILS[1], verified: false });
  await assertFails(setDoc(doc(unverified, ROLES_COLLECTION, 'student'), roleDoc('student', ['courses.view'], 'owner-unverified')));
  const claimed = as('claimed', { role: 'superadmin', gcoursebuilder_role: 'superadmin' });
  await assertFails(setDoc(doc(claimed, ROLES_COLLECTION, 'student'), roleDoc('student', PERMISSION_KEYS, 'claimed')));
});

await check('role documents must match the schema', async () => {
  const save = (id, data) => setDoc(doc(superadmin, ROLES_COLLECTION, id), data);
  await assertFails(save('teacher', roleDoc('teacher', ['courses.view', 'ai.operations'], OWNER)));
  await assertFails(save('janitor', { ...roleDoc('teacher', [], OWNER), roleName: 'Janitor' }));
  await assertFails(save('teacher', { ...roleDoc('teacher', [], OWNER), level: 40 }));
  await assertFails(save('teacher', roleDoc('teacher', [], 'someone-else')));
  await assertFails(save('teacher', { ...roleDoc('teacher', [], OWNER), updatedAt: new Date() }));
  await assertFails(save('teacher', roleDoc('teacher', ['courses.view', 'courses.view'], OWNER)));
  await assertFails(save('superadmin', roleDoc('superadmin', ['courses.view'], OWNER)));
  await assertSucceeds(save('superadmin', roleDoc('superadmin', PERMISSION_KEYS, OWNER)));
});

await check('Save All writes every role in one batch', async () => {
  const batch = writeBatch(superadmin);
  for (const r of ROLES) batch.set(doc(superadmin, ROLES_COLLECTION, r.key), roleDoc(r.key, BASELINE_ROLE_PERMISSIONS[r.key], OWNER));
  await assertSucceeds(batch.commit());
});

await check('roles are readable when signed in and never deleted', async () => {
  await assertSucceeds(getDoc(doc(newcomer, ROLES_COLLECTION, 'supporter')));
  await assertFails(getDoc(doc(anonymous, ROLES_COLLECTION, 'supporter')));
  await assertFails(deleteDoc(doc(superadmin, ROLES_COLLECTION, 'teacher')));
});

await reset();

await check('permissions follow the roles and the email assignment live', async () => {
  // Listing role assignments needs users.manage: administration (by email) has it in the baseline; teacher does not
  await assertSucceeds(getDocs(assignments(office)));
  await assertFails(getDocs(assignments(teacher)));
  // Revoking users.manage from administration closes it at once
  await setDoc(doc(superadmin, ROLES_COLLECTION, 'administration'), roleDoc('administration', ['courses.view'], OWNER));
  await assertFails(getDocs(assignments(office)));
  // Moving the teacher's email to CEO, and giving CEO users.manage, opens it
  await setDoc(doc(superadmin, ROLES_COLLECTION, 'ceo'), roleDoc('ceo', ['users.manage'], OWNER));
  await setDoc(doc(superadmin, ROLE_ASSIGNMENTS_COLLECTION, 'te@example.com'), assignment('te@example.com', 'ceo', OWNER));
  await assertSucceeds(getDocs(assignments(teacher)));
  // An unverified email does not get the assignment
  await assertFails(getDocs(assignments(as('te2', { email: 'te@example.com', verified: false }))));
  // Removing the assignment makes them a supporter again
  await deleteDoc(doc(superadmin, ROLE_ASSIGNMENTS_COLLECTION, 'te@example.com'));
  await assertFails(getDocs(assignments(teacher)));
});

await check('without an assignment a user is a supporter, not a teacher', async () => {
  await assertFails(getDocs(assignments(newcomer)));
  await setDoc(doc(superadmin, ROLES_COLLECTION, 'supporter'), roleDoc('supporter', ['courses.view', 'users.manage'], OWNER));
  await assertSucceeds(getDocs(assignments(newcomer)));
  await setDoc(doc(superadmin, ROLES_COLLECTION, 'supporter'), roleDoc('supporter', ['courses.view'], OWNER));
  await setDoc(doc(superadmin, ROLES_COLLECTION, 'teacher'), roleDoc('teacher', ['courses.view', 'users.manage'], OWNER));
  await assertFails(getDocs(assignments(newcomer)));
});

await check('the owner keeps every permission even without its role document', async () => {
  await env.withSecurityRulesDisabled(ctx => deleteDoc(doc(ctx.firestore(), ROLES_COLLECTION, 'superadmin')));
  await assertSucceeds(getDocs(assignments(superadmin)));
});

await reset();

await check('only the owner gives roles to email addresses', async () => {
  const assign = (db, email, role, uid) => setDoc(doc(db, ROLE_ASSIGNMENTS_COLLECTION, email), assignment(email, role, uid));
  await assertSucceeds(assign(superadmin, 'new.teacher@example.com', 'teacher', OWNER));
  await assertFails(assign(office, 'friend@example.com', 'chancellor', 'ad'));
  await assertFails(assign(teacher, 'te@example.com', 'president', 'te'));
  await assertFails(assign(superadmin, 'boss@example.com', 'superadmin', OWNER));
  await assertFails(assign(superadmin, 'x@example.com', 'janitor', OWNER));
  await assertFails(assign(superadmin, 'Mixed@Example.com', 'teacher', OWNER));
  await assertFails(setDoc(doc(superadmin, ROLE_ASSIGNMENTS_COLLECTION, 'a@example.com'), assignment('b@example.com', 'teacher', OWNER)));
  await assertFails(setDoc(doc(superadmin, ROLE_ASSIGNMENTS_COLLECTION, 'a@example.com'), { ...assignment('a@example.com', 'teacher', OWNER), note: 'x' }));
  await assertSucceeds(deleteDoc(doc(superadmin, ROLE_ASSIGNMENTS_COLLECTION, 'new.teacher@example.com')));
  await assertFails(deleteDoc(doc(office, ROLE_ASSIGNMENTS_COLLECTION, 'te@example.com')));
});

await check('people read their own assignment; listing needs users.manage', async () => {
  await assertSucceeds(getDoc(doc(teacher, ROLE_ASSIGNMENTS_COLLECTION, 'te@example.com')));
  await assertFails(getDoc(doc(teacher, ROLE_ASSIGNMENTS_COLLECTION, 'ad@example.com')));
  await assertFails(getDocs(assignments(teacher)));
  await assertSucceeds(getDocs(assignments(office)));
  await assertSucceeds(getDocs(assignments(superadmin)));
});

await check('profiles: people keep their own, never their role or tokens; the owner reads everyone', async () => {
  await assertSucceeds(setDoc(doc(teacher, 'users', 'te'), { displayName: 'T. Eacher', lastLoginAt: 'now' }, { merge: true }));
  await assertFails(updateDoc(doc(teacher, 'users', 'te'), { role: 'superadmin' }));
  await assertFails(updateDoc(doc(teacher, 'users', 'te'), { token_balance: 1000000 }));
  await assertFails(updateDoc(doc(teacher, 'users', 'te'), { tags: ['admin'] }));
  await assertFails(getDoc(doc(teacher, 'users', 'ad')));
  // users.manage in this app is not a key to everyone's profile
  await assertFails(getDocs(collection(office, 'users')));
  await assertSucceeds(getDocs(collection(superadmin, 'users')));
  await assertSucceeds(setDoc(doc(as('nu'), 'users', 'nu'), { email: 'nu@example.com', displayName: 'New' }));
  await assertFails(setDoc(doc(as('nu2'), 'users', 'nu2'), { email: 'nu2@example.com', token_balance: 50 }));
  await assertFails(setDoc(doc(as('nu3'), 'users', 'nu3'), { email: 'nu3@example.com', status: 'active' }));
  await assertFails(deleteDoc(doc(teacher, 'users', 'te')));
});

await check('tokens: only servers write the ledger and checkouts; people read their own', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'token_ledger', 'spend_gcoursebuilder_x'), { uid: 'te', change: -10, kind: 'spend' });
    await setDoc(doc(ctx.firestore(), 'token_checkouts', 'gcoursebuilder_te'), { uid: 'te', pendingCheckouts: [] });
  });
  await assertSucceeds(getDoc(doc(teacher, 'token_ledger', 'spend_gcoursebuilder_x')));
  await assertFails(getDoc(doc(office, 'token_ledger', 'spend_gcoursebuilder_x')));
  await assertFails(setDoc(doc(teacher, 'token_ledger', 'grant_free'), { uid: 'te', change: 1000 }));
  await assertFails(setDoc(doc(superadmin, 'token_ledger', 'grant_free'), { uid: OWNER, change: 1000 }));
  await assertSucceeds(getDoc(doc(teacher, 'token_checkouts', 'gcoursebuilder_te')));
  await assertFails(setDoc(doc(teacher, 'token_checkouts', 'gcoursebuilder_te'), { uid: 'te', pendingCheckouts: ['cs_x'] }));
});

await check("other apps' collections keep the shared fallback", async () => {
  // Another app's own "roles", for example: untouched by this app's rules
  await assertSucceeds(setDoc(doc(newcomer, 'roles', 'teacher'), { roleId: 'teacher', permissions: ['x'] }));
  await assertFails(setDoc(doc(anonymous, 'roles', 'teacher'), { roleId: 'teacher' }));
});

await env.cleanup();
console.log(`Firestore rules: ${checks.length} checks passed`);
