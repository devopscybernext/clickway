// Utilisation — how much of each person's working time shows up as time taken
// on tasks. Time taken counts in the month a task was created; capacity is
// Monday-Friday days x hours per day (up to today for the current month).
// Leave and public holidays are not taken off, so treat the percentages as a guide.

import type { DocSection, DocTable, ReportDoc, Tone } from './reportDoc';
import { byRoster, plural } from './reportDoc';
import { fmtDuration, TEAM_LABELS, type ReportTeam } from './productivity';
import { isoDate, monthKey, monthLabel, monthStart, startOfDay, workingDays, type ReportTask } from './reportTasks';

export interface UtilMonth { month: Date; workDays: number; capacityMin: number; takenMin: number; tasks: number }
export interface UtilPerson {
  person: string;
  months: UtilMonth[];
  takenMin: number;
  capacityMin: number;
  tasks: number;
  pct: number;
  status: { label: string; tone: Tone };
}

const statusFor = (pct: number, taken: number): UtilPerson['status'] =>
  taken === 0 ? { label: 'No time logged', tone: 'neutral' }
  : pct < 60 ? { label: 'Under-used', tone: 'warn' }
  : pct <= 110 ? { label: 'Well used', tone: 'good' }
  : { label: 'Stretched', tone: 'bad' };

/** First-of-month dates from the month of `from` to the month of `to` */
export function monthsBetween(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let d = monthStart(from); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push(d);
  return out;
}

export function buildUtilisation(
  all: ReportTask[],
  opts: { people: Set<string>; from: Date; to: Date; hoursPerDay: number; today: Date },
): UtilPerson[] {
  const today = startOfDay(opts.today);
  const months = monthsBetween(opts.from, opts.to);
  const by = new Map<string, ReportTask[]>();
  all.forEach(t => { if (opts.people.has(t.person)) (by.get(t.person) ?? by.set(t.person, []).get(t.person)!).push(t); });

  const out: UtilPerson[] = [];
  by.forEach((list, person) => {
    const rows: UtilMonth[] = months.map(m => {
      const monthEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0);
      const end = monthEnd > today ? today : monthEnd;
      const workDays = end < m ? 0 : workingDays(m, end);
      const mine = list.filter(t => t.created && monthKey(t.created) === monthKey(m));
      return { month: m, workDays, capacityMin: Math.round(workDays * opts.hoursPerDay * 60), takenMin: mine.reduce((s, t) => s + t.totalMin, 0), tasks: mine.length };
    });
    const takenMin = rows.reduce((s, r) => s + r.takenMin, 0);
    const capacityMin = rows.reduce((s, r) => s + r.capacityMin, 0);
    const pct = capacityMin > 0 ? Math.round((takenMin / capacityMin) * 100) : 0;
    out.push({ person, months: rows, takenMin, capacityMin, tasks: rows.reduce((s, r) => s + r.tasks, 0), pct, status: statusFor(pct, takenMin) });
  });
  return out;
}

const pctOf = (taken: number, cap: number) => (cap > 0 ? Math.round((taken / cap) * 100) : 0);

export function buildUtilisationDoc(
  people: UtilPerson[],
  ctx: { team: ReportTeam; order: string[]; rangeLabel: string; hoursPerDay: number; today: Date },
): ReportDoc {
  const label = TEAM_LABELS[ctx.team];
  const sorted = [...people].sort((a, b) => byRoster(ctx.order)(a.person, b.person));
  const takenAll = sorted.reduce((s, p) => s + p.takenMin, 0);
  const capAll = sorted.reduce((s, p) => s + p.capacityMin, 0);
  const under = sorted.filter(p => p.status.label === 'Under-used').length;
  const stretched = sorted.filter(p => p.status.label === 'Stretched').length;

  const summary: DocTable = {
    head: ['RESOURCE', 'TASKS', 'TIME TAKEN', 'CAPACITY', 'UTILISATION', 'BUSIEST MONTH', 'STATUS'],
    rows: sorted.map(p => {
      const busiest = [...p.months].sort((a, b) => b.takenMin - a.takenMin)[0];
      return [
        { text: p.person, bold: true }, String(p.tasks),
        p.takenMin ? fmtDuration(p.takenMin) : '-', fmtDuration(p.capacityMin),
        { text: `${p.pct}%`, bar: { pct: p.pct, tone: p.status.tone } },
        busiest && busiest.takenMin ? `${monthLabel(busiest.month)}  (${fmtDuration(busiest.takenMin)})` : '-',
        { text: p.status.label, tone: p.status.tone },
      ];
    }),
    widths: [34, 20, 28, 28, 40, 54, 36],
  };

  const sections: DocSection[] = sorted.map(p => ({
    title: p.person,
    verdict: p.status,
    facts: [plural(p.tasks, 'task'), `Taken ${p.takenMin ? fmtDuration(p.takenMin) : '-'}`, `Capacity ${fmtDuration(p.capacityMin)}`, `Utilisation ${p.pct}%`],
    tables: [{
      head: ['MONTH', 'WORKING DAYS', 'CAPACITY', 'TASKS', 'TIME TAKEN', 'UTILISATION'],
      rows: p.months.map(m => {
        const pct = pctOf(m.takenMin, m.capacityMin);
        const st = statusFor(pct, m.takenMin);
        return [{ text: monthLabel(m.month), bold: true }, String(m.workDays), fmtDuration(m.capacityMin), String(m.tasks), m.takenMin ? fmtDuration(m.takenMin) : '-', { text: `${pct}%`, bar: { pct, tone: st.tone } }];
      }),
      foot: ['TOTAL', String(p.months.reduce((s, m) => s + m.workDays, 0)), fmtDuration(p.capacityMin), String(p.tasks), p.takenMin ? fmtDuration(p.takenMin) : '-', `${p.pct}%`],
      widths: [50, 30, 36, 24, 36, 50],
    }],
  }));

  return {
    eyebrow: `UTILISATION  |  ${label.team.toUpperCase()}`,
    title: 'Utilisation',
    rangeLabel: `${ctx.rangeLabel}  |  ${ctx.hoursPerDay}h per working day`,
    stats: [
      { label: 'Resources', value: String(sorted.length) },
      { label: 'Time taken', value: takenAll ? fmtDuration(takenAll) : '-' },
      { label: 'Capacity', value: fmtDuration(capAll) },
      { label: 'Team utilisation', value: capAll ? `${pctOf(takenAll, capAll)}%` : '-' },
    ],
    summary,
    legend: [
      `Utilisation = time taken on tasks / capacity (Monday-Friday days x ${ctx.hoursPerDay}h). Under 60% is under-used, 60-110% is well used, over 110% is stretched${under || stretched ? ` (${under} under-used, ${stretched} stretched here)` : ''}.`,
      'A task\'s whole time counts in the month it was created, and leave and public holidays are not taken off, so treat the figures as a guide rather than exact attendance.',
    ],
    sections,
    fileName: `Utilisation-${label.team}-${isoDate(ctx.today)}`,
  };
}
