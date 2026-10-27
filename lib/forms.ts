import {
  SHEET_IDS, MARKETING_TEAM_SHEET_ID, PM_BANDWIDTH_SHEET_ID, TAB_BANDWIDTH, TAB_MARKETING_TASKS, TAB_LEADERBOARD,
} from './config';

// The dashboard's own entry forms — they replaced the Google Forms that used
// to feed the task and project sheets. Questions, options, "Other" choices
// and required flags are copied from those forms, and each answer is stored
// under the column the form's linked sheet used, in that sheet's date
// format, so every screen keeps reading the rows exactly as before.
// Shared by the form UI (components/EntryForm.tsx) and /api/forms.

export type FieldType =
  | 'choice'      // pick one (radio list); allowOther adds "Other: ___"
  | 'dropdown'    // pick one from a select
  | 'checkboxes'  // pick any number; allowOther adds "Other: ___"
  | 'text'        // one line
  | 'paragraph'   // several lines
  | 'date';

export interface FormField {
  header: string;            // question title = column header in the table
  type: FieldType;
  required?: boolean;
  options?: string[];
  allowOther?: boolean;
}

export type DateOrder = 'dmy' | 'mdy';

export interface EntryFormDef {
  key: FormKey;
  title: string;
  sheetId: string;           // dataset key (lib/data/datasets.ts)
  tab: string;
  order: DateOrder;          // the linked sheet's date format
  emailHeader: string;       // column that records who submitted
  fields: FormField[];
  // Columns the form doesn't ask about but a new row starts with. Tasks
  // start as "No Action Taken" (what the team set by hand in the sheet), so
  // they pass Tasks Assigned's default filters and show up right away.
  initialValues?: Record<string, string>;
}

const NEW_TASK_VALUES = {
  'Task Status Updation': 'No Action Taken',
  'Task Daily Bucket': 'No Action Taken',
  'PM Status': 'No Action Taken',
  'Today Bucket Set': 'No Action Taken',
};

export type FormKey = 'web-task' | 'marketing-task' | 'pm-project';

// The PM spreadsheet's current-month tab (single tab, see lib/config.ts).
export const TAB_PM_CURRENT = 'CurrentMonth';

const NO_ACTION = 'No Action Taken';

export const ENTRY_FORMS: Record<FormKey, EntryFormDef> = {
  'web-task': {
    key: 'web-task',
    title: 'Web Team Task',
    sheetId: SHEET_IDS['1'],
    tab: TAB_BANDWIDTH,
    order: 'dmy',
    emailHeader: 'Email address',
    initialValues: NEW_TASK_VALUES,
    fields: [
      { header: 'Project Name', type: 'choice', required: true, allowOther: true, options: [
        'Cybernext', 'Vigora Bloom', 'IHE', 'YDB', 'Strongsuit', 'Sean Doyle Windows', 'KataZoom', 'Studio Amelia',
        'Matthews Jewellers', 'Dr Sebaa', 'Raquel Tamez'] },
      { header: 'Task Name', type: 'choice', required: true, allowOther: true, options: [
        'Weekly Maintenance', 'Monthly Maintenance', 'Speed Optimization', 'Client Feedback', 'Ad Creatives',
        'SMM Creatives', 'Video Editing', 'Website Audit', 'Time Estimation', 'Task Discussion', 'QA Testing',
        'Section Dynamic', 'Blog Post'] },
      { header: 'Task URL', type: 'paragraph', required: true },
      { header: 'Task Priority', type: 'dropdown', required: true, options: ['Urgent', 'High', 'Medium', 'Low'] },
      { header: 'Team Required', type: 'dropdown', required: true, options: ['UIUX', 'FrontEnd', 'BackEnd', 'QA'] },
      { header: 'Task Information', type: 'dropdown', options: ['New', 'Running', 'To be expected'] },
      { header: 'Preferred Resource', type: 'dropdown', options: ['Lovepreet', 'Shubham', 'Dhruv', 'Pawan', 'Robin', 'Akash'] },
      { header: 'Time Estimation', type: 'text' },
      { header: 'Deadline', type: 'date' },
    ],
  },
  'marketing-task': {
    key: 'marketing-task',
    title: 'Marketing Team Task',
    sheetId: MARKETING_TEAM_SHEET_ID,
    tab: TAB_MARKETING_TASKS,
    order: 'mdy',
    emailHeader: 'Email Address',
    initialValues: NEW_TASK_VALUES,
    fields: [
      { header: 'Project Name', type: 'choice', required: true, allowOther: true, options: [
        'Cybernext', 'Vigora Bloom', 'HEM Ankle Rehab', 'Steen Schotten', 'Lagant Google and LinkedIn Ads', 'YDB',
        'KROS Framework', 'CDL Experts', 'Sean Doyle Windows', 'KataZoom'] },
      { header: 'Task Name', type: 'choice', required: true, allowOther: true, options: [
        'Google Ads Optimization', 'FB Ads Optimization', 'CRO and Funnel Audit', 'Monthly Report', 'Weekly Report',
        'Account Audit'] },
      { header: 'Task URL', type: 'paragraph', required: true },
      { header: 'Department', type: 'dropdown', options: ['SEO', 'PPC', 'SMM'] },
      { header: 'Assigned Person', type: 'dropdown', options: [
        'Atul', 'Shiwangi', 'Dheeraj', 'Anjali', 'Anurag', 'Vansh', 'Akshay', 'Kshitij', 'Bhavya', 'Payal', 'Akanksha'] },
      { header: 'Task Estimation', type: 'text' },
      { header: 'Deadline', type: 'date' },
    ],
  },
  'pm-project': {
    key: 'pm-project',
    title: 'Add New Project',
    sheetId: PM_BANDWIDTH_SHEET_ID,
    tab: TAB_PM_CURRENT,
    order: 'mdy',
    emailHeader: 'Email Address',
    fields: [
      { header: 'Department', type: 'dropdown', required: true, options: ['Web', 'Marketing'] },
      { header: 'Year', type: 'dropdown', required: true, options: ['2025', '2026', '2027'] },
      { header: 'Month', type: 'dropdown', required: true, options: [
        'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November',
        'December'] },
      { header: 'Project Name', type: 'choice', required: true, allowOther: true, options: [NO_ACTION] },
      { header: 'Client Name', type: 'choice', required: true, allowOther: true, options: [NO_ACTION] },
      { header: 'Communication Channel', type: 'choice', required: true, allowOther: true, options: [NO_ACTION] },
      { header: 'Tech', type: 'choice', required: true, allowOther: true, options: [NO_ACTION, 'Wordpress', 'Shopify', 'Webflow', 'Wix'] },
      { header: 'Total Hours', type: 'text', required: true },
      { header: 'AC Hours', type: 'text', required: true },
      { header: 'Payment Details', type: 'choice', required: true, allowOther: true, options: [
        NO_ACTION, 'Milestones', 'Offline', 'Upwork', 'Direct - Fixed', 'Fixed', 'Direct', 'Fixed - Direct', 'Fixed Upwork'] },
      { header: 'Assigned', type: 'checkboxes', required: true, options: [
        NO_ACTION, 'Akash', 'Pawan', 'Dhruv', 'Robin', 'Shubham', 'Lovepreet', 'Atul', 'Anjali', 'Dheeraj', 'Shiwangi',
        'Anurag', 'Vansh', 'Manas', 'Akshay', 'Kshitij', 'Bhavya', 'Payal', 'Akanksha'] },
      { header: 'Status', type: 'dropdown', required: true, options: [
        NO_ACTION, 'Yet to Start', 'In Progress', 'Initial setup', 'On Going', 'On Hold', 'Paused by client',
        'Paused by Cybernext', 'Escalated', 'Completed', 'Submitted - waiting for feedback', 'Closed: Without feedback',
        'Closed: Good Feedback', 'Closed: Bad Feedback', 'Move to Next Month'] },
      { header: 'Phase', type: 'dropdown', required: true, options: [
        NO_ACTION, 'Initial Setup', 'Requirement Gathering', 'Design', 'Development', 'QA', 'Deployed', 'Marketing',
        'Maintenance', 'Retainer', 'On Hold', 'Completed', 'Design + Dev', 'Ongoing Optimization', 'Need Based Support'] },
      { header: 'Milestone', type: 'choice', required: true, allowOther: true, options: [
        NO_ACTION, 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'Offline', 'Offline Retainer', 'Upwork Hourly',
        'Upwork - Milestone', 'Offline - Kickoff', 'TBD', 'Billing'] },
      { header: 'Current Month Hours', type: 'text', required: true },
      { header: 'Risk Month Hours', type: 'text', required: true },
      { header: 'Upcoming Milestones', type: 'choice', required: true, allowOther: true, options: [NO_ACTION] },
      { header: 'Upsell/Cross-Sell', type: 'choice', required: true, allowOther: true, options: [NO_ACTION, 'Upsell', 'Cross-Sell'] },
      { header: 'Project Start Date', type: 'date', required: true },
      { header: 'Target End Date', type: 'date', required: true },
      { header: 'Payment Status', type: 'dropdown', required: true, options: [
        NO_ACTION, 'Pending', 'Done', 'On Hold', 'QA_Done', 'Not Started Yet', 'In Progress', 'Ongoing',
        'Automated Payment', 'Direct Billing'] },
      { header: 'Last (Project) Follow-up Date', type: 'date', required: true },
      { header: 'Comments', type: 'paragraph' },
    ],
  },
};

// Google Forms targets still fed by Apps Script → /api/intake (the
// Leaderboard feedback form has no dashboard form yet).
export const INTAKE_TARGETS: Record<string, { sheetId: string; tab: string; order: DateOrder; emailHeader: string; initialValues?: Record<string, string> }> = {
  'web-task':       ENTRY_FORMS['web-task'],
  'marketing-task': ENTRY_FORMS['marketing-task'],
  'pm-project':     ENTRY_FORMS['pm-project'],
  'leaderboard':    { sheetId: SHEET_IDS['1'], tab: TAB_LEADERBOARD, order: 'dmy', emailHeader: 'Email address' },
};

export type Answers = Record<string, string | string[]>;

const MAX_TEXT = 5000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Returns a message per field that needs fixing (empty object = valid).
// "Other" answers arrive as plain text that isn't one of the options.
export function validateAnswers(def: EntryFormDef, answers: Answers): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of Object.keys(answers)) {
    if (!def.fields.some(f => f.header === key)) errors[key] = 'Unknown question';
  }
  for (const f of def.fields) {
    const raw = answers[f.header];
    const values = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).map(v => String(v).trim()).filter(Boolean);
    if (values.length === 0) {
      if (f.required) errors[f.header] = 'This question is required';
      continue;
    }
    if (values.some(v => v.length > MAX_TEXT)) { errors[f.header] = 'Answer is too long'; continue; }
    if (f.type !== 'checkboxes' && values.length > 1) { errors[f.header] = 'Choose one answer'; continue; }
    if (f.options && (f.type === 'choice' || f.type === 'dropdown' || f.type === 'checkboxes')) {
      const others = values.filter(v => !f.options!.includes(v));
      if (others.length > (f.allowOther ? 1 : 0)) errors[f.header] = 'Choose one of the listed options';
    }
    if (f.type === 'date') {
      const m = values[0].match(ISO_DATE);
      const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
      if (!m || !d || d.getUTCMonth() !== +m[2] - 1) errors[f.header] = 'Enter a valid date';
    }
  }
  return errors;
}

// ─── Sheet-style formatting ─────────────────────────────────────────────────
// Web Team Sheet is day-first with padded fields ("26/10/2026 14:05:09"),
// the Marketing and PM sheets are US style ("10/26/2026 14:05:09").

const pad = (n: number) => String(n).padStart(2, '0');

export function formatTimestamp(date: Date, order: DateOrder, timeZone: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(x => [x.type, x.value]));
  const [y, m, d, h] = [p.year, Number(p.month), Number(p.day), Number(p.hour)];
  return order === 'dmy'
    ? `${pad(d)}/${pad(m)}/${y} ${pad(h)}:${p.minute}:${p.second}`
    : `${m}/${d}/${y} ${h}:${p.minute}:${p.second}`;
}

// 2026-10-26 → the sheet's own date order; anything else is returned as is.
export function formatAnswer(value: string, order: DateOrder): string {
  const m = value.match(ISO_DATE);
  if (!m) return value;
  const [, y, mo, d] = m;
  return order === 'dmy' ? `${d}/${mo}/${y}` : `${Number(mo)}/${Number(d)}/${y}`;
}

// Answers → cells: checkbox answers joined with ", " (as Google Sheets did),
// dates in the sheet's order.
export function answersToValues(def: EntryFormDef, answers: Answers): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of def.fields) {
    const raw = answers[f.header];
    if (raw === undefined) continue;
    const list = (Array.isArray(raw) ? raw : [raw]).map(v => String(v).trim()).filter(Boolean);
    if (list.length) values[f.header] = formatAnswer(list.join(', '), def.order);
  }
  return values;
}
