// Checks the role-based access catalog (src/rbac/permissions.js), and that firestore.rules lists
// the same role and permission keys. Runs without Firebase.
//
//   node scripts/check-rbac.mjs     prints a summary, exits 1 on any mismatch

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ASSIGNABLE_ROLE_KEYS, BASELINE_ROLE_PERMISSIONS, DEFAULT_ROLE, PERMISSIONS, PERMISSION_GROUPS, PERMISSION_KEYS,
  ROLES, ROLE_KEYS, SUPERADMIN_ROLE, effectivePermissions, normalizeEmail, normalizeRoleKey, sortPermissions,
} from '../src/rbac/permissions.js';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const checks = [];
const check = (name, fn) => { fn(); checks.push(name); };

// The quoted strings in `function <name>() { return [...]; }` of firestore.rules
const rulesList = (name) => {
  const match = rules.match(new RegExp(`function ${name}\\(\\)\\s*\\{\\s*return\\s*\\[([^\\]]*)\\]`));
  assert.ok(match, `firestore.rules has no ${name}() list`);
  return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
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

check('11 roles with distinct levels, superadmin highest', () => {
  assert.equal(ROLES.length, 11);
  assert.equal(new Set(ROLE_KEYS).size, 11);
  assert.equal(new Set(ROLES.map(r => r.level)).size, 11);
  assert.equal(ROLES[0].key, SUPERADMIN_ROLE);
  assert.ok(ROLE_KEYS.includes(DEFAULT_ROLE));
  assert.deepEqual(ASSIGNABLE_ROLE_KEYS, ROLE_KEYS.filter(k => k !== SUPERADMIN_ROLE));
});

check('baseline lists only known permissions, superadmin all', () => {
  assert.deepEqual(Object.keys(BASELINE_ROLE_PERMISSIONS).sort(), [...ROLE_KEYS].sort());
  for (const [role, list] of Object.entries(BASELINE_ROLE_PERMISSIONS)) {
    assert.equal(new Set(list).size, list.length, `${role} lists a permission twice`);
    for (const p of list) assert.ok(PERMISSION_KEYS.includes(p), `${role}: unknown permission ${p}`);
  }
  assert.deepEqual(BASELINE_ROLE_PERMISSIONS.superadmin, PERMISSION_KEYS);
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
    school_admin: 'administration', ' President ': 'president',
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
  assert.deepEqual(rulesList('roleKeys'), ROLE_KEYS);
  assert.deepEqual(rulesList('permissionKeys'), PERMISSION_KEYS);
});

console.log(`Role-based access catalog: ${checks.length} checks passed`);
checks.forEach(name => console.log(`  ok  ${name}`));
