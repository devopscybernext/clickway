// Estimation Accuracy — how close each resource's estimates are to the time the
// work really took, whether they tend to run over or finish early, and which
// projects ran furthest over. Only tasks with both an estimate and logged time
// can be compared.
//
// difference % = (time taken - estimate) / estimate. A task is "close" when it is
// within +/-20% of its estimate. A resource's bias is the same figure over all
// of their compared tasks together (positive = usually runs over).

import type { DocSection, DocTable, ReportDoc, Tone } from './reportDoc';
import { fmtDuration, TEAM_LABELS, type ReportTeam } from './productivity';
import { fmtDate, isoDate, type ReportTask } from './reportTasks';

export const CLOSE_TOLERANCE = 0.2;
const MIN_TASKS = 3;

export interface EstTask extends ReportTask {
  diffMin: number;
  /** (taken - estimate) / estimate, as a whole percent */
  diffPct: number;
  kind: 'over' | 'under' | 'close';
}

export interface EstPerson {
  person: string;
  tasks: EstTask[];
  estMin: number;
  actMin: number;
  biasPct: number;
  closePct: number;
  over: number;
  under: number;
  close: number;
  /** share of compared tasks whose time is exactly the estimate (likely copied, not measured) */
  identicalPct: number;
  verdict: { label: string; tone: Tone };
}

export interface EstOptions {
  people: Set<string>;
  from: Date | null;
  to: Date | null;
}

const inRange = (d: Date | null, from: Date | null, to: Date | null) => {
  if (!from && !to) return true;
  if (!d) return false;
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (from && t < new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()) return false;
  if (to && t > new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()) return false;
  return true;
};

/** Tasks that can be compared: they have an estimate and logged time, and were created in the range */
export function comparableTasks(all: ReportTask[], opts: EstOptions): EstTask[] {
  return all
    .filter(t => opts.people.has(t.person) && t.estMin > 0 && t.totalMin > 0 && inRange(t.created, opts.from, opts.to))
    .map(t => {
      const diffMin = t.totalMin - t.estMin;
      const ratio = diffMin / t.estMin;
      return { ...t, diffMin, diffPct: Math.round(ratio * 100), kind: ratio > CLOSE_TOLERANCE ? 'over' as const : ratio < -CLOSE_TOLERANCE ? 'under' as const : 'close' as const };
    });
}

export function buildEstimation(tasks: EstTask[]): EstPerson[] {
  const by = new Map<string, EstTask[]>();
  tasks.forEach(t => (by.get(t.person) ?? by.set(t.person, []).get(t.person)!).push(t));
  const out: EstPerson[] = [];
  by.forEach((list, person) => {
    const estMin = list.reduce((s, t) => s + t.estMin, 0);
    const actMin = list.reduce((s, t) => s + t.totalMin, 0);
    const biasPct = Math.round(((actMin - estMin) / estMin) * 100);
    const close = list.filter(t => t.kind === 'close').length;
    const identicalPct = Math.round((list.filter(t => t.totalMin === t.estMin).length / list.length) * 100);
    const verdict: EstPerson['verdict'] =
      list.length < MIN_TASKS ? { label: 'Not enough tasks', tone: 'neutral' }
      : identicalPct >= 80 ? { label: 'Time looks copied from estimate', tone: 'neutral' }
      : Math.abs(biasPct) <= 10 ? { label: 'Accurate estimates', tone: 'good' }
      : biasPct > 25 ? { label: `Usually runs over (+${biasPct}%)`, tone: 'bad' }
      : biasPct > 10 ? { label: `Tends to run over (+${biasPct}%)`, tone: 'warn' }
      : { label: `Finishes early (${biasPct}%)`, tone: 'warn' };
    out.push({
      person, tasks: list, estMin, actMin, biasPct,
      closePct: Math.round((close / list.length) * 100),
      over: list.filter(t => t.kind === 'over').length,
      under: list.filter(t => t.kind === 'under').length,
      close, identicalPct, verdict,
    });
  });
  return out;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const signedPct = (n: number) => `${n > 0 ? '+' : ''}${n}%`;
const signedDur = (min: number) => (min === 0 ? '0m' : `${min > 0 ? '+' : '-'}${fmtDuration(min)}`);
const biasTone = (pct: number): Tone => (Math.abs(pct) <= 10 ? 'good' : pct > 25 ? 'bad' : 'warn');

const monthKey = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'none');
const monthLabel = (k: string) => {
  if (k === 'none') return 'No date';
  const [y, m] = k.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
};

export function buildEstimationDoc(
  people: EstPerson[],
  ctx: { team: ReportTeam; order: string[]; rangeLabel: string; today: Date },
): ReportDoc {
  const label = TEAM_LABELS[ctx.team];
  const sorted = [...people].sort((a, b) => {
    const ia = ctx.order.indexOf(a.person), ib = ctx.order.indexOf(b.person);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.person.localeCompare(b.person);
  });
  const allTasks = sorted.flatMap(p => p.tasks);
  const estAll = allTasks.reduce((s, t) => s + t.estMin, 0);
  const actAll = allTasks.reduce((s, t) => s + t.totalMin, 0);
  const biasAll = estAll ? Math.round(((actAll - estAll) / estAll) * 100) : 0;
  const closeAll = allTasks.filter(t => t.kind === 'close').length;
  const identicalAll = allTasks.length ? Math.round((allTasks.filter(t => t.totalMin === t.estMin).length / allTasks.length) * 100) : 0;

  const summary: DocTable = {
    head: ['RESOURCE', 'TASKS COMPARED', 'ESTIMATED', 'TIME TAKEN', 'OVER / UNDER', 'CLOSE (±20%)', 'RAN OVER', 'FINISHED EARLY', 'VERDICT'],
    rows: sorted.map(p => [
      { text: p.person, bold: true },
      String(p.tasks.length),
      fmtDuration(p.estMin),
      fmtDuration(p.actMin),
      { text: signedPct(p.biasPct), tone: p.verdict.tone === 'neutral' ? 'neutral' as const : biasTone(p.biasPct) },
      `${p.close} (${p.closePct}%)`,
      String(p.over),
      String(p.under),
      { text: p.verdict.label, tone: p.verdict.tone },
    ]),
    widths: [34, 24, 24, 24, 24, 28, 20, 26, 62],
  };

  // Projects that ran furthest over their estimates
  const byProject = new Map<string, { est: number; act: number; n: number }>();
  allTasks.forEach(t => {
    const k = t.project || '(no project)';
    const cur = byProject.get(k) ?? { est: 0, act: 0, n: 0 };
    cur.est += t.estMin; cur.act += t.totalMin; cur.n += 1;
    byProject.set(k, cur);
  });
  const worstProjects = [...byProject.entries()].map(([project, v]) => ({ project, ...v, over: v.act - v.est })).filter(p => p.over > 0).sort((a, b) => b.over - a.over).slice(0, 8);
  const extras: DocTable[] = worstProjects.length ? [{
    title: 'Projects that ran furthest over their estimates',
    head: ['PROJECT', 'TASKS', 'ESTIMATED', 'TIME TAKEN', 'OVER BY', 'DIFFERENCE'],
    rows: worstProjects.map(p => [
      { text: p.project, bold: true }, String(p.n), fmtDuration(p.est), fmtDuration(p.act),
      { text: fmtDuration(p.over), tone: 'bad' as const }, { text: signedPct(Math.round((p.over / p.est) * 100)), tone: biasTone(Math.round((p.over / p.est) * 100)) },
    ]),
    widths: [90, 22, 30, 30, 30, 30],
  }] : [];

  const sections: DocSection[] = sorted.map(p => {
    const months = new Map<string, EstTask[]>();
    p.tasks.forEach(t => (months.get(monthKey(t.created)) ?? months.set(monthKey(t.created), []).get(monthKey(t.created))!).push(t));
    const monthRows = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, list]) => {
      const e = list.reduce((s, t) => s + t.estMin, 0), a = list.reduce((s, t) => s + t.totalMin, 0);
      const pct = Math.round(((a - e) / e) * 100);
      return [monthLabel(k), String(list.length), fmtDuration(e), fmtDuration(a), { text: signedPct(pct), tone: biasTone(pct) }];
    });
    const misses = [...p.tasks].sort((a, b) => Math.abs(b.diffMin) - Math.abs(a.diffMin)).slice(0, 8);
    const notes: string[] = [];
    if (p.identicalPct >= 80 && p.tasks.length >= MIN_TASKS) notes.push(`${p.identicalPct}% of these tasks show a time exactly equal to the estimate, so they were probably copied rather than measured. The figures below are not a real accuracy reading.`);
    else if (p.verdict.tone === 'bad') notes.push(`Estimates are usually too low: adding about ${p.biasPct}% to this person's estimates would match what the work really takes.`);
    else if (p.biasPct < -10 && p.tasks.length >= MIN_TASKS) notes.push(`Work usually finishes early: estimates could be about ${Math.abs(p.biasPct)}% tighter.`);
    return {
      title: p.person,
      verdict: p.verdict,
      facts: [
        plural(p.tasks.length, 'task') + ' compared',
        `Estimated ${fmtDuration(p.estMin)}`,
        `Taken ${fmtDuration(p.actMin)}`,
        `${signedPct(p.biasPct)} overall`,
        `${p.close} close, ${p.over} ran over, ${p.under} finished early`,
      ],
      notes,
      tables: [
        { title: 'Month by month', head: ['MONTH CREATED', 'TASKS', 'ESTIMATED', 'TIME TAKEN', 'OVER / UNDER'], rows: monthRows, widths: [50, 30, 40, 40, 40] },
        {
          title: 'Biggest differences',
          head: ['#', 'PROJECT', 'TASK', 'LINK', 'CREATED', 'ESTIMATE', 'TIME TAKEN', 'DIFFERENCE', '%'],
          rows: misses.map((t, i) => [
            String(i + 1), t.project || '-', t.task || '-',
            t.url ? { text: 'Open', url: t.url } : '-',
            fmtDate(t.created),
            fmtDuration(t.estMin), fmtDuration(t.totalMin),
            { text: signedDur(t.diffMin), tone: t.kind === 'over' ? 'bad' as const : t.kind === 'under' ? 'warn' as const : 'good' as const },
            { text: signedPct(t.diffPct), tone: t.kind === 'over' ? 'bad' as const : t.kind === 'under' ? 'warn' as const : 'good' as const },
          ]),
          widths: [8, 36, 64, 13, 26, 24, 26, 28, 18],
        },
      ],
    };
  });

  return {
    eyebrow: `ESTIMATION ACCURACY  |  ${label.team.toUpperCase()}`,
    title: 'Estimation Accuracy',
    rangeLabel: ctx.rangeLabel,
    stats: [
      { label: 'Tasks compared', value: String(allTasks.length) },
      { label: 'Estimated', value: fmtDuration(estAll) },
      { label: 'Time taken', value: fmtDuration(actAll) },
      { label: 'Overall', value: allTasks.length ? `${signedPct(biasAll)}  (${Math.round((closeAll / allTasks.length) * 100)}% close)` : '-' },
    ],
    summary,
    legend: [
      `Over / under = (time taken - estimate) / estimate, over all of a person's compared tasks. + means the work usually takes longer than estimated. Close = within ±${CLOSE_TOLERANCE * 100}% of the estimate.`,
      `Only tasks with both an estimate and logged time are compared.${identicalAll >= 50 ? ` Warning: ${identicalAll}% of the compared tasks show a time exactly equal to the estimate, which usually means the time was copied from the estimate, so accuracy may look better than it is.` : ''}`,
    ],
    extras,
    sections,
    fileName: `Estimation-Accuracy-${label.team}-${isoDate(ctx.today)}`,
  };
}
