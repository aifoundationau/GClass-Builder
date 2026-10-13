import React, { useEffect, useState } from 'react';
import { ExternalLink, Pencil, Plus, RefreshCw } from 'lucide-react';

// A simple editor for one Google Classroom course, after it is created. Each save is one
// Classroom API call (see course_editor.py): course details, topics, posts and announcements
// can be changed, and new ones added. Nothing is deleted. Google only lets an app change items
// that the same app created, so items made in Classroom itself are shown but locked, with a
// link to change them there. Attachments cannot be changed once a post is made.

async function request(url, body) {
  const res = await fetch(url, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const pad = (n) => String(n).padStart(2, '0');

// Classroom keeps due dates in UTC; the editor shows and takes them in this computer's time.
const dueToLocal = (d, t) => {
  if (!d || !d.year) return { date: '', time: '' };
  const at = new Date(Date.UTC(d.year, d.month - 1, d.day, (t && t.hours) || 0, (t && t.minutes) || 0));
  return { date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`, time: `${pad(at.getHours())}:${pad(at.getMinutes())}` };
};
const dueLabel = (w) => {
  const { date, time } = dueToLocal(w.dueDate, w.dueTime);
  return date ? new Date(`${date}T${time}`).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
};

const attachmentOf = (m) => {
  if (m.driveFile) return { kind: 'Drive file', title: m.driveFile.driveFile?.title, url: m.driveFile.driveFile?.alternateLink };
  if (m.youtubeVideo) return { kind: 'YouTube', title: m.youtubeVideo.title, url: m.youtubeVideo.alternateLink || `https://www.youtube.com/watch?v=${m.youtubeVideo.id}` };
  if (m.form) return { kind: 'Google Form', title: m.form.title, url: m.form.formUrl };
  return { kind: 'Link', title: m.link?.title, url: m.link?.url };
};
const isQuiz = (w) => w.workType === 'ASSIGNMENT'
  && (w.materials || []).some((m) => m.form || /docs\.google\.com\/forms/.test(m.link?.url || ''));
const kindOf = (w) => (w.workType === 'ASSIGNMENT' ? 'assignment' : 'question');
const kindLabel = (w) => {
  if (w.workType === 'MULTIPLE_CHOICE_QUESTION') return 'Multiple-choice question';
  if (w.workType === 'SHORT_ANSWER_QUESTION') return 'Question';
  return isQuiz(w) ? 'Quiz' : 'Assignment';
};

const sectionStyle = { border: '1px solid var(--border-color)', borderRadius: 10, padding: 16, display: 'grid', gap: 10 };
const rowStyle = { border: '1px solid var(--border-color)', borderRadius: 8, padding: '10px 12px' };
const muted = { color: 'var(--text-muted)', fontSize: '0.8rem' };
const small = { fontSize: '0.78rem', padding: '4px 10px' };

function Message({ message }) {
  if (!message) return null;
  return (
    <div role={message.error ? 'alert' : 'status'} style={{ fontSize: '0.8rem', color: message.error ? '#c5221f' : '#188038' }}>
      {message.text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One material, assignment, quiz or question
// ---------------------------------------------------------------------------

function PostRow({ item, kind, topics, hasRubric, save }) {
  const locked = item.associatedWithDeveloper === false;
  const initial = {
    title: item.title || '',
    description: item.description || '',
    topicId: item.topicId || '',
    maxPoints: item.maxPoints ?? '',
    ...dueToLocal(item.dueDate, item.dueTime),
  };
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initial);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(initial); }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  const changes = {};
  if (draft.title !== initial.title) changes.title = draft.title;
  if (draft.description !== initial.description) changes.description = draft.description;
  if (draft.topicId !== initial.topicId) changes.topicId = draft.topicId;
  if (kind !== 'material' && String(draft.maxPoints) !== String(initial.maxPoints)) changes.maxPoints = draft.maxPoints === '' ? 0 : Number(draft.maxPoints);
  if (kind !== 'material' && (draft.date !== initial.date || draft.time !== initial.time)) {
    changes.due = draft.date ? (draft.time ? `${draft.date}T${draft.time}` : draft.date) : '';
  }

  const run = async (fields, done) => {
    setBusy(true);
    setMessage(null);
    try {
      await save(kind, item.id, fields);
      setMessage({ text: done });
    } catch (e) {
      setMessage({ error: true, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const meta = [
    item.state === 'DRAFT' ? 'Draft' : '',
    kind !== 'material' && item.maxPoints ? `${item.maxPoints} pts` : '',
    kind !== 'material' && dueLabel(item) ? `Due ${dueLabel(item)}` : '',
    hasRubric ? 'Rubric' : '',
  ].filter(Boolean).join(' · ');

  return (
    <article aria-label={item.title} style={rowStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={muted}>{kind === 'material' ? 'Material' : kindLabel(item)}{meta ? ` · ${meta}` : ''}</div>
          <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>{item.title}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {item.alternateLink && (
            <a href={item.alternateLink} target="_blank" rel="noreferrer" className="btn-secondary" style={{ ...small, textDecoration: 'none' }} title="Open in Google Classroom">
              <ExternalLink size={12} />
            </a>
          )}
          <button type="button" className="btn-secondary" style={small} onClick={() => setOpen(!open)} aria-expanded={open}>
            <Pencil size={12} />
            <span>{open ? 'Close' : 'Edit'}</span>
          </button>
        </div>
      </div>

      {open && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {locked && (
            <div style={{ ...muted, color: '#b45309' }}>
              Made in Google Classroom, not by Course Builder. Google only lets you change it there: use the open button.
            </div>
          )}
          <label className="form-label" style={{ margin: 0 }}>Title
            <input className="form-control" value={draft.title} disabled={locked} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className="form-label" style={{ margin: 0 }}>{kind === 'material' ? 'Description' : 'Instructions'}
            <textarea className="form-control" rows={3} value={draft.description} disabled={locked} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: kind === 'material' ? '1fr' : 'minmax(0, 2fr) 90px minmax(0, 2fr)', gap: 8 }}>
            <label className="form-label" style={{ margin: 0 }}>Topic
              <select className="form-control" value={draft.topicId} disabled={locked} onChange={(e) => setDraft({ ...draft, topicId: e.target.value })}>
                <option value="">No topic</option>
                {topics.map((t) => <option key={t.topicId} value={t.topicId}>{t.name}</option>)}
              </select>
            </label>
            {kind !== 'material' && (
              <>
                <label className="form-label" style={{ margin: 0 }}>Points
                  <input className="form-control" type="number" min="0" step="1" value={draft.maxPoints} disabled={locked}
                    onChange={(e) => setDraft({ ...draft, maxPoints: e.target.value })} />
                </label>
                <label className="form-label" style={{ margin: 0 }}>Due (your time)
                  <span style={{ display: 'flex', gap: 6 }}>
                    <input className="form-control" type="date" aria-label="Due date" value={draft.date} disabled={locked}
                      onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
                    <input className="form-control" type="time" aria-label="Due time" value={draft.time} disabled={locked || !draft.date}
                      onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
                  </span>
                </label>
              </>
            )}
          </div>

          {(item.materials || []).length > 0 && (
            <div>
              <div style={muted}>Attachments (Classroom does not let apps change these after posting)</div>
              <ul style={{ margin: '4px 0 0 18px', padding: 0, fontSize: '0.82rem' }}>
                {item.materials.map((m, i) => {
                  const a = attachmentOf(m);
                  return (
                    <li key={i}>
                      {a.kind}: {a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.title || a.url}</a> : (a.title || '')}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="btn-primary" style={small} disabled={locked || busy || Object.keys(changes).length === 0}
              onClick={() => run(changes, 'Saved to Classroom.')}>
              Save changes
            </button>
            {item.state === 'DRAFT' && (
              <button type="button" className="btn-secondary" style={small} disabled={locked || busy}
                onClick={() => run({ state: 'PUBLISHED' }, 'Published to students.')}>
                Publish to students
              </button>
            )}
            <Message message={message} />
          </div>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Adding a post
// ---------------------------------------------------------------------------

function AddPost({ topics, create }) {
  const blank = { kind: 'material', title: '', description: '', topicId: '', maxPoints: 100, date: '', time: '', links: '', questionType: 'SHORT_ANSWER_QUESTION', choices: '' };
  const [form, setForm] = useState(blank);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (fields) => setForm({ ...form, ...fields });

  const submit = async () => {
    const fields = { title: form.title, description: form.description, topicId: form.topicId };
    if (form.kind !== 'material') {
      fields.maxPoints = Number(form.maxPoints || 0);
      if (form.date) fields.due = form.time ? `${form.date}T${form.time}` : form.date;
    }
    if (form.kind !== 'question') fields.links = form.links.split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
    if (form.kind === 'question') {
      fields.questionType = form.questionType;
      fields.choices = form.choices.split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await create(form.kind, fields);
      setMessage({ text: ['Added to Classroom.', ...(result.notes || [])].join(' ') });
      setForm({ ...blank, kind: form.kind, topicId: form.topicId });
    } catch (e) {
      setMessage({ error: true, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...rowStyle, display: 'grid', gap: 8 }}>
      <strong style={{ fontSize: '0.9rem' }}>Add to classwork</strong>
      <div style={{ display: 'grid', gridTemplateColumns: '160px minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
        <select className="form-control" aria-label="Type" value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
          <option value="material">Material</option>
          <option value="assignment">Assignment</option>
          <option value="question">Question</option>
        </select>
        <input className="form-control" aria-label="Title" placeholder="Title" value={form.title} onChange={(e) => set({ title: e.target.value })} />
        <select className="form-control" aria-label="Topic" value={form.topicId} onChange={(e) => set({ topicId: e.target.value })}>
          <option value="">No topic</option>
          {topics.map((t) => <option key={t.topicId} value={t.topicId}>{t.name}</option>)}
        </select>
      </div>
      <textarea className="form-control" rows={2} aria-label="Description or instructions" placeholder={form.kind === 'material' ? 'Description' : 'Instructions'}
        value={form.description} onChange={(e) => set({ description: e.target.value })} />
      {form.kind !== 'material' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={muted}>Points <input className="form-control" style={{ width: 90 }} type="number" min="0" step="1" value={form.maxPoints} onChange={(e) => set({ maxPoints: e.target.value })} /></label>
          <label style={muted}>Due <input className="form-control" type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} /></label>
          <input className="form-control" style={{ width: 120 }} type="time" aria-label="Due time" value={form.time} disabled={!form.date} onChange={(e) => set({ time: e.target.value })} />
        </div>
      )}
      {form.kind !== 'question' ? (
        <textarea className="form-control" rows={2} aria-label="Links"
          placeholder="Full links, one per line: Google Drive files, YouTube videos, web pages, notebooks"
          value={form.links} onChange={(e) => set({ links: e.target.value })} />
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          <select className="form-control" aria-label="Question type" value={form.questionType} onChange={(e) => set({ questionType: e.target.value })}>
            <option value="SHORT_ANSWER_QUESTION">Short answer</option>
            <option value="MULTIPLE_CHOICE_QUESTION">Multiple choice</option>
          </select>
          {form.questionType === 'MULTIPLE_CHOICE_QUESTION' && (
            <textarea className="form-control" rows={3} aria-label="Choices" placeholder="Choices, one per line (at least 2)"
              value={form.choices} onChange={(e) => set({ choices: e.target.value })} />
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn-primary" style={small} disabled={busy || !form.title.trim()} onClick={submit}>
          <Plus size={12} />
          <span>Add</span>
        </button>
        <Message message={message} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small inline editors: a topic name, an announcement, a new topic or announcement
// ---------------------------------------------------------------------------

function InlineText({ value, multiline, placeholder, buttonLabel, onSave, locked }) {
  const [text, setText] = useState(value || '');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setText(value || ''); }, [value]);
  const Field = multiline ? 'textarea' : 'input';
  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await onSave(text);
      setMessage({ text: 'Saved to Classroom.' });
      if (!value) setText('');
    } catch (e) {
      setMessage({ error: true, text: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: multiline ? 'flex-start' : 'center' }}>
        <Field className="form-control" rows={multiline ? 3 : undefined} placeholder={placeholder} aria-label={placeholder}
          value={text} disabled={locked} onChange={(e) => setText(e.target.value)} />
        <button type="button" className="btn-secondary" style={{ ...small, flexShrink: 0 }}
          disabled={locked || busy || !text.trim() || text === (value || '')} onClick={submit}>
          {buttonLabel}
        </button>
      </div>
      <Message message={message} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

const COURSE_FIELDS = [
  ['name', 'Course name'], ['section', 'Section'], ['subject', 'Subject'], ['room', 'Room'], ['descriptionHeading', 'Description heading'],
];

export default function CourseEditor({ courseId, onCourseChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState({});
  const [detailsMessage, setDetailsMessage] = useState(null);
  const [renaming, setRenaming] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    request(`/api/classroom/editor?id=${encodeURIComponent(courseId)}`)
      .then((d) => {
        setData(d);
        setDetails(Object.fromEntries([...COURSE_FIELDS.map(([k]) => k), 'description', 'courseState'].map((k) => [k, d.course[k] || ''])));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (courseId) load(); }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (kind, action, id, fields) => request('/api/classroom/edit', { courseId, kind, action, id, fields });

  // Saving one item: Classroom answers with the item as it now is, which replaces the old copy.
  const saveItem = async (kind, id, fields) => {
    const { item } = await edit(kind, 'update', id, fields);
    const list = kind === 'material' ? 'courseWorkMaterials' : kind === 'announcement' ? 'announcements' : kind === 'topic' ? 'topics' : 'courseWork';
    const key = kind === 'topic' ? 'topicId' : 'id';
    setData((d) => ({ ...d, [list]: d[list].map((x) => (x[key] === id ? { ...x, ...item } : x)) }));
  };
  const createItem = async (kind, fields) => {
    const result = await edit(kind, 'create', '', fields);
    load();
    return result;
  };

  if (error && !data) return <div className="card" style={{ color: '#c5221f', padding: 12 }}>{error}</div>;
  if (!data) return <div className="card" style={{ padding: 16 }}>{loading ? 'Loading course…' : ''}</div>;

  const { course, topics } = data;
  const detailChanges = Object.fromEntries(Object.entries(details).filter(([k, v]) => v !== (course[k] || '')));
  const saveDetails = async () => {
    setDetailsMessage(null);
    try {
      const { item } = await edit('course', 'update', '', detailChanges);
      setData((d) => ({ ...d, course: { ...d.course, ...item } }));
      setDetailsMessage({ text: 'Saved to Classroom.' });
      if (onCourseChanged) onCourseChanged();
    } catch (e) {
      setDetailsMessage({ error: true, text: e.message });
    }
  };
  const groups = [...topics.map((t) => ({ id: t.topicId, topic: t })), { id: '', topic: null }];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{course.name}</div>
          <div style={muted}>{[course.section, course.courseState === 'ARCHIVED' ? 'Archived' : '', course.enrollmentCode ? `Class code ${course.enrollmentCode}` : ''].filter(Boolean).join(' · ')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-secondary" style={small} onClick={load} disabled={loading}>
            <RefreshCw size={12} />
            <span>Reload</span>
          </button>
          {course.alternateLink && (
            <a href={course.alternateLink} target="_blank" rel="noreferrer" className="btn-secondary" style={{ ...small, textDecoration: 'none' }}>
              Open in Google Classroom <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>
      {error && <div style={{ color: '#c5221f', fontSize: '0.85rem' }}>{error}</div>}

      {/* Course details */}
      <section style={sectionStyle}>
        <strong>Course details</strong>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          {COURSE_FIELDS.map(([key, label]) => (
            <label key={key} className="form-label" style={{ margin: 0 }}>{label}
              <input className="form-control" value={details[key] || ''} onChange={(e) => setDetails({ ...details, [key]: e.target.value })} />
            </label>
          ))}
          <label className="form-label" style={{ margin: 0 }}>Status
            <select className="form-control" aria-label="Course status" value={details.courseState || 'ACTIVE'} onChange={(e) => setDetails({ ...details, courseState: e.target.value })}>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived (hidden from students' class list; can be restored)</option>
            </select>
          </label>
        </div>
        <label className="form-label" style={{ margin: 0 }}>Description
          <textarea className="form-control" rows={3} value={details.description || ''} onChange={(e) => setDetails({ ...details, description: e.target.value })} />
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn-primary" style={small} disabled={Object.keys(detailChanges).length === 0} onClick={saveDetails}>
            Save course details
          </button>
          <Message message={detailsMessage} />
        </div>
      </section>

      {/* Classwork */}
      <section style={sectionStyle}>
        <strong>Classwork</strong>
        {groups.map(({ id, topic }) => {
          const materials = data.courseWorkMaterials.filter((m) => (m.topicId || '') === id);
          const work = data.courseWork.filter((w) => (w.topicId || '') === id);
          if (!topic && materials.length === 0 && work.length === 0) return null;
          return (
            <div key={id || 'none'} role="group" aria-label={topic ? topic.name : 'No topic'} style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border-color)', paddingBottom: 4 }}>
                {topic && renaming === id ? (
                  <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <InlineText value={topic.name} buttonLabel="Rename"
                        onSave={async (name) => { await saveItem('topic', id, { name }); setRenaming(''); }} />
                    </div>
                    <button type="button" className="btn-secondary" style={small} onClick={() => setRenaming('')}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <strong style={{ flex: 1 }}>{topic ? topic.name : 'No topic'}</strong>
                    {topic && (
                      <button type="button" className="btn-secondary" style={small} onClick={() => setRenaming(id)}>
                        <Pencil size={12} />
                        <span>Rename</span>
                      </button>
                    )}
                  </>
                )}
              </div>
              {materials.map((m) => <PostRow key={m.id} item={m} kind="material" topics={topics} save={saveItem} />)}
              {work.map((w) => (
                <PostRow key={w.id} item={w} kind={kindOf(w)} topics={topics} save={saveItem}
                  hasRubric={!!(data.rubrics && data.rubrics[w.id] && [].concat(data.rubrics[w.id]).length)} />
              ))}
              {topic && materials.length === 0 && work.length === 0 && <div style={muted}>Nothing in this topic yet.</div>}
            </div>
          );
        })}
        <InlineText value="" placeholder="New topic name" buttonLabel="Add topic"
          onSave={(name) => createItem('topic', { name })} />
        <AddPost topics={topics} create={createItem} />
      </section>

      {/* Stream */}
      <section style={sectionStyle}>
        <strong>Stream announcements</strong>
        {data.announcements.length === 0 && <div style={muted}>No announcements yet.</div>}
        {data.announcements.map((a) => (
          <div key={a.id} style={rowStyle}>
            <div style={muted}>{a.state === 'DRAFT' ? 'Draft · ' : ''}Posted {a.creationTime ? new Date(a.creationTime).toLocaleDateString() : ''}</div>
            <InlineText value={a.text} multiline buttonLabel="Save"
              onSave={(text) => saveItem('announcement', a.id, { text })} />
          </div>
        ))}
        <InlineText value="" multiline placeholder="New announcement for the stream" buttonLabel="Post"
          onSave={(text) => createItem('announcement', { text })} />
      </section>

      {/* People (read only) */}
      <section style={sectionStyle}>
        <strong>People</strong>
        <div style={{ fontSize: '0.85rem' }}>
          Teachers: {data.teachers.map((t) => t.profile?.name?.fullName || t.profile?.emailAddress || t.userId).join(', ') || 'none'}
        </div>
        <details>
          <summary style={{ cursor: 'pointer', fontSize: '0.85rem' }}>{data.students.length} student(s) joined{course.enrollmentCode ? ` with class code ${course.enrollmentCode}` : ''}</summary>
          <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: '0.82rem' }}>
            {data.students.map((s) => <li key={s.userId}>{s.profile?.name?.fullName || s.profile?.emailAddress || s.userId}</li>)}
          </ul>
        </details>
      </section>
    </div>
  );
}
