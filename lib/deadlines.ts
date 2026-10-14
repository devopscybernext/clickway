// Deadline Tracker — which tasks are overdue or about to be, and who is behind.
// Only tasks still on a resource's plate count (not closed, not already handed
// to the PM). The sheets have no completion date, so this looks at what is open
// right now rather than at how often past tasks were finished on time.

import type { DocCell, DocSection, DocTable, ReportDoc, Tone } from './reportDoc';
import { fmtDuration, TEAM_LABELS, type ReportTeam } from './productivity';
import { daysBetween, fmtDate, isoDate, startOfDay, type ReportTask } from './reportTasks';

export type Bucket = 'overdue' | 'today' | 'soon' | 'later' | 'none';

export interface DeadlineTask extends ReportTask {
  /** Days until the deadline; negative = days overdue; null = no usable deadline */
  daysLeft: number | null;
  bucket: Bucket;
}

export interface DeadlinePerson {
  person: string;
  open: number;       // open + on hold
  overdue: number;
  today: number;
  soon: number;       // due within the window, after today
  later: number;
  noDeadline: number;
  onHold: number;
  withPm: number;     // submitted for review, not closed yet
  worstOverdue: number;
  /** The tasks to list: overdue + due within the window (everything open when windowDays is null) */
  tasks: DeadlineTask[];
  verdict: { label: string; tone: Tone };
}

export interface DeadlineOptions {
  people: Set<string>;
  /** Days ahead that count as "due soon"; null lists every open task (soon = 7 days) */
  windowDays: number | null;
  today: Date;
}

const SOON_DEFAULT = 7;

export function buildDeadlines(all: ReportTask[], opts: DeadlineOptions): DeadlinePerson[] {
  const soonDays = opts.windowDays ?? SOON_DEFAULT;
  const today = startOfDay(opts.today);
  const byPerson = new Map<string, ReportTask[]>();
  all.forEach(t => { if (opts.people.has(t.person)) { (byPerson.get(t.person) ?? byPerson.set(t.person, []).get(t.person)!).push(t); } });

  const out: DeadlinePerson[] = [];
  byPerson.forEach((list, person) => {
    const openTasks: DeadlineTask[] = list.filter(t => t.state === 'open' || t.state === 'onhold').map(t => {
      const daysLeft = t.deadline ? daysBetween(today, t.deadline) : null;
      const bucket: Bucket = daysLeft === null ? 'none' : daysLeft < 0 ? 'overdue' : daysLeft === 0 ? 'today' : daysLeft <= soonDays ? 'soon' : 'later';
      return { ...t, daysLeft, bucket };
    });
    const count = (b: Bucket) => openTasks.filter(t => t.bucket === b).length;
    const overdue = count('overdue'), todayN = count('today'), soon = count('soon');
    const worstOverdue = openTasks.reduce((m, t) => (t.bucket === 'overdue' ? Math.max(m, -(t.daysLeft ?? 0)) : m), 0);
    const listed = openTasks
      .filter(t => opts.windowDays === null || t.bucket === 'overdue' || t.bucket === 'today' || t.bucket === 'soon')
      .sort((a, b) => (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9));
    const verdict: DeadlinePerson['verdict'] =
      overdue > 0 ? { label: 'Behind schedule', tone: 'bad' }
      : todayN + soon > 0 ? { label: 'Deadlines coming up', tone: 'warn' }
      : openTasks.length > 0 ? { label: 'On track', tone: 'good' }
      : { label: 'Nothing open', tone: 'good' };
    out.push({
      person,
      open: openTasks.length,
      overdue, today: todayN, soon, later: count('later'), noDeadline: count('none'),
      onHold: openTasks.filter(t => t.state === 'onhold').length,
      withPm: list.filter(t => t.state === 'submitted').length,
      worstOverdue,
      tasks: listed,
      verdict,
    });
  });
  return out;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const dayWord = (n: number) => plural(Math.abs(n), 'day');

function dueCell(t: DeadlineTask): DocCell {
  if (t.daysLeft === null) return { text: 'No deadline', tone: 'neutral' };
  if (t.daysLeft < 0) return { text: `Overdue by ${dayWord(t.daysLeft)}`, tone: 'bad' };
  if (t.daysLeft === 0) return { text: 'Due today', tone: 'warn' };
  return { text: `Due in ${dayWord(t.daysLeft)}`, tone: t.bucket === 'soon' ? 'warn' : 'good' };
}

export function buildDeadlineDoc(
  persons: DeadlinePerson[],
  ctx: { team: ReportTeam; order: string[]; windowDays: number | null; today: Date },
): ReportDoc {
  const label = TEAM_LABELS[ctx.team];
  const soonDays = ctx.windowDays ?? SOON_DEFAULT;
  const sorted = [...persons].sort((a, b) => {
    const ia = ctx.order.indexOf(a.person), ib = ctx.order.indexOf(b.person);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.person.localeCompare(b.person);
  });
  const sum = (f: (p: DeadlinePerson) => number) => sorted.reduce((s, p) => s + f(p), 0);
  const behind = sorted.filter(p => p.overdue > 0).length;

  const summary: DocTable = {
    head: ['RESOURCE', 'OPEN TASKS', 'OVERDUE', 'DUE TODAY', `DUE IN ${soonDays} DAYS`, 'ON HOLD', 'WITH PM', 'OLDEST OVERDUE', 'STATUS'],
    rows: sorted.map(p => [
      { text: p.person, bold: true },
      String(p.open),
      p.overdue ? { text: String(p.overdue), tone: 'bad' as const } : '0',
      p.today ? { text: String(p.today), tone: 'warn' as const } : '0',
      p.soon ? { text: String(p.soon), tone: 'warn' as const } : '0',
      String(p.onHold),
      String(p.withPm),
      p.worstOverdue ? dayWord(p.worstOverdue) : '-',
      { text: p.verdict.label, tone: p.verdict.tone },
    ]),
    widths: [40, 22, 20, 22, 28, 20, 20, 30, 44],
  };

  // The most overdue tasks across everyone
  const worst = sorted.flatMap(p => p.tasks.filter(t => t.bucket === 'overdue')).sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)).slice(0, 10);
  const extras: DocTable[] = worst.length ? [{
    title: 'Most overdue tasks',
    head: ['RESOURCE', 'PROJECT', 'TASK', 'LINK', 'DEADLINE', 'OVERDUE BY', 'TASK STATUS'],
    rows: worst.map(t => [
      { text: t.person, bold: true }, t.project || '-', t.task || '-',
      t.url ? { text: 'Open', url: t.url } : '-',
      fmtDate(t.deadline, t.deadlineRaw), { text: dayWord(t.daysLeft ?? 0), tone: 'bad' as const }, t.taskStatus || '-',
    ]),
    widths: [30, 44, 80, 14, 28, 26, 36],
  }] : [];

  const sections: DocSection[] = sorted.map(p => ({
    title: p.person,
    verdict: p.verdict,
    facts: [
      plural(p.open, 'open task'),
      p.overdue ? `${p.overdue} overdue` : '',
      p.today ? `${p.today} due today` : '',
      p.soon ? `${p.soon} due within ${soonDays} days` : '',
      p.onHold ? `${p.onHold} on hold` : '',
      p.withPm ? `${p.withPm} with the PM` : '',
    ],
    notes: p.noDeadline ? [`${plural(p.noDeadline, 'open task')} ${p.noDeadline === 1 ? 'has' : 'have'} no usable deadline.`] : [],
    tables: [{
      head: ['#', 'PROJECT', 'TASK', 'LINK', 'PRIORITY', 'DEADLINE', 'DUE', 'TASK STATUS', 'PM STATUS', 'ESTIMATE', 'TIME LOGGED'],
      rows: p.tasks.map((t, i) => [
        { text: String(i + 1) }, t.project || '-', t.task || '-',
        t.url ? { text: 'Open', url: t.url } : '-',
        t.priority || '-',
        fmtDate(t.deadline, t.deadlineRaw),
        dueCell(t),
        t.state === 'onhold' ? { text: t.taskStatus || 'On Hold', tone: 'neutral' as const } : t.taskStatus || '-',
        t.pmStatus || '-',
        t.estMin ? fmtDuration(t.estMin) : '-',
        t.totalMin ? fmtDuration(t.totalMin) : '-',
      ]),
      widths: [8, 30, 54, 13, 18, 24, 28, 24, 24, 17, 17],
    }],
  }));
  // A resource with nothing to list still gets a page that says so
  sections.forEach((s, i) => { if (!sorted[i].tasks.length) s.notes = [...(s.notes ?? []), 'No tasks to list for this resource in the chosen window.']; });

  const dateText = ctx.today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return {
    eyebrow: `DEADLINE TRACKER  |  ${label.team.toUpperCase()}`,
    title: 'Deadline Tracker',
    rangeLabel: `As of ${dateText}  |  ${ctx.windowDays === null ? 'All open tasks' : `Overdue + due within ${soonDays} days`}`,
    stats: [
      { label: 'Open tasks', value: String(sum(p => p.open)) },
      { label: 'Overdue', value: String(sum(p => p.overdue)) },
      { label: 'Due today / soon', value: String(sum(p => p.today + p.soon)) },
      { label: 'Resources behind', value: `${behind} of ${sorted.length}` },
    ],
    summary,
    legend: [
      'Open = still with the resource (not closed, not yet submitted to the PM). "With PM" = submitted and waiting for review.',
      'Red = past the deadline. Amber = due today or soon. Green = on track. Resources are ordered as in the team list.',
    ],
    extras,
    sections,
    fileName: `Deadline-Tracker-${label.team}-${isoDate(ctx.today)}`,
  };
}
