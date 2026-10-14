'use client';

import { useMemo, useState } from 'react';
import { SheetData } from '@/lib/googleSheets';
import { plural } from '@/lib/reportDoc';
import { monthKey, monthLabel, monthStart, startOfDay, type ReportTask } from '@/lib/reportTasks';
import { buildProjectTime, buildProjectTimeDoc } from '@/lib/projectTime';
import { buildMonthlyDoc, monthTasks, monthsWithTasks } from '@/lib/monthlySummary';
import { buildUtilisation, buildUtilisationDoc } from '@/lib/utilisation';
import { buildAging, buildAgingDoc } from '@/lib/aging';
import { buildHealth, buildHealthDoc, departmentsOf } from '@/lib/projectHealth';
import { buildNotes, buildNotesDoc } from '@/lib/blockers';
import {
  DateRangeSection, DialogFrame, Hint, ResourceSection, SectionLabel, chipClass, chipStyle, fromIso, inputStyle, iso,
  exportDoc, rangePresets, teamSuffix, today0, useGenerate,
  type DialogProps, type Format, type Preset,
} from './ReportDialogParts';

const long = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const rangeText = (what: string, from: Date | null, to: Date | null) =>
  from || to ? `${what}: ${from ? long(from) : 'start'} - ${to ? long(to) : 'now'}` : `${what}: all dates`;
const sixMonths: Preset = { key: 'six', label: 'Last 6 months', range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth() - 5, 1)), iso(n)]; } };

// Tasks created in a date range, counted per person — what the live counts show
function useRangeCounts(tasks: ReportTask[], from: Date | null, to: Date | null, people: string[]) {
  return useMemo(() => {
    const set = new Set(people);
    const m = new Map<string, number>();
    const f = from ? startOfDay(from).getTime() : null;
    const t = to ? startOfDay(to).getTime() : null;
    tasks.forEach(x => {
      if (!set.has(x.person)) return;
      if (f !== null || t !== null) {
        if (!x.created) return;
        const c = startOfDay(x.created).getTime();
        if ((f !== null && c < f) || (t !== null && c > t)) return;
      }
      m.set(x.person, (m.get(x.person) ?? 0) + 1);
    });
    return m;
  }, [tasks, people, from, to]);
}

// ─── Project Time Report ─────────────────────────────────────────────────────
const TOPS: { key: string; label: string; n: number | null }[] = [
  { key: '10', label: 'Top 10 projects', n: 10 },
  { key: '25', label: 'Top 25 projects', n: 25 },
  { key: 'all', label: 'All projects', n: null },
];

export function ProjectTimeDialog({ format, team, roster, tasks, people, onClose }: DialogProps) {
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)));
  const [to, setTo] = useState(iso(now));
  const [topKey, setTopKey] = useState('25');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(people));
  const g = useGenerate(onClose);
  const fromDate = fromIso(from), toDate = fromIso(to);
  const invalid = !!fromDate && !!toDate && fromDate > toDate;

  const counts = useRangeCounts(tasks, fromDate, toDate, people);
  const rows = useMemo(() => buildProjectTime(tasks, { people: selected, from: fromDate, to: toDate }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, selected, from, to]);
  const topN = TOPS.find(t => t.key === topKey)?.n ?? null;
  const shown = topN ? Math.min(topN, rows.length) : rows.length;
  const tasksShown = rows.slice(0, shown).reduce((s, p) => s + p.tasks.length, 0);

  const generate = () => g.run(async () => {
    if (!rows.length) throw new Error('No tasks found for these resources in that date range.');
    await exportDoc(buildProjectTimeDoc(rows, { team, order: roster, rangeLabel: rangeText('Created', fromDate, toDate), topN, today: new Date() }), format);
  });

  return (
    <DialogFrame
      title={`Project Time Report${teamSuffix(team)}`}
      intro="How much time each project used: estimated vs actual, who worked on it, and the split by person."
      format={format} busy={g.busy} error={g.error} canGenerate={!g.busy && !invalid && rows.length > 0} onClose={onClose} onGenerate={generate}
      footer={`${plural(shown, 'project')} · ${plural(tasksShown, 'task')}`}
    >
      <DateRangeSection from={from} to={to} setFrom={setFrom} setTo={setTo} presets={rangePresets([sixMonths])} invalid={invalid}>
        <p className="text-xs mt-2" style={{ color: 'var(--cn-text-muted)' }}>Tasks are picked by the date they were created.</p>
      </DateRangeSection>
      <section>
        <div className="mb-2"><SectionLabel>Projects to include</SectionLabel></div>
        <div className="flex flex-wrap gap-1.5">
          {TOPS.map(t => (
            <button key={t.key} onClick={() => setTopKey(t.key)} aria-pressed={topKey === t.key} className={chipClass} style={chipStyle(topKey === t.key)}>{t.label}</button>
          ))}
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--cn-text-muted)' }}>Projects are ordered by the time they took.</p>
      </section>
      <ResourceSection people={people} selected={selected} setSelected={setSelected} countOf={p => counts.get(p) ?? 0} unit="task" />
      {!invalid && selected.size > 0 && rows.length === 0 && <Hint>No tasks fall in this range — try &ldquo;Last 6 months&rdquo; or &ldquo;All time&rdquo;.</Hint>}
    </DialogFrame>
  );
}

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

// ─── Utilisation ─────────────────────────────────────────────────────────────
export function UtilisationDialog({ format, team, roster, tasks, people, onClose }: DialogProps) {
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)));
  const [to, setTo] = useState(iso(now));
  const [hours, setHours] = useState('8');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(people));
  const g = useGenerate(onClose);
  const today = useMemo(() => today0(), []);
  const hoursPerDay = Math.min(Math.max(parseFloat(hours) || 0, 0), 24);

  // "All time" (blank dates) runs from the first task to today
  const earliest = useMemo(() => tasks.reduce<Date | null>((m, t) => (t.created && (!m || t.created < m) ? t.created : m), null), [tasks]);
  const fromDate = fromIso(from) ?? earliest ?? today;
  const toDate = fromIso(to) ?? today;
  const invalid = fromDate > toDate;
  const counts = useRangeCounts(tasks, fromIso(from), fromIso(to), people);
  const total = people.filter(p => selected.has(p)).reduce((s, p) => s + (counts.get(p) ?? 0), 0);

  const generate = () => g.run(async () => {
    const built = buildUtilisation(tasks, { people: selected, from: fromDate, to: toDate, hoursPerDay, today });
    if (!built.length) throw new Error('None of the selected resources have tasks.');
    const rangeLabel = `${monthLabel(monthStart(fromDate))} - ${monthLabel(monthStart(toDate))}`;
    await exportDoc(buildUtilisationDoc(built, { team, order: roster, rangeLabel, hoursPerDay, today }), format);
  });

  return (
    <DialogFrame
      title={`Utilisation${teamSuffix(team)}`}
      intro="Compares the time taken on each person's tasks with their working time, month by month, to show who is under-used or stretched."
      format={format} busy={g.busy} error={g.error} canGenerate={!g.busy && !invalid && selected.size > 0 && hoursPerDay > 0} onClose={onClose} onGenerate={generate}
      footer={`${plural(selected.size, 'resource')} · ${plural(total, 'task')}`}
    >
      <DateRangeSection from={from} to={to} setFrom={setFrom} setTo={setTo} presets={rangePresets([sixMonths])} invalid={invalid}>
        <div className="flex items-center gap-2 mt-3">
          <label htmlFor="ut-hours" className="text-xs" style={{ color: 'var(--cn-text-muted)' }}>Working hours per day</label>
          <input id="ut-hours" type="number" min={1} max={24} step={0.5} value={hours} onChange={e => setHours(e.target.value)}
            className="w-20 text-sm rounded-lg px-2.5 py-1.5 border focus:outline-none focus:ring-1 focus:ring-[#FE4A23]" style={inputStyle} />
        </div>
        {!hoursPerDay && <p className="text-xs mt-2" style={{ color: '#ef4444' }}>Enter the working hours per day.</p>}
        <p className="text-xs mt-2" style={{ color: 'var(--cn-text-muted)' }}>Whole months are used. A task&rsquo;s time counts in the month it was created, and leave and public holidays are not taken off.</p>
      </DateRangeSection>
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

// ─── Project Health (PM Projects) ────────────────────────────────────────────
export function ProjectHealthDialog({ format, pmData, pmHeaders, onClose }: {
  format: Format; pmData: SheetData[]; pmHeaders: string[]; onClose: () => void;
}) {
  const [dept, setDept] = useState<string | null>(null);
  const [selectedPms, setSelectedPms] = useState<Set<string> | null>(null); // null = everyone
  const g = useGenerate(onClose);
  const today = useMemo(() => today0(), []);
  const depts = useMemo(() => departmentsOf(pmData, pmHeaders), [pmData, pmHeaders]);

  const all = useMemo(() => buildHealth(pmData, pmHeaders, { dept, pms: null, today }), [pmData, pmHeaders, dept, today]);
  const pms = useMemo(() => [...new Set(all.map(p => p.pm))].sort((a, b) => a.localeCompare(b)), [all]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    all.forEach(p => m.set(p.pm, (m.get(p.pm) ?? 0) + 1));
    return m;
  }, [all]);
  const selected = selectedPms ?? new Set(pms);
  const chosen = all.filter(p => selected.has(p.pm));

  const generate = () => g.run(async () => {
    if (!chosen.length) throw new Error('No projects found for these project managers.');
    await exportDoc(buildHealthDoc(chosen, { dept, today }), format);
  });

  return (
    <DialogFrame
      title="Project Health"
      intro="How each of this month's client projects is doing: hours used against the total, target end dates, follow-ups and anything at risk."
      format={format} busy={g.busy} error={g.error} canGenerate={!g.busy && chosen.length > 0} onClose={onClose} onGenerate={generate}
      footer={`${plural(selected.size, 'project manager')} · ${plural(chosen.length, 'project')}`}
    >
      {depts.length > 1 && (
        <section>
          <div className="mb-2"><SectionLabel>Department</SectionLabel></div>
          <div className="flex flex-wrap gap-1.5">
            {[null, ...depts].map(d => (
              <button key={d ?? 'all'} onClick={() => { setDept(d); setSelectedPms(null); }} aria-pressed={dept === d} className={chipClass} style={chipStyle(dept === d)}>{d ?? 'All departments'}</button>
            ))}
          </div>
        </section>
      )}
      <ResourceSection people={pms} selected={selected} setSelected={setSelectedPms} countOf={p => counts.get(p) ?? 0} unit="project" />
      <p className="text-xs" style={{ color: 'var(--cn-text-muted)' }}>Uses the current month&rsquo;s PM Projects rows. Projects are grouped by the project manager who owns them.</p>
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

