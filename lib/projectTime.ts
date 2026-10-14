// Project Time Report — how much time each project used: tasks, estimated vs
// actual, who worked on it, and the split by person. Tasks are picked by the
// date they were created.

import type { DocSection, DocTable, ReportDoc, Tone } from './reportDoc';
import { biasTone, byRoster, plural, signedPct } from './reportDoc';
import { fmtDuration, TEAM_LABELS, type ReportTeam } from './productivity';
import { fmtDate, inDateRange, isoDate, type ReportTask } from './reportTasks';

export interface ProjectRow {
  project: string;
  tasks: ReportTask[];
  estMin: number;
  totalMin: number;
  /** estimate / time of the tasks that have both, for the over/under figure */
  cmpEst: number;
  cmpAct: number;
  open: number;
  done: number;
  people: { person: string; tasks: number; estMin: number; totalMin: number }[];
}

export interface ProjectTimeOptions {
  people: Set<string>;
  from: Date | null;
  to: Date | null;
}

export function buildProjectTime(all: ReportTask[], opts: ProjectTimeOptions): ProjectRow[] {
  const by = new Map<string, ReportTask[]>();
  all.forEach(t => {
    if (!opts.people.has(t.person) || !inDateRange(t.created, opts.from, opts.to)) return;
    const key = t.project || '(no project)';
    (by.get(key) ?? by.set(key, []).get(key)!).push(t);
  });
  const rows: ProjectRow[] = [];
  by.forEach((tasks, project) => {
    const people = new Map<string, { person: string; tasks: number; estMin: number; totalMin: number }>();
    tasks.forEach(t => {
      const p = people.get(t.person) ?? { person: t.person, tasks: 0, estMin: 0, totalMin: 0 };
      p.tasks += 1; p.estMin += t.estMin; p.totalMin += t.totalMin;
      people.set(t.person, p);
    });
    const both = tasks.filter(t => t.estMin > 0 && t.totalMin > 0);
    rows.push({
      project,
      tasks: tasks.sort((a, b) => (a.created?.getTime() ?? 0) - (b.created?.getTime() ?? 0)),
      estMin: tasks.reduce((s, t) => s + t.estMin, 0),
      totalMin: tasks.reduce((s, t) => s + t.totalMin, 0),
      cmpEst: both.reduce((s, t) => s + t.estMin, 0),
      cmpAct: both.reduce((s, t) => s + t.totalMin, 0),
      open: tasks.filter(t => t.state === 'open' || t.state === 'onhold').length,
      done: tasks.filter(t => t.state === 'closed' || t.state === 'submitted').length,
      people: [...people.values()].sort((a, b) => b.totalMin - a.totalMin),
    });
  });
  return rows.sort((a, b) => b.totalMin - a.totalMin || b.tasks.length - a.tasks.length || a.project.localeCompare(b.project));
}

const diffPct = (p: ProjectRow) => (p.cmpEst > 0 ? Math.round(((p.cmpAct - p.cmpEst) / p.cmpEst) * 100) : null);
const diffCell = (p: ProjectRow) => {
  const d = diffPct(p);
  return d === null ? '-' : { text: signedPct(d), tone: biasTone(d) as Tone };
};

export function buildProjectTimeDoc(
  rowsAll: ProjectRow[],
  ctx: { team: ReportTeam; order: string[]; rangeLabel: string; topN: number | null; today: Date },
): ReportDoc {
  const label = TEAM_LABELS[ctx.team];
  const rows = ctx.topN ? rowsAll.slice(0, ctx.topN) : rowsAll;
  const tasksAll = rows.reduce((s, p) => s + p.tasks.length, 0);
  const takenAll = rows.reduce((s, p) => s + p.totalMin, 0);
  const estAll = rows.reduce((s, p) => s + p.estMin, 0);

  const summary: DocTable = {
    head: ['PROJECT', 'TASKS', 'ESTIMATED', 'TIME TAKEN', 'OVER / UNDER', 'RESOURCES', 'OPEN', 'DONE'],
    rows: rows.map(p => [
      { text: p.project, bold: true },
      String(p.tasks.length),
      p.estMin ? fmtDuration(p.estMin) : '-',
      p.totalMin ? fmtDuration(p.totalMin) : '-',
      diffCell(p),
      String(p.people.length),
      String(p.open),
      String(p.done),
    ]),
    widths: [80, 20, 30, 30, 30, 26, 20, 20],
  };

  // Time per resource across the listed projects
  const perPerson = new Map<string, { tasks: number; est: number; total: number; projects: Set<string> }>();
  rows.forEach(p => p.people.forEach(x => {
    const c = perPerson.get(x.person) ?? { tasks: 0, est: 0, total: 0, projects: new Set<string>() };
    c.tasks += x.tasks; c.est += x.estMin; c.total += x.totalMin; c.projects.add(p.project);
    perPerson.set(x.person, c);
  }));
  const people = [...perPerson.entries()].sort((a, b) => byRoster(ctx.order)(a[0], b[0]));
  const extras: DocTable[] = people.length ? [{
    title: 'Time by resource',
    head: ['RESOURCE', 'PROJECTS', 'TASKS', 'ESTIMATED', 'TIME TAKEN'],
    rows: people.map(([name, v]) => [{ text: name, bold: true }, String(v.projects.size), String(v.tasks), v.est ? fmtDuration(v.est) : '-', v.total ? fmtDuration(v.total) : '-']),
    widths: [60, 30, 30, 40, 40],
  }] : [];

  const sections: DocSection[] = rows.map(p => {
    const d = diffPct(p);
    const verdict: DocSection['verdict'] =
      d === null ? { label: 'No estimate to compare', tone: 'neutral' }
      : Math.abs(d) <= 10 ? { label: 'On estimate', tone: 'good' }
      : d > 0 ? { label: `${d}% over estimate`, tone: biasTone(d) }
      : { label: `${Math.abs(d)}% under estimate`, tone: 'warn' };
    return {
      title: p.project,
      verdict,
      facts: [plural(p.tasks.length, 'task'), `Estimated ${p.estMin ? fmtDuration(p.estMin) : '-'}`, `Taken ${p.totalMin ? fmtDuration(p.totalMin) : '-'}`, `${plural(p.people.length, 'resource')}`, `${p.open} open, ${p.done} done`],
      tables: [
        {
          title: 'Time by resource',
          head: ['RESOURCE', 'TASKS', 'ESTIMATED', 'TIME TAKEN', 'SHARE OF TIME'],
          rows: p.people.map(x => [{ text: x.person, bold: true }, String(x.tasks), x.estMin ? fmtDuration(x.estMin) : '-', x.totalMin ? fmtDuration(x.totalMin) : '-', p.totalMin ? `${Math.round((x.totalMin / p.totalMin) * 100)}%` : '-']),
          widths: [60, 30, 40, 40, 40],
        },
        {
          title: 'Tasks',
          head: ['#', 'RESOURCE', 'TASK', 'LINK', 'CREATED', 'ESTIMATE', 'TIME TAKEN', 'STATUS', 'PM STATUS'],
          rows: p.tasks.map((t, i) => [
            String(i + 1), t.person, t.task || '-', t.url ? { text: 'Open', url: t.url } : '-', fmtDate(t.created),
            t.estMin ? fmtDuration(t.estMin) : '-', t.totalMin ? fmtDuration(t.totalMin) : '-', t.taskStatus || '-', t.pmStatus || '-',
          ]),
          foot: ['', '', 'TOTAL', '', '', p.estMin ? fmtDuration(p.estMin) : '-', p.totalMin ? fmtDuration(p.totalMin) : '-', '', ''],
          widths: [8, 26, 70, 13, 26, 22, 24, 30, 30],
        },
      ],
    };
  });

  const more = rowsAll.length - rows.length;
  return {
    unit: 'project',
    eyebrow: `PROJECT TIME REPORT  |  ${label.team.toUpperCase()}`,
    title: 'Project Time Report',
    rangeLabel: ctx.rangeLabel,
    stats: [
      { label: 'Projects', value: ctx.topN && more > 0 ? `${rows.length} of ${rowsAll.length}` : String(rows.length) },
      { label: 'Tasks', value: String(tasksAll) },
      { label: 'Estimated', value: estAll ? fmtDuration(estAll) : '-' },
      { label: 'Time taken', value: takenAll ? fmtDuration(takenAll) : '-' },
    ],
    summary,
    legend: [
      `Projects are ordered by time taken${ctx.topN && more > 0 ? `; the top ${rows.length} of ${rowsAll.length} are shown` : ''}. Tasks are picked by the date they were created, and a task's whole time counts in that month.`,
      'Over / under = (time taken - estimate) / estimate, over the tasks that have both. Open = still in progress, to be started or on hold; done = submitted to the PM or closed.',
    ],
    extras,
    sections,
    fileName: `Project-Time-${label.team}-${isoDate(ctx.today)}`,
  };
}
