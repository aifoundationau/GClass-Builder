import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  QUIZ_TYPES, blankQuizQuestion, isChoiceQuestion, quizQuestionPoints, quizQuestionProblems, quizTotalPoints,
} from '../lib/courseWorkbook';

// The questions and answer key of a week's quiz. When the course is created, Course Builder
// turns them into a Google Forms quiz (marked automatically from the answer key) and attaches
// it to the quiz assignment. The rules match the Quiz_Questions sheet.

const LISTED_CHOICES = ['MULTIPLE_CHOICE', 'CHECKBOXES', 'DROPDOWN'];

export default function QuizQuestionsEditor({ questions = [], onChange }) {
  const update = (i, fields) => onChange(questions.map((q, j) => (j === i ? { ...q, ...fields } : q)));

  const changeType = (i, type) => {
    const q = questions[i];
    const choices = LISTED_CHOICES.includes(type) ? (q.choices.length ? q.choices : ['', '']) : [];
    const keep = LISTED_CHOICES.includes(type) ? q.answers.filter(a => choices.includes(a)) : [];
    update(i, { type, choices, answers: type === 'CHECKBOXES' ? keep : keep.slice(0, 1) });
  };

  const renameChoice = (i, c, value) => {
    const q = questions[i];
    const old = q.choices[c];
    update(i, {
      choices: q.choices.map((x, k) => (k === c ? value : x)),
      answers: q.answers.map(a => (a === old ? value : a)),
    });
  };

  const removeChoice = (i, c) => {
    const q = questions[i];
    update(i, { choices: q.choices.filter((_, k) => k !== c), answers: q.answers.filter(a => a !== q.choices[c]) });
  };

  const markCorrect = (i, value) => {
    const q = questions[i];
    if (!String(value).trim()) return;
    const answers = q.type === 'CHECKBOXES'
      ? (q.answers.includes(value) ? q.answers.filter(a => a !== value) : [...q.answers, value])
      : [value];
    update(i, { answers });
  };

  return (
    <div style={{ marginTop: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
        <span className="form-label" style={{ margin: 0 }}>Quiz questions and answers</span>
        {questions.length > 0 && (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {questions.length} question(s), {quizTotalPoints({ quiz_questions: questions })} point(s) in total
          </span>
        )}
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 10px' }}>
        Course Builder creates a Google Forms quiz from these questions, with the answer key, and attaches it ready for students.
      </p>

      {questions.map((q, i) => {
        const problems = quizQuestionProblems(q);
        const single = q.type !== 'CHECKBOXES';
        return (
          <div key={i} className="multi-link-card" style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Question {i + 1}</span>
              <button
                type="button"
                onClick={() => onChange(questions.filter((_, j) => j !== i))}
                style={{ background: 'transparent', color: '#991b1b', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
              >
                <Trash2 size={13} />
                <span>Remove</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(140px, 1fr) 90px', gap: '8px' }}>
              <input
                type="text"
                className="form-control"
                aria-label={`Question ${i + 1}`}
                placeholder="Question"
                value={q.question}
                onChange={e => update(i, { question: e.target.value })}
              />
              <select className="form-control" aria-label={`Question ${i + 1} type`} value={q.type} onChange={e => changeType(i, e.target.value)}>
                {QUIZ_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input
                type="number"
                min="0"
                step="1"
                className="form-control"
                aria-label={`Question ${i + 1} points`}
                title="Points"
                placeholder={String(quizQuestionPoints({ ...q, points: '' }))}
                value={q.points ?? ''}
                onChange={e => update(i, { points: e.target.value === '' ? '' : Number(e.target.value) })}
              />
            </div>

            {LISTED_CHOICES.includes(q.type) && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Choices. Tick the correct {single ? 'one' : 'ones'}.
                </div>
                {q.choices.map((choice, c) => (
                  <div key={c} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                    <input
                      type={single ? 'radio' : 'checkbox'}
                      name={`quiz-q-${i}`}
                      aria-label={`Choice ${c + 1} is correct`}
                      checked={!!choice && q.answers.includes(choice)}
                      disabled={!choice.trim()}
                      onChange={() => markCorrect(i, choice)}
                    />
                    <input
                      type="text"
                      className="form-control"
                      aria-label={`Choice ${c + 1}`}
                      placeholder={`Choice ${c + 1}`}
                      value={choice}
                      onChange={e => renameChoice(i, c, e.target.value)}
                    />
                    {q.choices.length > 2 && (
                      <button type="button" onClick={() => removeChoice(i, c)} title="Remove this choice"
                        style={{ background: 'transparent', border: 'none', color: '#991b1b', cursor: 'pointer' }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" className="btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  onClick={() => update(i, { choices: [...q.choices, ''] })}>
                  <Plus size={12} />
                  <span>Add choice</span>
                </button>
              </div>
            )}

            {q.type === 'TRUE_FALSE' && (
              <div style={{ marginTop: '8px', display: 'flex', gap: '16px', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Correct answer:</span>
                {['True', 'False'].map(v => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input type="radio" name={`quiz-q-${i}`} checked={q.answers[0] === v} onChange={() => update(i, { answers: [v] })} />
                    {v}
                  </label>
                ))}
              </div>
            )}

            {q.type === 'SHORT_ANSWER' && (
              <textarea
                rows={2}
                className="form-control"
                style={{ marginTop: '8px' }}
                aria-label={`Question ${i + 1} accepted answers`}
                placeholder="Accepted answers, one per line"
                value={q.answers.join('\n')}
                onChange={e => update(i, { answers: e.target.value.split('\n') })}
              />
            )}

            {q.type === 'PARAGRAPH' && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '8px 0 0' }}>
                Paragraph answers have no answer key: mark them by hand in Google Forms.
              </p>
            )}

            <input
              type="text"
              className="form-control"
              style={{ marginTop: '8px' }}
              aria-label={`Question ${i + 1} feedback`}
              placeholder="Feedback shown after marking (optional)"
              value={q.feedback}
              onChange={e => update(i, { feedback: e.target.value })}
            />

            {problems.length > 0 && (
              <p role="alert" style={{ color: '#ea4335', fontSize: '0.78rem', margin: '6px 0 0' }}>
                Fix before deploying: {problems.join('; ')}.
              </p>
            )}
            {problems.length === 0 && isChoiceQuestion(q) && q.answers.filter(a => String(a).trim()).length === 0 && (
              <p style={{ color: '#b45309', fontSize: '0.78rem', margin: '6px 0 0' }}>
                No correct answer is ticked, so this question is marked by hand.
              </p>
            )}
          </div>
        );
      })}

      <button type="button" className="btn-secondary" style={{ fontSize: '0.82rem', padding: '6px 14px' }}
        onClick={() => onChange([...questions, blankQuizQuestion()])}>
        <Plus size={14} />
        <span>Add question</span>
      </button>
    </div>
  );
}
