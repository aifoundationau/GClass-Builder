import React, { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

// One on-screen message at a time. Errors stay until closed (or 12+ seconds) so they are not
// missed; other messages stay long enough to read (about 4 seconds plus time per word). The timer
// pauses while the pointer is over the message or it has keyboard focus. A new message replaces
// the old one and starts its own timer, so an earlier timer can never hide a later message.

const ERROR_WORDS = /\b(error|errors|failed|fails?|cannot|can't|could not|couldn't|unable|invalid|denied|refused|rejected|missing|expired|blocked|not (?:allowed|available|found|set|signed|an?|ISO|valid)|is not|must|needs?|requires?|please (?:fix|check|choose|sign|add|enter|use))\b/i;
const SUCCESS_WORDS = /\b(saved|created|added|published|imported|exported|downloaded|copied|sent|updated|removed|deleted|success|successfully|done|ready|complete|completed|signed in|logged in|connected|loaded|synced)\b/i;

// The type of a message given only as text. Error words win: "Created, but 2 students could not be added".
export function toastType(text, type) {
  if (type === 'error' || type === 'success' || type === 'info') return type;
  const value = String(text || '');
  if (ERROR_WORDS.test(value)) return 'error';
  if (SUCCESS_WORDS.test(value)) return 'success';
  return 'info';
}

export function toastDuration(text, type) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  const reading = 4000 + words * 300; // roughly 200 words a minute, plus a margin
  return type === 'error' ? Math.max(12000, reading * 1.5) : Math.min(Math.max(4000, reading), 15000);
}

const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info };

export default function Toast({ toast, onClose }) {
  const timer = useRef(null);
  const remaining = useRef(0);
  const startedAt = useRef(0);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const start = (ms) => {
    stop();
    remaining.current = ms;
    startedAt.current = Date.now();
    timer.current = setTimeout(onClose, ms);
  };
  const pause = () => {
    if (!timer.current) return;
    stop();
    remaining.current = Math.max(1500, remaining.current - (Date.now() - startedAt.current));
  };
  const resume = () => { if (toast && !timer.current) start(remaining.current); };

  useEffect(() => {
    if (!toast) return undefined;
    start(toastDuration(toast.text, toast.type));
    return stop;
  }, [toast?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toast, onClose]);

  // The region is always on the page, so screen readers announce what is put in it.
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      {toast && (() => {
        const Icon = ICONS[toast.type] || Info;
        return (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}`}
            role={toast.type === 'error' ? 'alert' : 'status'}
            onMouseEnter={pause}
            onMouseLeave={resume}
            onFocus={pause}
            onBlur={resume}
          >
            <Icon size={20} className="toast-icon" aria-hidden="true" />
            <span className="toast-text">{toast.text}</span>
            <button type="button" className="toast-close" onClick={onClose} aria-label="Close message">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        );
      })()}
    </div>
  );
}
