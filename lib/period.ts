import { DAY_MS, parseTimestamp, startOfDay, startOfMonth, startOfWeek, type DateOrder } from './dates';

// The Today / Weekly / Monthly switch at the top of a team's Dashboard. One definition, used by the Project State
// cards, the Team Workload cards and the charts, so they always agree:
//   today    the Today and Everyday tasks (as the Team Bandwidth page always showed)
//   weekly   the tasks added this week (Monday to Sunday) plus the recurring Everyday ones
//   monthly  the tasks added this month plus the recurring Everyday ones
// A person's capacity grows with the period: 7 h a day, 35 h a week (5 working days), 7 h x the month's working days.
// PPC and SEO work to a monthly retainer of 125 h, spread over the month's working days.

export type Period = 'today' | 'weekly' | 'monthly';

export interface PeriodInfo {
  kind: Period;
  from: number;          // window start (epoch ms, local)
  to: number;            // window end, exclusive
  workingDays: number;   // Monday-Friday days of the whole month
  dateOrder: DateOrder;  // how this team writes the Timestamp
}

export const PERIOD_LABELS: Record<Period, string> = { today: 'Today', weekly: 'Weekly', monthly: 'Monthly' };

function workingDaysOfMonth(ms: number): number {
  const d = new Date(ms);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  let n = 0;
  for (let i = 1; i <= last; i++) { const w = new Date(d.getFullYear(), d.getMonth(), i).getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

export function periodInfo(kind: Period, now: number, dateOrder: DateOrder): PeriodInfo {
  const workingDays = workingDaysOfMonth(now);
  if (kind === 'today') return { kind, from: startOfDay(now), to: startOfDay(now) + DAY_MS, workingDays, dateOrder };
  if (kind === 'weekly') { const w = startOfWeek(now); return { kind, from: w, to: w + 7 * DAY_MS, workingDays, dateOrder }; }
  return { kind, from: startOfMonth(now), to: startOfMonth(now, -1), workingDays, dateOrder };
}

// Is a task in the period? `bucket` is its Task Daily Bucket (lower case), `added` when it was added (epoch ms, NaN if unknown).
export function taskInPeriodAt(p: PeriodInfo, bucket: string, added: number): boolean {
  if (p.kind === 'today') return bucket === 'today' || bucket === 'everyday';
  if (bucket === 'everyday') return true;
  return !isNaN(added) && added >= p.from && added < p.to;
}
// The same, from the Timestamp cell as the sheet holds it
export function taskInPeriod(p: PeriodInfo, bucket: string, timestamp: string): boolean {
  return taskInPeriodAt(p, bucket, p.kind === 'today' ? NaN : parseTimestamp(timestamp, p.dateOrder));
}

// The hours a person can take in the period
export function periodCapacity(p: PeriodInfo, monthlyBlock: boolean): number {
  if (p.kind === 'today') return monthlyBlock ? 125 : 7;
  if (p.kind === 'weekly') return monthlyBlock ? (125 * 5) / p.workingDays : 35;
  return monthlyBlock ? 125 : 7 * p.workingDays;
}

// Hours of a longer period as the equivalent of one day (so the usual Available / Occupied colours and the
// percentage read the same whatever the period)
export function dailyEquivalent(p: PeriodInfo, monthlyBlock: boolean, hours: number): number {
  const base = monthlyBlock ? 125 : 7;
  return hours * (base / periodCapacity(p, monthlyBlock));
}
