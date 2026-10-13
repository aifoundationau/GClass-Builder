import React from 'react';
import { CheckCircle2, X, ExternalLink, RefreshCw, Download } from 'lucide-react';

// Live log of a course deployment. The backend appends one entry per Classroom call
// (course, alias, activate, teacher, topic, materials, coursework, quiz form, rubric, stream);
// this panel polls it so the teacher sees progress and problems as they happen. When the
// course is built, the bottom of the panel gives the class code and the completion workbook.

const STEP_LABELS = {
  course: 'Course created',
  alias: 'Course alias',
  activate: 'Course activated',
  teacher: 'Co-teacher',
  topic: 'Topic',
  material: 'Materials',
  coursework: 'Coursework',
  form: 'Quiz form',
  rubric: 'Rubric',
  announcement: 'Stream',
};

const STATUS_STYLE = {
  ok: { color: '#34a853', label: 'done' },
  added: { color: '#34a853', label: 'added' },
  invited: { color: '#4285f4', label: 'invitation sent' },
  existing: { color: 'var(--text-muted)', label: 'already there' },
  partial: { color: '#f29900', label: 'done, with a note' },
  failed: { color: 'var(--danger, #ea4335)', label: 'failed' },
};

const smallButton = { fontSize: '0.75rem', padding: '4px 10px' };

// After the build: the class code students join with (Course Builder does not add students),
// ways to send it, and the workbook of everything that went into Classroom.
function CompletionSection({ result, courseName, students, onDownloadWorkbook }) {
  const [copied, setCopied] = React.useState('');
  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setCopied('');
    }
  };
  const name = courseName || 'our class';
  const message = `Please join ${name} in Google Classroom:\n${result.joinLink || ''}\n\n`
    + `Or open classroom.google.com, choose "Join class" and enter the class code: ${result.enrollmentCode}`;
  const mailto = `mailto:?bcc=${encodeURIComponent(students.join(','))}`
    + `&subject=${encodeURIComponent(`Join ${name} in Google Classroom`)}`
    + `&body=${encodeURIComponent(message)}`;

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
      {result.enrollmentCode && (
        <>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Class code for your students</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '2px 0 8px' }}>
            <strong style={{ fontFamily: 'monospace', fontSize: '1.4rem', letterSpacing: '0.08em' }}>{result.enrollmentCode}</strong>
            <button type="button" className="btn-secondary" style={smallButton} onClick={() => copy(result.enrollmentCode, 'code')}>
              {copied === 'code' ? 'Copied' : 'Copy code'}
            </button>
            {result.joinLink && (
              <button type="button" className="btn-secondary" style={smallButton} onClick={() => copy(result.joinLink, 'link')}>
                {copied === 'link' ? 'Copied' : 'Copy join link'}
              </button>
            )}
            <button type="button" className="btn-secondary" style={smallButton} onClick={() => copy(message, 'message')}>
              {copied === 'message' ? 'Copied' : 'Copy message'}
            </button>
          </div>
          {students.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <a className="btn-secondary" href={mailto} style={{ ...smallButton, textDecoration: 'none' }}>
                Email the class code to {students.length} student(s)
              </a>
              <button type="button" className="btn-secondary" style={smallButton} onClick={() => copy(students.join(', '), 'emails')}>
                {copied === 'emails' ? 'Copied' : 'Copy student emails'}
              </button>
            </div>
          )}
          <p style={{ margin: '0 0 10px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Students are not added automatically: they join with this code or link. Students outside your Google
            Workspace domain can only join if your admin allows users from other domains to join classes.
          </p>
        </>
      )}
      <button type="button" className="btn-primary" style={{ fontSize: '0.82rem', padding: '7px 14px' }} onClick={onDownloadWorkbook}>
        <Download size={14} />
        <span>Download course spreadsheet (.xlsx)</span>
      </button>
      <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
        Everything that went into Classroom: the class code, every post with its link, the quiz forms, the rubrics and
        this log, with the course itself in template form so it can be uploaded again.
      </p>
    </div>
  );
}

export default function DeployProgress({ progress, onClose, onDownloadWorkbook }) {
  if (!progress) return null;
  const { status, log = [], error, result, courseName, deployed } = progress;
  const running = status === 'running' || status === 'starting';
  const failed = log.filter((e) => e.status === 'failed');
  const noted = log.filter((e) => e.status === 'partial');
  const students = (deployed && deployed.students) || [];

  return (
    <div
      role="dialog"
      aria-label="Course deployment progress"
      style={{
        position: 'fixed', right: 16, bottom: 16, zIndex: 1000,
        width: 'min(480px, calc(100vw - 32px))', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', color: 'var(--text-main)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
        {running ? <RefreshCw size={18} className="icon-spin" aria-hidden="true" /> : <CheckCircle2 size={18} color={status === 'error' ? '#ea4335' : '#34a853'} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>
            {running ? `Deploying ${courseName || 'course'}…` : status === 'error' ? 'Deployment stopped' : 'Course complete'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {running
              ? `${log.length} step(s) done. Each topic, post, quiz form and rubric is a separate call to Google, so large courses take a few minutes.`
              : `${log.length} step(s). ${noted.length} with a note, ${failed.length} failed.`}
          </div>
        </div>
        {!running && (
          <button type="button" onClick={onClose} aria-label="Close deployment log"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: '10px 16px', color: '#ea4335', fontSize: '0.85rem', borderBottom: '1px solid var(--border-color)' }}>
          {error}
        </div>
      )}

      {result?.course?.alternateLink && (
        <a href={result.course.alternateLink} target="_blank" rel="noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', fontSize: '0.85rem', borderBottom: '1px solid var(--border-color)' }}>
          Open the course in Google Classroom <ExternalLink size={13} />
        </a>
      )}

      <ol style={{ margin: 0, padding: '8px 16px 12px 36px', overflowY: 'auto', fontSize: '0.82rem', lineHeight: 1.5, flex: 1 }}>
        {log.map((entry, i) => {
          const style = STATUS_STYLE[entry.status] || STATUS_STYLE.ok;
          return (
            <li key={i} style={{ marginBottom: 2 }}>
              <span style={{ color: 'var(--text-muted)' }}>{STEP_LABELS[entry.step] || entry.step}: </span>
              <span style={{ wordBreak: 'break-word' }}>{entry.target}</span>
              <span style={{ color: style.color, fontWeight: 600 }}> — {style.label}</span>
              {(entry.status === 'failed' || entry.status === 'partial') && entry.detail && (
                <div style={{ color: style.color, fontSize: '0.78rem', wordBreak: 'break-word' }}>{entry.detail}</div>
              )}
            </li>
          );
        })}
      </ol>

      {status === 'done' && result && (
        <CompletionSection result={result} courseName={courseName} students={students} onDownloadWorkbook={onDownloadWorkbook} />
      )}
    </div>
  );
}
