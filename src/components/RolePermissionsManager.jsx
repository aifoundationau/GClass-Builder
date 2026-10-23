import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, Check, DollarSign, FileText, GraduationCap, Info, LayoutGrid, List, Lock, Mail, MessageSquare,
  RotateCcw, Save, Search, Send, Settings, ShieldCheck, Undo2, UserPlus, Users, X,
} from 'lucide-react';
import { auth } from '../firebase';
import { useRbac } from '../rbac/PermissionContext';
import {
  BASELINE_ROLE_PERMISSIONS, DEFAULT_ROLE, PERMISSIONS, PERMISSION_GROUPS, ROLES, ROLES_COLLECTION,
  ROLE_ASSIGNMENTS_COLLECTION, ROLE_BY_KEY, SUPERADMIN_ROLE, effectivePermissions, isOwnerAccount, normalizeEmail,
  normalizeRoleKey,
} from '../rbac/permissions';
import {
  assignRoleToEmail, removeRoleAssignment, saveAllRolePermissions, saveRolePermissions, subscribeToPeople,
  subscribeToRoleAssignments, subscribeToRoles,
} from '../services/rolePermissionsService';

// Role Permissions: the Superadmin ticks what each role may do, and Save Role / Save All write it
// to /roles in Firestore. Ticks stay per role until saved or discarded. A role without a document
// shows its baseline permissions, and saving creates the document. Each role also lists the email
// addresses given it (/role_assignments); adding an email there takes effect immediately.

const GROUP_ICONS = {
  academic: GraduationCap, admissions: FileText, finance: DollarSign, communications: MessageSquare, governance: Settings,
};
const GROUP_LABELS = Object.fromEntries(PERMISSION_GROUPS.map(g => [g.key, g.label]));

const sameSet = (stored, shown) => {
  const set = new Set(stored);
  return set.size === stored.length && set.size === shown.length && shown.every(k => set.has(k));
};

const formatTime = (ts) => (ts && typeof ts.toDate === 'function' ? ts.toDate().toLocaleString() : '');

const saveError = (err) => (err && err.code === 'permission-denied'
  ? 'Firestore refused the write: only the Superadmin (the owner\'s Google account) can save, and the shared Firestore rules with this app\'s roles must be deployed.'
  : (err && err.message) || String(err));

export default function RolePermissionsManager({ showToast }) {
  const rbac = useRbac();
  // firestore.rules accept role writes only from the Superadmin: the owner's Google account
  const canEdit = rbac.role === SUPERADMIN_ROLE;
  const me = auth.currentUser;

  const [stored, setStored] = useState(null); // { roleKey: Firestore data }, null until read
  const [loadError, setLoadError] = useState('');
  const [edits, setEdits] = useState({}); // { roleKey: permissions } not saved yet
  const [activeRole, setActiveRole] = useState(DEFAULT_ROLE);
  const [view, setView] = useState('role'); // 'role' editor or 'matrix'
  const [groupFilter, setGroupFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(null); // 'all' or the role being saved
  const [assignments, setAssignments] = useState(null); // [{ email, role, ... }], null until read
  const [assignmentsError, setAssignmentsError] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [people, setPeople] = useState(null); // everyone in the shared profiles, null until read
  const [peopleError, setPeopleError] = useState('');
  const [peopleQuery, setPeopleQuery] = useState('');
  const [picked, setPicked] = useState([]); // emails ticked to receive the selected role

  useEffect(() => subscribeToRoles(
    (roles) => { setStored(roles); setLoadError(''); },
    (err) => { setStored({}); setLoadError(err.message || String(err)); },
  ), []);

  useEffect(() => subscribeToRoleAssignments(
    (list) => { setAssignments(list); setAssignmentsError(''); },
    (err) => { setAssignments([]); setAssignmentsError(err.message || String(err)); },
  ), []);

  // Only the Superadmin may read everyone's profile
  useEffect(() => {
    if (!canEdit) return undefined;
    return subscribeToPeople(
      (list) => { setPeople(list); setPeopleError(''); },
      (err) => { setPeople([]); setPeopleError(err.message || String(err)); },
    );
  }, [canEdit]);

  // A selection is for one role
  useEffect(() => { setPicked([]); }, [activeRole]);

  // What each role shows: unsaved ticks, else Firestore, else the baseline
  const current = {};
  for (const r of ROLES) {
    const source = edits[r.key] ?? stored?.[r.key]?.permissions ?? BASELINE_ROLE_PERMISSIONS[r.key];
    current[r.key] = effectivePermissions(r.key, Array.isArray(source) ? source : []);
  }
  // Roles whose Firestore document is missing or differs from what is shown
  const pending = stored === null ? [] : ROLES.map(r => r.key).filter((k) => {
    const saved = stored[k]?.permissions;
    return !stored[k] || !Array.isArray(saved) || !sameSet(saved, current[k]);
  });
  const isPending = (roleKey) => pending.includes(roleKey);

  const setRolePermissions = (roleKey, permissions) => setEdits(prev => ({ ...prev, [roleKey]: permissions }));

  const discard = (roleKey) => setEdits((prev) => {
    const next = { ...prev };
    delete next[roleKey];
    return next;
  });

  const editable = (roleKey) => canEdit && roleKey !== SUPERADMIN_ROLE && saving === null;

  const toggle = (roleKey, permission) => {
    if (!editable(roleKey)) return;
    const list = current[roleKey];
    setRolePermissions(roleKey, list.includes(permission) ? list.filter(k => k !== permission) : [...list, permission]);
  };

  const tickAll = (roleKey, keys, on) => {
    if (!editable(roleKey)) return;
    const set = new Set(current[roleKey]);
    keys.forEach(k => (on ? set.add(k) : set.delete(k)));
    setRolePermissions(roleKey, [...set]);
  };

  const saveRole = async (roleKey) => {
    const label = ROLE_BY_KEY[roleKey].label;
    setSaving(roleKey);
    try {
      await saveRolePermissions(roleKey, current[roleKey], me && me.uid);
      discard(roleKey);
      showToast(`Saved ${label}: ${current[roleKey].length} permissions.`);
    } catch (err) {
      showToast(`Could not save ${label}. ${saveError(err)}`);
    } finally {
      setSaving(null);
    }
  };

  const saveAll = async () => {
    if (pending.length === 0) return;
    const roles = pending;
    setSaving('all');
    try {
      await saveAllRolePermissions(Object.fromEntries(roles.map(k => [k, current[k]])), me && me.uid);
      setEdits({});
      showToast(`Saved ${roles.length} role${roles.length === 1 ? '' : 's'} to Firestore.`);
    } catch (err) {
      showToast(`Could not save role permissions. ${saveError(err)}`);
    } finally {
      setSaving(null);
    }
  };

  // Gives the email in the box the selected role; someone with another role moves to this one
  const addMember = async (event) => {
    event.preventDefault();
    const label = ROLE_BY_KEY[activeRole].label;
    const email = normalizeEmail(newEmail);
    if (!email) {
      setAssignError(`"${newEmail.trim()}" is not an email address.`);
      return;
    }
    const previous = (assignments || []).find(a => a.email === email);
    const previousRole = previous && normalizeRoleKey(previous.role);
    if (previousRole === activeRole) {
      setAssignError(`${email} already has the ${label} role.`);
      return;
    }
    setAssigning(true);
    setAssignError('');
    try {
      await assignRoleToEmail(email, activeRole, me && me.uid);
      setNewEmail('');

      let emailStatus = '';
      try {
        const notifRes = await fetch('/api/notifications/send-role-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientEmail: email,
            roleKey: activeRole,
            roleLabel: label,
            permissions: current[activeRole] || [],
            adminEmail: me?.email || null,
          }),
        });
        const notifData = await notifRes.json();
        if (notifData.sent) {
          emailStatus = ' & sent notification email!';
        } else if (notifData.composeUrl) {
          emailStatus = ' (notification draft prepared; click Send Email to dispatch).';
        }
      } catch (notifErr) {
        console.warn('[Gmail Notification] Error dispatching email:', notifErr);
      }

      showToast(previousRole
        ? `Moved ${email} from ${ROLE_BY_KEY[previousRole].label} to ${label}${emailStatus}`
        : `${email} now has the ${label} role${emailStatus}`);
    } catch (err) {
      setAssignError(saveError(err));
    } finally {
      setAssigning(false);
    }
  };

  const sendNotification = async (targetEmail) => {
    const label = ROLE_BY_KEY[activeRole].label;
    const permissions = current[activeRole] || [];
    showToast(`Preparing email notification for ${targetEmail}...`);

    const openClientFallback = () => {
      const subject = `Role Granted: You have been assigned the ${label} role [#gcoursebuilder]`;
      const permLines = permissions.map(p => `  * ${p}`).join('\n');
      const plainBody = `Hello,\n\nYour Google account (${targetEmail}) has been granted the ${label} role on Google Course Builder.\n\nGranted Permissions:\n${permLines || '  * Baseline supporter access.'}\n\nHow to activate:\nSign in to Google Course Builder using ${targetEmail}. Your role and permissions will activate automatically.\n\nTag: #gcoursebuilder\nAssigned by: ${me?.email || 'System Administrator'}\n`;
      const composeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(targetEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(plainBody)}`;
      window.open(composeUrl, '_blank');
      showToast(`Opened Gmail compose tab for ${targetEmail}`);
    };

    try {
      const res = await fetch('/api/notifications/send-role-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: targetEmail,
          roleKey: activeRole,
          roleLabel: label,
          permissions,
          adminEmail: me?.email || null,
        }),
      });

      if (!res.ok) {
        openClientFallback();
        return;
      }

      const data = await res.json();
      if (data.sent) {
        showToast(`Sent Gmail notification to ${targetEmail}!`);
      } else if (data.composeUrl) {
        window.open(data.composeUrl, '_blank');
        showToast(`Opened Gmail compose tab for ${targetEmail}`);
      } else {
        openClientFallback();
      }
    } catch (err) {
      console.warn('[Gmail Notification] Fallback to direct compose:', err);
      openClientFallback();
    }
  };

  const removeMember = async (email) => {
    try {
      await removeRoleAssignment(email);
      showToast(`Removed ${email} from ${ROLE_BY_KEY[activeRole].label}: they are a supporter again.`);
    } catch (err) {
      showToast(`Could not remove ${email}. ${saveError(err)}`);
    }
  };

  // Each email's role in this app (supporter when it has none)
  const roleByEmail = Object.fromEntries((assignments || []).map(a => [a.email, normalizeRoleKey(a.role)]));

  const togglePicked = (email) => setPicked(prev => (prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]));

  // Gives the ticked people the selected role; anyone with another role moves to this one
  const givePicked = async () => {
    const label = ROLE_BY_KEY[activeRole].label;
    const emails = picked.filter(email => roleByEmail[email] !== activeRole);
    if (emails.length === 0) return;
    setAssigning(true);
    setAssignError('');
    try {
      for (const email of emails) await assignRoleToEmail(email, activeRole, me && me.uid);
      setPicked([]);
      showToast(`${emails.length === 1 ? `${emails[0]} now has` : `${emails.length} people now have`} the ${label} role. Use Send Email to tell them.`);
    } catch (err) {
      setAssignError(saveError(err));
    } finally {
      setAssigning(false);
    }
  };

  const roleStatus = (roleKey) => {
    if (stored === null) return `Reading /${ROLES_COLLECTION} from Firestore...`;
    const data = stored[roleKey];
    if (!data) return `Not in Firestore yet: showing the baseline. Saving creates ${ROLES_COLLECTION}/${roleKey}.`;
    const when = formatTime(data.updatedAt);
    const by = me && data.updatedBy === me.uid ? 'you' : (data.updatedBy || 'unknown');
    return `Saved${when ? ` ${when}` : ''} by ${by}${isPending(roleKey) ? ', with unsaved changes' : ''}.`;
  };

  const role = ROLE_BY_KEY[activeRole];
  const isSuper = activeRole === SUPERADMIN_ROLE;
  const locked = !editable(activeRole);
  const granted = new Set(current[activeRole]);
  const needle = query.trim().toLowerCase();
  const shown = PERMISSIONS.filter(p => (groupFilter === 'all' || p.group === groupFilter)
    && (!needle || `${p.label} ${p.key} ${p.description}`.toLowerCase().includes(needle)));
  const members = (assignments || []).filter(a => normalizeRoleKey(a.role) === activeRole);
  // Everyone matching the search, at most 200 rows at a time
  const peopleNeedle = peopleQuery.trim().toLowerCase();
  const matchingPeople = (people || []).filter(p => !peopleNeedle
    || `${p.name} ${p.email} ${p.apps.join(' ')}`.toLowerCase().includes(peopleNeedle));
  const shownPeople = matchingPeople.slice(0, 200);

  const membersPanel = (
    <section className="rbac-panel">
      <h3 className="rbac-panel-title rbac-title-icon">
        <Users size={17} />
        <span>People with the {role.label} role</span>
        {!isSuper && assignments && <span className="rbac-count">{members.length}</span>}
      </h3>
      {isSuper ? (
        <>
          <p className="rbac-role-desc">
            The Superadmin is the owner: the owner's Google account is recognised when it signs in, in this
            app and in every other app that shares the Firebase project. It is never given by email.
          </p>
        </>
      ) : (
        <>
          <p className="rbac-role-desc">
            Tick people below, or type the email of someone who hasn't signed in yet, to give them this role.
            It applies the next time they sign in, or straight away if they are signed in. Someone who has
            another role moves to this one; everyone else is a supporter.
          </p>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: '#60a5fa',
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: '8px',
            padding: '8px 12px',
            marginBottom: '12px'
          }}>
            <Send size={13} />
            <span><strong>Role Notifications:</strong> Assigning a role prepares a notification email detailing granted permissions. Click <strong>Send Email</strong> next to any member to review and dispatch via Gmail.</span>
          </div>
          {canEdit && (
            <div className="rbac-people-picker">
              <label className="rbac-search rbac-people-search">
                <Search size={14} />
                <input
                  type="search"
                  placeholder="Search everyone by name, email or app"
                  value={peopleQuery}
                  onChange={(e) => setPeopleQuery(e.target.value)}
                  aria-label="Search everyone"
                />
              </label>
              {peopleError && <p className="rbac-inline-error" role="alert">Could not read everyone's profiles: {peopleError}</p>}
              {people === null && !peopleError && <p className="rbac-empty">Reading everyone's profiles...</p>}
              {people && !peopleError && (shownPeople.length === 0 ? (
                <p className="rbac-empty">{people.length ? 'No one matches your search.' : 'No profiles yet.'}</p>
              ) : (
                <ul className="rbac-people" aria-label={`People to give the ${role.label} role`}>
                  {shownPeople.map((p) => {
                    const isOwner = isOwnerAccount({ email: p.email, emailVerified: true });
                    const has = isOwner ? SUPERADMIN_ROLE : (roleByEmail[p.email] || DEFAULT_ROLE);
                    const fixed = isOwner || has === activeRole;
                    return (
                      <li key={p.email}>
                        <label className={`rbac-person ${picked.includes(p.email) ? 'picked' : ''} ${fixed ? 'fixed' : ''}`}>
                          <input
                            type="checkbox"
                            checked={picked.includes(p.email)}
                            onChange={() => togglePicked(p.email)}
                            disabled={fixed || assigning}
                          />
                          <span className="rbac-person-who">
                            <strong>{p.name || p.email}</strong>
                            {p.name && <small>{p.email}</small>}
                          </span>
                          {p.apps.length > 0 && <span className="rbac-person-apps">{p.apps.join(', ')}</span>}
                          <span className="rbac-person-role">{ROLE_BY_KEY[has].label}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ))}
              {matchingPeople.length > shownPeople.length && (
                <p className="rbac-empty">Showing {shownPeople.length} of {matchingPeople.length}: search to narrow the list.</p>
              )}
              <button
                type="button"
                className="btn-primary rbac-small-btn rbac-btn-purple"
                onClick={givePicked}
                disabled={assigning || picked.length === 0}
              >
                <UserPlus size={14} />
                <span>{assigning ? 'Giving...' : `Give ${role.label} to ${picked.length ? `${picked.length} ` : ''}selected`}</span>
              </button>
            </div>
          )}
          <form className="rbac-assign-form" onSubmit={addMember}>
            <label className="rbac-search rbac-assign-input">
              <Mail size={14} />
              <input
                type="email"
                placeholder="name@example.com"
                value={newEmail}
                onChange={(e) => { setNewEmail(e.target.value); setAssignError(''); }}
                disabled={!canEdit || assigning}
                aria-label={`Email address to add to ${role.label}`}
              />
            </label>
            <button type="submit" className="btn-primary rbac-small-btn rbac-btn-purple" disabled={!canEdit || assigning || !newEmail.trim()}>
              <UserPlus size={14} />
              <span>{assigning ? 'Adding...' : `Add to ${role.label}`}</span>
            </button>
          </form>
          {assignError && <p className="rbac-inline-error" role="alert">{assignError}</p>}
          {assignmentsError && (
            <p className="rbac-inline-error" role="alert">Could not read /{ROLE_ASSIGNMENTS_COLLECTION}: {assignmentsError}</p>
          )}
          {assignments === null && <p className="rbac-empty">Reading role assignments...</p>}
          {assignments && members.length === 0 && !assignmentsError && (
            <p className="rbac-empty">
              No email addresses have this role yet.
              {activeRole === DEFAULT_ROLE && ' Everyone without another role is a supporter.'}
            </p>
          )}
          {members.length > 0 && (
            <ul className="rbac-members">
              {members.map(m => (
                <li key={m.email} className="rbac-member">
                  <Mail size={13} />
                  <span className="rbac-member-email">{m.email}</span>
                  {formatTime(m.assignedAt) && <span className="rbac-member-meta">since {formatTime(m.assignedAt)}</span>}
                  {canEdit && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                      <button
                        type="button"
                        onClick={() => sendNotification(m.email)}
                        title={`Send Gmail notification with granted permissions to ${m.email}`}
                        aria-label={`Send Gmail notification to ${m.email}`}
                        style={{
                          background: 'rgba(66, 133, 244, 0.1)',
                          border: '1px solid rgba(66, 133, 244, 0.25)',
                          color: '#60a5fa',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          fontWeight: 500
                        }}
                      >
                        <Send size={11} />
                        <span>Send Email</span>
                      </button>
                      <button
                        type="button"
                        className="rbac-member-remove"
                        onClick={() => removeMember(m.email)}
                        title={`Remove ${m.email} from ${role.label}`}
                        aria-label={`Remove ${m.email} from ${role.label}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );

  const roleEditor = (
    <>
      <section className="rbac-panel">
        <div className="rbac-section-label">Select role to configure permissions</div>
        <div className="rbac-role-pills">
          {ROLES.map(r => (
            <button
              key={r.key}
              type="button"
              className={`rbac-role-pill ${r.key === activeRole ? 'active' : ''}`}
              aria-pressed={r.key === activeRole}
              onClick={() => setActiveRole(r.key)}
            >
              <span>{r.label}</span>
              <span className="rbac-count">{r.key === SUPERADMIN_ROLE ? 'ALL' : current[r.key].length}</span>
              {isPending(r.key) && (
                <span className="rbac-dot" title={stored && stored[r.key] ? 'Unsaved changes' : 'Not saved to Firestore yet'} />
              )}
            </button>
          ))}
        </div>
      </section>

      {membersPanel}

      <section className="rbac-panel">
        <div className="rbac-role-head">
          <div>
            <div className="rbac-role-title">
              <span className="rbac-role-badge">{role.label}</span>
              <span className="rbac-meta">Level {role.level}</span>
              <span className="rbac-meta rbac-meta-accent">
                {isSuper ? `Full system access (${PERMISSIONS.length}/${PERMISSIONS.length})` : `${granted.size}/${PERMISSIONS.length} permissions`}
              </span>
            </div>
            <p className="rbac-role-desc">{role.description}</p>
            <p className="rbac-role-status">{roleStatus(activeRole)}</p>
          </div>
          <div className="rbac-role-actions">
            {canEdit && !isSuper && (
              <button
                type="button"
                className="btn-secondary rbac-small-btn"
                onClick={() => setRolePermissions(activeRole, BASELINE_ROLE_PERMISSIONS[activeRole])}
                disabled={saving !== null}
                title="Tick this role's baseline permissions (saved only when you save)"
              >
                <RotateCcw size={14} />
                <span>Baseline</span>
              </button>
            )}
            {edits[activeRole] && stored && stored[activeRole] && isPending(activeRole) && (
              <button type="button" className="btn-secondary rbac-small-btn" onClick={() => discard(activeRole)} disabled={saving !== null}>
                <Undo2 size={14} />
                <span>Discard changes</span>
              </button>
            )}
            <button
              type="button"
              className="btn-primary rbac-small-btn rbac-btn-purple"
              onClick={() => saveRole(activeRole)}
              disabled={!canEdit || saving !== null || !isPending(activeRole)}
            >
              <Save size={14} />
              <span>{saving === activeRole ? 'Saving...' : 'Save Role'}</span>
            </button>
          </div>
        </div>

        {isSuper && (
          <p className="rbac-hint-box">
            <Lock size={14} />
            <span>Superadmin always holds every permission, so the role that manages permissions cannot lock itself out.</span>
          </p>
        )}

        <div className="rbac-toolbar">
          <div className="rbac-filters">
            <button type="button" className={`rbac-filter ${groupFilter === 'all' ? 'active' : ''}`} onClick={() => setGroupFilter('all')}>
              All <span>{granted.size}/{PERMISSIONS.length}</span>
            </button>
            {PERMISSION_GROUPS.map((g) => {
              const Icon = GROUP_ICONS[g.key];
              const keys = PERMISSIONS.filter(p => p.group === g.key).map(p => p.key);
              return (
                <button
                  key={g.key}
                  type="button"
                  className={`rbac-filter ${groupFilter === g.key ? 'active' : ''}`}
                  onClick={() => setGroupFilter(g.key)}
                >
                  <Icon size={13} />
                  {g.label} <span>{keys.filter(k => granted.has(k)).length}/{keys.length}</span>
                </button>
              );
            })}
          </div>
          <div className="rbac-toolbar-right">
            {!locked && shown.length > 0 && (
              <>
                <button type="button" className="rbac-link-btn" onClick={() => tickAll(activeRole, shown.map(p => p.key), true)}>Tick shown</button>
                <button type="button" className="rbac-link-btn" onClick={() => tickAll(activeRole, shown.map(p => p.key), false)}>Clear shown</button>
              </>
            )}
            <label className="rbac-search">
              <Search size={14} />
              <input
                type="search"
                placeholder="Filter permissions..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="Filter permissions"
              />
            </label>
          </div>
        </div>

        <div className="rbac-perm-grid">
          {shown.map((p) => {
            const Icon = GROUP_ICONS[p.group];
            const on = granted.has(p.key);
            return (
              <label key={p.key} className={`rbac-perm-card ${on ? 'on' : ''} ${locked ? 'locked' : ''}`}>
                <input type="checkbox" checked={on} disabled={locked} onChange={() => toggle(activeRole, p.key)} />
                <span className="rbac-perm-body">
                  <span className="rbac-perm-top">
                    <span className="rbac-perm-label">{p.label}</span>
                    <code className="rbac-perm-key">{p.key}</code>
                  </span>
                  <span className="rbac-perm-desc">{p.description}</span>
                  <span className="rbac-perm-group"><Icon size={12} /> {GROUP_LABELS[p.group]}</span>
                </span>
              </label>
            );
          })}
          {shown.length === 0 && <p className="rbac-empty">No permissions match "{query}".</p>}
        </div>
      </section>
    </>
  );

  const matrix = (
    <section className="rbac-panel">
      <div className="rbac-role-head">
        <div>
          <h3 className="rbac-panel-title">System Role Permission Matrix</h3>
          <p className="rbac-role-desc">Click any cell to grant or revoke that permission for the role. Superadmin is locked to every permission.</p>
        </div>
        <button
          type="button"
          className="btn-primary rbac-small-btn rbac-btn-purple"
          onClick={saveAll}
          disabled={!canEdit || saving !== null || pending.length === 0}
        >
          <Save size={14} />
          <span>{saving === 'all' ? 'Saving...' : 'Save Matrix'}</span>
        </button>
      </div>
      <div className="rbac-matrix-scroll">
        <table className="rbac-matrix">
          <thead>
            <tr>
              <th scope="col" className="rbac-matrix-perm">Permission scope</th>
              {ROLES.map(r => (
                <th key={r.key} scope="col">
                  <span className="rbac-matrix-role">
                    {r.label}
                    {isPending(r.key) && <span className="rbac-dot" title="Not saved to Firestore yet" />}
                  </span>
                  <span className="rbac-matrix-level">Lvl {r.level}</span>
                </th>
              ))}
            </tr>
          </thead>
          {PERMISSION_GROUPS.map((g) => {
            const Icon = GROUP_ICONS[g.key];
            return (
              <tbody key={g.key}>
                <tr className="rbac-matrix-group">
                  <th colSpan={ROLES.length + 1} scope="rowgroup"><Icon size={13} /> {g.label}</th>
                </tr>
                {PERMISSIONS.filter(p => p.group === g.key).map(p => (
                  <tr key={p.key}>
                    <th scope="row" className="rbac-matrix-perm">
                      <span className="rbac-perm-label">{p.label}</span>
                      <code className="rbac-perm-key">{p.key}</code>
                    </th>
                    {ROLES.map((r) => {
                      const on = current[r.key].includes(p.key);
                      return (
                        <td key={r.key}>
                          <button
                            type="button"
                            className={`rbac-cell ${on ? 'on' : ''}`}
                            aria-pressed={on}
                            aria-label={`${p.label} for ${r.label}`}
                            title={`${r.label}: ${on ? 'granted' : 'not granted'}`}
                            disabled={!editable(r.key)}
                            onClick={() => toggle(r.key, p.key)}
                          >
                            {on && <Check size={14} strokeWidth={3} />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
    </section>
  );

  return (
    <div className="rbac-page animate-fade-in">
      <section className="rbac-hero">
        <div className="rbac-hero-row">
          <div className="rbac-chips">
            <span className="rbac-chip rbac-chip-accent"><ShieldCheck size={13} /> Superadmin RBAC engine</span>
            <span className="rbac-chip">{ROLES.length} system roles</span>
            <span className="rbac-chip">{PERMISSIONS.length} granular permissions</span>
          </div>
          <div className="rbac-view-toggle" role="group" aria-label="View">
            <button type="button" className={view === 'role' ? 'active' : ''} aria-pressed={view === 'role'} onClick={() => setView('role')}>
              <List size={14} />
              <span>Role-by-Role Editor</span>
            </button>
            <button type="button" className={view === 'matrix' ? 'active' : ''} aria-pressed={view === 'matrix'} onClick={() => setView('matrix')}>
              <LayoutGrid size={14} />
              <span>Full Matrix Comparison</span>
            </button>
          </div>
        </div>
        <h2 className="rbac-title">Role Permissions Management</h2>
        <p className="rbac-lead">
          Grant or revoke what each system role may do. Saved changes reach signed-in users straight away,
          and the Firestore security rules check the same lists.
        </p>
        <div className="rbac-hero-row">
          <span className="rbac-hint"><Info size={14} /> All newly registered users receive the <strong>supporter</strong> role by default.</span>
          <button type="button" className="rbac-save-all" onClick={saveAll} disabled={!canEdit || saving !== null || pending.length === 0}>
            <Save size={15} />
            <span>{saving === 'all' ? 'Saving...' : 'Save All Role Permissions'}</span>
            {pending.length > 0 && <span className="rbac-save-count">{pending.length}</span>}
          </button>
        </div>
      </section>

      {!canEdit && (
        <div className="rbac-alert rbac-alert-warn" role="status">
          <AlertTriangle size={18} />
          <div>
            <strong>Read-only: only the Superadmin changes roles.</strong>
            <p>
              The Superadmin is the owner's Google account, recognised when it signs in. Your role here
              is <code>{ROLE_BY_KEY[rbac.role]?.label || 'none'}</code>.
            </p>
          </div>
        </div>
      )}

      {loadError && (
        <div className="rbac-alert rbac-alert-error" role="alert">
          <AlertTriangle size={18} />
          <div>
            <strong>Could not read /{ROLES_COLLECTION} from Firestore.</strong>
            <p>{loadError} The baseline permissions are shown instead.</p>
          </div>
        </div>
      )}

      {view === 'role' ? roleEditor : matrix}
    </div>
  );
}
