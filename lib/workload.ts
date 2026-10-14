// Workload Balance — how much open work each resource has against the hours
// they have left, and ideas for moving not-yet-started tasks from people who
// are over capacity to people who have room.
//
// Work still to do on a task = its estimate minus the time already logged
// (never below zero). Capacity = Monday-Friday days from today to the end date
// x hours per day. Public holidays and leave are not taken off, so treat the
// percentages as a guide.

import type { DocSection, DocTable, ReportDoc, Tone } from './reportDoc';
import { fmtDuration, TEAM_LABELS, type ReportTeam } from './productivity';
import { daysBetween, fmtDate, isoDate, startOfDay, type ReportTask } from './reportTasks';

export interface WorkloadTask extends ReportTask {
  remainingMin: number;
  overdue: boolean;
}

export interface WorkloadPerson {
  person: string;
  dept: string;
  tasks: WorkloadTask[];
  remainingMin: number;
  capacityMin: number;
  loadPct: number;
  /** capacity - remaining; negative = over capacity */
  freeMin: number;
  overdue: number;
  onHold: number;
  noEstimate: number;
  /** open tasks that fall after the end date, not counted */
  later: number;
  status: { label: string; tone: Tone };
}

export interface WorkloadOptions {
  people: Set<string>;
  endDate: Date;
  hoursPerDay: number;
  today: Date;
  deptOf: (person: string) => string;
}

/** Monday-Friday days from `from` to `to`, both included */
export function workingDays(from: Date, to: Date): number {
  let n = 0;
  for (let d = startOfDay(from); d <= startOfDay(to); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

export function buildWorkload(all: ReportTask[], opts: WorkloadOptions): WorkloadPerson[] {
  const today = startOfDay(opts.today);
  const end = startOfDay(opts.endDate);
  const capacityMin = workingDays(today, end) * opts.hoursPerDay * 60;
  const byPerson = new Map<string, ReportTask[]>();
  all.forEach(t => { if (opts.people.has(t.person)) (byPerson.get(t.person) ?? byPerson.set(t.person, []).get(t.person)!).push(t); });

  const out: WorkloadPerson[] = [];
  byPerson.forEach((list, person) => {
    const live = list.filter(t => t.state === 'open' || t.state === 'onhold');
    const counted: WorkloadTask[] = live
      .filter(t => t.state === 'open' && (!t.deadline || startOfDay(t.deadline) <= end))
      .map(t => ({
        ...t,
        remainingMin: t.estMin > 0 ? Math.max(t.estMin - t.totalMin, 0) : 0,
        overdue: !!t.deadline && daysBetween(today, t.deadline) < 0,
      }))
      .sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity));
    const remainingMin = counted.reduce((s, t) => s + t.remainingMin, 0);
    const noEstimate = counted.filter(t => t.estMin <= 0).length;
    const loadPct = capacityMin > 0 ? Math.round((remainingMin / capacityMin) * 100) : 0;
    const status: WorkloadPerson['status'] =
      counted.length === 0 ? { label: 'No open tasks', tone: 'good' }
      : remainingMin === 0 && noEstimate > 0 ? { label: 'No estimates to measure', tone: 'neutral' }
      : loadPct > 100 ? { label: 'Over capacity', tone: 'bad' }
      : loadPct >= 80 ? { label: 'Nearly full', tone: 'warn' }
      : { label: 'Has room', tone: 'good' };
    out.push({
      person,
      dept: opts.deptOf(person),
      tasks: counted,
      remainingMin,
      capacityMin,
      loadPct,
      freeMin: capacityMin - remainingMin,
      overdue: counted.filter(t => t.overdue).length,
      onHold: live.filter(t => t.state === 'onhold').length,
      noEstimate,
      later: live.filter(t => t.state === 'open' && t.deadline && startOfDay(t.deadline) > end).length,
      status,
    });
  });
  return out;
}

export interface Suggestion {
  task: WorkloadTask;
  from: string;
  to: string;
  fromBefore: number; fromAfter: number;
  toBefore: number; toAfter: number;
}

// Move not-yet-started tasks (biggest first) from over-capacity people to the
// person with the most free time in the same department, until the overloaded
// person is back at capacity or nothing fits.
export function suggestMoves(people: WorkloadPerson[], max = 10): Suggestion[] {
  const state = new Map(people.map(p => [p.person, { remaining: p.remainingMin, cap: p.capacityMin }]));
  const pct = (n: string) => { const s = state.get(n)!; return s.cap > 0 ? Math.round((s.remaining / s.cap) * 100) : 0; };
  const out: Suggestion[] = [];
  const overloaded = people.filter(p => p.loadPct > 100).sort((a, b) => b.loadPct - a.loadPct);
  for (const p of overloaded) {
    const candidates = p.tasks
      .filter(t => t.remainingMin > 0 && /^(to be started|no action taken|)$/i.test(t.taskStatus.trim()))
      .sort((a, b) => b.remainingMin - a.remainingMin);
    for (const t of candidates) {
      if (out.length >= max) return out;
      const me = state.get(p.person)!;
      if (me.remaining <= me.cap) break;
      const target = people
        .filter(q => q.person !== p.person && (!p.dept || !q.dept || q.dept === p.dept))
        .map(q => ({ q, free: state.get(q.person)!.cap - state.get(q.person)!.remaining }))
        .filter(x => x.free >= t.remainingMin)
        .sort((a, b) => b.free - a.free)[0];
      if (!target) continue;
      const fromBefore = pct(p.person), toBefore = pct(target.q.person);
      me.remaining -= t.remainingMin;
      state.get(target.q.person)!.remaining += t.remainingMin;
      out.push({ task: t, from: p.person, to: target.q.person, fromBefore, fromAfter: pct(p.person), toBefore, toAfter: pct(target.q.person) });
    }
  }
  return out;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function buildWorkloadDoc(
  people: WorkloadPerson[],
  ctx: { team: ReportTeam; order: string[]; endDate: Date; endLabel: string; hoursPerDay: number; today: Date },
): ReportDoc {
  const label = TEAM_LABELS[ctx.team];
  const sorted = [...people].sort((a, b) => {
    const ia = ctx.order.indexOf(a.person), ib = ctx.order.indexOf(b.person);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.person.localeCompare(b.person);
  });
  const sum = (f: (p: WorkloadPerson) => number) => sorted.reduce((s, p) => s + f(p), 0);
  const over = sorted.filter(p => p.status.tone === 'bad').length;
  const days = workingDays(ctx.today, ctx.endDate);
  const capAll = sum(p => p.capacityMin);
  const remAll = sum(p => p.remainingMin);
  const moves = suggestMoves(sorted);

  const summary: DocTable = {
    head: ['RESOURCE', 'DEPARTMENT', 'OPEN TASKS', 'WORK LEFT', 'CAPACITY', 'LOAD', 'FREE / OVER', 'OVERDUE', 'ON HOLD', 'NO ESTIMATE', 'STATUS'],
    rows: sorted.map(p => [
      { text: p.person, bold: true },
      p.dept || '-',
      String(p.tasks.length),
      fmtDuration(p.remainingMin),
      fmtDuration(p.capacityMin),
      { text: `${p.loadPct}%`, bar: { pct: p.loadPct, tone: p.status.tone } },
      p.freeMin >= 0 ? `${fmtDuration(p.freeMin)} free` : { text: `${fmtDuration(p.freeMin)} over`, tone: 'bad' as const },
      p.overdue ? { text: String(p.overdue), tone: 'bad' as const } : '0',
      String(p.onHold),
      p.noEstimate ? { text: String(p.noEstimate), tone: 'warn' as const } : '0',
      { text: p.status.label, tone: p.status.tone },
    ]),
    widths: [30, 30, 18, 22, 22, 30, 26, 18, 16, 22, 36],
  };

  const extras: DocTable[] = [];
  if (moves.length) {
    extras.push({
      title: 'Ideas to rebalance',
      head: ['TASK', 'PROJECT', 'LINK', 'WORK LEFT', 'MOVE FROM', 'MOVE TO', 'RESULT'],
      rows: moves.map(m => [
        m.task.task || '-', m.task.project || '-',
        m.task.url ? { text: 'Open', url: m.task.url } : '-',
        fmtDuration(m.task.remainingMin),
        { text: m.from, bold: true }, { text: m.to, bold: true },
        `${m.from} ${m.fromBefore}% to ${m.fromAfter}%   |   ${m.to} ${m.toBefore}% to ${m.toAfter}%`,
      ]),
      widths: [64, 36, 13, 20, 26, 26, 88],
    });
  } else if (over > 0) {
    extras.push({
      title: 'Ideas to rebalance',
      head: ['NOTE'],
      rows: [['Someone is over capacity, but no not-yet-started task fits another person in the same department. Review the open tasks on their page.']],
    });
  }

  const sections: DocSection[] = sorted.map(p => ({
    title: p.person,
    verdict: p.status,
    facts: [
      p.dept,
      plural(p.tasks.length, 'open task'),
      `Work left ${fmtDuration(p.remainingMin)}`,
      `Capacity ${fmtDuration(p.capacityMin)}`,
      `Load ${p.loadPct}%`,
      p.freeMin >= 0 ? `${fmtDuration(p.freeMin)} free` : `${fmtDuration(p.freeMin)} over`,
    ],
    notes: [
      p.later ? `${plural(p.later, 'open task')} due after ${fmtDate(ctx.endDate)} ${p.later === 1 ? 'is' : 'are'} not counted.` : '',
      p.onHold ? `${plural(p.onHold, 'task')} on hold ${p.onHold === 1 ? 'is' : 'are'} not counted.` : '',
      p.noEstimate ? `${plural(p.noEstimate, 'task')} ${p.noEstimate === 1 ? 'has' : 'have'} no estimate, so ${p.noEstimate === 1 ? 'its' : 'their'} work is not measured.` : '',
    ].filter(Boolean),
    tables: [{
      head: ['#', 'PROJECT', 'TASK', 'LINK', 'DEADLINE', 'TASK STATUS', 'ESTIMATE', 'TIME LOGGED', 'WORK LEFT'],
      rows: p.tasks.map((t, i) => [
        String(i + 1), t.project || '-', t.task || '-',
        t.url ? { text: 'Open', url: t.url } : '-',
        t.overdue ? { text: fmtDate(t.deadline, t.deadlineRaw), tone: 'bad' as const } : fmtDate(t.deadline, t.deadlineRaw),
        t.taskStatus || '-',
        t.estMin ? fmtDuration(t.estMin) : { text: 'No estimate', tone: 'warn' as const },
        t.totalMin ? fmtDuration(t.totalMin) : '-',
        t.estMin ? fmtDuration(t.remainingMin) : '-',
      ]),
      foot: ['', '', 'TOTAL', '', '', '', '', '', fmtDuration(p.remainingMin)],
      widths: [8, 36, 66, 13, 28, 30, 24, 24, 24],
    }],
  }));
  sections.forEach((s, i) => { if (!sorted[i].tasks.length) { s.notes = [...(s.notes ?? []), 'No open tasks to show for this resource.']; s.tables = []; } });

  return {
    eyebrow: `WORKLOAD BALANCE  |  ${label.team.toUpperCase()}`,
    title: 'Workload Balance',
    rangeLabel: `Today to ${ctx.endLabel}  |  ${plural(days, 'working day')} at ${ctx.hoursPerDay}h`,
    stats: [
      { label: 'Open tasks', value: String(sum(p => p.tasks.length)) },
      { label: 'Work left', value: fmtDuration(remAll) },
      { label: 'Team load', value: capAll ? `${Math.round((remAll / capAll) * 100)}%` : '-' },
      { label: 'Over capacity', value: `${over} of ${sorted.length}` },
    ],
    summary,
    legend: [
      `Work left = estimate minus time already logged, for open tasks due by ${fmtDate(ctx.endDate)} (overdue and no-deadline tasks included; on-hold tasks left out). Capacity = Monday-Friday days x ${ctx.hoursPerDay}h; leave and public holidays are not taken off.`,
      'Load: green under 80%, amber 80-100%, red over 100%. Rebalancing ideas only move tasks that have not been started, and stay within the same department where it is known.',
    ],
    extras,
    sections,
    fileName: `Workload-Balance-${label.team}-${isoDate(ctx.today)}`,
  };
}
