// Checks the role-based access catalog (src/rbac/permissions.js), and that firestore.rules lists
// the same role and permission keys and the same owner accounts as the app and the token server
// (lib/auth.js). firestore.rules here is a copy of the shared rules every app uses, deployed only
// from the AI Foundation folder: when that folder is next to this one, the copy must match it.
// Runs without Firebase.
//
//   node scripts/check-rbac.mjs     prints a summary, exits 1 on any mismatch

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  ASSIGNABLE_ROLE_KEYS, BASELINE_ROLE_PERMISSIONS, DEFAULT_ROLE, PERMISSIONS, PERMISSION_GROUPS, PERMISSION_KEYS,
  ROLES, ROLES_COLLECTION, ROLE_ASSIGNMENTS_COLLECTION, ROLE_KEYS, SUPERADMIN_EMAILS, SUPERADMIN_ROLE,
  SUPERADMIN_UIDS, effectivePermissions, isOwnerAccount, normalizeEmail, normalizeRoleKey, sortPermissions,
} from '../src/rbac/permissions.js';

const tokenServerAuth = createRequire(import.meta.url)('../lib/auth.js');
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const checks = [];
const check = (name, fn) => { fn(); checks.push(name); };

// The quoted strings in `function <name>() { return [...]; }` of firestore.rules
const rulesList = (name) => {
  const match = rules.match(new RegExp(`function ${name}\\(\\)\\s*\\{\\s*return\\s*\\[([^\\]]*)\\]`));
  assert.ok(match, `firestore.rules has no ${name}() list`);
  return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
};

// The quoted strings in a function of firestore.rules, by name
const rulesStrings = (name) => {
  const start = rules.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `firestore.rules has no ${name}()`);
  const body = rules.slice(start, rules.indexOf('\n    }', start));
  return [...body.matchAll(/'([^']+)'/g)].map(m => m[1]);
};

check('24 unique permissions in 5 groups', () => {
  assert.equal(PERMISSIONS.length, 24);
  assert.equal(new Set(PERMISSION_KEYS).size, 24);
  const groups = PERMISSION_GROUPS.map(g => g.key);
  for (const p of PERMISSIONS) {
    assert.ok(groups.includes(p.group), `${p.key} has unknown group ${p.group}`);
    assert.ok(p.label && p.description, `${p.key} needs a label and description`);
  }
  const counts = PERMISSION_GROUPS.map(g => PERMISSIONS.filter(p => p.group === g.key).length);
  assert.deepEqual(counts, [6, 4, 5, 4, 5]);
});

check('12 roles with distinct levels, superadmin highest', () => {
  assert.equal(ROLES.length, 12);
  assert.equal(new Set(ROLE_KEYS).size, 12);
  assert.equal(new Set(ROLES.map(r => r.level)).size, 12);
  assert.equal(ROLES[0].key, SUPERADMIN_ROLE);
  assert.equal(ROLES[1].key, 'chiefadmin');
  assert.equal(ROLES[1].level, 95);
  assert.equal(ROLES[2].key, 'administration');
  assert.equal(ROLES[2].level, 92);
  assert.equal(ROLES[3].key, 'chancellor');
  assert.equal(ROLES[3].level, 90);
  assert.equal(DEFAULT_ROLE, 'supporter');
  assert.deepEqual(ASSIGNABLE_ROLE_KEYS, ROLE_KEYS.filter(k => k !== SUPERADMIN_ROLE));
});

check('the Superadmin is the owner: the same accounts as the token server and firestore.rules', () => {
  assert.deepEqual([...SUPERADMIN_UIDS].sort(), [...tokenServerAuth.SUPERADMIN_UIDS].sort());
  assert.deepEqual([...SUPERADMIN_EMAILS].sort(), [...tokenServerAuth.SUPERADMIN_EMAILS].sort());
  const inRules = rulesStrings('isSuperAdmin');
  assert.deepEqual(inRules.filter(s => !s.includes('@')).sort(), [...SUPERADMIN_UIDS].sort());
  assert.deepEqual(inRules.filter(s => s.includes('@')).sort(), [...SUPERADMIN_EMAILS].sort());
  assert.ok(isOwnerAccount({ uid: SUPERADMIN_UIDS[0] }));
  assert.ok(isOwnerAccount({ email: SUPERADMIN_EMAILS[0].toUpperCase(), emailVerified: true }));
  assert.ok(!isOwnerAccount({ email: SUPERADMIN_EMAILS[0], emailVerified: false }), 'an unverified email is not the owner');
  assert.ok(!isOwnerAccount({ uid: 'someone-else', email: 'someone@example.com', emailVerified: true }));
});

check("the app's own collections carry its tag and are protected in firestore.rules", () => {
  for (const name of [ROLES_COLLECTION, ROLE_ASSIGNMENTS_COLLECTION]) {
    assert.ok(name.startsWith('gcoursebuilder_'), name);
    assert.ok(rulesStrings('isProtectedCollection').includes(name), `${name} is not in isProtectedCollection`);
    assert.ok(rules.includes(`match /${name}/{`), `firestore.rules has no rules for ${name}`);
  }
});

check('baseline lists only known permissions, superadmin all', () => {
  assert.deepEqual(Object.keys(BASELINE_ROLE_PERMISSIONS).sort(), [...ROLE_KEYS].sort());
  for (const [role, list] of Object.entries(BASELINE_ROLE_PERMISSIONS)) {
    assert.equal(new Set(list).size, list.length, `${role} lists a permission twice`);
    for (const p of list) assert.ok(PERMISSION_KEYS.includes(p), `${role}: unknown permission ${p}`);
  }
  assert.deepEqual(BASELINE_ROLE_PERMISSIONS.superadmin, PERMISSION_KEYS);
  assert.deepEqual(BASELINE_ROLE_PERMISSIONS.chiefadmin, PERMISSION_KEYS);
  assert.deepEqual(BASELINE_ROLE_PERMISSIONS.supporter, ['courses.view']);
});

check('superadmin always has every permission; others in catalog order', () => {
  assert.deepEqual(effectivePermissions(SUPERADMIN_ROLE, []), PERMISSION_KEYS);
  assert.deepEqual(effectivePermissions('teacher', ['grades.edit', 'nope', 'courses.view', 'courses.view']),
    ['courses.view', 'grades.edit']);
  assert.deepEqual(sortPermissions(undefined), []);
});

check('older profile categories map to roles', () => {
  const legacy = {
    Supporter: 'supporter', student: 'student', teacher: 'teacher', 'admin staff': 'administration', CEO: 'ceo',
    COO: 'coo', CFO: 'cfo', 'Financial team': 'accounting', Superadmin: 'superadmin', instructor: 'teacher',
    school_admin: 'administration', ' President ': 'president', 'Chief Admin': 'chiefadmin', chief_admin: 'chiefadmin',
  };
  for (const [value, role] of Object.entries(legacy)) assert.equal(normalizeRoleKey(value), role, value);
  for (const value of ['', null, undefined, 'janitor']) assert.equal(normalizeRoleKey(value), null);
});

check('email addresses become lower-case document IDs', () => {
  assert.equal(normalizeEmail('  Jane.Doe@Example.EDU.au '), 'jane.doe@example.edu.au');
  for (const bad of ['', 'jane', 'jane@', '@example.com', 'a b@example.com', 'a/b@example.com', 'jane@example']) {
    assert.equal(normalizeEmail(bad), null, bad);
  }
});

check('firestore.rules lists the same roles and permissions', () => {
  assert.deepEqual(rulesList('gcbRoleKeys'), ROLE_KEYS);
  assert.deepEqual(rulesList('gcbPermissionKeys'), PERMISSION_KEYS);
});

// The shared rules in the AI Foundation folder: firestore.rules once it has this app's section, until
// then the draft that adds it
const shared = ['firestore.rules', 'firestore.merged-draft.rules']
  .map(name => new URL(`../../ai-foundation/${name}`, import.meta.url))
  .filter(url => existsSync(url))
  .map(url => ({ url, text: readFileSync(url, 'utf8') }))
  .find(file => file.text.includes(`match /${ROLES_COLLECTION}/{`));
if (shared) {
  check(`firestore.rules is the same as the shared ${shared.url.pathname.split('/').pop()}`, () => {
    assert.ok(shared.text.replace(/\r\n/g, '\n') === rules.replace(/\r\n/g, '\n'),
      'firestore.rules differs from the shared rules in the AI Foundation folder: copy that file here');
  });
}

console.log(`Role-based access catalog: ${checks.length} checks passed`);
checks.forEach(name => console.log(`  ok  ${name}`));
