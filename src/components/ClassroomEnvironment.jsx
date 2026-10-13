import React, { useEffect, useState } from 'react';
import CourseDeveloper from './CourseDeveloper';
import CourseEditor from './CourseEditor';

// The Courses tab: every Google Classroom course the teacher teaches, and a simple editor for
// the one they pick (CourseEditor). The AI Course Developer is still available, folded away.

const BANNER_COLOURS = ['#1a73e8', '#188038', '#e37400', '#d93025', '#8e24aa', '#129eaf', '#5f6368'];

const colourFor = (id = '') => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return BANNER_COLOURS[hash % BANNER_COLOURS.length];
};

async function getJson(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export default function ClassroomEnvironment({ user, onImportCourse }) {
  const [courses, setCourses] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');

  const loadCourses = () => getJson('/api/classroom/courses')
    .then((d) => { setCourses(d.courses || []); setError(''); })
    .catch((e) => setError(e.message));

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

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <section style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Your Google Classroom courses</strong>
          <button className="btn-secondary" onClick={loadCourses} style={{ padding: '4px 8px', fontSize: '0.75rem' }}>Refresh</button>
        </div>
        {error && <div className="card" style={{ color: '#c5221f', padding: 12 }}>{error}</div>}
        {!error && courses.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No classes yet.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {courses.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              aria-pressed={selectedId === c.id}
              style={{
                border: selectedId === c.id ? '2px solid #1a73e8' : '1px solid var(--border-color)',
                borderRadius: 8, padding: 0, overflow: 'hidden', background: 'var(--card-bg, #fff)',
                cursor: 'pointer', textAlign: 'left', color: 'inherit',
              }}
            >
              <div style={{ background: colourFor(c.id), color: '#fff', padding: '14px 12px', minHeight: 56, opacity: c.courseState === 'ARCHIVED' ? 0.6 : 1 }}>
                <div style={{ fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                  {[c.section, c.courseState === 'ARCHIVED' ? 'Archived' : ''].filter(Boolean).join(' · ')}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {selectedId && (
        <>
          <CourseEditor key={selectedId} courseId={selectedId} onCourseChanged={loadCourses} />
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>AI Course Developer (optional)</summary>
            <div style={{ marginTop: 12 }}>
              <CourseDeveloper user={user} courseId={selectedId} onChanged={() => {}} onImportCourse={onImportCourse} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}
