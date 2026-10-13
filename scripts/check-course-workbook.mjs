// Checks that the Course Builder workbook round-trips: the template (and Save .xlsx) write every
// field of the web app, and Upload reads every field back unchanged.
//
//   node scripts/check-course-workbook.mjs          prints a summary, exits 1 on any mismatch
//   node scripts/check-course-workbook.mjs --json   also prints the uploaded template as JSON,
//                                                   for test_template_roundtrip.py to deploy

import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  CURRICULUM_COLUMNS, QUIZ_QUESTION_COLUMNS, QUIZ_TYPES, SETTINGS_FIELDS, TEMPLATE_EXAMPLE, blankModule,
  buildCourseWorkbook, buildDeployedWorkbook, importCourseWorkbook, isSheetLink, quizQuestionProblems,
  quizTotalPoints, readCourseTemplate,
} from '../src/lib/courseWorkbook.js';

const toBytes = (wb) => new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
const roundTrip = (course) => importCourseWorkbook(toBytes(buildCourseWorkbook(course)));
const checks = [];
const check = (name, fn) => { fn(); checks.push(name); };

// 1. The template example uses every field, so uploading it fills every field of the form.
check('template example fills every field', () => {
  for (const f of SETTINGS_FIELDS) {
    const value = TEMPLATE_EXAMPLE.settings[f.key];
    assert.ok(Array.isArray(value) ? value.length : value, `template example has no ${f.key}`);
  }
  for (const c of CURRICULUM_COLUMNS) {
    const used = TEMPLATE_EXAMPLE.curriculum.some((m) => {
      const v = m[c.key];
      return Array.isArray(v) ? v.some(Boolean) : v !== '' && v != null;
    });
    assert.ok(used, `no week in the template example fills "${c.header}"`);
  }
  const questions = TEMPLATE_EXAMPLE.curriculum.flatMap(m => m.quiz_questions);
  for (const c of QUIZ_QUESTION_COLUMNS.filter(c => c.key !== 'week')) {
    assert.ok(questions.some(q => (Array.isArray(q[c.key]) ? q[c.key].length : q[c.key] !== '' && q[c.key] != null)),
      `no quiz question in the template example fills "${c.header}"`);
  }
  for (const t of QUIZ_TYPES) {
    assert.ok(questions.some(q => q.type === t.value), `the template example has no ${t.value} question`);
  }
  for (const q of questions) assert.deepEqual(quizQuestionProblems(q), [], q.question);
  assert.ok(TEMPLATE_EXAMPLE.students.length > 0);
});

// 2. Template -> upload gives back exactly the example, with no warnings.
const uploaded = roundTrip(TEMPLATE_EXAMPLE);
check('template uploads unchanged', () => {
  assert.deepEqual(uploaded.warnings, []);
  assert.deepEqual(uploaded.settings, TEMPLATE_EXAMPLE.settings);
  assert.deepEqual(uploaded.curriculum, TEMPLATE_EXAMPLE.curriculum);
  assert.deepEqual(uploaded.students, TEMPLATE_EXAMPLE.students);
});

// 3. Save .xlsx of an uploaded course uploads unchanged (the round trip is stable).
check('save .xlsx then upload is unchanged', () => {
  const again = roundTrip(uploaded);
  assert.deepEqual({ ...again, sheets: undefined }, { ...uploaded, sheets: undefined });
});

// 4. Values that are easy to lose.
check('edge values survive', () => {
  const mod = {
    ...blankModule(1), title: 'Edge', points: 0, quiz_title: 'Q', quiz_points: 0, question_points: '',
    notebook_enabled: false, notebook_url: 'https://notebooklm.google.com/notebook/kept-out',
    presentation_urls: ['https://docs.google.com/document/d/1AbCdEfGhIjKlMn/edit', 'https://example.org/a'],
    youtube_urls: ['https://youtu.be/dQw4w9WgXcQ'], due_date: '2026-11-05T17:00+11:00',
  };
  const back = roundTrip({ settings: { class_name: 'Edge' }, curriculum: [mod], students: [] }).curriculum[0];
  assert.equal(back.points, 0);
  assert.equal(back.quiz_points, 0);
  assert.equal(back.question_points, '');
  assert.equal(back.notebook_enabled, false); // an unticked notebook is not saved
  assert.equal(back.notebook_url, '');
  assert.deepEqual(back.presentation_urls, mod.presentation_urls);
  assert.deepEqual(back.youtube_urls, mod.youtube_urls);
  assert.equal(back.due_date, '2026-11-05T17:00+11:00');
});

// 5. A real Excel date cell (as Excel or Sheets saves a typed date) becomes ISO 8601.
check('excel date cells become ISO dates', () => {
  const wb = buildCourseWorkbook(TEMPLATE_EXAMPLE);
  const ws = wb.Sheets.Curriculum;
  const col = XLSX.utils.encode_col(CURRICULUM_COLUMNS.findIndex(c => c.key === 'due_date'));
  ws[`${col}2`] = { t: 'n', v: 46331.7083333, z: 'yyyy-mm-dd hh:mm' }; // 5 Nov 2026 17:00
  ws[`${col}3`] = { t: 'n', v: 46331, z: 'yyyy-mm-dd' };
  const back = importCourseWorkbook(toBytes(wb));
  assert.equal(back.curriculum[0].due_date, '2026-11-05T17:00');
  assert.equal(back.curriculum[1].due_date, '2026-11-05');
});

// 6. Anything the importer cannot use is reported, not dropped silently.
check('unknown columns and bad values are reported', () => {
  const wb = buildCourseWorkbook(TEMPLATE_EXAMPLE);
  const ws = wb.Sheets.Curriculum;
  XLSX.utils.sheet_add_aoa(ws, [['Mystery Column']], { origin: XLSX.utils.encode_cell({ r: 0, c: CURRICULUM_COLUMNS.length }) });
  const col = XLSX.utils.encode_col(CURRICULUM_COLUMNS.findIndex(c => c.key === 'due_date'));
  ws[`${col}2`] = { t: 's', v: '05/11/2026' };
  const { warnings } = importCourseWorkbook(toBytes(wb));
  assert.ok(warnings.some(w => w.includes('Mystery Column')), warnings.join('\n'));
  assert.ok(warnings.some(w => w.includes('05/11/2026')), warnings.join('\n'));
});

// 7. Quiz questions written by hand: loose types, answers in another case, TRUE/FALSE, problems reported.
check('quiz questions are read and checked', () => {
  const wb = buildCourseWorkbook(TEMPLATE_EXAMPLE);
  XLSX.utils.sheet_add_aoa(wb.Sheets.Quiz_Questions, [
    ['Week 2', 'Pick the odd one out', 'multiple choice', 'Pod; Service; Banana', 'banana', 3, ''],
    ['Week 2', 'Kubernetes schedules containers.', 'tf', '', true, '', ''],
    ['Week 2', 'Broken question', 'checkboxes', 'Only one choice', 'Something else', '', ''],
    ['Week 9', 'Lost question', '', '', '', '', ''],
  ], { origin: -1 });
  const back = importCourseWorkbook(toBytes(wb));
  const w2 = back.curriculum[1].quiz_questions;
  assert.deepEqual(w2[0], { question: 'Pick the odd one out', type: 'MULTIPLE_CHOICE', choices: ['Pod', 'Service', 'Banana'], answers: ['Banana'], points: 3, feedback: '' });
  assert.deepEqual([w2[1].type, w2[1].answers], ['TRUE_FALSE', ['True']]);
  assert.ok(back.warnings.some(w => w.includes('Broken') || w.includes('at least 2 choices')), back.warnings.join('\n'));
  assert.ok(back.warnings.some(w => w.includes('"Week 9" is not on the Curriculum sheet')), back.warnings.join('\n'));
  assert.ok(back.warnings.some(w => w.includes('both a Quiz URL and quiz questions')), back.warnings.join('\n'));
  assert.equal(quizTotalPoints(TEMPLATE_EXAMPLE.curriculum[0]), 11);
});

// 8. Rubrics are full Google Sheets links, including Drive file links like the teacher's.
check('rubric links', () => {
  assert.ok(isSheetLink('https://docs.google.com/spreadsheets/d/1Ry05DVSSEQxKwV-_PZdn7KPbWmmZKUwA/edit#gid=0'));
  assert.ok(isSheetLink('https://drive.google.com/file/d/1Ry05DVSSEQxKwV-_PZdn7KPbWmmZKUwA/view'));
  assert.ok(!isSheetLink('https://example.org/rubric'));
});

// 9. The AI panels hand a template straight to the importer, and anything else to the AI.
check('template workbooks are recognised', () => {
  assert.ok(readCourseTemplate(toBytes(buildCourseWorkbook(TEMPLATE_EXAMPLE))));
  const other = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(other, XLSX.utils.aoa_to_sheet([['Name', 'Mark'], ['Ada', 9]]), 'Marks');
  assert.equal(readCourseTemplate(toBytes(other)), null);
});

// 10. The completion workbook holds the class code and every post, and uploads again as a template.
check('completion workbook', () => {
  const result = {
    course: { id: 'c1', name: 'CS101', section: 'Cohort 1', alternateLink: 'https://classroom.google.com/c/c1', creationTime: '2026-10-13T00:00:00Z' },
    enrollmentCode: 'abc123', joinLink: 'https://classroom.google.com/c/c1?cjc=abc123', announcement: 'Welcome',
    posts: [{ week: 'Week 1', topic: 'Week 1: Foundations', kind: 'Quiz', title: 'Quiz 1', state: 'PUBLISHED', link: 'https://classroom.google.com/c/c1/a/q1', maxPoints: 10, due: '2026-10-15T06:00Z', attachments: ['Link: https://docs.google.com/forms/d/e/f1/viewform'], description: '' }],
    forms: [{ week: 'Week 1', quiz: 'Quiz 1', questions: 5, responderUri: 'https://docs.google.com/forms/d/e/f1/viewform', editUri: 'https://docs.google.com/forms/d/f1/edit', published: true, problem: null }],
    rubrics: [{ week: 'Week 1', assignment: 'Lab 1', url: 'https://docs.google.com/spreadsheets/d/1demo-lab-rubric-sheet/edit', status: 'created', problem: null }],
    provisioningLog: [{ step: 'course', target: 'c1', status: 'ok', detail: 'ACTIVE' }],
  };
  const wb = buildDeployedWorkbook(TEMPLATE_EXAMPLE, result);
  assert.equal(wb.SheetNames[0], 'Classroom');
  for (const name of ['Classroom_Posts', 'Quiz_Forms', 'Rubrics', 'Deployment_Log', 'Curriculum', 'Quiz_Questions']) {
    assert.ok(wb.SheetNames.includes(name), name);
  }
  const summary = XLSX.utils.sheet_to_json(wb.Sheets.Classroom, { header: 1 });
  assert.deepEqual(summary[2], ['Class code (students join with this)', 'abc123']);
  const again = importCourseWorkbook(toBytes(wb));
  assert.deepEqual(again.warnings, []);
  assert.deepEqual(again.curriculum, TEMPLATE_EXAMPLE.curriculum);
});

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({
    curriculumHeaders: CURRICULUM_COLUMNS.map(c => c.header),
    curriculumKeys: CURRICULUM_COLUMNS.map(c => c.key),
    quizHeaders: QUIZ_QUESTION_COLUMNS.map(c => c.header),
    quizKeys: QUIZ_QUESTION_COLUMNS.map(c => c.key),
    settingsKeys: SETTINGS_FIELDS.map(f => f.key),
    course: { settings: uploaded.settings, curriculum: uploaded.curriculum, students: uploaded.students },
  }));
} else {
  console.log(`Course Builder workbook: ${checks.length} checks passed`);
  checks.forEach(name => console.log(`  ok  ${name}`));
}
