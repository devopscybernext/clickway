// Monthly Team Summary — a management view of one month: tasks created and how
// many are finished, time taken, the busiest projects, and how each resource
// compares with the month before. Tasks are counted in the month they were
// created, and a task's whole time counts in that month.

import type { DocSection, DocTable, ReportDoc, Tone } from './reportDoc';
import { byRoster, plural, signedPct } from './reportDoc';
import { fmtDuration, TEAM_LABELS, type ReportTeam } from './productivity';
import { fmtDate, monthKey, monthLabel, monthStart, type ReportTask } from './reportTasks';

const finished = (t: ReportTask) => t.state === 'closed' || t.state === 'submitted';

/** Tasks created in the given month for the chosen people */
export function monthTasks(all: ReportTask[], month: Date, people: Set<string>): ReportTask[] {
  const key = monthKey(month);
  return all.filter(t => people.has(t.person) && t.created && monthKey(t.created) === key);
}

/** Months that have tasks, newest first (first-of-month dates) */
export function monthsWithTasks(all: ReportTask[]): Date[] {
  const keys = new Set<string>();
  all.forEach(t => { if (t.created) keys.add(monthKey(t.created)); });
  return [...keys].sort().reverse().map(k => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1); });
}

const change = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
const changeCell = (now: number, before: number) => {
  const c = change(now, before);
  return c === null ? (now > 0 ? 'new' : '-') : { text: signedPct(c), tone: 'neutral' as Tone };
};

export function buildMonthlyDoc(
  all: ReportTask[],
  ctx: { team: ReportTeam; order: string[]; month: Date; people: Set<string>; today: Date },
): ReportDoc {
  const label = TEAM_LABELS[ctx.team];
  const month = monthStart(ctx.month);
  const prev = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const cur = monthTasks(all, month, ctx.people);
  const before = monthTasks(all, prev, ctx.people);

  const names = [...new Set(cur.map(t => t.person))].sort(byRoster(ctx.order));
  const sum = (list: ReportTask[], f: (t: ReportTask) => number) => list.reduce((s, t) => s + f(t), 0);

  const summary: DocTable = {
    head: ['RESOURCE', 'TASKS', 'FINISHED', 'STILL OPEN', 'ESTIMATED', 'TIME TAKEN', `${monthLabel(prev).split(' ')[0].toUpperCase()} TIME`, 'CHANGE', 'PROJECTS'],
    rows: names.map(n => {
      const mine = cur.filter(t => t.person === n);
      const was = before.filter(t => t.person === n);
      const open = mine.filter(t => t.state === 'open' || t.state === 'onhold').length;
      return [
        { text: n, bold: true },
        String(mine.length),
        String(mine.filter(finished).length),
        String(open),
        sum(mine, t => t.estMin) ? fmtDuration(sum(mine, t => t.estMin)) : '-',
        sum(mine, t => t.totalMin) ? fmtDuration(sum(mine, t => t.totalMin)) : '-',
        sum(was, t => t.totalMin) ? fmtDuration(sum(was, t => t.totalMin)) : '-',
        changeCell(sum(mine, t => t.totalMin), sum(was, t => t.totalMin)),
        String(new Set(mine.map(t => t.project || '(no project)')).size),
      ];
    }),
    widths: [34, 20, 22, 22, 28, 28, 28, 22, 22],
  };

  // Busiest projects and the status mix, across everyone
  const projects = new Map<string, { tasks: number; total: number; people: Set<string> }>();
  cur.forEach(t => {
    const k = t.project || '(no project)';
    const c = projects.get(k) ?? { tasks: 0, total: 0, people: new Set<string>() };
    c.tasks += 1; c.total += t.totalMin; c.people.add(t.person);
    projects.set(k, c);
  });
  const busiest = [...projects.entries()].sort((a, b) => b[1].total - a[1].total || b[1].tasks - a[1].tasks).slice(0, 8);
  const statuses = new Map<string, number>();
  cur.forEach(t => statuses.set(t.taskStatus || '(blank)', (statuses.get(t.taskStatus || '(blank)') ?? 0) + 1));
  const extras: DocTable[] = [];
  if (busiest.length) extras.push({
    title: 'Busiest projects',
    head: ['PROJECT', 'TASKS', 'TIME TAKEN', 'RESOURCES'],
    rows: busiest.map(([p, v]) => [{ text: p, bold: true }, String(v.tasks), v.total ? fmtDuration(v.total) : '-', String(v.people.size)]),
    widths: [100, 30, 40, 30],
  });
  if (statuses.size) extras.push({
    title: 'Where the month\'s tasks stand',
    head: ['TASK STATUS', 'TASKS', 'SHARE'],
    rows: [...statuses.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => [{ text: s, bold: true }, String(n), `${Math.round((n / cur.length) * 100)}%`]),
    widths: [80, 30, 30],
  });

  const sections: DocSection[] = names.map(n => {
    const mine = cur.filter(t => t.person === n);
    const was = before.filter(t => t.person === n);
    const byProject = new Map<string, ReportTask[]>();
    mine.forEach(t => { const k = t.project || '(no project)'; (byProject.get(k) ?? byProject.set(k, []).get(k)!).push(t); });
    const taken = sum(mine, t => t.totalMin);
    const c = change(taken, sum(was, t => t.totalMin));
    const biggest = [...mine].sort((a, b) => b.totalMin - a.totalMin).filter(t => t.totalMin > 0).slice(0, 8);
    return {
      title: n,
      verdict: c === null ? undefined : { label: `${signedPct(c)} time vs ${monthLabel(prev).split(' ')[0]}`, tone: 'neutral' as Tone },
      facts: [plural(mine.length, 'task'), `${mine.filter(finished).length} finished`, `Estimated ${sum(mine, t => t.estMin) ? fmtDuration(sum(mine, t => t.estMin)) : '-'}`, `Taken ${taken ? fmtDuration(taken) : '-'}`, plural(byProject.size, 'project')],
      tables: [
        {
          title: 'Projects',
          head: ['PROJECT', 'TASKS', 'FINISHED', 'ESTIMATED', 'TIME TAKEN'],
          rows: [...byProject.entries()].sort((a, b) => sum(b[1], t => t.totalMin) - sum(a[1], t => t.totalMin)).map(([p, list]) => [
            { text: p, bold: true }, String(list.length), String(list.filter(finished).length),
            sum(list, t => t.estMin) ? fmtDuration(sum(list, t => t.estMin)) : '-', sum(list, t => t.totalMin) ? fmtDuration(sum(list, t => t.totalMin)) : '-',
          ]),
          widths: [100, 30, 30, 40, 40],
        },
        ...(biggest.length ? [{
          title: 'Biggest tasks by time',
          head: ['#', 'PROJECT', 'TASK', 'LINK', 'CREATED', 'ESTIMATE', 'TIME TAKEN', 'STATUS'],
          rows: biggest.map((t, i) => [String(i + 1), t.project || '-', t.task || '-', t.url ? { text: 'Open', url: t.url } : '-', fmtDate(t.created), t.estMin ? fmtDuration(t.estMin) : '-', fmtDuration(t.totalMin), t.taskStatus || '-']),
          widths: [8, 36, 70, 13, 26, 22, 24, 34],
        }] : []),
      ],
    };
  });

  const inProgress = monthKey(month) === monthKey(ctx.today);
  const takenAll = sum(cur, t => t.totalMin);
  const takenPrev = sum(before, t => t.totalMin);
  const cAll = change(takenAll, takenPrev);
  return {
    eyebrow: `MONTHLY TEAM SUMMARY  |  ${label.team.toUpperCase()}`,
    title: `Monthly Summary - ${monthLabel(month)}`,
    rangeLabel: `Tasks created in ${monthLabel(month)}${inProgress ? ' (month still in progress)' : ''}  |  compared with ${monthLabel(prev)}`,
    stats: [
      { label: 'Tasks created', value: `${cur.length}${before.length ? `  (${monthLabel(prev).split(' ')[0]} ${before.length})` : ''}` },
      { label: 'Finished', value: cur.length ? `${cur.filter(finished).length}  (${Math.round((cur.filter(finished).length / cur.length) * 100)}%)` : '-' },
      { label: 'Time taken', value: takenAll ? `${fmtDuration(takenAll)}${cAll === null ? '' : `  (${signedPct(cAll)})`}` : '-' },
      { label: 'Active projects', value: String(projects.size) },
    ],
    summary,
    legend: [
      'Tasks are counted in the month they were created, and a task\'s whole time counts in that month. Finished = submitted to the PM or closed. Change = time taken vs the month before.' + (inProgress ? ` ${monthLabel(month)} is still in progress, so its figures are not yet comparable with a full month.` : ''),
    ],
    extras,
    sections,
    fileName: `Monthly-Summary-${label.team}-${monthKey(month)}`,
  };
}
