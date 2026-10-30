import {
  SHEET_IDS, MARKETING_TEAM_SHEET_ID, PM_BANDWIDTH_SHEET_ID, TAB_BANDWIDTH, TAB_MARKETING_TASKS, TAB_LEADERBOARD,
  HELP_SHEET_ID, TAB_HELP,
} from './config';
import { HELP_TYPES, HELP_AREAS } from './help';
import type { RosterNames } from './roster';

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
  | 'date'
  | 'duration'    // Hours : Minutes dropdowns, stored as "HH.MM Hours" like every other time cell
  | 'grid';       // one choice per row; each row is its own column, "Header [Row]"

export interface FormField {
  header: string;            // question title = column header in the table (grid: the prefix)
  type: FieldType;
  required?: boolean;
  options?: string[];        // grid: the column choices
  rows?: string[];           // grid only
  allowOther?: boolean;      // dropdown / choice / checkboxes: adds "Other" with a text box
  asDropdown?: boolean;      // checkboxes only: a dropdown you tick several entries in, not a list
  fromSheet?: boolean;       // dropdown: also offer the values already used in the sheet (e.g. project names)
  maxLength?: number;        // text / paragraph: longest answer accepted
  roster?: 'web' | 'marketing' | 'all'; // the options are the people on that team (Admin Portal accounts); `options` is the fallback
  rosterPrefix?: string[];   // entries that come before the people (e.g. "No Action Taken")
}

// Hours : Minutes entry. Stored the way every time cell in the sheets is
// written ("04.00 Hours": the "." splits literal hours and minutes), so the
// bandwidth maths and the PM tables read it back unchanged.
export const DURATION_MAX_HOURS = 500;
export const DURATION_MAX_MINUTES = 59;
const pad2 = (n: number) => String(n).padStart(2, '0');
export const formatDuration = (h: number, m: number) => `${pad2(h)}.${pad2(m)} Hours`;
export function parseDuration(value: string): { h: number; m: number } | null {
  const match = /^(\d{2,3})\.(\d{2}) Hours$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]), m = Number(match[2]);
  return h <= DURATION_MAX_HOURS && m <= DURATION_MAX_MINUTES ? { h, m } : null;
}

// Column a grid row is stored in — the same name Google Forms gave it.
export const gridKey = (header: string, row: string) => `${header} [${row}]`;

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
  // An answer that is also written to other columns (question header -> column headers)
  alsoStoreIn?: Record<string, string[]>;
}

const NEW_TASK_VALUES = {
  'Task Status Updation': 'No Action Taken',
  'Task Daily Bucket': 'No Action Taken',
  'PM Status': 'No Action Taken',
  'Today Bucket Set': 'No Action Taken',
};

export type FormKey = 'web-task' | 'marketing-task' | 'pm-project' | 'leaderboard' | 'help';

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
    // The time filled in here is the task's Daily Time and also its Total Time Est; the
    // Preferred Resource picked is also the task's Assigned Person
    alsoStoreIn: { 'Time Estimation': ['Total Time Est'], 'Preferred Resource': ['Assigned Person'] },
    fields: [
      { header: 'Project Name', type: 'dropdown', required: true, allowOther: true, fromSheet: true, options: [
        'Cybernext', 'Vigora Bloom', 'IHE', 'YDB', 'Strongsuit', 'Sean Doyle Windows', 'KataZoom', 'Studio Amelia',
        'Matthews Jewellers', 'Dr Sebaa', 'Raquel Tamez'] },
      { header: 'Task Name', type: 'dropdown', required: true, allowOther: true, options: [
        'Weekly Maintenance', 'Monthly Maintenance', 'Speed Optimization', 'Client Feedback', 'Ad Creatives',
        'SMM Creatives', 'Video Editing', 'Website Audit', 'Time Estimation', 'Task Discussion', 'QA Testing',
        'Section Dynamic', 'Blog Post'] },
      { header: 'Task URL', type: 'paragraph', required: true },
      { header: 'Task Priority', type: 'dropdown', required: true, options: ['Urgent', 'High', 'Medium', 'Low'] },
      { header: 'Team Required', type: 'dropdown', required: true, options: ['UIUX', 'FrontEnd', 'BackEnd', 'QA'] },
      { header: 'Task Information', type: 'dropdown', options: ['New', 'Running', 'To be expected'] },
      { header: 'Preferred Resource', type: 'dropdown', roster: 'web', options: ['Lovepreet', 'Shubham', 'Dhruv', 'Pawan', 'Robin', 'Akash'] },
      { header: 'Time Estimation', type: 'duration' },
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
      { header: 'Project Name', type: 'dropdown', required: true, allowOther: true, fromSheet: true, options: [
        'Cybernext', 'Vigora Bloom', 'HEM Ankle Rehab', 'Steen Schotten', 'Lagant Google and LinkedIn Ads', 'YDB',
        'KROS Framework', 'CDL Experts', 'Sean Doyle Windows', 'KataZoom'] },
      { header: 'Task Name', type: 'dropdown', required: true, allowOther: true, options: [
        'Google Ads Optimization', 'FB Ads Optimization', 'CRO and Funnel Audit', 'Monthly Report', 'Weekly Report',
        'Account Audit'] },
      { header: 'Task URL', type: 'paragraph', required: true },
      { header: 'Department', type: 'dropdown', options: ['SEO', 'PPC', 'SMM'] },
      { header: 'Assigned Person', type: 'dropdown', roster: 'marketing', options: [
        'Atul', 'Shiwangi', 'Dheeraj', 'Anjali', 'Anurag', 'Vansh', 'Akshay', 'Kshitij', 'Bhavya', 'Payal', 'Akanksha'] },
      { header: 'Task Estimation', type: 'duration' },
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
      { header: 'Project Name', type: 'dropdown', required: true, allowOther: true, fromSheet: true, options: [NO_ACTION] },
      { header: 'Client Name', type: 'dropdown', required: true, allowOther: true, fromSheet: true, options: [NO_ACTION] },
      { header: 'Communication Channel', type: 'dropdown', required: true, allowOther: true, fromSheet: true, options: [NO_ACTION] },
      { header: 'Tech', type: 'dropdown', required: true, allowOther: true, options: [NO_ACTION, 'Wordpress', 'Shopify', 'Webflow', 'Wix'] },
      { header: 'Total Hours', type: 'duration', required: true },
      { header: 'AC Hours', type: 'duration', required: true },
      { header: 'Payment Details', type: 'dropdown', required: true, allowOther: true, options: [
        NO_ACTION, 'Milestones', 'Offline', 'Upwork', 'Direct - Fixed', 'Fixed', 'Direct', 'Fixed - Direct', 'Fixed Upwork'] },
      { header: 'Assigned', type: 'checkboxes', asDropdown: true, required: true, roster: 'all', rosterPrefix: [NO_ACTION], options: [
        NO_ACTION, 'Akash', 'Pawan', 'Dhruv', 'Robin', 'Shubham', 'Lovepreet', 'Atul', 'Anjali', 'Dheeraj', 'Shiwangi',
        'Anurag', 'Vansh', 'Manas', 'Akshay', 'Kshitij', 'Bhavya', 'Payal', 'Akanksha'] },
      { header: 'Status', type: 'dropdown', required: true, options: [
        NO_ACTION, 'Yet to Start', 'In Progress', 'Initial setup', 'On Going', 'On Hold', 'Paused by client',
        'Paused by Cybernext', 'Escalated', 'Completed', 'Submitted - waiting for feedback', 'Closed: Without feedback',
        'Closed: Good Feedback', 'Closed: Bad Feedback', 'Move to Next Month'] },
      { header: 'Phase', type: 'dropdown', required: true, options: [
        NO_ACTION, 'Initial Setup', 'Requirement Gathering', 'Design', 'Development', 'QA', 'Deployed', 'Marketing',
        'Maintenance', 'Retainer', 'On Hold', 'Completed', 'Design + Dev', 'Ongoing Optimization', 'Need Based Support'] },
      { header: 'Milestone', type: 'dropdown', required: true, allowOther: true, options: [
        NO_ACTION, 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'Offline', 'Offline Retainer', 'Upwork Hourly',
        'Upwork - Milestone', 'Offline - Kickoff', 'TBD', 'Billing'] },
      { header: 'Current Month Hours', type: 'duration', required: true },
      { header: 'Risk Month Hours', type: 'duration', required: true },
      { header: 'Upcoming Milestones', type: 'dropdown', required: true, allowOther: true, fromSheet: true, options: [NO_ACTION] },
      { header: 'Upsell/Cross-Sell', type: 'dropdown', required: true, allowOther: true, options: [NO_ACTION, 'Upsell', 'Cross-Sell'] },
      { header: 'Project Start Date', type: 'date', required: true },
      { header: 'Target End Date', type: 'date', required: true },
      { header: 'Payment Status', type: 'dropdown', required: true, options: [
        NO_ACTION, 'Pending', 'Done', 'On Hold', 'QA_Done', 'Not Started Yet', 'In Progress', 'Ongoing',
        'Automated Payment', 'Direct Billing'] },
      { header: 'Last (Project) Follow-up Date', type: 'date', required: true },
      { header: 'Comments', type: 'paragraph' },
    ],
  },
  // Help tab: anyone can ask for help, suggest something or complain about the dashboard.
  // The sender's name, username and role are added by /api/forms; new requests start as "New".
  'help': {
    key: 'help',
    title: 'Help',
    sheetId: HELP_SHEET_ID,
    tab: TAB_HELP,
    order: 'mdy',
    emailHeader: 'Email',
    initialValues: { Status: 'New' },
    fields: [
      { header: 'Type', type: 'choice', required: true, options: [...HELP_TYPES] },
      { header: 'Subject', type: 'text', required: true, maxLength: 120 },
      { header: 'Area', type: 'dropdown', required: true, options: HELP_AREAS },
      { header: 'Details', type: 'paragraph', required: true, maxLength: 3000 },
    ],
  },
  // "Web Special Points" — manual points for the Leaderboard (P = plus,
  // M = minus; see components/Leaderboard.tsx). The resource list is the
  // current Web team: the Google Form's list misspelt Dhruv as "Dhurv" (so
  // those points never counted) and still had members who have left.
  'leaderboard': {
    key: 'leaderboard',
    title: 'Leaderboard Feedback',
    sheetId: SHEET_IDS['1'],
    tab: TAB_LEADERBOARD,
    order: 'dmy',
    emailHeader: 'Email address',
    fields: [
      { header: 'Select Resource', type: 'dropdown', required: true, roster: 'web', options: ['Shubham', 'Lovepreet', 'Robin', 'Pawan', 'Dhruv', 'Akash'] },
      { header: 'Project Name', type: 'text', required: true },
      { header: 'Task Name/Topic', type: 'text' },
      { header: 'Positive Feedback', type: 'grid', options: ['P5', 'P10', 'P15', 'P20', 'P25', 'P30'], rows: [
        'Client gave positive feedback', 'Zero revisions needed on delivery', 'Delivered before the deadline',
        'Helped team member/knowledge sharing', 'Took an urgent task outside the scope', 'Other Feedback'] },
      { header: 'Negative Feedback', type: 'grid', options: ['M5', 'M10', 'M15', 'M20', 'M25', 'M30'], rows: [
        'The client complained about the quality', 'Multiple revisions (poor quality)',
        'Missed the deadline without communication', 'Task reassigned due to errors', 'Other Feedback'] },
      { header: 'Keka Objectives Points', type: 'text' },
      { header: 'Other Feedback ( Positive or Negative )', type: 'text' },
    ],
  },
};

// The choices a question offers: the fixed list, or — for the "who" questions — the
// people on the team right now (names = the current roster).
export function resolveFieldOptions(f: FormField, names?: RosterNames): string[] | undefined {
  if (f.roster && names) return [...(f.rosterPrefix ?? []), ...names[f.roster]];
  return f.options;
}

export type Answers = Record<string, string | string[]>;

const MAX_TEXT = 5000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// The questions as stored: each grid row becomes its own single-choice
// question keyed by its column name.
function storedFields(def: EntryFormDef): FormField[] {
  return def.fields.flatMap(f => f.type === 'grid'
    ? (f.rows ?? []).map(row => ({ header: gridKey(f.header, row), type: 'dropdown' as const, options: f.options }))
    : [f]);
}

// Returns a message per question that needs fixing (empty object = valid),
// keyed by the stored question (grid rows by their own column name).
// "Other" answers arrive as plain text that isn't one of the options.
export function validateAnswers(def: EntryFormDef, answers: Answers, names?: RosterNames): Record<string, string> {
  const errors: Record<string, string> = {};
  const fields = storedFields(def);
  for (const key of Object.keys(answers)) {
    if (!fields.some(f => f.header === key)) errors[key] = 'Unknown question';
  }
  for (const f of fields) {
    const raw = answers[f.header];
    const values = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).map(v => String(v).trim()).filter(Boolean);
    if (values.length === 0) {
      if (f.required) errors[f.header] = 'This question is required';
      continue;
    }
    if (values.some(v => v.length > (f.maxLength ?? MAX_TEXT))) { errors[f.header] = 'Answer is too long'; continue; }
    if (f.type !== 'checkboxes' && values.length > 1) { errors[f.header] = 'Choose one answer'; continue; }
    if (f.type === 'duration') {
      if (!parseDuration(values[0])) errors[f.header] = `Choose hours (0-${DURATION_MAX_HOURS}) and minutes (0-${DURATION_MAX_MINUTES})`;
      continue;
    }
    const options = resolveFieldOptions(f, names);
    if (options && (f.type === 'choice' || f.type === 'dropdown' || f.type === 'checkboxes')) {
      const others = values.filter(v => !options.includes(v));
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
// dates in the sheet's order, grid rows in their own columns.
export function answersToValues(def: EntryFormDef, answers: Answers): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of storedFields(def)) {
    const raw = answers[f.header];
    if (raw === undefined) continue;
    const list = (Array.isArray(raw) ? raw : [raw]).map(v => String(v).trim()).filter(Boolean);
    if (list.length) values[f.header] = formatAnswer(list.join(', '), def.order);
  }
  for (const [from, targets] of Object.entries(def.alsoStoreIn ?? {})) {
    if (values[from] !== undefined) for (const t of targets) values[t] = values[from];
  }
  return values;
}
