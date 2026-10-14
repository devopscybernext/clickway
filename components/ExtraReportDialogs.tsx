'use client';

import { useMemo, useState } from 'react';
import { plural } from '@/lib/reportDoc';
import { monthKey, monthLabel, monthStart } from '@/lib/reportTasks';
import { buildMonthlyDoc, monthTasks, monthsWithTasks } from '@/lib/monthlySummary';
import { buildAging, buildAgingDoc } from '@/lib/aging';
import { buildNotes, buildNotesDoc } from '@/lib/blockers';
import {
  DateRangeSection, DialogFrame, Hint, ResourceSection, SectionLabel, chipClass, chipStyle, fromIso, inputStyle, iso,
  exportDoc, rangePresets, teamSuffix, today0, useGenerate,
  type DialogProps, type Preset,
} from './ReportDialogParts';

const long = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const rangeText = (what: string, from: Date | null, to: Date | null) =>
  from || to ? `${what}: ${from ? long(from) : 'start'} - ${to ? long(to) : 'now'}` : `${what}: all dates`;
const sixMonths: Preset = { key: 'six', label: 'Last 6 months', range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth() - 5, 1)), iso(n)]; } };

// ─── Monthly Team Summary ────────────────────────────────────────────────────
export function MonthlyDialog({ format, team, roster, tasks, people, onClose }: DialogProps) {
  const months = useMemo(() => monthsWithTasks(tasks), [tasks]);
  const thisMonth = monthKey(new Date());
  const [monthIdx, setMonthIdx] = useState(() => Math.max(months.findIndex(m => monthKey(m) === thisMonth), 0));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(people));
  const g = useGenerate(onClose);
  const month = months[monthIdx] ?? monthStart(new Date());

  const inMonth = useMemo(() => monthTasks(tasks, month, new Set(people)), [tasks, month, people]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    inMonth.forEach(t => m.set(t.person, (m.get(t.person) ?? 0) + 1));
    return m;
  }, [inMonth]);
  const total = inMonth.filter(t => selected.has(t.person)).length;

  const generate = () => g.run(async () => {
    if (!total) throw new Error('No tasks were created in that month for these resources.');
    await exportDoc(buildMonthlyDoc(tasks, { team, order: roster, month, people: selected, today: new Date() }), format);
  });

  return (
    <DialogFrame
      title={`Monthly Team Summary${teamSuffix(team)}`}
      intro="A one-month view for management: tasks and time per person, busiest projects, and how it compares with the month before."
      format={format} busy={g.busy} error={g.error} canGenerate={!g.busy && total > 0} onClose={onClose} onGenerate={generate}
      footer={`${plural(selected.size, 'resource')} · ${plural(total, 'task')}`}
    >
      <section>
        <div className="mb-2"><SectionLabel>Month</SectionLabel></div>
        <select value={monthIdx} onChange={e => setMonthIdx(Number(e.target.value))} aria-label="Month"
          className="w-full text-sm rounded-lg px-2.5 py-2 border focus:outline-none focus:ring-1 focus:ring-[#FE4A23] cursor-pointer" style={inputStyle}>
          {months.map((m, i) => <option key={monthKey(m)} value={i}>{monthLabel(m)}</option>)}
        </select>
        <p className="text-xs mt-2" style={{ color: 'var(--cn-text-muted)' }}>Tasks are counted in the month they were created.</p>
      </section>
      <ResourceSection people={people} selected={selected} setSelected={setSelected} countOf={p => counts.get(p) ?? 0} unit="task" />
    </DialogFrame>
  );
}

// ─── Aging Tasks ─────────────────────────────────────────────────────────────
const AGES: { key: string; label: string; days: number }[] = [
  { key: '0', label: 'All open tasks', days: 0 },
  { key: '7', label: '7+ days old', days: 7 },
  { key: '14', label: '14+ days', days: 14 },
  { key: '30', label: '30+ days', days: 30 },
  { key: '60', label: '60+ days', days: 60 },
  { key: '90', label: '90+ days', days: 90 },
];

export function AgingDialog({ format, team, roster, tasks, people, onClose }: DialogProps) {
  const [ageKey, setAgeKey] = useState('0');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(people));
  const g = useGenerate(onClose);
  const today = useMemo(() => today0(), []);
  const minAge = AGES.find(a => a.key === ageKey)?.days ?? 0;

  const all = useMemo(() => buildAging(tasks, { people: new Set(people), minAge, today }), [tasks, people, minAge, today]);
  const byPerson = useMemo(() => new Map(all.map(p => [p.person, p])), [all]);
  const chosen = all.filter(p => selected.has(p.person));
  const listed = chosen.reduce((s, p) => s + p.tasks.length, 0);

  const generate = () => g.run(async () => {
    if (!chosen.length) throw new Error('None of the selected resources have open tasks.');
    await exportDoc(buildAgingDoc(chosen, { team, order: roster, minAge, today }), format);
  });

  return (
    <DialogFrame
      title={`Aging Tasks${teamSuffix(team)}`}
      intro="Open tasks ordered by how long they have been sitting since they were created, including ones with no deadline."
      format={format} busy={g.busy} error={g.error} canGenerate={!g.busy && chosen.length > 0} onClose={onClose} onGenerate={generate}
      footer={`${plural(chosen.length, 'resource')} · ${plural(listed, 'task')} listed`}
    >
      <section>
        <div className="mb-2"><SectionLabel>List tasks that are</SectionLabel></div>
        <div className="flex flex-wrap gap-1.5">
          {AGES.map(a => (
            <button key={a.key} onClick={() => setAgeKey(a.key)} aria-pressed={ageKey === a.key} className={chipClass} style={chipStyle(ageKey === a.key)}>{a.label}</button>
          ))}
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--cn-text-muted)' }}>Open means to be started, in progress or on hold. Closed tasks and ones already submitted to the PM are left out.</p>
      </section>
      <ResourceSection people={people} selected={selected} setSelected={setSelected} countOf={p => byPerson.get(p)?.tasks.length ?? 0} unit="task" />
    </DialogFrame>
  );
}

// ─── Blockers and Insights (Marketing) ───────────────────────────────────────
export function BlockersDialog({ format, roster, tasks, people, onClose }: DialogProps) {
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)));
  const [to, setTo] = useState(iso(now));
  const [onlyBlockers, setOnlyBlockers] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(people));
  const g = useGenerate(onClose);
  const fromDate = fromIso(from), toDate = fromIso(to);
  const invalid = !!fromDate && !!toDate && fromDate > toDate;

  const all = useMemo(() => buildNotes(tasks, { people: new Set(people), from: fromDate, to: toDate, onlyBlockers }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, people, from, to, onlyBlockers]);
  const byPerson = useMemo(() => new Map(all.map(p => [p.person, p])), [all]);
  const chosen = all.filter(p => selected.has(p.person));
  const listed = chosen.reduce((s, p) => s + p.tasks.length, 0);

  const generate = () => g.run(async () => {
    if (!chosen.length) throw new Error('No tasks with notes found for these resources in that date range.');
    await exportDoc(buildNotesDoc(chosen, { order: roster, rangeLabel: rangeText('Created', fromDate, toDate), onlyBlockers, today: new Date() }), format);
  });

  return (
    <DialogFrame
      title={`Blockers and Insights${teamSuffix('marketing')}`}
      intro="The blockers, next steps and performance notes resources left on their tasks, gathered per person."
      format={format} busy={g.busy} error={g.error} canGenerate={!g.busy && !invalid && chosen.length > 0} onClose={onClose} onGenerate={generate}
      footer={`${plural(chosen.length, 'resource')} · ${plural(listed, 'task')} with notes`}
    >
      <DateRangeSection from={from} to={to} setFrom={setFrom} setTo={setTo} presets={rangePresets([sixMonths])} invalid={invalid}>
        <label className="flex items-center gap-2 mt-3 text-xs cursor-pointer" style={{ color: 'var(--cn-text-secondary)' }}>
          <input type="checkbox" checked={onlyBlockers} onChange={e => setOnlyBlockers(e.target.checked)} className="accent-[#FE4A23] cursor-pointer" />
          Only tasks that have a blocker
        </label>
      </DateRangeSection>
      <ResourceSection people={people} selected={selected} setSelected={setSelected} countOf={p => byPerson.get(p)?.tasks.length ?? 0} unit="task" />
      {!invalid && chosen.length === 0 && selected.size > 0 && <Hint>No tasks with notes fall in this range — try &ldquo;All time&rdquo;.</Hint>}
    </DialogFrame>
  );
}

