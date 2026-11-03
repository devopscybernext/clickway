import { SHEET_IDS, MARKETING_TEAM_SHEET_ID, TAB_BANDWIDTH, TAB_MARKETING_TASKS } from './config';
import { formatDuration } from './forms';
import type { Team } from './auth';

// Import Data (Web and Marketing): an Excel sheet of tasks added to that team's task table.
// Unlike the InHouse upload there is no "same entry" match - every row of the file becomes a new
// task, so uploading the same file twice adds everything twice.
export interface DataImportDef {
  label: string;
  sheetId: string;
  tab: string;        // the dataset's tab (lib/data/datasets.ts)
  dateOrder: 'dmy' | 'mdy'; // the order the team's Timestamp column is written in
  headers: string[];  // columns the Excel sheet may have, in the order of the template
  example: string[];  // the template's sample row
  required: string[]; // a row needs at least one of these filled in
  timeColumns: string[]; // read as hours:minutes and stored like every other time cell
}

export const DATA_IMPORT: Record<Team, DataImportDef> = {
  web: {
    label: 'Web Tasks', sheetId: SHEET_IDS['1'], tab: TAB_BANDWIDTH, dateOrder: 'dmy',
    headers: [
      'Timestamp', 'Project Name', 'Task Name', 'Task URL', 'Time Estimation', 'Task Priority', 'Assigned Person',
      'Task Daily Bucket', 'Deadline', 'Task Status Updation', 'Preferred Resource', 'Team Required',
      'Task Information', 'Email address', 'Total Time Est', 'PM Status', 'Time Logged On Ac', 'Today Bucket Set',
      'Total Time',
    ],
    example: [
      '', 'Example Co', 'Weekly Maintenance', 'https://example.com/task', '02:30', 'Medium', 'Dhruv',
      'Today', '2026-12-31', 'To Be Started', 'Dhruv', 'FrontEnd',
      'New', 'pm@example.com', '02:30', '', '', '', '',
    ],
    required: ['Project Name', 'Task Name'],
    timeColumns: ['Time Estimation', 'Total Time Est', 'Time Logged On Ac', 'Total Time'],
  },
  marketing: {
    label: 'Marketing Tasks', sheetId: MARKETING_TEAM_SHEET_ID, tab: TAB_MARKETING_TASKS, dateOrder: 'mdy',
    headers: [
      'Timestamp', 'Email Address', 'Project Name', 'Task Name', 'Task URL', 'Department', 'Task Estimation',
      'Deadline', 'Assigned Person', 'Task Daily Bucket', 'Action Taken Today', 'Performance Signal/Insights',
      'Blocker', 'Next Steps', 'Time Logged On Ac', 'Task Status Updation', 'Today Bucket Set', 'Total Hours',
      'PM Status',
    ],
    example: [
      '', 'pm@example.com', 'Example Co', 'Monthly SEO report', 'https://example.com/task', 'SEO', '04:00',
      '2026-12-31', 'Bhavya', 'Today', '', '',
      '', '', '', 'To Be Started', 'P1', '',
      '',
    ],
    required: ['Project Name', 'Task Name'],
    timeColumns: ['Task Estimation', 'Time Logged On Ac', 'Total Hours'],
  },
};

export const MAX_IMPORT_ROWS = 2000;
export const MAX_CELL = 2000;

export const normHeader = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

// "3:30" / "03:30" / "250:05" (the way the dashboard shows time) -> the stored "03.30 Hours".
// Anything else (already "03.30 Hours", free text, a blank) is kept as it was typed.
export function storedTime(v: string): string {
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(v.trim());
  if (!m) return v;
  const h = Number(m[1]);
  return h > 500 ? v : formatDuration(h, Number(m[2]));
}

export interface DataImportSummary {
  newRows: number;
  skipped: { row: number; reason: string }[];
  ignoredColumns: string[];
  badTimes: { row: number; column: string; value: string }[];
  sampleNew: Record<string, string>[];
}
