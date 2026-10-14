// Aging Tasks — open tasks ordered by how long they have been sitting since
// they were created, including ones with no deadline. Open = to be started, in
// progress or on hold (not closed, not yet submitted to the PM).

import type { DocSection, DocTable, ReportDoc, Tone } from './reportDoc';
import { byRoster, plural } from './reportDoc';
import { TEAM_LABELS, type ReportTeam } from './productivity';
import { daysBetween, fmtDate, isoDate, startOfDay, type ReportTask } from './reportTasks';

export interface AgingTask extends ReportTask { age: number }
export interface AgingPerson {
  person: string;
  tasks: AgingTask[];
  /** all open tasks, before the minimum-age filter */
  open: number;
  over7: number; over30: number; over90: number;
  oldest: number;
  noDeadline: number;
  onHold: number;
  verdict: { label: string; tone: Tone };
}

export function buildAging(all: ReportTask[], opts: { people: Set<string>; minAge: number; today: Date }): AgingPerson[] {
  const today = startOfDay(opts.today);
  const by = new Map<string, AgingTask[]>();
  all.forEach(t => {
    if (!opts.people.has(t.person) || !(t.state === 'open' || t.state === 'onhold') || !t.created) return;
    (by.get(t.person) ?? by.set(t.person, []).get(t.person)!).push({ ...t, age: Math.max(daysBetween(t.created, today), 0) });
  });
  const out: AgingPerson[] = [];
  by.forEach((list, person) => {
    const oldest = list.reduce((m, t) => Math.max(m, t.age), 0);
    out.push({
      person,
      tasks: list.filter(t => t.age >= opts.minAge).sort((a, b) => b.age - a.age),
      open: list.length,
      over7: list.filter(t => t.age > 7).length,
      over30: list.filter(t => t.age > 30).length,
      over90: list.filter(t => t.age > 90).length,
      oldest,
      noDeadline: list.filter(t => !t.deadline).length,
      onHold: list.filter(t => t.state === 'onhold').length,
      verdict: oldest > 90 ? { label: 'Has stale tasks', tone: 'bad' } : oldest > 30 ? { label: 'Some tasks waiting', tone: 'warn' } : { label: 'Fresh', tone: 'good' },
    });
  });
  return out;
}

const ageTone = (age: number): Tone => (age > 90 ? 'bad' : age > 30 ? 'warn' : 'neutral');
const days = (n: number) => plural(n, 'day');

export function buildAgingDoc(
  people: AgingPerson[],
  ctx: { team: ReportTeam; order: string[]; minAge: number; today: Date },
): ReportDoc {
  const label = TEAM_LABELS[ctx.team];
  const sorted = [...people].sort((a, b) => byRoster(ctx.order)(a.person, b.person));
  const sum = (f: (p: AgingPerson) => number) => sorted.reduce((s, p) => s + f(p), 0);

  const summary: DocTable = {
    head: ['RESOURCE', 'OPEN TASKS', 'OVER 7 DAYS', 'OVER 30 DAYS', 'OVER 90 DAYS', 'OLDEST', 'NO DEADLINE', 'ON HOLD', 'STATUS'],
    rows: sorted.map(p => [
      { text: p.person, bold: true }, String(p.open), String(p.over7),
      p.over30 ? { text: String(p.over30), tone: 'warn' as Tone } : '0',
      p.over90 ? { text: String(p.over90), tone: 'bad' as Tone } : '0',
      p.oldest ? days(p.oldest) : '-', String(p.noDeadline), String(p.onHold),
      { text: p.verdict.label, tone: p.verdict.tone },
    ]),
    widths: [34, 22, 24, 26, 26, 24, 26, 20, 38],
  };

  const oldestAll = sorted.flatMap(p => p.tasks).sort((a, b) => b.age - a.age).slice(0, 10);
  const extras: DocTable[] = oldestAll.length ? [{
    title: 'Oldest open tasks',
    head: ['RESOURCE', 'PROJECT', 'TASK', 'LINK', 'CREATED', 'AGE', 'TASK STATUS'],
    rows: oldestAll.map(t => [{ text: t.person, bold: true }, t.project || '-', t.task || '-', t.url ? { text: 'Open', url: t.url } : '-', fmtDate(t.created), { text: days(t.age), tone: ageTone(t.age) }, t.taskStatus || '-']),
    widths: [30, 44, 76, 13, 28, 26, 34],
  }] : [];

  const sections: DocSection[] = sorted.map(p => ({
    title: p.person,
    verdict: p.verdict,
    facts: [plural(p.open, 'open task'), `${p.over30} over 30 days`, p.oldest ? `Oldest ${days(p.oldest)}` : '', p.noDeadline ? `${p.noDeadline} with no deadline` : '', p.onHold ? `${p.onHold} on hold` : ''],
    notes: ctx.minAge > 0 && p.tasks.length < p.open ? [`Showing the ${p.tasks.length} task${p.tasks.length === 1 ? '' : 's'} that ${p.tasks.length === 1 ? 'is' : 'are'} at least ${days(ctx.minAge)} old.`] : [],
    tables: p.tasks.length ? [{
      head: ['#', 'PROJECT', 'TASK', 'LINK', 'CREATED', 'AGE', 'DEADLINE', 'TASK STATUS', 'PM STATUS', 'ESTIMATE'],
      rows: p.tasks.map((t, i) => [
        String(i + 1), t.project || '-', t.task || '-', t.url ? { text: 'Open', url: t.url } : '-', fmtDate(t.created),
        { text: days(t.age), tone: ageTone(t.age) }, t.deadline ? fmtDate(t.deadline, t.deadlineRaw) : { text: 'None', tone: 'warn' as Tone },
        t.taskStatus || '-', t.pmStatus || '-', t.estRaw || '-',
      ]),
      widths: [8, 34, 64, 13, 26, 24, 26, 28, 28, 22],
    }] : [],
  }));
  sections.forEach(s => { if (!s.tables.length) s.notes = [...(s.notes ?? []), 'No open tasks to list for this resource.']; });

  return {
    eyebrow: `AGING TASKS  |  ${label.team.toUpperCase()}`,
    title: 'Aging Tasks',
    rangeLabel: `As of ${ctx.today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}  |  ${ctx.minAge > 0 ? `Open ${days(ctx.minAge)} or more` : 'All open tasks'}`,
    stats: [
      { label: 'Open tasks', value: String(sum(p => p.open)) },
      { label: 'Over 30 days', value: String(sum(p => p.over30)) },
      { label: 'Over 90 days', value: String(sum(p => p.over90)) },
      { label: 'With no deadline', value: String(sum(p => p.noDeadline)) },
    ],
    summary,
    legend: [
      'Age = days since the task was created. Open = to be started, in progress or on hold. Amber = over 30 days, red = over 90 days.',
      'Old open tasks are often finished work that was never marked closed, or work that was dropped, so they are worth a look.',
    ],
    extras,
    sections,
    fileName: `Aging-Tasks-${label.team}-${isoDate(ctx.today)}`,
  };
}
