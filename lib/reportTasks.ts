// Task rows in one shape for the Deadline Tracker, Workload Balance and
// Estimation Accuracy reports — the same reading of the Web and Marketing
// sheets the Productivity Meter uses (column names, date order, duplicate rows).

import { timeToMinutes } from './copyTotals';
import { findWebColumns, parseSheetDate, type DateOrder, type ReportTeam } from './productivity';

// Where a task is in its life:
//   closed     — Task Closed / TicketClosed: finished
//   submitted  — handed to the PM (or admin) for review: the resource is done
//   onhold     — paused
//   open       — to be started / in progress / no action yet: still on the resource's plate
export type TaskState = 'closed' | 'submitted' | 'onhold' | 'open';

export function taskState(taskStatus: string, pmStatus: string): TaskState {
  const s = taskStatus.trim().toLowerCase();
  const p = pmStatus.trim().toLowerCase();
  if (s.includes('closed') || p === 'ticketclosed') return 'closed';
  if (s.startsWith('submitted')) return 'submitted';
  if (s.includes('on hold')) return 'onhold';
  return 'open';
}

export interface ReportTask {
  person: string;
  project: string;
  task: string;
  url: string;
  estRaw: string;
  totalRaw: string;
  /** minutes; 0 when blank / "As Per Task" */
  estMin: number;
  totalMin: number;
  deadlineRaw: string;
  deadline: Date | null;
  created: Date | null;
  taskStatus: string;
  pmStatus: string;
  priority: string;
  state: TaskState;
  /** Marketing's free-text notes (blank on Web) */
  blocker: string;
  nextSteps: string;
  performance: string;
  actionToday: string;
}

const str = (v: unknown) => String(v ?? '').trim();
const hasTime = (raw: string) => /^\s*\d/.test(raw);

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Whole calendar days from a to b (negative when b is earlier) */
export const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);

/** Monday-Friday days from `from` to `to`, both included (public holidays and leave are not taken off) */
export function workingDays(from: Date, to: Date): number {
  let n = 0;
  for (let d = startOfDay(from); d <= startOfDay(to); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/** True when `d` falls on or between `from` and `to` (either may be null = open ended); a missing date only passes with no range */
export function inDateRange(d: Date | null, from: Date | null, to: Date | null): boolean {
  if (!from && !to) return true;
  if (!d) return false;
  const t = startOfDay(d).getTime();
  if (from && t < startOfDay(from).getTime()) return false;
  if (to && t > startOfDay(to).getTime()) return false;
  return true;
}

export const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const monthLabel = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

/** Local date as YYYY-MM-DD (toISOString would shift the day by the UTC offset) */
export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const fmtDate = (d: Date | null, raw = ''): string =>
  d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : raw || '-';

/** Every task row of the team, parsed. The Marketing archive tab mirrors its current-month tab, so identical rows are kept once. */
export function extractTasks(rows: Record<string, unknown>[], headers: string[], team: ReportTeam): ReportTask[] {
  const order: DateOrder = team === 'marketing' ? 'mdy' : 'dmy';
  const c = findWebColumns(headers, team);
  if (!c.person) return [];
  const seen = new Set<string>();
  const out: ReportTask[] = [];
  for (const r of rows) {
    const person = str(r[c.person]);
    if (!person) continue;
    const key = [c.created ? str(r[c.created]) : '', person, c.project ? str(r[c.project]) : '', c.task ? str(r[c.task]) : ''].join('|');
    if (seen.has(key)) continue;
    seen.add(key);

    const estRaw = c.est ? str(r[c.est]) : '';
    const totalRaw = c.total ? str(r[c.total]) : '';
    const deadlineRaw = c.deadline ? str(r[c.deadline]) : '';
    const taskStatus = c.taskStatus ? str(r[c.taskStatus]) : '';
    const pmStatus = c.pmStatus ? str(r[c.pmStatus]) : '';
    out.push({
      person,
      project: c.project ? str(r[c.project]) : '',
      task: c.task ? str(r[c.task]) : '',
      url: c.url ? str(r[c.url]) : '',
      estRaw,
      totalRaw,
      estMin: hasTime(estRaw) ? timeToMinutes(estRaw) : 0,
      totalMin: hasTime(totalRaw) ? timeToMinutes(totalRaw) : 0,
      deadlineRaw,
      deadline: deadlineRaw ? parseSheetDate(deadlineRaw, order) : null,
      created: c.created ? parseSheetDate(r[c.created], order) : null,
      taskStatus,
      pmStatus,
      priority: c.priority ? str(r[c.priority]) : '',
      state: taskState(taskStatus, pmStatus),
      blocker: c.blocker ? str(r[c.blocker]) : '',
      nextSteps: c.nextSteps ? str(r[c.nextSteps]) : '',
      performance: c.performance ? str(r[c.performance]) : '',
      actionToday: c.actionToday ? str(r[c.actionToday]) : '',
    });
  }
  return out;
}

/** Everyone who has a task — the team roster first (in roster order), then anyone else. */
export function listPeople(tasks: ReportTask[], roster: string[]): string[] {
  const found = new Set(tasks.map(t => t.person));
  const has = (n: string) => [...found].find(f => f.toLowerCase() === n.toLowerCase());
  const ordered = roster.map(n => has(n) ?? n);
  const rest = [...found].filter(n => !roster.some(t => t.toLowerCase() === n.toLowerCase())).sort((a, b) => a.localeCompare(b));
  return [...ordered, ...rest];
}
