'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Gauge, FileText, FileSpreadsheet, X, AlertCircle } from 'lucide-react';
import { SheetData } from '@/lib/googleSheets';
import { WEB_TEAM } from '@/lib/config';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { buildProductivityTasks, findWebColumns, formatRange, summarise } from '@/lib/productivity';
import { downloadProductivityPdf } from '@/lib/productivityPdf';
import { downloadProductivityExcel } from '@/lib/productivityExcel';

type Format = 'pdf' | 'xlsx';

// One entry per report. More reports (and the Marketing set) slot in here later.
const REPORTS = [
  {
    id: 'productivity',
    title: 'Productivity Meter',
    description:
      'See who finished tasks within the estimated time. Pick dates and resources. Green means on time, red means over the estimate.',
    Icon: Gauge,
  },
];

// Local date → "YYYY-MM-DD" (toISOString would shift the day by the UTC offset)
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (s: string): Date | null => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

interface Props {
  /** Every Web task row (current month + archive tabs) */
  data: SheetData[];
  headers: string[];
}

// Report tab (Web): a grid of report cards, 3 per row, each with Generate PDF
// and Generate Excel. A report with options opens its popup first.
export default function Reports({ data, headers }: Props) {
  const [open, setOpen] = useState<{ reportId: string; format: Format } | null>(null);

  return (
    <div className="p-3 sm:p-6">
      <div className="mb-5">
        <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>Reports</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>
          Web team reports. Choose one, set what it should cover, and download it as a PDF or an Excel sheet.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map(r => (
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

      {open?.reportId === 'productivity' && (
        <ProductivityDialog format={open.format} data={data} headers={headers} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

// ─── Productivity Meter popup ────────────────────────────────────────────────
function ProductivityDialog({ format, data, headers, onClose }: {
  format: Format;
  data: SheetData[];
  headers: string[];
  onClose: () => void;
}) {
  useBodyScrollLock();

  // Everyone who has a task, the roster first
  const people = useMemo(() => {
    const col = findWebColumns(headers).person;
    const found = new Set<string>();
    if (col) data.forEach(r => { const n = String(r[col] ?? '').trim(); if (n) found.add(n); });
    // The Web roster first (in roster order, even if someone has no tasks yet),
    // then anyone else who appears in the data.
    const has = (n: string) => [...found].find(f => f.toLowerCase() === n.toLowerCase());
    const roster = WEB_TEAM.map(n => has(n) ?? n);
    const rest = [...found].filter(n => !WEB_TEAM.some(t => t.toLowerCase() === n.toLowerCase())).sort((a, b) => a.localeCompare(b));
    return [...roster, ...rest];
  }, [data, headers]);

  const today = new Date();
  const [from, setFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(iso(today));
  const [dateBy, setDateBy] = useState<'created' | 'deadline'>('created');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(people));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const fromDate = fromIso(from);
  const toDate = fromIso(to);
  const rangeInvalid = !!fromDate && !!toDate && fromDate > toDate;

  // Live counts: how many tasks each person has inside the chosen dates
  const counts = useMemo(() => {
    const all = buildProductivityTasks(data, headers, { from: fromDate, to: toDate, dateBy, people: new Set(people) });
    const map = new Map<string, number>();
    all.forEach(t => map.set(t.person, (map.get(t.person) ?? 0) + 1));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, headers, from, to, dateBy, people]);

  const totalSelectedTasks = people.filter(p => selected.has(p)).reduce((s, p) => s + (counts.get(p) ?? 0), 0);
  const canGenerate = !busy && !rangeInvalid && selected.size > 0 && totalSelectedTasks > 0;

  const preset = (kind: 'month' | 'last' | 'three' | 'all') => {
    const now = new Date();
    if (kind === 'month') { setFrom(iso(new Date(now.getFullYear(), now.getMonth(), 1))); setTo(iso(now)); }
    if (kind === 'last') { setFrom(iso(new Date(now.getFullYear(), now.getMonth() - 1, 1))); setTo(iso(new Date(now.getFullYear(), now.getMonth(), 0))); }
    if (kind === 'three') { setFrom(iso(new Date(now.getFullYear(), now.getMonth() - 2, 1))); setTo(iso(now)); }
    if (kind === 'all') { setFrom(''); setTo(''); }
  };

  const toggle = (name: string) =>
    setSelected(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });

  const generate = async () => {
    setError('');
    const tasks = buildProductivityTasks(data, headers, { from: fromDate, to: toDate, dateBy, people: selected });
    const summaries = summarise(tasks, WEB_TEAM);
    if (!summaries.length) { setError('No tasks found for these resources in that date range.'); return; }
    const rangeLabel = formatRange(fromDate, toDate, dateBy);
    const stamp = `${from || 'start'}_to_${to || 'now'}`;
    setBusy(true);
    try {
      if (format === 'pdf') await downloadProductivityPdf({ summaries, rangeLabel, fileName: `Productivity-Meter-${stamp}.pdf` });
      else await downloadProductivityExcel({ summaries, rangeLabel, fileName: `Productivity-Meter-${stamp}.xlsx` });
      onClose();
    } catch {
      setError('Could not generate the report. Please try again.');
      setBusy(false);
    }
  };

  const inputStyle = { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)' };
  const chip = 'px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-all border';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => { if (!busy) onClose(); }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Productivity Meter report"
        className="rounded-xl w-full flex flex-col"
        style={{ background: 'var(--cn-bg-card)', maxWidth: 560, maxHeight: '92vh', border: '1px solid var(--cn-border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>
              Productivity Meter — {format === 'pdf' ? 'PDF' : 'Excel'}
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--cn-text-muted)' }}>
              Choose the dates and the resources. Each task is flagged green when it took no longer than its estimate, red when it ran over.
            </p>
          </div>
          <button onClick={onClose} disabled={busy} title="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-50"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-4 overflow-y-auto overscroll-contain space-y-5">
          {/* Date range */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>Date range</h3>
              <div className="flex flex-wrap gap-1.5">
                {([['month', 'This month'], ['last', 'Last month'], ['three', 'Last 3 months'], ['all', 'All time']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => preset(k)} className={chip}
                    style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-secondary)', borderColor: 'var(--cn-border)' }}>{label}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} aria-label="From date"
                className="flex-1 text-sm rounded-lg px-2.5 py-2 border focus:outline-none focus:ring-1 focus:ring-[#FE4A23]" style={inputStyle} />
              <span className="text-xs" style={{ color: 'var(--cn-text-muted)' }}>to</span>
              <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} aria-label="To date"
                className="flex-1 text-sm rounded-lg px-2.5 py-2 border focus:outline-none focus:ring-1 focus:ring-[#FE4A23]" style={inputStyle} />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs" style={{ color: 'var(--cn-text-muted)' }}>Count tasks by</span>
              {([['created', 'Date created'], ['deadline', 'Deadline']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setDateBy(k)} aria-pressed={dateBy === k} className={chip}
                  style={dateBy === k
                    ? { background: 'var(--cn-accent)', color: '#fff', borderColor: 'var(--cn-accent)' }
                    : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-secondary)', borderColor: 'var(--cn-border)' }}>{label}</button>
              ))}
            </div>
            {rangeInvalid && <p className="text-xs mt-2" style={{ color: '#ef4444' }}>The start date is after the end date.</p>}
          </section>

          {/* Resources */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>Resources</h3>
              <div className="flex items-center gap-3 text-xs font-semibold">
                <button onClick={() => setSelected(new Set(people))} className="cursor-pointer hover:opacity-80" style={{ color: 'var(--cn-accent)' }}>Select all</button>
                <span style={{ color: 'var(--cn-border)' }}>·</span>
                <button onClick={() => setSelected(new Set())} className="cursor-pointer hover:opacity-80" style={{ color: 'var(--cn-text-muted)' }}>Clear</button>
              </div>
            </div>
            {people.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: 'var(--cn-text-muted)' }}>No resources found in the task data.</p>
            ) : (
              <div className="rounded-lg border divide-y" style={{ borderColor: 'var(--cn-border)' }}>
                {people.map(p => {
                  const n = counts.get(p) ?? 0;
                  return (
                    <label key={p} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-[var(--cn-bg-hover)] text-sm" style={{ borderColor: 'var(--cn-border)' }}>
                      <input type="checkbox" checked={selected.has(p)} onChange={() => toggle(p)} className="accent-[#FE4A23] cursor-pointer" />
                      <span className="flex-1" style={{ color: 'var(--cn-text-primary)' }}>{p}</span>
                      <span className="text-xs tabular-nums" style={{ color: n ? 'var(--cn-text-secondary)' : 'var(--cn-text-faint)' }}>
                        {n} task{n === 1 ? '' : 's'}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          {!rangeInvalid && selected.size > 0 && totalSelectedTasks === 0 && (
            <p className="text-xs flex items-start gap-1.5" style={{ color: 'var(--cn-text-muted)' }}>
              <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" />
              No tasks fall in this date range for the selected resources — try &ldquo;Last 3 months&rdquo; or &ldquo;All time&rdquo;.
            </p>
          )}
          {error && <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--cn-border)' }}>
          <span className="text-xs" style={{ color: 'var(--cn-text-muted)' }}>
            {selected.size} resource{selected.size === 1 ? '' : 's'} · {totalSelectedTasks} task{totalSelectedTasks === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all disabled:opacity-50"
              style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>
              Cancel
            </button>
            <button onClick={generate} disabled={!canGenerate}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }}>
              {busy
                ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : format === 'pdf' ? <FileText className="w-4 h-4" /> : <FileSpreadsheet className="w-4 h-4" />}
              {busy ? 'Generating…' : format === 'pdf' ? 'Generate PDF' : 'Generate Excel'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
