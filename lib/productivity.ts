// Productivity Meter — turns Web task rows into per-resource figures.
// Pure logic only (no React, no PDF/Excel), so the numbers on the PDF and in
// the Excel file always come from the same place.

import { timeToMinutes } from './copyTotals';

// ── Teams ──────────────────────────────────────────────────────────────────
// Web and Marketing keep the same kind of task rows, but name the two time
// columns differently and write their dates in a different order.
export type ReportTeam = 'web' | 'marketing';

export const TEAM_LABELS: Record<ReportTeam, { team: string; est: string; total: string }> = {
  web: { team: 'Web', est: 'Total Time Est', total: 'Total Time' },
  marketing: { team: 'Marketing', est: 'Task Estimation', total: 'Total Hours' },
};

// ── Dates ──────────────────────────────────────────────────────────────────
// The Web sheet stores dates day-first ("21/04/2026 17:42:25"), the Marketing
// sheet month-first ("8/31/2026"). Reading either the wrong way round (what
// `new Date(str)` does) silently turns 05/06 into the wrong month.
export type DateOrder = 'dmy' | 'mdy';
export function parseSheetDate(value: unknown, order: DateOrder = 'dmy'): Date | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const day = order === 'mdy' ? +m[2] : +m[1];
    const month = order === 'mdy' ? +m[1] : +m[2];
    const year = +m[3];
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    return isNaN(d.getTime()) ? null : d;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const serial = Number(s);
  if (!isNaN(serial) && serial > 40000) return new Date(Math.round((serial - 25569) * 86400 * 1000));
  return null;
}

// ── The flag ───────────────────────────────────────────────────────────────
// Compares what a task was estimated at (Total Time Est) with the time it
// actually took (Total Time):
//   Total Time under the estimate  → 'under' — finished faster than planned (green)
//   Total Time equal to the estimate → 'on'  — right on plan (green)
//   Total Time over the estimate   → 'over'  — took longer than planned (red)
//   no usable estimate / no time logged → 'none' (grey)
export type FlagKind = 'under' | 'on' | 'over' | 'none';

export interface TimeFlag {
  kind: FlagKind;
  message: string;
  /** actual − estimate, in minutes (negative = faster than estimate). */
  diffMin: number;
}

/** "1h 30m", "45m", "2h" */
export function fmtDuration(minutes: number): string {
  const m = Math.round(Math.abs(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
}

// True when the cell holds a real number of hours (not blank / "As Per Task").
const hasTime = (raw: string) => /^\s*\d/.test(raw);

export function compareTimes(estRaw: string, totalRaw: string): TimeFlag {
  const est = hasTime(estRaw) ? timeToMinutes(estRaw) : 0;
  const actual = hasTime(totalRaw) ? timeToMinutes(totalRaw) : 0;
  if (!est) {
    return { kind: 'none', message: estRaw.trim() && !hasTime(estRaw) ? `Estimate: ${estRaw.trim()}` : 'No estimate set', diffMin: 0 };
  }
  if (!actual) return { kind: 'none', message: 'No time logged yet', diffMin: 0 };
  const diff = actual - est;
  if (diff < 0) return { kind: 'under', message: `Finished ${fmtDuration(diff)} under the estimate`, diffMin: diff };
  if (diff > 0) return { kind: 'over', message: `Took ${fmtDuration(diff)} over the estimate`, diffMin: diff };
  return { kind: 'on', message: 'Right on the estimate', diffMin: 0 };
}

/** Colours used for the flag everywhere (PDF fills, Excel fills, UI). */
export const FLAG_STYLE: Record<FlagKind, { fill: string; text: string; label: string }> = {
  under: { fill: '#dcfce7', text: '#166534', label: 'Under estimate' },
  on:    { fill: '#dcfce7', text: '#166534', label: 'On estimate' },
  over:  { fill: '#fee2e2', text: '#991b1b', label: 'Over estimate' },
  none:  { fill: '#f3f4f6', text: '#4b5563', label: 'Not comparable' },
};

// ── Task rows ──────────────────────────────────────────────────────────────
export interface ProductivityTask {
  person: string;
  project: string;
  task: string;
  url: string;
  estRaw: string;
  totalRaw: string;
  /** minutes, 0 when blank / "As Per Task" */
  estMin: number;
  totalMin: number;
  deadline: string;
  taskStatus: string;
  pmStatus: string;
  created: Date | null;
  flag: TimeFlag;
}

export interface TaskFilter {
  from: Date | null;
  to: Date | null;
  /** Which date the range is applied to. */
  dateBy: 'created' | 'deadline';
  people: Set<string>;
  /** Which team's columns and date order to use. Defaults to Web. */
  team?: ReportTeam;
}

export interface WebColumns {
  person?: string; project?: string; task?: string; url?: string; est?: string; total?: string;
  deadline?: string; taskStatus?: string; pmStatus?: string; created?: string;
}

export function findWebColumns(headers: string[], team: ReportTeam = 'web'): WebColumns {
  const lower = (h: string) => h.trim().toLowerCase();
  const find = (pred: (l: string) => boolean) => headers.find(h => pred(lower(h)));
  return {
    person: find(l => l.includes('assigned person') || l.includes('assigned to')),
    project: find(l => l.includes('project name')),
    task: find(l => l.includes('task name')),
    url: find(l => l.includes('task url')),
    // exact names — Web's "Total Time" must never pick up "Total Time Est"
    est: find(l => l === TEAM_LABELS[team].est.toLowerCase()),
    total: find(l => l === TEAM_LABELS[team].total.toLowerCase()),
    deadline: find(l => l === 'deadline'),
    taskStatus: find(l => l.includes('status updation')),
    pmStatus: find(l => l.includes('pm status')),
    created: find(l => l.includes('timestamp')),
  };
}

const str = (v: unknown) => String(v ?? '').trim();

export function buildProductivityTasks(
  rows: Record<string, unknown>[],
  headers: string[],
  filter: TaskFilter,
): ProductivityTask[] {
  const team = filter.team ?? 'web';
  const order: DateOrder = team === 'marketing' ? 'mdy' : 'dmy';
  const c = findWebColumns(headers, team);
  if (!c.person) return [];
  const startMs = filter.from ? new Date(filter.from.getFullYear(), filter.from.getMonth(), filter.from.getDate()).getTime() : null;
  const endMs = filter.to ? new Date(filter.to.getFullYear(), filter.to.getMonth(), filter.to.getDate()).getTime() : null;

  // The Marketing sheet's archive tab mirrors its current-month tab, so the same
  // task can arrive twice. Keep the first copy (the current-month one).
  const seen = new Set<string>();

  const out: ProductivityTask[] = [];
  for (const r of rows) {
    const person = str(r[c.person]);
    if (!person || !filter.people.has(person)) continue;

    const dupKey = [c.created ? str(r[c.created]) : '', person, c.project ? str(r[c.project]) : '', c.task ? str(r[c.task]) : ''].join('|');
    if (seen.has(dupKey)) continue;
    seen.add(dupKey);

    const created = c.created ? parseSheetDate(r[c.created], order) : null;
    const dateValue = filter.dateBy === 'deadline' ? (c.deadline ? parseSheetDate(r[c.deadline], order) : null) : created;
    if (startMs !== null || endMs !== null) {
      if (!dateValue) continue; // no usable date → can't be placed in a range
      const t = new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate()).getTime();
      if (startMs !== null && t < startMs) continue;
      if (endMs !== null && t > endMs) continue;
    }

    const estRaw = c.est ? str(r[c.est]) : '';
    const totalRaw = c.total ? str(r[c.total]) : '';
    out.push({
      person,
      project: c.project ? str(r[c.project]) : '',
      task: c.task ? str(r[c.task]) : '',
      url: c.url ? str(r[c.url]) : '',
      estRaw,
      totalRaw,
      estMin: hasTime(estRaw) ? timeToMinutes(estRaw) : 0,
      totalMin: hasTime(totalRaw) ? timeToMinutes(totalRaw) : 0,
      deadline: c.deadline ? str(r[c.deadline]) : '',
      taskStatus: c.taskStatus ? str(r[c.taskStatus]) : '',
      pmStatus: c.pmStatus ? str(r[c.pmStatus]) : '',
      created,
      flag: compareTimes(estRaw, totalRaw),
    });
  }
  // Oldest first within each person, so the report reads like a timeline
  out.sort((a, b) => (a.created?.getTime() ?? 0) - (b.created?.getTime() ?? 0));
  return out;
}

// ── Per-resource summary ───────────────────────────────────────────────────
export interface PersonSummary {
  person: string;
  tasks: ProductivityTask[];
  taskCount: number;
  /** Sum of estimates across all of the person's tasks, minutes */
  estMin: number;
  /** Sum of time taken across all of the person's tasks, minutes */
  totalMin: number;
  /** Tasks that had both an estimate and logged time, so could be compared */
  comparable: number;
  withinEstimate: number;   // under + on
  overEstimate: number;
  /** estimate ÷ time taken over comparable tasks; 100 = exactly on plan, higher = faster */
  efficiencyPct: number | null;
  verdict: { kind: FlagKind; label: string };
}

export function summarise(tasks: ProductivityTask[], order: string[]): PersonSummary[] {
  const byPerson = new Map<string, ProductivityTask[]>();
  tasks.forEach(t => { if (!byPerson.has(t.person)) byPerson.set(t.person, []); byPerson.get(t.person)!.push(t); });

  const names = [...byPerson.keys()].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.localeCompare(b);
  });

  return names.map(person => {
    const list = byPerson.get(person)!;
    const comparableTasks = list.filter(t => t.estMin > 0 && t.totalMin > 0);
    const estCmp = comparableTasks.reduce((s, t) => s + t.estMin, 0);
    const totCmp = comparableTasks.reduce((s, t) => s + t.totalMin, 0);
    const efficiencyPct = totCmp > 0 ? Math.round((estCmp / totCmp) * 100) : null;
    const withinEstimate = comparableTasks.filter(t => t.flag.kind === 'under' || t.flag.kind === 'on').length;
    const overEstimate = comparableTasks.filter(t => t.flag.kind === 'over').length;
    const verdict: PersonSummary['verdict'] =
      efficiencyPct === null ? { kind: 'none', label: 'Not enough data' }
      : efficiencyPct >= 100 ? { kind: 'under', label: 'On or under estimate' }
      : efficiencyPct >= 85 ? { kind: 'over', label: 'Slightly over estimate' }
      : { kind: 'over', label: 'Well over estimate' };
    return {
      person,
      tasks: list,
      taskCount: list.length,
      estMin: list.reduce((s, t) => s + t.estMin, 0),
      totalMin: list.reduce((s, t) => s + t.totalMin, 0),
      comparable: comparableTasks.length,
      withinEstimate,
      overEstimate,
      efficiencyPct,
      verdict,
    };
  });
}

export function formatRange(from: Date | null, to: Date | null, dateBy: 'created' | 'deadline'): string {
  const f = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const what = dateBy === 'deadline' ? 'Deadline' : 'Created';
  if (from && to) return `${what}: ${f(from)} - ${f(to)}`;
  if (from) return `${what}: from ${f(from)}`;
  if (to) return `${what}: up to ${f(to)}`;
  return `${what}: all dates`;
}
