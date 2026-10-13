import React, { useEffect, useRef, useState } from 'react';
import { readCourseTemplate } from '../lib/courseWorkbook';

// AI Course Agent: a chat the teacher can open at every step. They can type, paste,
// or attach files, and the agent writes the course text. Build mode turns the
// conversation into a new course. Edit mode proposes changes to the selected course,
// and nothing changes in Classroom until the teacher approves them.

const STEPS = {
  create: [
    { label: 'Outline the course', prompt: 'Outline this course: units, weekly topics, and learning outcomes for each unit.' },
    { label: 'Write lesson notes', prompt: 'Write lesson notes for the first unit, with key points and a short activity.' },
    { label: 'Create assessments', prompt: 'Create one assignment and two quiz questions with answers for each unit.' },
    { label: 'Sort my material', prompt: 'Look at the attached material. Say what each file contains and where it should go, then ask how to sort or filter it.' },
    { label: 'Check standards', prompt: 'Check the course outline against the selected standards and list any gaps with fixes.' },
  ],
  edit: [
    { label: 'Improve unit overviews', prompt: 'Improve the unit overviews in this course so they are clear and measurable.' },
    { label: 'Write assessments', prompt: 'Write new assessments for the weakest unit in this course, with answers.' },
    { label: 'Suggest announcement', prompt: 'Draft a welcome announcement for students in this course.' },
    { label: 'Sort my material', prompt: 'Look at the attached material. Say which parts belong in this course and where, then ask how to sort or filter it.' },
    { label: 'Check standards', prompt: 'Check this course against the selected standards and list gaps with fixes.' },
  ],
};

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

export default function CourseAgentPanel({ user, mode = 'create', courseId = '', onChanged, onCopied, onImportCourse }) {
  const isEdit = mode === 'edit';
  const signedIn = Boolean(user && user.authenticated);
  const steps = isEdit ? STEPS.edit : STEPS.create;

  const [standards, setStandards] = useState([]);
  const [chosenStandards, setChosenStandards] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState([]); // {name, text}
  const [plan, setPlan] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [acceptedOps, setAcceptedOps] = useState({});
  const [editChoice, setEditChoice] = useState('inPlace');
  const [copySection, setCopySection] = useState('');
  const [openWeeks, setOpenWeeks] = useState({});
  const [notebookUrl, setNotebookUrl] = useState('');
  const [notebookTitle, setNotebookTitle] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const threadEnd = useRef(null);

  useEffect(() => {
    if (!signedIn) return;
    getJson('/api/standards').then((d) => setStandards(d.standards || [])).catch(() => {});
  }, [signedIn]);

  // A new course or a different course starts a fresh conversation
  useEffect(() => {
    setMessages([]);
    setPlan(null);
    setProposal(null);
    setAttachments([]);
    setError('');
    setNotice('');
  }, [courseId, mode]);

  useEffect(() => {
    if (threadEnd.current) threadEnd.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  const run = async (label, fn) => {
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const toggleStandard = (key) =>
    setChosenStandards((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const transcript = () => messages.map((m) => `${m.role === 'user' ? 'Teacher' : 'Agent'}: ${m.content}`).join('\n\n');

  const materialText = () => attachments.map((a) => `## ${a.name}\n${a.text}`).join('\n\n');

  const sendMessage = (text) => {
    const content = (text ?? draft).trim();
    if (!content || busy) return;
    const nextMessages = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setDraft('');
    run('Agent is writing', async () => {
      const data = await postJson('/api/agent/chat', {
        messages: nextMessages.slice(-30),
        mode,
        courseId,
        attachments,
        plan,
        standards: chosenStandards,
      });
      setMessages((prev) => [...prev, { role: 'agent', content: data.reply }]);
    });
  };

  const attachFiles = async (event) => {
    const all = Array.from(event.target.files || []);
    event.target.value = '';
    // A Course Builder template goes straight to the importer (see CourseDeveloper), not the AI.
    const picked = [];
    for (const file of all) {
      const course = onImportCourse && /\.xls[xm]?$/i.test(file.name)
        ? readCourseTemplate(new Uint8Array(await file.arrayBuffer()))
        : null;
      if (course) onImportCourse(course, file.name);
      else picked.push(file);
    }
    if (picked.length === 0) return;
    await run('Reading files', async () => {
      const encoded = await Promise.all(picked.map(async (f) => ({ name: f.name, data: await readFileBase64(f) })));
      const data = await postJson('/api/agent/extract', { files: encoded });
      setAttachments((prev) => [...prev, ...data.files]);
      setNotice(`Attached ${data.files.length} file(s). The agent can use them in its next reply.`);
    });
  };

  const pasteAsAttachment = () => {
    const text = draft.trim();
    if (!text) return;
    setAttachments((prev) => [...prev, { name: `Pasted text ${prev.length + 1}`, text }]);
    setDraft('');
  };

  const draftPlan = () => run('Building the course plan', async () => {
    const data = await postJson('/api/agent/plan', {
      text: [transcript(), materialText()].filter(Boolean).join('\n\n'),
      files: [],
      instructions: '',
      standards: chosenStandards,
    });
    setPlan(data.plan);
    const open = {};
    data.plan.units.forEach((_, i) => { open[`plan-${i}`] = false; });
    setOpenWeeks(open);
    setNotice('Course plan ready. Review it below, ask for changes in the chat, or create the course.');
  });

  const reviseWithChat = () => {
    if (!plan) return;
    const last = messages.filter((m) => m.role === 'user').slice(-1)[0];
    if (!last) return;
    run('Revising the plan', async () => {
      const data = await postJson('/api/agent/revise', { plan, request: last.content, standards: chosenStandards });
      setPlan(data.plan);
      setNotice('Plan updated from your last request.');
    });
  };

  const buildCourse = () => run('Creating course in Classroom', async () => {
    const data = await postJson('/api/agent/build', { plan });
    const failed = data.failedSteps || [];
    setNotice(`Course created: ${data.course?.name || plan.course.name}. Topics: ${data.topicsCount}, assignments: ${data.courseworkCount}.`
      + (data.invitationsCount ? ` Invitations sent: ${data.invitationsCount}.` : '')
      + (failed.length ? ` Failed: ${failed.map(f => `${f.step} ${f.target}`).join(', ')}.` : ''));
    setPlan(null);
    if (onChanged) onChanged('');
  });

  const proposeEdit = () => run('Reading the course and proposing changes', async () => {
    const last = messages.filter((m) => m.role === 'user').slice(-1)[0];
    const data = await postJson('/api/agent/edit/propose', {
      courseId,
      request: last ? last.content : 'Apply the conversation to this course.',
      standards: chosenStandards,
      text: [transcript(), materialText()].filter(Boolean).join('\n\n'),
      files: [],
      answers: '',
    });
    setProposal(data);
    const accepted = {};
    data.operations.forEach((_, i) => { accepted[i] = true; });
    setAcceptedOps(accepted);
  });

  // Edits never create a course unless the teacher picks "make a copy".
  const applyEdits = () => run('Applying approved changes', async () => {
    const operations = proposal.operations.filter((_, i) => acceptedOps[i]);
    if (operations.length === 0) throw new Error('Select at least one change to apply.');
    const last = messages.filter((m) => m.role === 'user').slice(-1)[0];
    const request = last ? last.content : 'Apply the conversation to this course.';
    if (editChoice === 'copy') {
      if (!copySection.trim()) throw new Error('Enter a section name for the copy.');
      const data = await postJson('/api/agent/edit/copy', {
        courseId, newSection: copySection.trim(), request, standards: chosenStandards,
        text: [transcript(), materialText()].filter(Boolean).join('\n\n'), files: [], answers: '',
      });
      setCopySection('');
      setProposal(data.proposal);
      const accepted = {};
      data.proposal.operations.forEach((_, i) => { accepted[i] = true; });
      setAcceptedOps(accepted);
      setNotice(`Copy created: “${data.copy.name}”. Review its changes below, then apply them.`);
      if (onCopied) onCopied(data.copy.id);
      return;
    }
    const data = await postJson('/api/agent/edit/apply', { courseId, operations });
    setNotice(`Applied ${data.applied.length} change(s) to this version.`);
    setProposal(null);
    if (onChanged) onChanged(courseId);
  });

  const linkNotebook = () => run('Linking NotebookLM notebook', async () => {
    await postJson('/api/agent/link-notebook', {
      courseId, url: notebookUrl, title: notebookTitle || 'NotebookLM notebook',
    });
    setNotebookUrl('');
    setNotebookTitle('');
    setNotice('NotebookLM notebook linked to this course.');
    if (onChanged) onChanged(courseId);
  });

  if (!signedIn) {
    return (
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        Sign in with Google using the Log In button at the top of the Course Studio page to use the AI Course Agent.
      </div>
    );
  }
  if (isEdit && !courseId) {
    return <div className="card" style={{ padding: 20, marginBottom: 24 }}>Choose a class below to work on it with the agent.</div>;
  }

  const canUseMaterial = attachments.length > 0 || messages.length > 0;

  return (
    <section className="card" style={{ padding: 0, marginBottom: 24, overflow: 'hidden' }}>
      {/* Header and step actions */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-color, #e2e8f0)', display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <strong style={{ fontSize: '1.05rem' }}>AI Course Agent</strong>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>
              {isEdit ? 'Works on this course. Changes wait for your approval.' : 'Helps you write every step of a new course.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {standards.map((s) => (
              <label key={s.key} style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={chosenStandards.includes(s.key)} onChange={() => toggleStandard(s.key)} />
                {s.name.split(' (')[0]}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {steps.map((step) => (
            <button
              key={step.label}
              type="button"
              className="btn-secondary"
              disabled={!!busy}
              onClick={() => sendMessage(step.prompt)}
              style={{ fontSize: '0.8rem', padding: '6px 10px', borderRadius: 999 }}
            >
              {step.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation */}
      <div style={{ padding: 18, minHeight: 200, maxHeight: 460, overflowY: 'auto', display: 'grid', gap: 12, background: 'var(--app-bg, #fff)' }}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--text-muted, #64748b)', fontSize: '0.9rem' }}>
            Ask for anything: an outline, lesson notes, quiz questions, or a rewrite. Paste your own text or attach documents, sheets, or PDFs.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 8 }}>
            {m.role !== 'user' && (
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1a73e8', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>AI</div>
            )}
            <div style={bubble(m.role === 'user')}>{m.content}</div>
          </div>
        ))}
        {busy && <div style={{ color: 'var(--text-muted, #64748b)', fontSize: '0.85rem' }}>{busy}…</div>}
        <div ref={threadEnd} />
      </div>

      {/* Status and results */}
      <div style={{ padding: '0 18px', display: 'grid', gap: 10 }}>
        {error && <div style={{ color: '#c5221f', fontSize: '0.88rem' }}>{error}</div>}
        {notice && <div style={{ color: '#137333', fontSize: '0.88rem' }}>{notice}</div>}

        {!isEdit && canUseMaterial && (
          <div>
            <button className="btn-secondary" disabled={!!busy} onClick={draftPlan} style={{ fontSize: '0.85rem' }}>
              Turn this conversation into a course plan
            </button>
          </div>
        )}

        {!isEdit && plan && (
          <div className="card" style={{ padding: 14 }}>
            <strong>{plan.course.name}</strong>
            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              {plan.units.map((u, i) => {
                const key = `plan-${i}`;
                return (
                  <div key={key} style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 8, padding: 8 }}>
                    <button
                      type="button"
                      onClick={() => setOpenWeeks((p) => ({ ...p, [key]: !p[key] }))}
                      style={{ background: 'none', border: 'none', padding: 0, width: '100%', textAlign: 'left', color: 'inherit', cursor: 'pointer', fontWeight: 600 }}
                    >
                      {openWeeks[key] ? '▾' : '▸'} Week {i + 1}: {u.title}
                    </button>
                    {openWeeks[key] && (
                      <div style={{ marginTop: 6, fontSize: '0.88rem' }}>
                        <p>{u.overview}</p>
                        {u.outcomes?.length > 0 && <ul>{u.outcomes.map((o, j) => <li key={j}>{o}</li>)}</ul>}
                        {u.assessments?.map((a, j) => <p key={j}>Assessment: {a.title} ({a.points} pts)</p>)}
                        {u.notebook_url && <p>NotebookLM: {u.notebook_url}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button className="btn-secondary" disabled={!!busy || messages.length === 0} onClick={reviseWithChat}>
                Apply my last request to the plan
              </button>
              <button className="btn-primary" disabled={!!busy} onClick={buildCourse}>Create course in Classroom</button>
            </div>
          </div>
        )}

        {isEdit && (
          <div>
            <button className="btn-secondary" disabled={!!busy || messages.length === 0} onClick={proposeEdit} style={{ fontSize: '0.85rem' }}>
              Propose changes to this course from the conversation
            </button>
          </div>
        )}

        {isEdit && proposal && (
          <div className="card" style={{ padding: 14 }}>
            <p><strong>Agent summary:</strong> {proposal.summary || 'No summary.'}</p>
            {proposal.operations.length === 0 && <p>No changes were proposed.</p>}
            <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
              {proposal.operations.map((op, i) => (
                <li key={`${op.resource}-${op.id}-${i}`} style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 8, padding: 10 }}>
                  <label>
                    <input type="checkbox" checked={!!acceptedOps[i]} onChange={(e) => setAcceptedOps({ ...acceptedOps, [i]: e.target.checked })} />{' '}
                    <strong>{op.resource.replace('courses.', '')}</strong>: {op.reason}
                  </label>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0', fontSize: '0.82rem' }}>{JSON.stringify(op.fields, null, 2)}</pre>
                </li>
              ))}
            </ul>
            {proposal.operations.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <p style={{ margin: '4px 0' }}><strong>Edit this version, or make a copy and edit the copy?</strong></p>
                <label style={{ display: 'block' }}>
                  <input type="radio" name="editChoice" checked={editChoice === 'inPlace'} onChange={() => setEditChoice('inPlace')} /> Edit this version
                </label>
                <label style={{ display: 'block' }}>
                  <input type="radio" name="editChoice" checked={editChoice === 'copy'} onChange={() => setEditChoice('copy')} /> Make a copy and edit the copy (creates one new course)
                </label>
                {editChoice === 'copy' && (
                  <input type="text" placeholder="Section name for the copy" value={copySection} onChange={(e) => setCopySection(e.target.value)} style={{ width: '100%', marginTop: 6 }} />
                )}
                <button
                  className="btn-primary"
                  style={{ marginTop: 8 }}
                  disabled={!!busy || (editChoice === 'copy' && !copySection.trim())}
                  onClick={applyEdits}
                >
                  {editChoice === 'copy' ? 'Create copy and propose changes' : 'Apply selected changes to this version'}
                </button>
              </div>
            )}
          </div>
        )}

        {isEdit && (
          <details style={{ fontSize: '0.88rem' }}>
            <summary style={{ cursor: 'pointer' }}>Link a NotebookLM notebook</summary>
            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              <input type="url" placeholder="https://notebooklm.google.com/notebook/..." value={notebookUrl} onChange={(e) => setNotebookUrl(e.target.value)} />
              <input type="text" placeholder="Title shown in Classroom (optional)" value={notebookTitle} onChange={(e) => setNotebookTitle(e.target.value)} />
              <button className="btn-secondary" disabled={!notebookUrl.trim() || !!busy} onClick={linkNotebook} style={{ justifySelf: 'start' }}>
                Attach notebook to course
              </button>
            </div>
          </details>
        )}
      </div>

      {/* Composer */}
      <div style={{ padding: 14, borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'grid', gap: 8, marginTop: 12 }}>
        {attachments.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {attachments.map((a, i) => (
              <span key={`${a.name}-${i}`} style={{ background: 'var(--card-bg, #f1f5f9)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 999, padding: '3px 10px', fontSize: '0.8rem' }}>
                📎 {a.name}
                <button type="button" onClick={() => setAttachments(attachments.filter((_, j) => j !== i))} style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
              </span>
            ))}
          </div>
        )}
        <textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder={isEdit ? 'Ask the agent to change this course, or paste text to work with…' : 'Describe the course, or paste your material…'}
          style={{ width: '100%', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label className="btn-secondary" style={{ cursor: 'pointer', fontSize: '0.85rem', padding: '6px 10px' }}>
            📎 Attach files
            <input type="file" multiple accept=".txt,.md,.docx,.pdf,.csv,.xlsx,.xlsm" onChange={attachFiles} style={{ display: 'none' }} />
          </label>
          <button type="button" className="btn-secondary" disabled={!draft.trim()} onClick={pasteAsAttachment} style={{ fontSize: '0.85rem', padding: '6px 10px' }}>
            Keep pasted text as a file
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button type="button" className="btn-primary" disabled={!draft.trim() || !!busy} onClick={() => sendMessage()}>
              Send
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
