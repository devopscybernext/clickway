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
  dateColumns: string[]; // read as dates and stored in the team's own date format
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
    dateColumns: ['Timestamp', 'Deadline'],
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
    dateColumns: ['Timestamp', 'Deadline'],
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

// A date from the sheet -> the way that team writes dates: Web "DD/MM/YYYY[ HH:MM:SS]", Marketing "M/D/YYYY[ H:MM:SS]".
// An Excel date arrives as "2026-10-01"; "10/26/2026" in the day-first Web table is turned round (26 is not a
// month). Anything that is not a date is kept as typed, with ok false.
export function storedDate(raw: string, order: 'dmy' | 'mdy'): { value: string; ok: boolean } {
  const s = raw.trim();
  const pad = (n: number) => String(n).padStart(2, '0');
  const valid = (mo: number, d: number) => mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
  const out = (y: number, mo: number, d: number, t?: [number, number, number]) => {
    const date = order === 'dmy' ? `${pad(d)}/${pad(mo)}/${y}` : `${mo}/${d}/${y}`;
    if (!t) return date;
    return `${date} ${order === 'dmy' ? pad(t[0]) : t[0]}:${pad(t[1])}:${pad(t[2])}`;
  };
  const time = (h?: string, mi?: string, sec?: string): [number, number, number] | undefined =>
    h === undefined ? undefined : [Number(h), Number(mi ?? 0), Number(sec ?? 0)];
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const mo = Number(iso[2]), d = Number(iso[3]);
    return valid(mo, d) ? { value: out(Number(iso[1]), mo, d, time(iso[4], iso[5], iso[6])), ok: true } : { value: s, ok: false };
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return { value: s, ok: false };
  let [d, mo] = order === 'dmy' ? [Number(m[1]), Number(m[2])] : [Number(m[2]), Number(m[1])];
  if (!valid(mo, d)) [d, mo] = [mo, d];
  if (!valid(mo, d)) return { value: s, ok: false };
  return { value: out(Number(m[3]), mo, d, time(m[4], m[5], m[6])), ok: true };
}

export interface DataImportSummary {
  newRows: number;
  skipped: { row: number; reason: string }[];
  ignoredColumns: string[];
  badTimes: { row: number; column: string; value: string }[];
  badDates: { row: number; column: string; value: string }[]; // not dates: added as typed
  sampleNew: Record<string, string>[];
}
