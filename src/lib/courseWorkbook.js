import * as XLSX from 'xlsx';

/*
 * The Course Builder workbook (Google_Classroom_Course_Template.xlsx).
 *
 * The template download, Save .xlsx, Upload and the AI panels all use these definitions, so
 * every field in the web app has a column, and a filled-in or saved workbook loads back into the
 * same fields. The server writes the same columns before creating the course
 * (CURRICULUM_COLUMNS and QUIZ_QUESTION_COLUMNS in classroom_course_engine.py);
 * test_template_roundtrip.py checks that the lists match, and scripts/check-course-workbook.mjs
 * checks the round trip.
 */

export const SHEETS = {
  settings: 'Course_Settings',
  curriculum: 'Curriculum',
  quiz: 'Quiz_Questions',
  students: 'Students',
  readme: 'Readme_Instructions',
};

export const SETTINGS_FIELDS = [
  { key: 'class_name', required: 'YES', description: 'Course name shown in Google Classroom.' },
  { key: 'section', required: 'NO', description: 'Section, cohort or term, e.g. Cohort 1 - Term 1.' },
  { key: 'subject', required: 'NO', description: 'Subject area.' },
  { key: 'level', required: 'NO', description: 'Academic level or audience. For your records: Classroom has no level field.' },
  { key: 'room', required: 'NO', description: 'Room or meeting link.' },
  { key: 'welcome_announcement', required: 'NO', description: 'Posted to the Classroom stream when the course is created.' },
  { key: 'teachers', required: 'NO', description: 'Co-teacher email addresses, separated by commas. They are added to the course (or invited).' },
];

const SEVERAL = 'For several, put each on its own line in the cell (Alt+Enter) or separate them with commas.';

export const CURRICULUM_COLUMNS = [
  { header: 'Week', key: 'sequence', type: 'text', required: 'YES', description: 'Week label, e.g. Week 1. Quiz_Questions rows use the same label.' },
  { header: 'Classroom Stream Topic', key: 'stream_topic', type: 'text', required: 'YES', description: 'The topic created in Classroom for the week. Up to 100 characters; weeks with the same topic share it.' },
  { header: 'Module Title', key: 'title', type: 'text', required: 'YES', description: "The week's title. Its lecture materials post is called \"<Module Title> - Lecture Materials\"." },
  { header: 'Module Overview / Description', key: 'overview', type: 'text', required: 'NO', description: 'Description of the lecture materials post.' },
  { header: 'Lecture Presentation URL (Google Slides / Web Document)', key: 'presentation_urls', type: 'urls', required: 'NO', description: `Full links. Google Drive files (e.g. https://drive.google.com/file/d/.../view), Docs, Slides and Sheets are attached as Drive files; web pages and Drive folders as links. ${SEVERAL}` },
  { header: 'YouTube Video URLs', key: 'youtube_urls', type: 'urls', required: 'NO', description: `YouTube videos, attached as videos. ${SEVERAL}` },
  { header: 'Notebook URL', key: 'notebook_url', type: 'text', required: 'NO', description: 'Gemini or NotebookLM notebook for the week (https://notebooklm.google.com/..., https://notebook.google.com/... or https://gemini.google.com/...), attached as a link. Leave empty for none.' },
  { header: 'Assessment / Knowledge Check', key: 'assignment_title', type: 'text', required: 'NO', description: "Title of the week's assignment." },
  { header: 'Assignment Instructions', key: 'assignment_instructions', type: 'text', required: 'NO', description: 'Instructions for the assignment.' },
  { header: 'Assignment Rubric (Google Sheet URL)', key: 'rubric_url', type: 'text', required: 'NO', description: "Full link to a Google Sheet in Classroom's rubric format (the sheet you would use with Rubric > Import from Sheets). It becomes the assignment's rubric. If Classroom refuses it, the link is put in the assignment description." },
  { header: 'Points', key: 'points', type: 'points', required: 'NO', description: 'Points for the assignment (default 100). 0 means ungraded.' },
  { header: 'Due Date', key: 'due_date', type: 'date', required: 'NO', description: "ISO 8601 only: 2026-10-15 (due 23:59 that day), 2026-10-15T17:00 for a time, or with an offset such as 2026-10-15T17:00+11:00. Without an offset, times are in the time zone of the computer running Course Builder. Applies to the week's assignment, quiz and question." },
  { header: 'Quiz assignment', key: 'quiz_title', type: 'text', required: 'NO', description: "Title of the week's quiz." },
  { header: 'Quiz URL', key: 'quiz_url', type: 'text', required: 'NO', description: 'An existing Google Form to use as the quiz, attached as a link. Leave empty when the quiz is written on the Quiz_Questions sheet: Course Builder then creates the form.' },
  { header: 'Quiz Points', key: 'quiz_points', type: 'points', required: 'NO', description: 'Points for a quiz given by Quiz URL (default 50). A quiz from Quiz_Questions is worth the total of its questions.' },
  { header: 'Question', key: 'question_prompt', type: 'text', required: 'NO', description: "The week's discussion question." },
  { header: 'Question Type', key: 'question_type', type: 'questionType', required: 'NO', description: 'SHORT_ANSWER_QUESTION (default) or MULTIPLE_CHOICE_QUESTION.' },
  { header: 'Question Choices', key: 'question_choices', type: 'lines', required: 'For multiple choice', description: 'At least 2 answer choices for a multiple-choice question, one per line (Alt+Enter) or separated by ;. Ignored for short answer.' },
  { header: 'Question Points', key: 'question_points', type: 'points', required: 'NO', description: 'Points for the question (default 20). 0 means ungraded.' },
];

export const QUIZ_QUESTION_COLUMNS = [
  { header: 'Week', key: 'week', description: 'The Week label of the quiz, exactly as on the Curriculum sheet.' },
  { header: 'Question', key: 'question', description: 'The question.' },
  { header: 'Question Type', key: 'type', description: 'MULTIPLE_CHOICE (default when there are choices), CHECKBOXES, DROPDOWN, TRUE_FALSE, SHORT_ANSWER (default without choices) or PARAGRAPH (marked by hand).' },
  { header: 'Choices', key: 'choices', description: 'For MULTIPLE_CHOICE, CHECKBOXES and DROPDOWN: at least 2 choices, one per line (Alt+Enter) or separated by ;.' },
  { header: 'Correct Answers', key: 'answers', description: 'The answer key, exactly as written in Choices (several for CHECKBOXES). TRUE_FALSE: True or False. SHORT_ANSWER: every accepted answer. Questions without one are marked by hand.' },
  { header: 'Points', key: 'points', description: 'Points for the question (default 1 when it has a correct answer).' },
  { header: 'Feedback', key: 'feedback', description: 'Optional. Shown to the student after the answer is marked.' },
];

export const QUIZ_TYPES = [
  { value: 'MULTIPLE_CHOICE', label: 'Multiple choice', choices: true },
  { value: 'CHECKBOXES', label: 'Checkboxes', choices: true },
  { value: 'DROPDOWN', label: 'Drop-down', choices: true },
  { value: 'TRUE_FALSE', label: 'True / False', choices: false },
  { value: 'SHORT_ANSWER', label: 'Short answer', choices: false },
  { value: 'PARAGRAPH', label: 'Paragraph (marked by hand)', choices: false },
];
const QUIZ_TYPE_ALIASES = {
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE', MCQ: 'MULTIPLE_CHOICE', RADIO: 'MULTIPLE_CHOICE',
  CHECKBOXES: 'CHECKBOXES', CHECKBOX: 'CHECKBOXES',
  DROPDOWN: 'DROPDOWN', DROP_DOWN: 'DROPDOWN',
  TRUE_FALSE: 'TRUE_FALSE', TRUE_OR_FALSE: 'TRUE_FALSE', TF: 'TRUE_FALSE', T_F: 'TRUE_FALSE',
  SHORT_ANSWER: 'SHORT_ANSWER', SHORT: 'SHORT_ANSWER', TEXT: 'SHORT_ANSWER',
  PARAGRAPH: 'PARAGRAPH', LONG_ANSWER: 'PARAGRAPH', ESSAY: 'PARAGRAPH',
};
const TRUE_FALSE = { true: 'True', t: 'True', yes: 'True', false: 'False', f: 'False', no: 'False' };

export const BLANK_SETTINGS = {
  class_name: '',
  section: '',
  subject: '',
  level: '',
  room: '',
  welcome_announcement: '',
  teachers: [],
};

export const blankModule = (weekNumber) => ({
  sequence: `Week ${weekNumber}`,
  stream_topic: '',
  title: '',
  overview: '',
  presentation_urls: [''],
  presentation_url: '',
  youtube_urls: [''],
  notebook_enabled: false,
  notebook_url: '',
  assignment_title: '',
  assignment_instructions: '',
  rubric_url: '',
  points: 100,
  due_date: '',
  quiz_title: '',
  quiz_url: '',
  quiz_points: '',
  quiz_questions: [],
  question_prompt: '',
  question_type: 'SHORT_ANSWER_QUESTION',
  question_choices: [],
  question_points: '',
});

export const blankQuizQuestion = () => ({ question: '', type: 'MULTIPLE_CHOICE', choices: ['', ''], answers: [], points: 1, feedback: '' });

// Topic notebooks are attached as links; only NotebookLM and Gemini notebook URLs are accepted.
export const NOTEBOOK_HOSTS = ['notebooklm.google.com', 'notebook.google.com', 'gemini.google.com'];
export const NOTEBOOK_HOSTS_TEXT = NOTEBOOK_HOSTS.map(h => `https://${h}/`).join(', ').replace(/, ([^,]*)$/, ' or $1');
export const isNotebookUrl = (url) => {
  try {
    const u = new URL(String(url).trim());
    return u.protocol === 'https:' && NOTEBOOK_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
};

// A rubric is imported from a Google Sheet, given by its full link.
const SHEET_LINK = /^https:\/\/(?:docs\.google\.com\/(?:a\/[^/]+\/)?spreadsheets\/(?:u\/\d+\/)?d\/|drive\.google\.com\/(?:a\/[^/]+\/)?file\/(?:u\/\d+\/)?d\/|drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=)[A-Za-z0-9_-]{10,}/;
export const isSheetLink = (url) => SHEET_LINK.test(String(url || '').trim());

// Due dates are ISO 8601: a date (due 23:59), a date and time, or either with an offset.
// A time without an offset is in this computer's time zone.
const ISO_DUE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
export const isIsoDue = (value) => {
  const text = String(value || '').trim();
  return text === '' || (ISO_DUE.test(text) && !Number.isNaN(Date.parse(text.slice(0, 10))));
};
export const splitDue = (value) => {
  const m = String(value || '').match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  return m ? { date: m[1], time: m[2] || '' } : { date: '', time: '' };
};

// Excel stores a date cell as a count of days (with the time as a fraction) since 30 Dec 1899,
// or since 1 Jan 1904 in workbooks using the Mac date system. Rounded to the minute, because
// 17:00 can be stored as 16:59:59.99.
export const excelSerialToIso = (serial, date1904 = false) => {
  if (!Number.isFinite(serial)) return '';
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const d = new Date(epoch + Math.round(serial * 1440) * 60000);
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return (d.getUTCHours() || d.getUTCMinutes()) ? `${day}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : day;
};

export const nonEmptyChoices = (mod) => (mod.question_choices || []).map(c => String(c).trim()).filter(Boolean);

const lines = (values) => (values || []).map(v => String(v ?? '').trim()).filter(Boolean);
const entries = (text) => [...new Set(String(text ?? '').split(/[\r\n;]+/).map(s => s.trim()).filter(Boolean))];
const norm = (text) => String(text ?? '').toLowerCase().trim().replace(/[\s_-]+/g, ' ');
const weekKey = (label) => String(label ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

// ---------------------------------------------------------------------------
// Quiz questions: the same rules as parse_quiz_question in classroom_course_engine.py
// ---------------------------------------------------------------------------

export const quizChoices = (q) => (q.type === 'TRUE_FALSE' ? ['True', 'False'] : lines(q.choices));
export const isChoiceQuestion = (q) => ['MULTIPLE_CHOICE', 'CHECKBOXES', 'DROPDOWN', 'TRUE_FALSE'].includes(q.type);
export const quizQuestionPoints = (q) => (q.points === '' || q.points == null
  ? (lines(q.answers).length && q.type !== 'PARAGRAPH' ? 1 : 0)
  : Number(q.points));
export const quizTotalPoints = (mod) => (mod.quiz_questions || []).reduce((sum, q) => sum + quizQuestionPoints(q), 0);

/** What would stop a question from making a working, correctly marked quiz. */
export function quizQuestionProblems(q) {
  const problems = [];
  if (!String(q.question || '').trim()) problems.push('the question is empty');
  if (!QUIZ_TYPES.some(t => t.value === q.type)) problems.push(`question type "${q.type}" is not one of ${QUIZ_TYPES.map(t => t.value).join(', ')}`);
  const choices = quizChoices(q);
  if (['MULTIPLE_CHOICE', 'CHECKBOXES', 'DROPDOWN'].includes(q.type) && choices.length < 2) problems.push('it needs at least 2 choices');
  if (isChoiceQuestion(q)) {
    const known = new Set(choices.map(c => c.toLowerCase()));
    const unknown = lines(q.answers).filter(a => !known.has(a.toLowerCase()));
    if (unknown.length) problems.push(`the correct answer "${unknown[0]}" is not one of its choices`);
  }
  if (q.points !== '' && q.points != null && !(Number.isInteger(Number(q.points)) && Number(q.points) >= 0)) {
    problems.push(`points "${q.points}" must be a whole number of 0 or more`);
  }
  return problems;
}

/** A question as written in a sheet (any case, aliases, TRUE/FALSE as booleans) in the app's form. */
function readQuizQuestion(cells) {
  const choices = entries(cells.choices);
  const typeKey = String(cells.type ?? '').toUpperCase().replace(/[^A-Z]+/g, '_').replace(/^_|_$/g, '');
  const type = typeKey ? (QUIZ_TYPE_ALIASES[typeKey] || typeKey) : (choices.length ? 'MULTIPLE_CHOICE' : 'SHORT_ANSWER');
  let answers = entries(typeof cells.answers === 'boolean' ? (cells.answers ? 'True' : 'False') : cells.answers);
  const q = {
    question: String(cells.question ?? '').trim(),
    type,
    choices: ['MULTIPLE_CHOICE', 'CHECKBOXES', 'DROPDOWN'].includes(type) ? choices : [],
    answers: [],
    points: cells.points === '' || cells.points == null ? '' : Number(cells.points),
    feedback: String(cells.feedback ?? '').trim(),
  };
  if (type === 'TRUE_FALSE') answers = answers.map(a => TRUE_FALSE[a.toLowerCase()] || a);
  if (isChoiceQuestion(q)) {
    const byLower = Object.fromEntries(quizChoices(q).map(c => [c.toLowerCase(), c]));
    answers = answers.map(a => byLower[a.toLowerCase()] || a);
  }
  q.answers = type === 'PARAGRAPH' ? [] : answers;
  if (Number.isNaN(q.points)) q.points = String(cells.points);
  return q;
}

// ---------------------------------------------------------------------------
// Writing: template download, Save .xlsx and the completion workbook
// ---------------------------------------------------------------------------

function toCell(column, mod, index) {
  const value = mod[column.key];
  switch (column.key) {
    case 'sequence':
      return value || `Week ${index + 1}`;
    case 'stream_topic':
      return value || `${mod.sequence || `Week ${index + 1}`}: ${mod.title || `Module ${index + 1}`}`;
    case 'presentation_urls':
      return lines(lines(value).length ? value : [mod.presentation_url]).join('\n');
    case 'notebook_url':
      return mod.notebook_enabled ? String(value || '').trim() : '';
    case 'points':
      return value === '' || value == null ? 100 : Number(value);
    default:
      break;
  }
  switch (column.type) {
    case 'urls':
    case 'lines':
      return lines(value).join('\n');
    case 'points':
      return value === '' || value == null ? '' : Number(value);
    case 'questionType':
      return value || 'SHORT_ANSWER_QUESTION';
    default:
      return value == null ? '' : String(value);
  }
}

function appendSheet(wb, name, rows, header, widths) {
  const ws = XLSX.utils.json_to_sheet(rows, { header });
  ws['!cols'] = widths.map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, name);
}

const README_NOTES = [
  { Sheet: 'Attachments', Element: 'How resources are attached', Required: '-', Description: 'Give every resource as a full link. Google Drive files (Docs, Slides, Sheets, uploaded files) are attached as Drive files, YouTube videos as videos, and web pages, Google Forms, Drive folders and notebooks as links. If Classroom refuses one (for example a Drive file that does not exist or that you cannot open), it is attached as a plain link instead, and if that is refused too it is listed with its title under "Resources:" in the post\'s description.' },
  { Sheet: 'Quizzes', Element: 'How quizzes are made', Required: '-', Description: 'A week with rows on Quiz_Questions gets a new Google Forms quiz: the questions, the answer key, points and feedback, collecting each student\'s email. It is published and attached to the quiz assignment, ready for students. Scores are in the form\'s Responses tab. A week with a Quiz URL instead uses that existing form.' },
  { Sheet: 'Students', Element: 'Joining the course', Required: '-', Description: 'Course Builder does not add students. When the course is built it shows the class code and join link, which you share with your students (the Students sheet can be emailed from there).' },
  { Sheet: 'Workflow', Element: 'Step 1', Required: '-', Description: 'Fill in Course_Settings, Curriculum, Quiz_Questions and Students. One Curriculum row per week; one Quiz_Questions row per question.' },
  { Sheet: 'Workflow', Element: 'Step 2', Required: '-', Description: 'In Course Builder, press Upload .xlsx (or attach the workbook to the AI agent). Every field of the form is filled from the workbook.' },
  { Sheet: 'Workflow', Element: 'Step 3', Required: '-', Description: 'Review the weeks, then press Finish & Create Course. When it finishes, share the class code and download the completed workbook.' },
];

/** The workbook for a course (form state). The template download is this, for TEMPLATE_EXAMPLE. */
export function buildCourseWorkbook({ settings = {}, curriculum = [], students = [] }) {
  const wb = XLSX.utils.book_new();

  appendSheet(wb, SHEETS.settings, SETTINGS_FIELDS.map(f => ({
    Setting: f.key,
    Value: f.key === 'teachers' ? lines(settings.teachers).join(', ') : (settings[f.key] ?? ''),
    Description: f.description,
  })), ['Setting', 'Value', 'Description'], [24, 60, 70]);

  appendSheet(wb, SHEETS.curriculum,
    curriculum.map((mod, i) => Object.fromEntries(CURRICULUM_COLUMNS.map(c => [c.header, toCell(c, mod, i)]))),
    CURRICULUM_COLUMNS.map(c => c.header),
    [10, 40, 34, 50, 60, 45, 45, 38, 50, 50, 8, 18, 38, 45, 11, 50, 26, 40, 14]);

  appendSheet(wb, SHEETS.quiz, curriculum.flatMap((mod, i) => (mod.quiz_questions || []).map(q => ({
    Week: toCell(CURRICULUM_COLUMNS[0], mod, i),
    Question: q.question || '',
    'Question Type': q.type || '',
    Choices: q.type === 'TRUE_FALSE' ? '' : lines(q.choices).join('\n'),
    'Correct Answers': lines(q.answers).join('\n'),
    Points: q.points === '' || q.points == null ? '' : q.points,
    Feedback: q.feedback || '',
  }))), QUIZ_QUESTION_COLUMNS.map(c => c.header), [10, 60, 18, 40, 30, 8, 50]);

  appendSheet(wb, SHEETS.students, lines(students.map(s => (typeof s === 'string' ? s : s?.email))).map((email, i) => ({
    'Student #': i + 1,
    'Student Email': email,
  })), ['Student #', 'Student Email'], [12, 42]);

  appendSheet(wb, SHEETS.readme, [
    ...SETTINGS_FIELDS.map(f => ({ Sheet: SHEETS.settings, Element: f.key, Required: f.required, Description: f.description })),
    ...CURRICULUM_COLUMNS.map(c => ({ Sheet: SHEETS.curriculum, Element: c.header, Required: c.required, Description: c.description })),
    ...QUIZ_QUESTION_COLUMNS.map(c => ({ Sheet: SHEETS.quiz, Element: c.header, Required: ['week', 'question'].includes(c.key) ? 'YES' : 'NO', Description: c.description })),
    { Sheet: SHEETS.students, Element: 'Student Email', Required: 'NO', Description: 'Your class list, used to email students the class code after the course is built. Students are not added automatically.' },
    ...README_NOTES,
  ], ['Sheet', 'Element', 'Required', 'Description'], [18, 50, 18, 110]);

  return wb;
}

/**
 * The completion workbook: the course exactly as it was sent to Classroom (it uploads again as a
 * template), with the class code, every post made and its link, the quiz forms, the rubrics and
 * the deployment log added in front.
 */
export function buildDeployedWorkbook(deployed, result) {
  const wb = buildCourseWorkbook(deployed);
  const course = result.course || {};
  const sheets = [];
  const add = (name, ws, widths) => {
    ws['!cols'] = widths.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
    sheets.push(name);
  };

  add('Classroom', XLSX.utils.aoa_to_sheet([
    ['Course', course.name || ''],
    ['Section', course.section || ''],
    ['Class code (students join with this)', result.enrollmentCode || ''],
    ['Join link', result.joinLink || ''],
    ['Course in Classroom', course.alternateLink || ''],
    ['Course ID', course.id || ''],
    ['Created', course.creationTime || ''],
    ['Welcome announcement', result.announcement || ''],
    ['Posts created', (result.posts || []).length],
    ['Steps that need attention', (result.provisioningLog || []).filter(e => e.status === 'failed' || e.status === 'partial').length],
  ]), [36, 90]);

  add('Classroom_Posts', XLSX.utils.json_to_sheet((result.posts || []).map(p => ({
    Week: p.week, Topic: p.topic, Type: p.kind, Title: p.title,
    Status: p.state === 'DRAFT' ? 'Draft' : 'Published', Points: p.maxPoints ?? '',
    'Due (UTC)': p.due || '', 'Classroom link': p.link || '',
    Attachments: (p.attachments || []).join('\n'), Description: p.description || '',
  })), { header: ['Week', 'Topic', 'Type', 'Title', 'Status', 'Points', 'Due (UTC)', 'Classroom link', 'Attachments', 'Description'] }),
  [10, 34, 12, 40, 10, 8, 18, 50, 70, 70]);

  add('Quiz_Forms', XLSX.utils.json_to_sheet((result.forms || []).map(f => ({
    Week: f.week, Quiz: f.quiz, Questions: f.questions,
    'Student link': f.responderUri || '', 'Edit link (teacher)': f.editUri || '',
    Published: f.published ? 'Yes' : 'No', Problem: f.problem || '',
  })), { header: ['Week', 'Quiz', 'Questions', 'Student link', 'Edit link (teacher)', 'Published', 'Problem'] }),
  [10, 40, 10, 60, 60, 10, 70]);

  add('Rubrics', XLSX.utils.json_to_sheet((result.rubrics || []).map(r => ({
    Week: r.week, Assignment: r.assignment, 'Rubric sheet': r.url,
    Result: r.status === 'created' ? 'Rubric added' : r.status === 'in description' ? 'Link in assignment description' : 'Not added',
    Problem: r.problem || '',
  })), { header: ['Week', 'Assignment', 'Rubric sheet', 'Result', 'Problem'] }), [10, 40, 60, 30, 70]);

  add('Deployment_Log', XLSX.utils.json_to_sheet((result.provisioningLog || []).map(e => ({
    Step: e.step, Item: e.target, Status: e.status, Detail: e.detail || '',
  })), { header: ['Step', 'Item', 'Status', 'Detail'] }), [14, 50, 10, 120]);

  // The class code first, then the course sheets, then the details.
  wb.SheetNames = ['Classroom', ...wb.SheetNames.filter(n => !sheets.includes(n)), ...sheets.filter(n => n !== 'Classroom')];
  return wb;
}

// ---------------------------------------------------------------------------
// Reading: Upload .xlsx and the AI panels
// ---------------------------------------------------------------------------

const SETTING_ALIASES = {
  class_name: ['class_name', 'name', 'course_name', 'course_title', 'title', 'class', 'course'],
  section: ['section', 'cohort', 'cohort_name', 'term', 'section_term'],
  subject: ['subject', 'subject_area', 'department'],
  level: ['level', 'academic_level'],
  room: ['room', 'location', 'virtual_room', 'room_location'],
  welcome_announcement: ['welcome_announcement', 'announcement', 'welcome_message', 'stream_announcement', 'welcome'],
  teachers: ['teachers', 'teacher', 'co_teachers', 'co_teacher', 'instructors', 'instructor', 'faculty'],
};
const settingKey = (raw) => {
  const key = String(raw ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return Object.keys(SETTING_ALIASES).find(k => SETTING_ALIASES[k].includes(key)) || null;
};

// For workbooks made by hand: header words that point at a field.
function guessColumnKey(h) {
  if (h.includes('stream topic') || h.includes('classroom stream') || h.includes('classroom topic') || h === 'stream') return 'stream_topic';
  if (h.includes('rubric')) return 'rubric_url';
  if (h.includes('quiz points') || h.includes('quiz max points') || h.includes('quiz score')) return 'quiz_points';
  if (h.includes('question points') || h.includes('question max points') || h.includes('question score')) return 'question_points';
  if (h.includes('question choices') || h.includes('choices') || h.includes('answer options')) return 'question_choices';
  if (h.includes('youtube') || h.includes('video')) return 'youtube_urls';
  if (h.includes('notebook')) return 'notebook_url';
  if (h.includes('question type') || h.includes('prompt type')) return 'question_type';
  if (h === 'week' || h.includes('module #') || h.includes('module number') || h.includes('unit') || h === 'topic order') return 'sequence';
  if (h.includes('module title') || h.includes('topic title') || h === 'title') return 'title';
  if (h.includes('overview') || h.includes('description') || h.includes('summary')) return 'overview';
  if (h.includes('lecture') || h.includes('presentation') || h.includes('slides') || h.includes('materials url')) return 'presentation_urls';
  if (h.includes('instructions')) return 'assignment_instructions';
  if (h.includes('quiz assignment') || h.includes('quiz title') || h.includes('quiz name')) return 'quiz_title';
  if (h.includes('quiz url') || h.includes('quiz form') || h.includes('google form') || h.includes('form url')) return 'quiz_url';
  if (h.includes('question') || h.includes('discussion')) return 'question_prompt';
  if (h.includes('assignment') || h.includes('assessment') || h.includes('knowledge check')) return 'assignment_title';
  if (h.includes('points') || h.includes('score')) return 'points';
  if (h.includes('due') || h.includes('date') || h.includes('deadline')) return 'due_date';
  return null;
}

function guessQuizColumnKey(h) {
  const exact = QUIZ_QUESTION_COLUMNS.find(c => norm(c.header) === h);
  if (exact) return exact.key;
  if (h.includes('week') || h === 'topic order') return 'week';
  if (h.includes('type')) return 'type';
  if (h.includes('choice') || h.includes('option')) return 'choices';
  if (h.includes('answer') || h.includes('correct')) return 'answers';
  if (h.includes('point') || h.includes('mark') || h.includes('score')) return 'points';
  if (h.includes('feedback') || h.includes('explanation')) return 'feedback';
  if (h.includes('question')) return 'question';
  return null;
}

const COLUMN_BY_HEADER = Object.fromEntries(CURRICULUM_COLUMNS.flatMap(c => [[norm(c.header), c], [norm(c.key), c]]));
const COLUMN_BY_KEY = Object.fromEntries(CURRICULUM_COLUMNS.map(c => [c.key, c]));
const EMAIL = /[^\s@,;<>()"']+@[^\s@,;<>()"']+\.[^\s@,;<>()"']+/;

/**
 * Read a Course Builder workbook into form state: { settings, curriculum, students, warnings }.
 * Everything in the workbook replaces the form; anything that cannot be read is listed in
 * warnings rather than dropped silently.
 */
export function importCourseWorkbook(data) {
  const wb = XLSX.read(data, { type: 'array' });
  const date1904 = !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);
  const warnings = [];
  const sheetByName = Object.fromEntries(wb.SheetNames.map(n => [norm(n), n]));
  const findSheet = (names) => names.map(n => sheetByName[norm(n)]).find(Boolean) || null;

  // Course settings: a Setting | Value list (or one header row and one row of values)
  const settings = { ...BLANK_SETTINGS, teachers: [] };
  const settingsSheet = findSheet(['Course_Settings', 'CourseSettings', 'Settings', 'Course', 'Metadata']);
  if (settingsSheet) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[settingsSheet], { header: 1, defval: '' });
    const firstCell = norm((rows[0] || [])[0]);
    const vertical = ['setting', 'key', 'property'].includes(firstCell) || rows.some(r => settingKey(r[0]));
    const pairs = vertical
      ? rows.slice(['setting', 'key', 'property'].includes(firstCell) ? 1 : 0).map(r => [r[0], r[1]])
      : (rows[0] || []).map((h, i) => [h, (rows[1] || [])[i]]);
    for (const [rawKey, rawValue] of pairs) {
      const value = String(rawValue ?? '').trim();
      if (!String(rawKey ?? '').trim() || !value) continue;
      const key = settingKey(rawKey);
      if (!key) {
        warnings.push(`Course setting "${rawKey}" is not a Course Builder field and was ignored.`);
      } else if (key === 'teachers') {
        settings.teachers = value.split(/[\r\n,;]+/).map(t => t.trim().toLowerCase()).filter(t => EMAIL.test(t));
      } else {
        settings[key] = value;
      }
    }
  } else {
    warnings.push('No Course_Settings sheet was found, so the course settings are empty.');
  }

  // Students: every email address on the Students sheet (a class list; they are not added)
  const students = [];
  const studentSheet = findSheet(['Students', 'Student', 'Roster', 'Class Roster', 'Student Roster', 'Enrollment',
    'Enrolment', 'Student Enrolment', 'Student Enrollment', 'Student List']);
  if (studentSheet) {
    for (const row of XLSX.utils.sheet_to_json(wb.Sheets[studentSheet], { header: 1, defval: '' })) {
      for (const cell of row) {
        const match = String(cell ?? '').match(EMAIL);
        if (match) {
          const email = match[0].toLowerCase();
          if (!students.includes(email)) students.push(email);
          break;
        }
      }
    }
  }

  // Curriculum: one row per week
  const curriculumSheet = findSheet(['Curriculum', 'Modules', 'Weeks', 'Coursework', 'Syllabus', 'Topics'])
    || wb.SheetNames.find(n => !/setting|student|readme|instruction|teacher|enrol|roster|quiz|classroom|log|rubric/.test(norm(n)));
  const curriculum = [];
  let templateColumns = 0;
  if (!curriculumSheet) {
    warnings.push('No Curriculum sheet was found, so there are no weeks.');
  } else {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[curriculumSheet], { header: 1, defval: '' });
    const headers = (grid[0] || []).map(h => String(h ?? '').trim());
    const columns = headers.map((h) => {
      if (!h) return null;
      if (CURRICULUM_COLUMNS.some(c => norm(c.header) === norm(h))) templateColumns += 1;
      const column = COLUMN_BY_HEADER[norm(h)] || COLUMN_BY_KEY[guessColumnKey(norm(h))];
      if (!column) warnings.push(`Curriculum column "${h}" is not a Course Builder field and was ignored.`);
      return column || null;
    });
    columns.forEach((column, i) => {
      if (column && columns.indexOf(column) !== i) {
        warnings.push(`Curriculum columns "${headers[columns.indexOf(column)]}" and "${headers[i]}" both hold ${column.header}; only the first is used.`);
        columns[i] = null;
      }
    });

    grid.slice(1).forEach((cells) => {
      if (!cells.some(c => String(c ?? '').trim() !== '')) return; // empty row
      const week = curriculum.length + 1;
      const mod = blankModule(week);
      columns.forEach((column, i) => {
        if (!column) return;
        const raw = cells[i];
        if (raw === '' || raw == null) return;
        switch (column.type) {
          case 'urls':
            mod[column.key] = String(raw).split(/[\r\n,;]+/).map(s => s.trim()).filter(Boolean);
            break;
          case 'lines':
            mod[column.key] = String(raw).split(/[\r\n;]+/).map(s => s.trim()).filter(Boolean);
            break;
          case 'points': {
            const n = Number(raw);
            if (Number.isInteger(n) && n >= 0) mod[column.key] = n;
            else warnings.push(`Week ${week}: ${column.header} "${raw}" is not a whole number of 0 or more, so the default is used.`);
            break;
          }
          case 'date':
            mod.due_date = typeof raw === 'number' ? excelSerialToIso(raw, date1904) : String(raw).trim();
            break;
          case 'questionType':
            mod.question_type = String(raw).toUpperCase().includes('MULTIPLE') ? 'MULTIPLE_CHOICE_QUESTION' : 'SHORT_ANSWER_QUESTION';
            break;
          default:
            mod[column.key] = String(raw).trim();
        }
      });
      if (!mod.title) mod.title = `Module ${week}`;
      if (!mod.stream_topic) mod.stream_topic = `${mod.sequence}: ${mod.title}`;
      mod.presentation_urls = lines(mod.presentation_urls).length ? lines(mod.presentation_urls) : [''];
      mod.presentation_url = mod.presentation_urls[0];
      mod.youtube_urls = lines(mod.youtube_urls).length ? lines(mod.youtube_urls) : [''];
      mod.notebook_enabled = !!mod.notebook_url;
      curriculum.push(mod);
    });
    if (curriculum.length === 0) warnings.push(`The ${curriculumSheet} sheet has no weeks.`);
  }

  // Quiz_Questions: one row per question, joined to its week by the Week label
  const quizSheet = findSheet(['Quiz_Questions', 'Quiz Questions', 'QuizQuestions', 'Quizzes', 'Quiz']);
  if (quizSheet && curriculum.length) {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[quizSheet], { header: 1, defval: '' });
    const keys = (grid[0] || []).map(h => guessQuizColumnKey(norm(h)));
    const byWeek = Object.fromEntries(curriculum.map(m => [weekKey(m.sequence), m]));
    grid.slice(1).forEach((cells, i) => {
      if (!cells.some(c => String(c ?? '').trim() !== '')) return;
      const raw = {};
      keys.forEach((key, c) => { if (key && raw[key] === undefined) raw[key] = cells[c]; });
      const where = `${quizSheet} row ${i + 2}`;
      const mod = byWeek[weekKey(raw.week)];
      if (!mod) {
        warnings.push(`${where}: week "${raw.week}" is not on the Curriculum sheet, so the question was not loaded.`);
        return;
      }
      const q = readQuizQuestion(raw);
      quizQuestionProblems(q).forEach(p => warnings.push(`${where} (${mod.sequence}): ${p}.`));
      mod.quiz_questions.push(q);
    });
  }

  // Checks that need the whole week
  for (const mod of curriculum) {
    if (!isIsoDue(mod.due_date)) {
      warnings.push(`${mod.sequence}: due date "${mod.due_date}" is not ISO 8601 (YYYY-MM-DD). Fix it before deploying.`);
    }
    if (mod.notebook_url && !isNotebookUrl(mod.notebook_url)) {
      warnings.push(`${mod.sequence}: the notebook link must start with ${NOTEBOOK_HOSTS_TEXT}.`);
    }
    if (mod.rubric_url && !isSheetLink(mod.rubric_url)) {
      warnings.push(`${mod.sequence}: the rubric link must be a full Google Sheets link (https://docs.google.com/spreadsheets/d/...).`);
    }
    if (mod.question_prompt && mod.question_type === 'MULTIPLE_CHOICE_QUESTION' && nonEmptyChoices(mod).length < 2) {
      warnings.push(`${mod.sequence}: the multiple-choice question needs at least 2 choices.`);
    }
    if (mod.quiz_questions.length && mod.quiz_url) {
      warnings.push(`${mod.sequence}: has both a Quiz URL and quiz questions. A new form is made from the questions, and the Quiz URL is not used.`);
    }
  }

  return {
    settings, curriculum, students, warnings, templateColumns,
    sheets: { settings: settingsSheet, curriculum: curriculumSheet, quiz: quizSheet, students: studentSheet },
  };
}

/** The course in a Course Builder workbook, or null when the file is something else (for the AI to read). */
export function readCourseTemplate(data) {
  let course;
  try {
    course = importCourseWorkbook(data);
  } catch {
    return null;
  }
  return course.templateColumns >= 3 && course.curriculum.length > 0 ? course : null;
}

// ---------------------------------------------------------------------------
// The example course in the downloadable template. It fills every field once,
// so the template shows how each one is written.
// ---------------------------------------------------------------------------

const week = (n, fields) => ({ ...blankModule(n), ...fields, presentation_url: (fields.presentation_urls || [''])[0] });

export const TEMPLATE_EXAMPLE = {
  settings: {
    class_name: 'CS101: Introduction to Cloud Computing',
    section: 'Cohort 1 - Term 1 2026',
    subject: 'Computer Science & Cloud Systems',
    level: 'Undergraduate (Introductory)',
    room: 'Virtual Lab Room A-12',
    welcome_announcement: 'Welcome to CS101! Please review the syllabus, bookmark the lecture slide links, and complete weekly coursework.',
    teachers: ['prof.sarah.jenkins@school.edu', 'ta.alex@school.edu'],
  },
  curriculum: [
    week(1, {
      stream_topic: 'Week 1: Foundations of Cloud Infrastructure',
      title: 'Foundations of Cloud Infrastructure',
      overview: 'Introduction to distributed systems, virtualization, hypervisors, and multi-tenant architectures.',
      presentation_urls: [
        'https://docs.google.com/presentation/d/1demo-cloud-foundations-slides/edit',
        'https://drive.google.com/file/d/1demo-cloud-architecture-whitepaper/view',
      ],
      youtube_urls: ['https://www.youtube.com/watch?v=VIDEO_ID_01'],
      notebook_enabled: true,
      notebook_url: 'https://notebooklm.google.com/notebook/your-notebook-id',
      assignment_title: 'Lab 1: Setting up Cloud Shell & IAM',
      assignment_instructions: 'Configure your cloud environment, set up service accounts, and verify CLI access.',
      rubric_url: 'https://docs.google.com/spreadsheets/d/1demo-lab-rubric-sheet/edit',
      points: 100,
      due_date: '2026-10-15T17:00',
      quiz_title: 'Quiz 1: Virtualization vs Containers',
      quiz_questions: [
        { question: 'Which hypervisor type runs directly on the hardware?', type: 'MULTIPLE_CHOICE', choices: ['Type-1 (bare metal)', 'Type-2 (hosted)'], answers: ['Type-1 (bare metal)'], points: 2, feedback: 'Type-1 hypervisors run on the hardware itself, with no host operating system.' },
        { question: 'Which of these are container runtimes?', type: 'CHECKBOXES', choices: ['containerd', 'CRI-O', 'VirtualBox'], answers: ['containerd', 'CRI-O'], points: 2, feedback: '' },
        { question: 'Containers share the host operating system kernel.', type: 'TRUE_FALSE', choices: [], answers: ['True'], points: 1, feedback: '' },
        { question: 'Which cloud service model gives you virtual machines?', type: 'DROPDOWN', choices: ['IaaS', 'PaaS', 'SaaS'], answers: ['IaaS'], points: 1, feedback: '' },
        { question: 'Name the command-line tool used to run Docker containers.', type: 'SHORT_ANSWER', choices: [], answers: ['docker'], points: 1, feedback: '' },
        { question: 'Describe one advantage of virtual machines over containers.', type: 'PARAGRAPH', choices: [], answers: [], points: 4, feedback: 'Marked by your teacher.' },
      ],
      question_prompt: 'Which hypervisor type would you choose for a production cloud, and why?',
      question_type: 'MULTIPLE_CHOICE_QUESTION',
      question_choices: ['Type-1 (bare metal)', 'Type-2 (hosted)'],
      question_points: 10,
    }),
    week(2, {
      stream_topic: 'Week 2: Compute & Container Orchestration',
      title: 'Compute & Container Orchestration',
      overview: 'Deep dive into Docker container runtime and Kubernetes workload management.',
      presentation_urls: ['https://docs.google.com/presentation/d/2demo-kubernetes-containers/edit'],
      assignment_title: 'Lab Assignment: Deploying Microservices on GKE',
      assignment_instructions: 'Deploy multi-tier containerized applications to Google Kubernetes Engine.',
      points: 100,
      due_date: '2026-10-22',
      quiz_title: 'Quiz 2: Kubernetes Pods, Services & Ingress',
      quiz_url: 'https://docs.google.com/forms/d/2quiz-k8s-orchestration/viewform',
      quiz_points: 25,
      question_prompt: 'Explain how a Kubernetes Service discovers and routes traffic to backend Pods.',
    }),
    week(3, {
      stream_topic: 'Week 3: Cloud Storage & Scalable Databases',
      title: 'Cloud Storage & Scalable Databases',
      overview: 'Understanding blob storage, transactional SQL databases, and globally distributed NoSQL.',
      presentation_urls: ['https://docs.google.com/presentation/d/3demo-cloud-databases-storage/edit'],
      assignment_title: 'Assessment 3: Designing a High-Availability Storage Tier',
      assignment_instructions: 'Design a fault-tolerant multi-region storage architecture with read replicas.',
      points: 100,
      due_date: '2026-10-29',
      quiz_title: 'Quiz 3: CAP Theorem & Consistency Models',
      quiz_url: 'https://docs.google.com/forms/d/3quiz-databases-storage/viewform',
      question_prompt: 'Under what latency and throughput constraints would you select Cloud Spanner over Cloud SQL?',
    }),
    week(4, {
      stream_topic: 'Week 4: DevOps, Security & Final Capstone',
      title: 'DevOps, Security & Final Capstone',
      overview: 'IAM roles, least privilege, CI/CD automation pipelines, and course capstone presentation.',
      presentation_urls: ['https://docs.google.com/presentation/d/4demo-devops-security-capstone/edit'],
      assignment_title: 'Final Capstone Project: End-to-End Automated Pipeline',
      assignment_instructions: 'Build and deploy an automated CI/CD pipeline with strict security policy enforcement.',
      points: 200,
      due_date: '2026-11-05',
      quiz_title: 'Quiz 4: Cloud Security & Principle of Least Privilege',
      quiz_url: 'https://docs.google.com/forms/d/4quiz-devops-security/viewform',
      question_prompt: 'Discuss the key considerations when securing secrets in a public cloud pipeline.',
    }),
  ],
  students: [
    'anna.smith@student.school.edu',
    'ben.miller@student.school.edu',
    'clara.zhao@student.school.edu',
    'david.williams@student.school.edu',
    'elena.rostova@student.school.edu',
  ],
};
