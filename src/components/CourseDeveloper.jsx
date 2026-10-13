import React, { useEffect, useMemo, useRef, useState } from 'react';
import { readCourseTemplate } from '../lib/courseWorkbook';

// Course Developer: the teacher pastes text or attaches documents, and the agent finds where
// each part belongs in this course. The course is also worked on step by step, and each step
// has its own agent chat. The agent only proposes changes. Nothing changes in Google Classroom
// until the teacher selects items and clicks Apply selected. This component has no delete
// actions. The policy step explains that deletions are done in the Classroom dashboard.

const POLICY_KEY = 'policy';
const ACCEPT = '.txt,.md,.docx,.pdf,.csv,.xlsx,.xlsm';
const LIST_LIMIT = 25;
const PUBLISHABLE = new Set(['courses.courseWork', 'courses.courseWorkMaterials', 'courses.announcements']);

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function getJson(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const readFileBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// Only creates of these resources can be published now. Everything else stays as the server sets it.
const canPublish = (op) => op.method === 'create' && PUBLISHABLE.has(op.resource);

const asList = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return [value];
  return [];
};

const itemLabel = (item) => {
  if (item === null || typeof item !== 'object') return String(item ?? '');
  const text = item.title || item.name || item.alias || item.text || item.invitedEmailAddress
    || item.profile?.name?.fullName || item.profile?.emailAddress || item.userId || item.id || 'Untitled';
  const label = String(text).replace(/\s+/g, ' ').trim();
  return label.length > 140 ? `${label.slice(0, 137)}...` : label;
};

const methodsText = (methods) => (Array.isArray(methods) ? methods.join(', ') : String(methods || ''));

const muted = { color: 'var(--text-muted, #64748b)', fontSize: '0.88rem' };
const itemBox = { border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 8, padding: 10 };
const headingStyle = { margin: '0 0 6px', fontSize: '1rem' };
const errorText = { color: '#c5221f', fontSize: '0.88rem' };
const noticeText = { color: '#137333', fontSize: '0.88rem' };
const listStyle = { margin: '6px 0 0', paddingLeft: 18, display: 'grid', gap: 4, fontSize: '0.88rem' };

const bubble = (isUser) => ({
  maxWidth: '82%',
  padding: '10px 14px',
  borderRadius: 12,
  whiteSpace: 'pre-wrap',
  lineHeight: 1.5,
  fontSize: '0.92rem',
  background: isUser ? '#1a73e8' : 'var(--card-bg, #f8fafc)',
  color: isUser ? '#fff' : 'var(--text-main, #1e293b)',
  border: isUser ? 'none' : '1px solid var(--border-color, #e2e8f0)',
});

function Details({ value }) {
  return (
    <details style={{ marginTop: 6, fontSize: '0.82rem' }}>
      <summary style={{ cursor: 'pointer' }}>Details</summary>
      <pre style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

function RejectedList({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <strong style={{ fontSize: '0.9rem' }}>Rejected</strong>
      <ul style={listStyle}>
        {items.map((r, i) => (
          <li key={i}>
            {[r.resource, r.method].filter(Boolean).join(' ')}
            {r.reason ? `: ${r.reason}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultList({ results }) {
  return (
    <ul style={listStyle}>
      {results.map((r, i) => (
        <li key={i} style={r.ok ? noticeText : errorText}>
          {r.resource} {r.method}: {r.ok ? 'Done' : `Not applied${r.error ? ` (${r.error})` : ''}`}
        </li>
      ))}
    </ul>
  );
}

export default function CourseDeveloper({ user, courseId = '', onChanged, onImportCourse }) {
  const signedIn = Boolean(user && user.authenticated);

  const [steps, setSteps] = useState([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [stepData, setStepData] = useState(null);
  const [stepLoading, setStepLoading] = useState(false);
  const [dataVersion, setDataVersion] = useState(0); // bumped after a successful apply to reload data
  const [chats, setChats] = useState({}); // {stepKey: [message]}
  const [stepRequest, setStepRequest] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [pickedFiles, setPickedFiles] = useState([]); // File objects
  const [placement, setPlacement] = useState(null); // {summary, placements, rejected}
  const [placementSelected, setPlacementSelected] = useState({});
  const [placementResults, setPlacementResults] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const courseRef = useRef(courseId);
  const idCounter = useRef(0);

  const newId = () => {
    idCounter.current += 1;
    return `msg-${idCounter.current}`;
  };

  // Responses for a course the teacher has already left are ignored
  const isCurrent = (id) => courseRef.current === id;

  const defaultKey = (steps.find((s) => s.key !== POLICY_KEY) || {}).key || '';
  const activeKey = steps.some((s) => s.key === selectedKey) ? selectedKey : defaultKey;
  const activeStep = steps.find((s) => s.key === activeKey) || null;
  const isPolicy = activeKey === POLICY_KEY;
  const chat = chats[activeKey] || [];

  // Maps each Classroom resource to the step that owns it, used to group placements
  const resourceStep = useMemo(() => {
    const map = {};
    steps.forEach((s) => (s.resources || []).forEach((r) => { map[r.resource] = s.key; }));
    return map;
  }, [steps]);

  useEffect(() => {
    courseRef.current = courseId;
  }, [courseId]);

  // Steps do not depend on the course, so they load once the teacher is signed in
  useEffect(() => {
    if (!signedIn) return;
    getJson('/api/developer/steps')
      .then((d) => setSteps(d.steps || []))
      .catch((e) => setError(e.message));
  }, [signedIn]);

  // A new course starts fresh, with no chats, pasted text, files, or proposals from the last one
  useEffect(() => {
    setChats({});
    setStepRequest('');
    setPastedText('');
    setPickedFiles([]);
    setPlacement(null);
    setPlacementSelected({});
    setPlacementResults(null);
    setSelectedKey('');
    setStepData(null);
    setStepLoading(false);
    setBusy('');
    setError('');
    setNotice('');
  }, [courseId]);

  useEffect(() => {
    if (!signedIn || !courseId || !activeKey || activeKey === POLICY_KEY) {
      setStepData(null);
      setStepLoading(false);
      return undefined;
    }
    let active = true;
    setStepData(null);
    setStepLoading(true);
    getJson(`/api/developer/step-data?courseId=${encodeURIComponent(courseId)}&step=${encodeURIComponent(activeKey)}`)
      .then((d) => { if (active) setStepData(d.data || {}); })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setStepLoading(false); });
    return () => { active = false; };
  }, [signedIn, courseId, activeKey, dataVersion]);

  const updateMessage = (stepKey, msgId, change) =>
    setChats((prev) => ({
      ...prev,
      [stepKey]: (prev[stepKey] || []).map((m) => (m.id === msgId ? { ...m, ...change(m) } : m)),
    }));

  const addFiles = async (event) => {
    const picked = Array.from(event.target.files || []);
    event.target.value = '';
    const material = [];
    for (const file of picked) {
      // A Course Builder template is a whole course. It goes straight to the importer and fills
      // the Course Studio form, exactly as Upload .xlsx does, instead of being read by the AI.
      const course = onImportCourse && /\.xls[xm]?$/i.test(file.name)
        ? readCourseTemplate(new Uint8Array(await file.arrayBuffer()))
        : null;
      if (course) onImportCourse(course, file.name);
      else material.push(file);
    }
    if (material.length > 0) setPickedFiles((prev) => [...prev, ...material]);
  };

  const findPlacements = async () => {
    const text = pastedText.trim();
    if (busy || (!text && pickedFiles.length === 0)) return;
    const forCourse = courseId;
    setBusy('Reading the material and finding where each part goes');
    setError('');
    setNotice('');
    setPlacement(null);
    setPlacementResults(null);
    setPlacementSelected({});
    try {
      const files = await Promise.all(pickedFiles.map(async (f) => ({ name: f.name, data: await readFileBase64(f) })));
      const data = await postJson('/api/developer/place', { courseId: forCourse, text, files, standards: [] });
      if (!isCurrent(forCourse)) return;
      const found = data.placements || [];
      const selected = {};
      found.forEach((_, i) => { selected[i] = true; });
      setPlacement({ summary: data.summary || '', placements: found, rejected: data.rejected || [] });
      setPlacementSelected(selected);
      setNotice(found.length > 0
        ? `Found ${found.length} place(s) for this material. Select the items to apply.`
        : 'No places were found for this material.');
    } catch (e) {
      if (isCurrent(forCourse)) setError(e.message);
    } finally {
      if (isCurrent(forCourse)) setBusy('');
    }
  };

  const applyPlacements = async () => {
    if (!placement || busy) return;
    const forCourse = courseId;
    const chosen = placement.placements.filter((_, i) => placementSelected[i]);
    if (chosen.length === 0) {
      setError('Select at least one item to apply.');
      return;
    }
    setBusy('Applying selected items');
    setError('');
    setNotice('');
    try {
      const data = await postJson('/api/developer/place/apply', { courseId: forCourse, placements: chosen });
      if (!isCurrent(forCourse)) return;
      const results = data.results || [];
      const okCount = results.filter((r) => r.ok).length;
      setPlacementResults(results);
      setPlacement(null);
      setPlacementSelected({});
      setNotice(`Applied ${okCount} of ${results.length} item(s).`);
      setDataVersion((v) => v + 1);
      if (okCount > 0 && onChanged) onChanged(forCourse);
    } catch (e) {
      if (isCurrent(forCourse)) setError(e.message);
    } finally {
      if (isCurrent(forCourse)) setBusy('');
    }
  };

  const proposeChanges = async () => {
    const request = stepRequest.trim();
    if (!request || busy || !activeKey || isPolicy) return;
    const stepKey = activeKey;
    const forCourse = courseId;
    setChats((prev) => ({
      ...prev,
      [stepKey]: [...(prev[stepKey] || []), { id: newId(), role: 'user', content: request }],
    }));
    setStepRequest('');
    setBusy('Reading this step and proposing changes');
    setError('');
    setNotice('');
    try {
      const data = await postJson('/api/developer/propose', {
        courseId: forCourse, step: stepKey, request, text: '', files: [], standards: [],
      });
      if (!isCurrent(forCourse)) return;
      const operations = (data.operations || []).map((op) => ({ ...op, publish: false }));
      const selected = {};
      operations.forEach((_, i) => { selected[i] = true; });
      setChats((prev) => ({
        ...prev,
        [stepKey]: [...(prev[stepKey] || []), {
          id: newId(),
          role: 'agent',
          summary: data.summary || 'No summary.',
          operations,
          selected,
          rejected: data.rejected || [],
          applied: null,
        }],
      }));
    } catch (e) {
      if (isCurrent(forCourse)) setError(e.message);
    } finally {
      if (isCurrent(forCourse)) setBusy('');
    }
  };

  const applyStepOps = async (msg) => {
    const stepKey = activeKey;
    const forCourse = courseId;
    // The server reads the Publish tick from the publish flag and sets the state itself
    const chosen = msg.operations
      .filter((_, i) => msg.selected[i])
      .map((op) => ({ ...op, publish: op.publish === true && canPublish(op) }));
    if (chosen.length === 0) {
      setError('Select at least one change to apply.');
      return;
    }
    setBusy('Applying selected changes');
    setError('');
    setNotice('');
    try {
      const data = await postJson('/api/developer/apply', { courseId: forCourse, operations: chosen });
      if (!isCurrent(forCourse)) return;
      const results = data.results || [];
      const okCount = results.filter((r) => r.ok).length;
      updateMessage(stepKey, msg.id, () => ({ applied: results, selected: {} }));
      setNotice(`Applied ${okCount} of ${results.length} change(s).`);
      setDataVersion((v) => v + 1);
      if (okCount > 0 && onChanged) onChanged(forCourse);
    } catch (e) {
      if (isCurrent(forCourse)) setError(e.message);
    } finally {
      if (isCurrent(forCourse)) setBusy('');
    }
  };

  if (!signedIn) {
    return (
      <div className="card" style={{ padding: 20 }}>
        Sign in with Google using the Log In button at the top of the Course Studio page to use the Course Developer.
      </div>
    );
  }
  if (!courseId) {
    return <div className="card" style={{ padding: 20 }}>Choose a class below to develop it.</div>;
  }

  const placementGroups = () => {
    if (!placement) return [];
    const groups = {};
    placement.placements.forEach((p, i) => {
      const key = resourceStep[p.resource] || 'other';
      if (!groups[key]) groups[key] = [];
      groups[key].push({ p, i });
    });
    const order = [...steps.map((s) => s.key), 'other'];
    return order
      .filter((k) => groups[k])
      .map((k) => ({
        key: k,
        title: k === 'other' ? 'Other' : (steps.find((s) => s.key === k)?.title || k),
        items: groups[k],
      }));
  };

  const anyPlacementSelected = placement ? placement.placements.some((_, i) => placementSelected[i]) : false;

  const toggleOp = (msgId, i, checked) =>
    updateMessage(activeKey, msgId, (m) => ({ selected: { ...m.selected, [i]: checked } }));

  const togglePublish = (msgId, i, checked) =>
    updateMessage(activeKey, msgId, (m) => ({
      operations: m.operations.map((op, j) => (j === i ? { ...op, publish: checked } : op)),
    }));

  const dataEntries = stepData ? Object.entries(stepData) : [];

  return (
    <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
      <div aria-live="polite" style={{ display: 'grid', gap: 6 }}>
        {busy && <div style={muted}>{busy}…</div>}
        {error && <div role="alert" style={errorText}>{error}</div>}
        {notice && <div style={noticeText}>{notice}</div>}
      </div>

      {/* Add documents or paste content */}
      <section className="card" style={{ padding: 18, display: 'grid', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Add documents or paste content</h3>
          <p style={{ ...muted, margin: '4px 0 0' }}>
            The agent finds where each part belongs in this course. Nothing changes in Classroom until you select items and click Apply selected.
          </p>
        </div>

        <label htmlFor="course-developer-text" style={{ fontWeight: 600, fontSize: '0.9rem' }}>Paste text</label>
        <textarea
          id="course-developer-text"
          rows={4}
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          placeholder="Paste lesson notes, a rubric, or a list of tasks"
          style={{ width: '100%', resize: 'vertical' }}
        />

        <label htmlFor="course-developer-files" style={{ fontWeight: 600, fontSize: '0.9rem' }}>
          Attach documents (.txt, .md, .docx, .pdf, .csv, .xlsx, .xlsm)
        </label>
        <input id="course-developer-files" type="file" multiple accept={ACCEPT} onChange={addFiles} />

        {pickedFiles.length > 0 && (
          <ul aria-label="Attached files" style={{ ...listStyle, listStyle: 'none', paddingLeft: 0 }}>
            {pickedFiles.map((f, i) => (
              <li key={`${f.name}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span>{f.name}</span>
                <button
                  type="button"
                  className="btn-secondary"
                  aria-label={`Remove ${f.name} from the attachments`}
                  onClick={() => setPickedFiles((prev) => prev.filter((_, j) => j !== i))}
                  style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div>
          <button
            type="button"
            className="btn-primary"
            disabled={!!busy || (!pastedText.trim() && pickedFiles.length === 0)}
            onClick={findPlacements}
          >
            Find where each part goes
          </button>
        </div>

        {placement && (
          <div style={{ display: 'grid', gap: 10 }}>
            <p style={{ margin: 0 }}><strong>Agent summary:</strong> {placement.summary || 'No summary.'}</p>
            {placementGroups().map((group) => (
              <section key={group.key} aria-label={group.title}>
                <h4 style={headingStyle}>{group.title}</h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                  {group.items.map(({ p, i }) => (
                    <li key={`${p.resource}-${i}`} style={itemBox}>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <input
                          type="checkbox"
                          checked={!!placementSelected[i]}
                          onChange={(e) => setPlacementSelected((prev) => ({ ...prev, [i]: e.target.checked }))}
                        />
                        <span>
                          <code>{p.resource}</code> · {p.method}
                          <br />
                          {p.reason}
                        </span>
                      </label>
                      {p.source && <div style={{ ...muted, marginTop: 4 }}>From: {p.source}</div>}
                      <Details value={{ params: p.params, body: p.body }} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <RejectedList items={placement.rejected} />
            {placement.placements.length > 0 && (
              <div>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!!busy || !anyPlacementSelected}
                  onClick={applyPlacements}
                >
                  Apply selected
                </button>
              </div>
            )}
          </div>
        )}

        {placementResults && (
          <div>
            <strong style={{ fontSize: '0.9rem' }}>Results</strong>
            <ResultList results={placementResults} />
          </div>
        )}
      </section>

      {/* Steps and the selected step */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 240px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <nav aria-label="Course steps" style={{ display: 'grid', gap: 6 }}>
          {steps.length === 0 && <div style={muted}>Loading course steps…</div>}
          {steps.map((s) => {
            const active = s.key === activeKey;
            return (
              <button
                key={s.key}
                type="button"
                aria-current={active ? 'step' : undefined}
                onClick={() => setSelectedKey(s.key)}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: active ? '2px solid #1a73e8' : '1px solid var(--border-color, #e2e8f0)',
                  background: 'var(--card-bg, #fff)',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontWeight: active ? 700 : 500,
                }}
              >
                {s.title}
              </button>
            );
          })}
        </nav>

        <section className="card" style={{ padding: 18, display: 'grid', gap: 16, minWidth: 0 }}>
          {!activeStep && <div style={muted}>Choose a step on the left.</div>}

          {activeStep && isPolicy && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{activeStep.title}</h3>
                <p style={{ margin: '6px 0 0' }}>{activeStep.description}</p>
              </div>
              <div>
                <h4 style={headingStyle}>Blocked deletes</h4>
                <ul style={listStyle}>
                  {(activeStep.blocked_deletes || []).map((r) => (
                    <li key={`${r.resource}-${r.method}`}>
                      <code>{r.resource}</code> {r.method}: deleting is not available in this app
                    </li>
                  ))}
                </ul>
              </div>
              <p style={{ margin: 0 }}>Delete items in the Google Classroom dashboard, not here.</p>
            </div>
          )}

          {activeStep && !isPolicy && (
            <>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{activeStep.title}</h3>
                {activeStep.description && <p style={{ margin: '6px 0 0' }}>{activeStep.description}</p>}
                <div style={{ ...muted, marginTop: 6 }}>
                  {(activeStep.resources || []).map((r) => (
                    <div key={r.resource}>
                      <code>{r.resource}</code>{r.methods ? ` (${methodsText(r.methods)})` : ''}
                    </div>
                  ))}
                </div>
              </div>

              {/* Course data for this step */}
              <div>
                <h4 style={headingStyle}>Course data</h4>
                {stepLoading && <div style={muted}>Loading course data…</div>}
                {!stepLoading && !stepData && <div style={muted}>Course data could not be loaded.</div>}
                {!stepLoading && stepData && dataEntries.length === 0 && <div style={muted}>No data for this step.</div>}
                {!stepLoading && stepData && dataEntries.map(([name, value]) => {
                  const items = asList(value);
                  return (
                    <div key={name} style={{ marginBottom: 10 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        <code>{name}</code> ({items.length})
                      </div>
                      {items.length === 0 && <div style={muted}>None found.</div>}
                      {items.length > 0 && (
                        <ul style={listStyle}>
                          {items.slice(0, LIST_LIMIT).map((item, i) => <li key={i}>{itemLabel(item)}</li>)}
                          {items.length > LIST_LIMIT && <li style={muted}>and {items.length - LIST_LIMIT} more</li>}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Step agent chat */}
              <div style={{ display: 'grid', gap: 10 }}>
                <h4 style={headingStyle}>Ask the agent about this step</h4>
                {chat.length === 0 && <div style={muted}>Describe a change to this step. The agent will propose it, and you choose what to apply.</div>}
                {chat.map((m) => (
                  m.role === 'user' ? (
                    <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <div style={bubble(true)}>{m.content}</div>
                    </div>
                  ) : (
                    <div key={m.id} style={{ ...itemBox, display: 'grid', gap: 8, background: 'var(--app-bg, #fff)' }}>
                      <p style={{ margin: 0 }}><strong>Agent:</strong> {m.summary}</p>
                      {m.applied ? (
                        <div>
                          <strong style={{ fontSize: '0.9rem' }}>Results</strong>
                          <ResultList results={m.applied} />
                        </div>
                      ) : (
                        <>
                          {m.operations.length === 0 && <p style={{ ...muted, margin: 0 }}>No changes were proposed.</p>}
                          {m.operations.length > 0 && (
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                              {m.operations.map((op, i) => (
                                <li key={i} style={itemBox}>
                                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                    <input
                                      type="checkbox"
                                      checked={!!m.selected[i]}
                                      onChange={(e) => toggleOp(m.id, i, e.target.checked)}
                                    />
                                    <span>
                                      <code>{op.resource}</code> · {op.method}
                                      {op.reason ? <><br />{op.reason}</> : null}
                                    </span>
                                  </label>
                                  {canPublish(op) && (
                                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, fontSize: '0.85rem' }}>
                                      <input
                                        type="checkbox"
                                        checked={!!op.publish}
                                        onChange={(e) => togglePublish(m.id, i, e.target.checked)}
                                      />
                                      Publish to students now (otherwise it is saved as a draft)
                                    </label>
                                  )}
                                  <Details value={{ params: op.params, body: op.body }} />
                                </li>
                              ))}
                            </ul>
                          )}
                          <RejectedList items={m.rejected} />
                          {m.operations.length > 0 && (
                            <div>
                              <button
                                type="button"
                                className="btn-primary"
                                disabled={!!busy || !m.operations.some((_, i) => m.selected[i])}
                                onClick={() => applyStepOps(m)}
                              >
                                Apply selected
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                ))}

                <label htmlFor="course-developer-step-request" style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  Request for this step
                </label>
                <textarea
                  id="course-developer-step-request"
                  rows={3}
                  value={stepRequest}
                  onChange={(e) => setStepRequest(e.target.value)}
                  placeholder="For example: add a quiz for unit 2 with five questions and answers"
                  style={{ width: '100%', resize: 'vertical' }}
                />
                <div>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!!busy || !stepRequest.trim()}
                    onClick={proposeChanges}
                  >
                    Propose changes
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
