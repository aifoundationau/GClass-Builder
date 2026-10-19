// Firestore storage for role-based access (see src/rbac/permissions.js):
//   /roles/{roleKey}            { roleName, permissions, updatedAt, updatedBy }
//   /role_assignments/{email}   { email, role, assignedAt, assignedBy }
// Only an account whose sign-in token carries the "superadmin" role claim may write either
// (firestore.rules), and every write stores the whole document.

import {
  collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, writeBatch,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase";
import {
  ASSIGNABLE_ROLE_KEYS, ROLES_COLLECTION, ROLE_ASSIGNMENTS_COLLECTION, ROLE_BY_KEY, effectivePermissions,
  normalizeEmail, normalizeRoleKey,
} from "../rbac/permissions";

const notConfigured = () => new Error("Firebase is not configured (VITE_FIREBASE_API_KEY).");

const requireAdmin = (adminUid) => {
  if (!adminUid) throw new Error("Sign in to Firebase before changing roles.");
};

function roleDocument(roleKey, permissions, adminUid) {
  const role = ROLE_BY_KEY[roleKey];
  if (!role) throw new Error(`Unknown role "${roleKey}".`);
  requireAdmin(adminUid);
  return {
    roleName: role.label,
    permissions: effectivePermissions(roleKey, permissions),
    updatedAt: serverTimestamp(),
    updatedBy: adminUid,
  };
}

// Live snapshot listener that reports "not configured" instead of failing
function listen(ref, onChange, onError) {
  if (!isFirebaseConfigured) {
    onError(notConfigured());
    return () => {};
  }
  return onSnapshot(ref, onChange, onError);
}

// Every stored role as { roleKey: data }, live. Pending writes show an estimated updatedAt.
export function subscribeToRoles(onChange, onError) {
  return listen(collection(db, ROLES_COLLECTION), (snap) => {
    const roles = {};
    snap.forEach((d) => { roles[d.id] = d.data({ serverTimestamps: "estimate" }); });
    onChange(roles);
  }, onError);
}

// One role's document, live; null while it does not exist
export function subscribeToRole(roleKey, onChange, onError) {
  return listen(doc(db, ROLES_COLLECTION, roleKey),
    (snap) => onChange(snap.exists() ? snap.data({ serverTimestamps: "estimate" }) : null),
    onError);
}

export async function saveRolePermissions(roleKey, permissions, adminUid) {
  await setDoc(doc(db, ROLES_COLLECTION, roleKey), roleDocument(roleKey, permissions, adminUid));
}

// { roleKey: permissions } in one batch, so either every role is saved or none is
export async function saveAllRolePermissions(permissionsByRole, adminUid) {
  const batch = writeBatch(db);
  for (const [roleKey, permissions] of Object.entries(permissionsByRole)) {
    batch.set(doc(db, ROLES_COLLECTION, roleKey), roleDocument(roleKey, permissions, adminUid));
  }
  await batch.commit();
}

// Every email with an assigned role, live, as [{ email, role, assignedAt, assignedBy }]
export function subscribeToRoleAssignments(onChange, onError) {
  return listen(collection(db, ROLE_ASSIGNMENTS_COLLECTION), (snap) => {
    const assignments = [];
    snap.forEach((d) => { assignments.push({ ...d.data({ serverTimestamps: "estimate" }), email: d.id }); });
    assignments.sort((a, b) => a.email.localeCompare(b.email));
    onChange(assignments);
  }, onError);
}

// The role assigned to one email address, live; null when it has none
export function subscribeToRoleAssignment(email, onChange, onError) {
  return listen(doc(db, ROLE_ASSIGNMENTS_COLLECTION, email),
    (snap) => onChange(snap.exists() ? normalizeRoleKey(snap.data().role) : null),
    onError);
}

// Gives an email address a role (replacing any role it had). It applies as soon as that person
// signs in with Google, or straight away if they are signed in.
export async function assignRoleToEmail(emailInput, roleKey, adminUid) {
  const email = normalizeEmail(emailInput);
  if (!email) throw new Error(`"${emailInput}" is not an email address.`);
  if (!ASSIGNABLE_ROLE_KEYS.includes(roleKey)) {
    throw new Error(`The ${ROLE_BY_KEY[roleKey]?.label || roleKey} role cannot be assigned by email.`);
  }
  requireAdmin(adminUid);
  await setDoc(doc(db, ROLE_ASSIGNMENTS_COLLECTION, email), {
    email,
    role: roleKey,
    assignedAt: serverTimestamp(),
    assignedBy: adminUid,
  });
  return email;
}

// Takes the assigned role away: the person is a supporter again
export async function removeRoleAssignment(email) {
  await deleteDoc(doc(db, ROLE_ASSIGNMENTS_COLLECTION, email));
}

// The "role" custom claim on a Firebase user's ID token (set by scripts/rbac-admin.mjs), or null,
// and the verified email address that role assignments are looked up by
export async function readTokenIdentity(user, forceRefresh = false) {
  const { claims } = await user.getIdTokenResult(forceRefresh);
  return {
    claimRole: normalizeRoleKey(claims.role),
    email: claims.email_verified ? normalizeEmail(claims.email) : null,
  };
}
