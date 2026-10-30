import {
  SHEET_IDS, TOOLS_SHEET_ID, USER_DETAILS_SHEET_ID, PM_BANDWIDTH_SHEET_ID, PM_BANDWIDTH_ALL_DATA_SHEET_ID,
  LEAVE_SHEET_ID, MARKETING_TEAM_SHEET_ID, INHOUSE_SHEET_ID, HELP_SHEET_ID, TAB_HELP,
  TAB_USERS, TAB_LEAVE, TAB_NEWS, TAB_HOLIDAY, TAB_AI_TOOLS, TAB_LEADERBOARD, TAB_QA_TESTING, TAB_AVAILABILITY,
} from '../config';

// Every dataset the dashboard uses, mapped to a MySQL table. The data came
// from Google Sheets, and the routes still ask for (spreadsheet id, tab) as
// they always did — the ids in lib/config.ts are now just dataset keys — and
// get back the same headers, in the same order, so column indexes the UI
// sends for edits still line up.
//
// A source with tab '*' takes every tab of that spreadsheet not claimed by a
// more specific source (e.g. Sheet 1's task tabs, but not Leaderboard or
// QATesting) — the same auto-discovery the routes do for archive tabs today.
// Each row remembers its spreadsheet and tab (sheet_id / sheet_tab), so the
// current-month vs archive split, and write-back to the right "tab", carry
// over unchanged.

export interface DatasetSource {
  sheetId: string;
  tab: string; // exact tab name, or '*'
}

export interface Dataset {
  table: string;
  sources: DatasetSource[];
  headers: string[];
}

// Tab names never served: the old password tabs and notes from the sheets.
export const IGNORED_TABS = new Set(['Sheet2', 'Sheet3', TAB_AVAILABILITY]);

export const DATASETS: Dataset[] = [
  {
    table: 'web_tasks',
    sources: [{ sheetId: SHEET_IDS['1'], tab: '*' }],
    headers: [
      'Timestamp', 'Project Name', 'Task Name', 'Task URL', 'Time Estimation', 'Task Priority', 'Assigned Person',
      'Task Daily Bucket', 'Deadline', 'Task Status Updation', 'Preferred Resource', 'Team Required',
      'Task Information', 'Email address', 'Total Time Est', 'PM Status', 'Time Logged On Ac', 'Today Bucket Set',
      'Total Time',
    ],
  },
  {
    table: 'leaderboard_feedback',
    sources: [{ sheetId: SHEET_IDS['1'], tab: TAB_LEADERBOARD }],
    headers: [
      'Timestamp', 'Email address', 'Select Resource', 'Project Name', 'Task Name/Topic',
      'Positive Feedback [Client gave positive feedback]',
      'Positive Feedback [Zero revisions needed on delivery]',
      'Positive Feedback [Delivered before the deadline]',
      'Positive Feedback [Helped team member/knowledge sharing]',
      'Positive Feedback [Took an urgent task outside the scope]',
      'Positive Feedback [Other Feedback]',
      'Negative Feedback [The client complained about the quality]',
      'Negative Feedback [Multiple revisions (poor quality)]',
      'Negative Feedback [Missed the deadline without communication]',
      'Negative Feedback [Task reassigned due to errors]',
      'Negative Feedback [Other Feedback]',
      'Keka Objectives Points', 'Other Feedback ( Positive or Negative )',
    ],
  },
  {
    table: 'qa_tasks',
    sources: [{ sheetId: SHEET_IDS['1'], tab: TAB_QA_TESTING }],
    headers: ['Project Name', 'Task Name', 'Task URL', 'Time Logged On Ac', "Today's Bucket Set", 'Status'],
  },
  {
    table: 'marketing_tasks',
    sources: [{ sheetId: MARKETING_TEAM_SHEET_ID, tab: '*' }],
    headers: [
      'Timestamp', 'Email Address', 'Project Name', 'Task Name', 'Task URL', 'Department', 'Task Estimation',
      'Deadline', 'Assigned Person', 'Task Daily Bucket', 'Action Taken Today', 'Performance Signal/Insights',
      'Blocker', 'Next Steps', 'Time Logged On Ac', 'Task Status Updation', 'Today Bucket Set', 'Total Hours',
      'PM Status',
    ],
  },
  {
    table: 'pm_projects',
    sources: [
      { sheetId: PM_BANDWIDTH_SHEET_ID, tab: '*' },
      { sheetId: PM_BANDWIDTH_ALL_DATA_SHEET_ID, tab: '*' },
    ],
    headers: [
      'Timestamp', 'Email Address', 'Department', 'Year', 'Month', 'Project Name', 'Client Name',
      'Communication Channel', 'Tech', 'Total Hours', 'AC Hours', 'Payment Details', 'Assigned', 'Status', 'Phase',
      'Milestone', 'Current Month Hours', 'Risk Month Hours', 'Upcoming Milestones', 'Upsell/Cross-Sell',
      'Project Start Date', 'Target End Date', 'Payment Status', 'Last (Project) Follow-up Date', 'Comments',
      'Checklist', 'Week1', 'Week2', 'Week3', 'Week4', 'Week5', 'Monthly',
    ],
  },
  {
    table: 'users',
    sources: [{ sheetId: USER_DETAILS_SHEET_ID, tab: TAB_USERS }],
    headers: ['Username', 'Password Hash', 'Role', 'Display Name', 'Email', 'Department', 'Sub Department'],
  },
  {
    table: 'help_requests',
    sources: [{ sheetId: HELP_SHEET_ID, tab: TAB_HELP }],
    headers: ['Timestamp', 'Email', 'Username', 'Name', 'Role', 'Type', 'Subject', 'Area', 'Details', 'Status'],
  },
  {
    table: 'leave_status',
    sources: [{ sheetId: LEAVE_SHEET_ID, tab: TAB_LEAVE }],
    headers: ['Team', 'Email ID', 'Department', 'Leave'],
  },
  {
    table: 'news',
    sources: [{ sheetId: TOOLS_SHEET_ID, tab: TAB_NEWS }],
    headers: ['Company', 'Title', 'Description'],
  },
  {
    table: 'ai_tools',
    sources: [{ sheetId: TOOLS_SHEET_ID, tab: TAB_AI_TOOLS }],
    headers: ['Tool Name', 'Short Description', 'Price', 'Categories', 'URL', 'PM Focus', 'Resource Focus'],
  },
  {
    table: 'holidays',
    sources: [{ sheetId: TOOLS_SHEET_ID, tab: TAB_HOLIDAY }],
    headers: ['Name', 'Date', 'Day'],
  },
  {
    table: 'inhouse_case_studies',
    sources: [{ sheetId: INHOUSE_SHEET_ID, tab: 'Live Portfolio links' }],
    headers: ['Website Name', 'Website Link', 'Platform', 'Category', 'Status', 'URL', 'Industry'],
  },
  {
    table: 'inhouse_websites',
    sources: [{ sheetId: INHOUSE_SHEET_ID, tab: 'Websites Details' }],
    headers: ['Website Name', 'Website Link', 'Platform', 'Status', 'Industry'],
  },
  {
    table: 'inhouse_brand_kit',
    sources: [{ sheetId: INHOUSE_SHEET_ID, tab: 'Brand Kit' }],
    headers: ['Name', 'Destination', 'URL'],
  },
  {
    table: 'inhouse_documentations',
    sources: [{ sheetId: INHOUSE_SHEET_ID, tab: 'Documentations' }],
    headers: ['Name', 'Destination', 'URL'],
  },
];

// "Last (Project) Follow-up Date" → last_project_follow_up_date
export function columnName(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// A specific tab beats a '*' source for the same spreadsheet.
export function findDataset(sheetId: string, tab: string): Dataset | undefined {
  const t = tab.trim();
  if (IGNORED_TABS.has(t)) return undefined;
  const exact = DATASETS.find(d => d.sources.some(s => s.sheetId === sheetId && s.tab === t));
  if (exact) return exact;
  return DATASETS.find(d => d.sources.some(s => s.sheetId === sheetId && s.tab === '*'));
}

// Fixed tab names registered for a spreadsheet (wildcard tabs come from the data).
export function fixedTabs(sheetId: string): string[] {
  return DATASETS.flatMap(d => d.sources.filter(s => s.sheetId === sheetId && s.tab !== '*').map(s => s.tab));
}

export function wildcardDatasets(sheetId: string): Dataset[] {
  return DATASETS.filter(d => d.sources.some(s => s.sheetId === sheetId && s.tab === '*'));
}

// 'Tab'!A1:Z10000 → Tab ; Tab!A1 → Tab
export function tabFromRange(range: string): string {
  const bang = range.lastIndexOf('!');
  const raw = bang === -1 ? range : range.slice(0, bang);
  return raw.replace(/^'(.*)'$/, '$1').replace(/''/g, "'").trim();
}
