'use client';

import { useMemo, useState } from 'react';
import { Gauge, CalendarClock, Target, CalendarRange, Hourglass, MessageSquareWarning, FileText, FileSpreadsheet, type LucideIcon } from 'lucide-react';
import { SheetData } from '@/lib/googleSheets';
import { WEB_TEAM, MARKETING_ASSIGNED_PERSONS } from '@/lib/config';
import { TEAM_LABELS, buildProductivityTasks, formatRange, summarise, type ReportTeam } from '@/lib/productivity';
import { downloadProductivityPdf } from '@/lib/productivityPdf';
import { downloadProductivityExcel } from '@/lib/productivityExcel';
import { extractTasks, listPeople } from '@/lib/reportTasks';
import { buildDeadlineDoc, buildDeadlines } from '@/lib/deadlines';
import { buildEstimation, buildEstimationDoc, comparableTasks } from '@/lib/estimation';
import { plural } from '@/lib/reportDoc';
import {
  DateRangeSection, DialogFrame, Hint, ResourceSection, SectionLabel, chipClass, chipStyle, fromIso, iso,
  exportDoc, rangePresets, teamSuffix, today0, useGenerate,
  type DialogProps, type Format,
} from './ReportDialogParts';
import { AgingDialog, BlockersDialog, MonthlyDialog } from './ExtraReportDialogs';

type ReportId = 'productivity' | 'deadlines' | 'estimation' | 'monthly' | 'aging' | 'blockers';

const ROSTER: Record<ReportTeam, string[]> = { web: WEB_TEAM, marketing: MARKETING_ASSIGNED_PERSONS };

// One entry per report. More reports slot in here later.
// `teams` says which team's Report tab shows the card.
const REPORTS: { id: ReportId; title: string; description: string; Icon: LucideIcon; teams: ReportTeam[] }[] = [
  {
    id: 'productivity',
    title: 'Productivity Meter',
    description: 'See who finished tasks within the estimated time. Pick dates and resources. Green means on time, red means over the estimate.',
    Icon: Gauge,
    teams: ['web', 'marketing'],
  },
  {
    id: 'deadlines',
    title: 'Deadline Tracker',
    description: 'See which tasks are overdue or due soon, and who is falling behind.',
    Icon: CalendarClock,
    teams: ['web', 'marketing'],
  },
  {
    id: 'estimation',
    title: 'Estimation Accuracy',
    description: 'See whose time estimates run over or under, and by how much.',
    Icon: Target,
    teams: ['web', 'marketing'],
  },
  {
    id: 'monthly',
    title: 'Monthly Team Summary',
    description: 'A one-month view of tasks, time and projects, compared with last month.',
    Icon: CalendarRange,
    teams: ['web', 'marketing'],
  },
  {
    id: 'aging',
    title: 'Aging Tasks',
    description: 'See open tasks that have been waiting the longest.',
    Icon: Hourglass,
    teams: ['web', 'marketing'],
  },
  {
    id: 'blockers',
    title: 'Blockers and Insights',
    description: 'See what is stuck, and what each person plans next.',
    Icon: MessageSquareWarning,
    teams: ['marketing'],
  },
];

interface Props {
  /** Every task row of the team (current month + archive tabs) */
  data: SheetData[];
  headers: string[];
  team: ReportTeam;
}

// Report tab (Web and Marketing): a grid of report cards, 3 per row, each with
// Generate PDF and Generate Excel. A report with options opens its popup first.
export default function Reports({ data, headers, team }: Props) {
  const [open, setOpen] = useState<{ reportId: ReportId; format: Format } | null>(null);

  const roster = ROSTER[team];
  const tasks = useMemo(() => extractTasks(data, headers, team), [data, headers, team]);
  const people = useMemo(() => listPeople(tasks, roster), [tasks, roster]);

  const common: Omit<DialogProps, 'format'> = { team, roster, tasks, people, onClose: () => setOpen(null) };

  return (
    <div className="p-3 sm:p-6">
      <div className="mb-5">
        <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>Reports</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>
          {TEAM_LABELS[team].team} team reports. Choose one, set what it should cover, and download it as a PDF or an Excel sheet.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.filter(r => r.teams.includes(team)).map(r => (
          <article
            key={r.id}
            className="rounded-xl border p-5 flex flex-col gap-3 transition-shadow hover:shadow-lg"
            style={{ background: 'var(--cn-bg-row-even)', borderColor: 'var(--cn-border)' }}
          >
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-lg inline-flex items-center justify-center shrink-0" style={{ background: 'rgba(254,74,35,0.12)', color: 'var(--cn-accent)' }}>
                <r.Icon className="w-5 h-5" />
              </span>
              <h3 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>{r.title}</h3>
            </div>
            <p className="text-sm leading-relaxed flex-1" style={{ color: 'var(--cn-text-secondary)' }}>{r.description}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={() => setOpen({ reportId: r.id, format: 'pdf' })}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all"
                style={{ background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }}
              >
                <FileText className="w-3.5 h-3.5" />
                Generate PDF
              </button>
              <button
                onClick={() => setOpen({ reportId: r.id, format: 'xlsx' })}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all"
                style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Generate Excel
              </button>
            </div>
          </article>
        ))}
      </div>

      {open?.reportId === 'productivity' && <ProductivityDialog {...common} format={open.format} data={data} headers={headers} />}
      {open?.reportId === 'deadlines' && <DeadlineDialog {...common} format={open.format} />}
      {open?.reportId === 'estimation' && <EstimationDialog {...common} format={open.format} />}
      {open?.reportId === 'monthly' && <MonthlyDialog {...common} format={open.format} />}
      {open?.reportId === 'aging' && <AgingDialog {...common} format={open.format} />}
      {open?.reportId === 'blockers' && <BlockersDialog {...common} format={open.format} />}
    </div>
  );
}

// ─── Productivity Meter popup ────────────────────────────────────────────────
function ProductivityDialog({ format, team, roster, people, data, headers, onClose }: DialogProps & { data: SheetData[]; headers: string[] }) {
  const teamName = TEAM_LABELS[team].team;
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(iso(now));
  const [dateBy, setDateBy] = useState<'created' | 'deadline'>('created');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(people));
  const g = useGenerate(onClose);

  const fromDate = fromIso(from);
  const toDate = fromIso(to);
  const rangeInvalid = !!fromDate && !!toDate && fromDate > toDate;

  // Live counts: how many tasks each person has inside the chosen dates
  const counts = useMemo(() => {
    const all = buildProductivityTasks(data, headers, { from: fromDate, to: toDate, dateBy, people: new Set(people), team });
    const map = new Map<string, number>();
    all.forEach(t => map.set(t.person, (map.get(t.person) ?? 0) + 1));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, headers, from, to, dateBy, people, team]);

  const total = people.filter(p => selected.has(p)).reduce((s, p) => s + (counts.get(p) ?? 0), 0);
  const canGenerate = !g.busy && !rangeInvalid && selected.size > 0 && total > 0;

  const generate = () => g.run(async () => {
    const tasks = buildProductivityTasks(data, headers, { from: fromDate, to: toDate, dateBy, people: selected, team });
    const summaries = summarise(tasks, roster);
    if (!summaries.length) throw new Error('No tasks found for these resources in that date range.');
    const rangeLabel = formatRange(fromDate, toDate, dateBy);
    const stamp = `${team === 'web' ? '' : `${teamName}-`}${from || 'start'}_to_${to || 'now'}`;
    if (format === 'pdf') await downloadProductivityPdf({ summaries, rangeLabel, fileName: `Productivity-Meter-${stamp}.pdf`, team });
    else await downloadProductivityExcel({ summaries, rangeLabel, fileName: `Productivity-Meter-${stamp}.xlsx`, team });
  });

  return (
    <DialogFrame
      title={`Productivity Meter${teamSuffix(team)}`}
      intro="Choose the dates and the resources. Each task is flagged green when it took no longer than its estimate, red when it ran over."
      format={format} busy={g.busy} error={g.error} canGenerate={canGenerate} onClose={onClose} onGenerate={generate}
      footer={`${plural(selected.size, 'resource')} · ${plural(total, 'task')}`}
    >
      <DateRangeSection from={from} to={to} setFrom={setFrom} setTo={setTo} presets={rangePresets()} invalid={rangeInvalid}>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs" style={{ color: 'var(--cn-text-muted)' }}>Count tasks by</span>
          {([['created', 'Date created'], ['deadline', 'Deadline']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setDateBy(k)} aria-pressed={dateBy === k} className={chipClass} style={chipStyle(dateBy === k)}>{label}</button>
          ))}
        </div>
      </DateRangeSection>
      <ResourceSection people={people} selected={selected} setSelected={setSelected} countOf={p => counts.get(p) ?? 0} unit="task" />
      {!rangeInvalid && selected.size > 0 && total === 0 && (
        <Hint>No tasks fall in this date range for the selected resources — try &ldquo;Last 3 months&rdquo; or &ldquo;All time&rdquo;.</Hint>
      )}
    </DialogFrame>
  );
}

// ─── Deadline Tracker popup ──────────────────────────────────────────────────
const WINDOWS: { key: string; label: string; days: number | null }[] = [
  { key: '3', label: 'Next 3 days', days: 3 },
  { key: '7', label: 'Next 7 days', days: 7 },
  { key: '14', label: 'Next 14 days', days: 14 },
  { key: '30', label: 'Next 30 days', days: 30 },
  { key: 'all', label: 'All open tasks', days: null },
];

function DeadlineDialog({ format, team, roster, tasks, people, onClose }: DialogProps) {
  const [windowKey, setWindowKey] = useState('7');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(people));
  const g = useGenerate(onClose);
  const windowDays = WINDOWS.find(w => w.key === windowKey)?.days ?? null;
  const today = useMemo(() => today0(), []);

  const all = useMemo(() => buildDeadlines(tasks, { people: new Set(people), windowDays, today }), [tasks, people, windowDays, today]);
  const byPerson = useMemo(() => new Map(all.map(p => [p.person, p])), [all]);
  const chosen = all.filter(p => selected.has(p.person));
  const listed = chosen.reduce((s, p) => s + p.tasks.length, 0);
  const overdue = chosen.reduce((s, p) => s + p.overdue, 0);
  const canGenerate = !g.busy && chosen.length > 0;

  const generate = () => g.run(async () => {
    if (!chosen.length) throw new Error('None of the selected resources have tasks.');
    await exportDoc(buildDeadlineDoc(chosen, { team, order: roster, windowDays, today }), format);
  });

  return (
    <DialogFrame
      title={`Deadline Tracker${teamSuffix(team)}`}
      intro="Lists the tasks that are overdue plus those due soon, for each resource. Tasks that are closed or already submitted to the PM are left out."
      format={format} busy={g.busy} error={g.error} canGenerate={canGenerate} onClose={onClose} onGenerate={generate}
      footer={`${plural(chosen.length, 'resource')} · ${plural(listed, 'task')} listed · ${overdue} overdue`}
    >
      <section>
        <div className="mb-2"><SectionLabel>Show deadlines</SectionLabel></div>
        <div className="flex flex-wrap gap-1.5">
          {WINDOWS.map(w => (
            <button key={w.key} onClick={() => setWindowKey(w.key)} aria-pressed={windowKey === w.key} className={chipClass} style={chipStyle(windowKey === w.key)}>{w.label}</button>
          ))}
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--cn-text-muted)' }}>Overdue tasks are always included.</p>
      </section>
      <ResourceSection people={people} selected={selected} setSelected={setSelected} countOf={p => byPerson.get(p)?.tasks.length ?? 0} unit="task" />
    </DialogFrame>
  );
}

// ─── Estimation Accuracy popup ───────────────────────────────────────────────
function EstimationDialog({ format, team, roster, tasks, people, onClose }: DialogProps) {
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)));
  const [to, setTo] = useState(iso(now));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(people));
  const g = useGenerate(onClose);
  const fromDate = fromIso(from);
  const toDate = fromIso(to);
  const rangeInvalid = !!fromDate && !!toDate && fromDate > toDate;

  const compared = useMemo(
    () => comparableTasks(tasks, { people: new Set(people), from: fromDate, to: toDate }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, people, from, to],
  );
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    compared.forEach(t => m.set(t.person, (m.get(t.person) ?? 0) + 1));
    return m;
  }, [compared]);
  const chosenTasks = compared.filter(t => selected.has(t.person));
  const identicalPct = chosenTasks.length ? Math.round((chosenTasks.filter(t => t.totalMin === t.estMin).length / chosenTasks.length) * 100) : 0;
  const canGenerate = !g.busy && !rangeInvalid && chosenTasks.length > 0;

  const presets = rangePresets([{ key: 'six', label: 'Last 6 months', range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth() - 5, 1)), iso(n)]; } }]);
  const long = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const generate = () => g.run(async () => {
    const built = buildEstimation(chosenTasks);
    if (!built.length) throw new Error('No tasks with both an estimate and logged time in that range.');
    const rangeLabel = fromDate || toDate ? `Created: ${fromDate ? long(fromDate) : 'start'} - ${toDate ? long(toDate) : 'now'}` : 'Created: all dates';
    await exportDoc(buildEstimationDoc(built, { team, order: roster, rangeLabel, today: new Date() }), format);
  });

  return (
    <DialogFrame
      title={`Estimation Accuracy${teamSuffix(team)}`}
      intro="Shows how close each person's estimates are to the time the work really took, and whether they tend to run over or finish early."
      format={format} busy={g.busy} error={g.error} canGenerate={canGenerate} onClose={onClose} onGenerate={generate}
      footer={`${plural(selected.size, 'resource')} · ${plural(chosenTasks.length, 'task')} compared`}
    >
      <DateRangeSection from={from} to={to} setFrom={setFrom} setTo={setTo} presets={presets} invalid={rangeInvalid}>
        <p className="text-xs mt-2" style={{ color: 'var(--cn-text-muted)' }}>Tasks are picked by the date they were created. Only tasks with both an estimate and logged time can be compared.</p>
      </DateRangeSection>
      <ResourceSection people={people} selected={selected} setSelected={setSelected} countOf={p => counts.get(p) ?? 0} unit="task" />
      {!rangeInvalid && chosenTasks.length === 0 && selected.size > 0 && (
        <Hint>No tasks with both an estimate and logged time fall in this range — try &ldquo;Last 6 months&rdquo; or &ldquo;All time&rdquo;.</Hint>
      )}
      {identicalPct >= 50 && chosenTasks.length >= 3 && (
        <Hint tone="warn">{identicalPct}% of these tasks show a time exactly equal to the estimate. That usually means the time was copied from the estimate, so the accuracy will look better than it really is.</Hint>
      )}
    </DialogFrame>
  );
}
