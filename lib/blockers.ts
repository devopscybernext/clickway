// Blockers and Insights (Marketing) — the free-text notes resources leave on
// their tasks (Blocker, Next Steps, Performance Signal/Insights, Action Taken
// Today), gathered per resource so a PM sees what is stuck without opening
// every row.

import type { DocSection, DocTable, ReportDoc, Tone } from './reportDoc';
import { byRoster, plural } from './reportDoc';
import { TEAM_LABELS } from './productivity';
import { fmtDate, inDateRange, isoDate, type ReportTask } from './reportTasks';

// A note only counts when it says something (not blank, "No Action Taken", "None", "-")
export const hasNote = (v: string) => !!v.trim() && !/^(no action taken|none|n\/?a|nil|-+)$/i.test(v.trim());
const anyNote = (t: ReportTask) => hasNote(t.blocker) || hasNote(t.nextSteps) || hasNote(t.performance) || hasNote(t.actionToday);

export interface NotesPerson {
  person: string;
  tasks: ReportTask[];
  blockers: number;
  nextSteps: number;
  open: number;
  verdict: { label: string; tone: Tone };
}

export function buildNotes(
  all: ReportTask[],
  opts: { people: Set<string>; from: Date | null; to: Date | null; onlyBlockers: boolean },
): NotesPerson[] {
  const by = new Map<string, ReportTask[]>();
  all.forEach(t => {
    if (!opts.people.has(t.person) || !inDateRange(t.created, opts.from, opts.to)) return;
    if (opts.onlyBlockers ? !hasNote(t.blocker) : !anyNote(t)) return;
    (by.get(t.person) ?? by.set(t.person, []).get(t.person)!).push(t);
  });
  const out: NotesPerson[] = [];
  by.forEach((tasks, person) => {
    const blockers = tasks.filter(t => hasNote(t.blocker)).length;
    out.push({
      person,
      tasks: tasks.sort((a, b) => (hasNote(b.blocker) ? 1 : 0) - (hasNote(a.blocker) ? 1 : 0) || (b.created?.getTime() ?? 0) - (a.created?.getTime() ?? 0)),
      blockers,
      nextSteps: tasks.filter(t => hasNote(t.nextSteps)).length,
      open: tasks.filter(t => t.state === 'open' || t.state === 'onhold').length,
      verdict: blockers > 0 ? { label: `${plural(blockers, 'blocker')}`, tone: 'bad' } : { label: 'No blockers', tone: 'good' },
    });
  });
  return out;
}

const note = (v: string) => (hasNote(v) ? v.trim() : '-');

export function buildNotesDoc(
  people: NotesPerson[],
  ctx: { order: string[]; rangeLabel: string; onlyBlockers: boolean; today: Date },
): ReportDoc {
  const label = TEAM_LABELS.marketing;
  const sorted = [...people].sort((a, b) => byRoster(ctx.order)(a.person, b.person));
  const sum = (f: (p: NotesPerson) => number) => sorted.reduce((s, p) => s + f(p), 0);

  const summary: DocTable = {
    head: ['RESOURCE', 'TASKS WITH NOTES', 'BLOCKERS', 'NEXT STEPS', 'STILL OPEN', 'STATUS'],
    rows: sorted.map(p => [
      { text: p.person, bold: true }, String(p.tasks.length),
      p.blockers ? { text: String(p.blockers), tone: 'bad' as Tone } : '0',
      String(p.nextSteps), String(p.open), { text: p.verdict.label, tone: p.verdict.tone },
    ]),
    widths: [40, 34, 26, 26, 26, 44],
  };

  const blocked = sorted.flatMap(p => p.tasks.filter(t => hasNote(t.blocker))).slice(0, 15);
  const extras: DocTable[] = blocked.length ? [{
    title: 'Blockers across the team',
    head: ['RESOURCE', 'PROJECT', 'TASK', 'LINK', 'BLOCKER'],
    rows: blocked.map(t => [{ text: t.person, bold: true }, t.project || '-', t.task || '-', t.url ? { text: 'Open', url: t.url } : '-', { text: t.blocker.trim(), tone: 'bad' as Tone }]),
    widths: [30, 40, 56, 13, 120],
  }] : [];

  const sections: DocSection[] = sorted.map(p => ({
    title: p.person,
    verdict: p.verdict,
    facts: [plural(p.tasks.length, 'task') + ' with notes', plural(p.blockers, 'blocker'), plural(p.nextSteps, 'next step'), `${p.open} still open`],
    tables: [{
      head: ['#', 'PROJECT', 'TASK', 'LINK', 'CREATED', 'STATUS', 'BLOCKER', 'NEXT STEPS', 'PERFORMANCE SIGNAL', 'ACTION TAKEN TODAY'],
      rows: p.tasks.map((t, i) => [
        String(i + 1), t.project || '-', t.task || '-', t.url ? { text: 'Open', url: t.url } : '-', fmtDate(t.created), t.taskStatus || '-',
        hasNote(t.blocker) ? { text: t.blocker.trim(), tone: 'bad' as Tone } : '-', note(t.nextSteps), note(t.performance), note(t.actionToday),
      ]),
      widths: [8, 26, 38, 13, 24, 24, 44, 38, 38, 38],
    }],
  }));

  return {
    eyebrow: `BLOCKERS AND INSIGHTS  |  ${label.team.toUpperCase()}`,
    title: 'Blockers and Insights',
    rangeLabel: `${ctx.rangeLabel}${ctx.onlyBlockers ? '  |  Tasks with a blocker only' : ''}`,
    stats: [
      { label: 'Tasks with notes', value: String(sum(p => p.tasks.length)) },
      { label: 'Blockers', value: String(sum(p => p.blockers)) },
      { label: 'Next steps', value: String(sum(p => p.nextSteps)) },
      { label: 'Resources', value: String(sorted.length) },
    ],
    summary,
    legend: [
      'Gathered from the Blocker, Next Steps, Performance Signal/Insights and Action Taken Today columns. Blank entries and "No Action Taken" are ignored. Tasks with a blocker are listed first.',
    ],
    extras,
    sections,
    fileName: `Blockers-Insights-${label.team}-${isoDate(ctx.today)}`,
  };
}
