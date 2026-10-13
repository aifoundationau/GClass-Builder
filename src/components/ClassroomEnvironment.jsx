import React, { useEffect, useState } from 'react';
import CourseDeveloper from './CourseDeveloper';

// A Google Classroom-style workspace for the teacher's own courses: course cards,
// a coloured banner, and Stream / Classwork / People tabs. The data comes from the
// Classroom API, so it is shown inside this site. The original Classroom page cannot
// be embedded because Google blocks framing, so "Open in Google Classroom" opens it in
// a new tab.

const BANNER_COLOURS = ['#1a73e8', '#188038', '#e37400', '#d93025', '#8e24aa', '#129eaf', '#5f6368'];

const colourFor = (id = '') => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return BANNER_COLOURS[hash % BANNER_COLOURS.length];
};

const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

const personName = (p) => p?.profile?.name?.fullName || p?.profile?.emailAddress || p?.userId || 'Unnamed';

const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const formatDue = (due) => {
  if (!due || !due.year) return '';
  return new Date(due.year, (due.month || 1) - 1, due.day || 1).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

// A rubric belongs to exactly one assignment. The snapshot may hold it as an object or a
// one-item list, keyed by courseWork id. Returns null when there is no usable rubric.
const rubricFor = (snapshot, courseWorkId) => {
  const found = snapshot?.rubrics?.[courseWorkId];
  if (!found) return null;
  const list = Array.isArray(found) ? found : [found];
  return list.find((r) => r && Array.isArray(r.criteria) && r.criteria.length > 0) || null;
};

async function getJson(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function Avatar({ name, colour }) {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%', background: colour || '#5f6368', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0,
    }}>
      {initials(name)}
    </div>
  );
}

export default function ClassroomEnvironment({ user, onImportCourse }) {
  const [courses, setCourses] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [tab, setTab] = useState('stream');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadCourses = () => getJson('/api/classroom/courses')
    .then((d) => setCourses(d.courses || []))
    .catch((e) => setError(e.message));

  const loadCourse = (id) => {
    if (!id) return;
    setLoading(true);
    setError('');
    getJson(`/api/classroom/course?id=${encodeURIComponent(id)}`)
      .then((d) => setSnapshot(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  const selectCourse = (id) => {
    setSelectedId(id);
    setTab('stream');
    setSnapshot(null);
    loadCourse(id);
  };

  useEffect(() => {
    if (user && user.authenticated) loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user && user.authenticated]);

  if (!user || !user.authenticated) {
    return (
      <div className="card" style={{ padding: 24 }}>
        Sign in with Google using the Log In button at the top of the Course Studio page to see your classes.
      </div>
    );
  }

  const course = snapshot?.course;
  const colour = colourFor(selectedId);

  // Stream: announcements, assignments, and materials, newest first
  const streamItems = snapshot ? [
    ...snapshot.announcements.map((a) => ({ kind: 'Announcement', id: a.id, title: a.text, when: a.creationTime })),
    ...snapshot.courseWork.map((w) => ({
      kind: 'Assignment', id: w.id, title: w.title,
      detail: [w.maxPoints ? `${w.maxPoints} points` : '', formatDue(w.dueDate) ? `Due ${formatDue(w.dueDate)}` : ''].filter(Boolean).join(' · '),
      when: w.creationTime,
    })),
    ...snapshot.courseWorkMaterials.map((m) => ({ kind: 'Material', id: m.id, title: m.title, when: m.creationTime })),
  ].sort((a, b) => new Date(b.when || 0) - new Date(a.when || 0)) : [];

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Class list, like the Classroom home page */}
      <aside style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Classes</strong>
          <button className="btn-secondary" onClick={loadCourses} style={{ padding: '4px 8px', fontSize: '0.75rem' }}>Refresh</button>
        </div>
        {courses.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No classes yet.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        {courses.map((c) => (
          <button
            key={c.id}
            onClick={() => selectCourse(c.id)}
            style={{
              border: selectedId === c.id ? '2px solid #1a73e8' : '1px solid var(--border-color)',
              borderRadius: 8, padding: 0, overflow: 'hidden', background: 'var(--card-bg, #fff)',
              cursor: 'pointer', textAlign: 'left', color: 'inherit',
            }}
          >
            <div style={{ background: colourFor(c.id), color: '#fff', padding: '14px 12px', minHeight: 56 }}>
              <div style={{ fontWeight: 700 }}>{c.name}</div>
              {c.section && <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>{c.section}</div>}
            </div>
          </button>
        ))}
        </div>
      </aside>

      <main style={{ display: 'grid', gap: 16, minWidth: 0 }}>
        {error && <div className="card" style={{ color: '#c5221f', padding: 12 }}>{error}</div>}

        {!selectedId && !error && (
          <div className="card" style={{ padding: 24 }}>Choose a class on the left to open it.</div>
        )}

        {selectedId && (
          <CourseDeveloper
            user={user}
            courseId={selectedId}
            onChanged={(id) => loadCourse(id)}
            onImportCourse={onImportCourse}
          />
        )}

        {selectedId && course && (
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-color)', background: 'var(--card-bg, #fff)' }}>
            {/* Banner */}
            <div style={{ background: colour, color: '#fff', padding: '24px 28px', minHeight: 150, position: 'relative' }}>
              <div style={{ fontSize: '1.9rem', fontWeight: 500 }}>{course.name}</div>
              {course.section && <div style={{ fontSize: '1rem', opacity: 0.95 }}>{course.section}</div>}
              {course.room && <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>Room {course.room}</div>}
              <a
                href={course.alternateLink || `https://classroom.google.com/c/${course.id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ position: 'absolute', right: 20, top: 20, background: 'rgba(255,255,255,0.18)', color: '#fff', padding: '6px 12px', borderRadius: 6, textDecoration: 'none', fontSize: '0.85rem' }}
              >
                Open in Google Classroom ↗
              </a>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border-color)', padding: '0 16px' }}>
              {[['stream', 'Stream'], ['classwork', 'Classwork'], ['people', 'People']].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  style={{
                    background: 'none', border: 'none', padding: '14px 16px', cursor: 'pointer',
                    fontWeight: 600, color: tab === key ? colour : 'var(--text-muted)',
                    borderBottom: tab === key ? `3px solid ${colour}` : '3px solid transparent',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={{ padding: 20, display: 'grid', gap: 12 }}>
              {loading && <p>Loading class…</p>}

              {tab === 'stream' && !loading && (
                streamItems.length === 0
                  ? <p style={{ color: 'var(--text-muted)' }}>Nothing posted yet.</p>
                  : streamItems.map((item) => (
                    <div key={`${item.kind}-${item.id}`} style={{ display: 'flex', gap: 12, border: '1px solid var(--border-color)', borderRadius: 8, padding: 14 }}>
                      <Avatar name={course.name} colour={colour} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {item.kind} posted {formatDate(item.when)}
                        </div>
                        <div style={{ fontWeight: item.kind === 'Announcement' ? 400 : 600, whiteSpace: 'pre-wrap' }}>{item.title}</div>
                        {item.detail && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{item.detail}</div>}
                      </div>
                    </div>
                  ))
              )}

              {tab === 'classwork' && !loading && (
                <>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Topics hold materials and assignments. Rubrics belong to assignments.
                  </div>
                  {snapshot.topics.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No topics yet.</p>}
                  {[...snapshot.topics.map((t) => ({ id: t.topicId, name: t.name })), { id: '', name: 'No topic' }].map((topic) => {
                    const materials = snapshot.courseWorkMaterials.filter((m) => (m.topicId || '') === topic.id);
                    const work = snapshot.courseWork.filter((w) => (w.topicId || '') === topic.id);
                    if (topic.id === '' && materials.length === 0 && work.length === 0) return null;
                    const unassigned = topic.id === '';
                    return (
                      <section key={topic.id || 'none'}>
                        <div style={{ fontWeight: 700, borderBottom: `2px solid ${colour}`, padding: '6px 0', marginBottom: 6 }}>
                          {topic.name}
                          {unassigned && (
                            <span style={{ marginLeft: 8, fontWeight: 400, fontSize: '0.8rem', color: '#e37400' }}>
                              Flagged: move these items into a topic
                            </span>
                          )}
                        </div>
                        {materials.map((m) => (
                          <div key={m.id} style={{ display: 'flex', gap: 10, padding: '8px 4px' }}>
                            <span>📄</span>
                            <span>{m.title}</span>
                          </div>
                        ))}
                        {work.map((w) => {
                          const rubric = rubricFor(snapshot, w.id);
                          return (
                            <div key={w.id}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 4px' }}>
                                <span>📝 {w.title}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                  {[w.maxPoints ? `${w.maxPoints} pts` : '', formatDue(w.dueDate) ? `Due ${formatDue(w.dueDate)}` : ''].filter(Boolean).join(' · ')}
                                </span>
                              </div>
                              {rubric && (
                                <div style={{ margin: '0 0 8px 28px', border: '1px dashed var(--border-color)', borderRadius: 6, padding: '8px 10px', fontSize: '0.85rem' }}>
                                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Rubric</div>
                                  {rubric.criteria.map((c, ci) => (
                                    <div key={c.id || ci} style={{ padding: '4px 0' }}>
                                      <div>{c.title || 'Untitled criterion'}</div>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, color: 'var(--text-muted)' }}>
                                        {(c.levels || []).map((l, li) => (
                                          <span key={l.id || li}>{l.title || 'Level'}: {l.points ?? 0} pts</span>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {!rubric && snapshot?.rubricErrors?.[w.id] && (
                                <div style={{ margin: '0 0 8px 28px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                  Rubric could not be loaded, so this may have one that is not shown.
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {materials.length === 0 && work.length === 0 && (
                          <div style={{ color: 'var(--text-muted)', padding: '4px' }}>No items in this topic.</div>
                        )}
                      </section>
                    );
                  })}
                </>
              )}

              {tab === 'people' && !loading && (
                <>
                  <h4 style={{ borderBottom: `2px solid ${colour}`, paddingBottom: 6 }}>Teachers</h4>
                  {snapshot.teachers.map((t) => (
                    <div key={t.userId} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <Avatar name={personName(t)} colour={colour} />
                      <div>
                        <div>{personName(t)}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.profile?.emailAddress || ''}</div>
                      </div>
                    </div>
                  ))}

                  <h4 style={{ borderBottom: `2px solid ${colour}`, paddingBottom: 6, marginTop: 12 }}>
                    Students ({snapshot.students.length})
                  </h4>
                  {snapshot.students.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No students yet.</p>}
                  {snapshot.students.map((s) => (
                    <div key={s.userId} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <Avatar name={personName(s)} colour="#5f6368" />
                      <div>
                        <div>{personName(s)}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.profile?.emailAddress || ''}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
