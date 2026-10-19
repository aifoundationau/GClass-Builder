// Role-based access for the UI. A user's role is the "role" custom claim on their Firebase sign-in
// when there is one (superadmins), else the role the Superadmin assigned to their verified Google
// email in /role_assignments, else supporter. What a role may do is /roles/{role}.permissions.
// firestore.rules work the role out the same way, so the UI offers what the database allows.
// Without Firebase configured there are no roles, and every action stays available as before.
//
//   const rbac = useRbacSession(uid);                                  once, in App
//   <PermissionProvider session={rbac}>...</PermissionProvider>
//   usePermission('courses.create')                                    true when the role grants it
//   <PermissionGuard permission="roles.manage">...</PermissionGuard>   not mounted without it
//   <PermissionGuard permission="grades.edit" mode="disable"><button /></PermissionGuard>

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onIdTokenChanged } from 'firebase/auth';
import { Lock } from 'lucide-react';
import { auth, isFirebaseConfigured } from '../firebase';
import { readTokenIdentity, subscribeToRole, subscribeToRoleAssignment } from '../services/rolePermissionsService';
import { DEFAULT_ROLE, PERMISSION_BY_KEY, ROLE_BY_KEY, SUPERADMIN_ROLE, effectivePermissions } from './permissions';

// Outside a provider, and when Firebase is not configured: nothing is restricted
const OPEN_SESSION = {
  enforced: false,
  status: 'open',
  role: null,
  roleSource: null,
  permissions: [],
  roleDocMissing: false,
  can: () => true,
  explain: () => '',
  refreshRole: async () => {},
};

const PermissionContext = createContext(OPEN_SESSION);

// uid: the Firebase account whose role applies (the one signed in to Classroom), or null.
// status: 'open' (no Firebase), 'signed-out', 'loading', 'ready' or 'error'.
export function useRbacSession(uid) {
  // The signed-in Firebase user's role claim and verified email, and whose they are
  const [identity, setIdentity] = useState({ uid: null, claimRole: null, email: null });
  // The role assigned to that email, once read
  const [assignment, setAssignment] = useState({ email: null, role: null });
  // The /roles document last read, and for which role
  const [roleDoc, setRoleDoc] = useState({ role: null, permissions: [], exists: false, error: null });

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    let latest = 0;
    return onIdTokenChanged(auth, (user) => {
      const call = ++latest;
      if (!user) {
        setIdentity({ uid: null, claimRole: null, email: null });
        return;
      }
      readTokenIdentity(user)
        .catch(() => ({ claimRole: null, email: null }))
        .then((found) => { if (call === latest) setIdentity({ uid: user.uid, ...found }); });
    });
  }, []);

  const signedIn = Boolean(uid) && identity.uid === uid;
  // Without a claim, the role comes from the email's assignment
  const assignmentEmail = signedIn && !identity.claimRole ? identity.email : null;

  useEffect(() => {
    if (!assignmentEmail) return undefined;
    return subscribeToRoleAssignment(assignmentEmail,
      (role) => setAssignment({ email: assignmentEmail, role }),
      () => setAssignment({ email: assignmentEmail, role: null }));
  }, [assignmentEmail]);

  // roleSource: 'claim', 'email' (assigned in Role Permissions) or 'default'
  let role = null;
  let roleSource = null;
  if (signedIn && identity.claimRole) {
    role = identity.claimRole;
    roleSource = 'claim';
  } else if (signedIn && (!assignmentEmail || assignment.email === assignmentEmail)) {
    const assigned = assignmentEmail ? assignment.role : null;
    role = assigned || DEFAULT_ROLE;
    roleSource = assigned ? 'email' : 'default';
  }

  useEffect(() => {
    if (!role) return undefined;
    return subscribeToRole(role,
      (data) => setRoleDoc({ role, permissions: data?.permissions || [], exists: Boolean(data), error: null }),
      (error) => setRoleDoc({ role, permissions: [], exists: false, error }));
  }, [role]);

  const loaded = Boolean(role) && roleDoc.role === role;
  let status = 'ready';
  if (!isFirebaseConfigured) status = 'open';
  else if (!uid) status = 'signed-out';
  else if (!role || (!loaded && role !== SUPERADMIN_ROLE)) status = 'loading';
  else if (loaded && roleDoc.error) status = 'error';

  const permissions = useMemo(() => {
    if (role === SUPERADMIN_ROLE) return effectivePermissions(role, []);
    return loaded ? effectivePermissions(role, roleDoc.permissions) : [];
  }, [role, loaded, roleDoc.permissions]);

  const refreshRole = useCallback(async () => {
    // A new token runs onIdTokenChanged above, which reads the role claim again (assignments are live)
    if (auth.currentUser) await auth.currentUser.getIdToken(true);
  }, []);

  return useMemo(() => {
    if (!isFirebaseConfigured) return OPEN_SESSION;
    const granted = new Set(permissions);
    const can = (permission) => granted.has(permission);
    // Why `permission` is not available, for tooltips and notices ('' when it is)
    const explain = (permission) => {
      if (granted.has(permission)) return '';
      const label = PERMISSION_BY_KEY[permission]?.label || permission;
      if (status === 'signed-out') return `Sign in with Google (the Log In button on the Course Studio page) to use "${label}".`;
      if (status === 'loading') return 'Checking your role permissions...';
      if (status === 'error') return `Your role permissions could not be read: ${roleDoc.error.message}`;
      return `Your role (${ROLE_BY_KEY[role]?.label || role}) does not include "${label}". A Superadmin can grant it in Role Permissions.`;
    };
    return {
      enforced: true,
      status,
      role,
      roleSource,
      permissions,
      roleDocMissing: loaded && !roleDoc.exists && role !== SUPERADMIN_ROLE,
      can,
      explain,
      refreshRole,
    };
  }, [status, role, roleSource, permissions, loaded, roleDoc, refreshRole]);
}

export function PermissionProvider({ session, children }) {
  return <PermissionContext.Provider value={session || OPEN_SESSION}>{children}</PermissionContext.Provider>;
}

export function useRbac() {
  return useContext(PermissionContext);
}

export function usePermission(permissionKey) {
  return useContext(PermissionContext).can(permissionKey);
}

// Mounts children only when the user's role grants `permission`, otherwise `fallback`. With
// mode="disable" the children (buttons, inputs) stay visible but disabled, the reason as tooltip.
export function PermissionGuard({ permission, mode = 'hide', fallback = null, children }) {
  const session = useRbac();
  if (session.can(permission)) return children;
  if (mode !== 'disable') return fallback;
  const reason = session.explain(permission);
  return React.Children.map(children, (child) => (React.isValidElement(child)
    ? React.cloneElement(child, { disabled: true, 'aria-disabled': true, title: reason })
    : child));
}

// Shown in place of a page the user's role does not open
export function PermissionNotice({ permission }) {
  const session = useRbac();
  return (
    <div className="rbac-notice" role="status">
      <Lock size={18} />
      <div>
        <strong>{PERMISSION_BY_KEY[permission]?.label || permission}</strong>
        <p>{session.explain(permission)}</p>
      </div>
    </div>
  );
}
