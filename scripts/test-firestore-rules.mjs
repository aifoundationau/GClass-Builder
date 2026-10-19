// Tests firestore.rules against the Firestore emulator (needs Java 21+). Uses a demo project, so
// nothing real is read or written:
//
//   npm run test:rules
//   (firebase emulators:exec --only firestore --project demo-gcoursebuilder "node scripts/test-firestore-rules.mjs")

import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { BASELINE_ROLE_PERMISSIONS, PERMISSION_KEYS, ROLES, ROLE_BY_KEY } from '../src/rbac/permissions.js';

const env = await initializeTestEnvironment({
  projectId: 'demo-gcoursebuilder',
  firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
});

const checks = [];
const check = async (name, fn) => { await fn(); checks.push(name); };

// A signed-in Google user: verified email, and a role claim only when given one
const as = (uid, { role, email = `${uid}@example.com`, verified = true } = {}) => env.authenticatedContext(uid, {
  email, email_verified: verified, ...(role ? { role } : {}),
}).firestore();

const superadmin = as('sa', { role: 'superadmin' });
const office = as('ad'); // assigned "administration" by email below
const teacher = as('te'); // assigned "teacher" by email below
const newcomer = as('su'); // no claim, no assignment: supporter
const anonymous = env.unauthenticatedContext().firestore();

const roleDoc = (key, permissions, uid) => ({
  roleName: ROLE_BY_KEY[key].label, permissions, updatedAt: serverTimestamp(), updatedBy: uid,
});
const assignment = (email, role, uid) => ({ email, role, assignedAt: serverTimestamp(), assignedBy: uid });

async function reset() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const r of ROLES) {
      await setDoc(doc(db, 'roles', r.key), {
        roleName: r.label, permissions: BASELINE_ROLE_PERMISSIONS[r.key], updatedAt: new Date(), updatedBy: 'seed',
      });
    }
    await setDoc(doc(db, 'role_assignments', 'ad@example.com'), { email: 'ad@example.com', role: 'administration', assignedAt: new Date(), assignedBy: 'sa' });
    await setDoc(doc(db, 'role_assignments', 'te@example.com'), { email: 'te@example.com', role: 'teacher', assignedAt: new Date(), assignedBy: 'sa' });
    for (const [uid, role] of [['sa', 'superadmin'], ['ad', 'administration'], ['te', 'teacher'], ['su', 'supporter']]) {
      await setDoc(doc(db, 'users', uid), { email: `${uid}@example.com`, role, classification: role, status: 'active' });
    }
  });
}

await reset();

await check('only the superadmin claim writes /roles', async () => {
  const teacherPermissions = ['courses.view', 'courses.create'];
  await assertSucceeds(setDoc(doc(superadmin, 'roles', 'teacher'), roleDoc('teacher', teacherPermissions, 'sa')));
  await assertFails(setDoc(doc(teacher, 'roles', 'teacher'), roleDoc('teacher', PERMISSION_KEYS, 'te')));
  await assertFails(setDoc(doc(newcomer, 'roles', 'supporter'), roleDoc('supporter', PERMISSION_KEYS, 'su')));
  await assertFails(setDoc(doc(anonymous, 'roles', 'supporter'), roleDoc('supporter', [], 'x')));
  // roles.manage is not enough: writes need the claim itself
  await assertSucceeds(setDoc(doc(superadmin, 'roles', 'administration'), roleDoc('administration', ['roles.manage', 'users.manage'], 'sa')));
  await assertFails(setDoc(doc(office, 'roles', 'teacher'), roleDoc('teacher', PERMISSION_KEYS, 'ad')));
});

await check('role documents must match the schema', async () => {
  const save = (id, data) => setDoc(doc(superadmin, 'roles', id), data);
  await assertFails(save('teacher', roleDoc('teacher', ['courses.view', 'ai.operations'], 'sa')));
  await assertFails(save('janitor', { ...roleDoc('teacher', [], 'sa'), roleName: 'Janitor' }));
  await assertFails(save('teacher', { ...roleDoc('teacher', [], 'sa'), level: 40 }));
  await assertFails(save('teacher', roleDoc('teacher', [], 'someone-else')));
  await assertFails(save('teacher', { ...roleDoc('teacher', [], 'sa'), updatedAt: new Date() }));
  await assertFails(save('teacher', roleDoc('teacher', ['courses.view', 'courses.view'], 'sa')));
  await assertFails(save('superadmin', roleDoc('superadmin', ['courses.view'], 'sa')));
  await assertSucceeds(save('superadmin', roleDoc('superadmin', PERMISSION_KEYS, 'sa')));
});

await check('Save All writes every role in one batch', async () => {
  const batch = writeBatch(superadmin);
  for (const r of ROLES) batch.set(doc(superadmin, 'roles', r.key), roleDoc(r.key, BASELINE_ROLE_PERMISSIONS[r.key], 'sa'));
  await assertSucceeds(batch.commit());
});

await check('roles are readable when signed in and never deleted', async () => {
  await assertSucceeds(getDoc(doc(newcomer, 'roles', 'supporter')));
  await assertFails(getDoc(doc(anonymous, 'roles', 'supporter')));
  await assertFails(deleteDoc(doc(superadmin, 'roles', 'teacher')));
});

await reset();

await check('hasPermission follows /roles and the email assignment live', async () => {
  // administration (by email) has users.manage in the baseline; teacher does not
  await assertSucceeds(getDoc(doc(office, 'users', 'te')));
  await assertSucceeds(getDocs(collection(office, 'users')));
  await assertFails(getDoc(doc(teacher, 'users', 'ad')));
  // Revoking users.manage from administration closes it at once
  await setDoc(doc(superadmin, 'roles', 'administration'), roleDoc('administration', ['courses.view'], 'sa'));
  await assertFails(getDoc(doc(office, 'users', 'te')));
  // Moving the teacher's email to CEO, and giving CEO users.manage, opens it
  await setDoc(doc(superadmin, 'roles', 'ceo'), roleDoc('ceo', ['users.manage'], 'sa'));
  await setDoc(doc(superadmin, 'role_assignments', 'te@example.com'), assignment('te@example.com', 'ceo', 'sa'));
  await assertSucceeds(getDoc(doc(teacher, 'users', 'ad')));
  // An unverified email does not get the assignment
  await assertFails(getDoc(doc(as('te2', { email: 'te@example.com', verified: false }), 'users', 'ad')));
  // Removing the assignment makes them a supporter again
  await deleteDoc(doc(superadmin, 'role_assignments', 'te@example.com'));
  await assertFails(getDoc(doc(teacher, 'users', 'ad')));
});

await check('without a claim or assignment a user is a supporter', async () => {
  await assertSucceeds(getDoc(doc(newcomer, 'users', 'su')));
  await assertFails(getDoc(doc(newcomer, 'users', 'te')));
  await setDoc(doc(superadmin, 'roles', 'supporter'), roleDoc('supporter', ['courses.view', 'users.manage'], 'sa'));
  await assertSucceeds(getDoc(doc(newcomer, 'users', 'te')));
  await setDoc(doc(superadmin, 'roles', 'supporter'), roleDoc('supporter', ['courses.view'], 'sa'));
});

await check('superadmin keeps every permission even without its /roles document', async () => {
  await env.withSecurityRulesDisabled(ctx => deleteDoc(doc(ctx.firestore(), 'roles', 'superadmin')));
  await assertSucceeds(getDocs(collection(superadmin, 'users')));
});

await reset();

await check('only the superadmin claim assigns roles to email addresses', async () => {
  const assign = (db, email, role, uid) => setDoc(doc(db, 'role_assignments', email), assignment(email, role, uid));
  await assertSucceeds(assign(superadmin, 'new.teacher@example.com', 'teacher', 'sa'));
  await assertFails(assign(office, 'friend@example.com', 'chancellor', 'ad'));
  await assertFails(assign(teacher, 'te@example.com', 'president', 'te'));
  await assertFails(assign(superadmin, 'boss@example.com', 'superadmin', 'sa'));
  await assertFails(assign(superadmin, 'x@example.com', 'janitor', 'sa'));
  await assertFails(assign(superadmin, 'Mixed@Example.com', 'teacher', 'sa'));
  await assertFails(setDoc(doc(superadmin, 'role_assignments', 'a@example.com'), assignment('b@example.com', 'teacher', 'sa')));
  await assertFails(setDoc(doc(superadmin, 'role_assignments', 'a@example.com'), { ...assignment('a@example.com', 'teacher', 'sa'), note: 'x' }));
  await assertSucceeds(deleteDoc(doc(superadmin, 'role_assignments', 'new.teacher@example.com')));
  await assertFails(deleteDoc(doc(office, 'role_assignments', 'te@example.com')));
});

await check('people read their own assignment; listing needs users.manage', async () => {
  await assertSucceeds(getDoc(doc(teacher, 'role_assignments', 'te@example.com')));
  await assertFails(getDoc(doc(teacher, 'role_assignments', 'ad@example.com')));
  await assertFails(getDocs(collection(teacher, 'role_assignments')));
  await assertSucceeds(getDocs(collection(office, 'role_assignments')));
  await assertSucceeds(getDocs(collection(superadmin, 'role_assignments')));
});

await check('users keep their profile but cannot change their own role', async () => {
  const fresh = as('nu');
  await assertSucceeds(setDoc(doc(fresh, 'users', 'nu'), { email: 'nu@example.com', role: 'supporter', classification: 'supporter', status: 'active' }));
  await assertFails(setDoc(doc(as('nu2'), 'users', 'nu2'), { email: 'nu2@example.com', role: 'superadmin' }));
  await assertFails(setDoc(doc(as('nu3'), 'users', 'nu3'), { email: 'nu3@example.com', isSuperAdmin: true }));
  await assertSucceeds(setDoc(doc(teacher, 'users', 'te'), { displayName: 'T. Eacher', lastLoginAt: 'now' }, { merge: true }));
  await assertFails(updateDoc(doc(teacher, 'users', 'te'), { role: 'superadmin' }));
  await assertFails(updateDoc(doc(teacher, 'users', 'te'), { isAdmin: true }));
  await assertFails(updateDoc(doc(teacher, 'users', 'ad'), { displayName: 'x' }));
  await assertSucceeds(updateDoc(doc(office, 'users', 'te'), { role: 'ceo' }));
  await assertFails(updateDoc(doc(office, 'users', 'te'), { isSuperAdmin: true }));
  await assertSucceeds(updateDoc(doc(superadmin, 'users', 'te'), { isAdmin: false }));
  await assertFails(deleteDoc(doc(teacher, 'users', 'te')));
});

await check('older admin lists: own entry only, written by superadmin', async () => {
  await assertSucceeds(getDoc(doc(teacher, 'admins', 'te@example.com')));
  await assertSucceeds(getDoc(doc(teacher, 'superadmins', 'te')));
  await assertFails(getDoc(doc(teacher, 'admins', 'ad@example.com')));
  await assertFails(getDocs(collection(teacher, 'admins')));
  await assertFails(getDoc(doc(anonymous, 'superadmins', 'x')));
  await assertFails(getDoc(doc(teacher, 'system_config', 'admin')));
  await assertFails(setDoc(doc(teacher, 'superadmins', 'te@example.com'), { email: 'te@example.com' }));
  await assertSucceeds(setDoc(doc(superadmin, 'system_config', 'admin'), { adminEmails: [] }));
  await assertSucceeds(getDoc(doc(superadmin, 'system_config', 'admin')));
});

await check('collections without rules are closed', async () => {
  await assertFails(getDoc(doc(superadmin, 'courses', 'x')));
  await assertFails(setDoc(doc(superadmin, 'courses', 'x'), { a: 1 }));
});

await env.cleanup();
console.log(`Firestore rules: ${checks.length} checks passed`);
checks.forEach(name => console.log(`  ok  ${name}`));
