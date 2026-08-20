'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, X, ChevronLeft, ChevronRight, Pencil, SlidersHorizontal } from 'lucide-react';
import { SheetData } from '@/lib/googleSheets';
import { MultiSelect } from './FilteredDataTable';
import SearchFilter from './SearchFilter';
import { parseHHMM, formatHHMM, hhmmToDecimalHours, DURATION_MINUTE_OPTIONS } from './SpecificCharts';
import { memberPhoto, memberColor } from '@/lib/memberColors';

const PAGE_SIZE = 30;
const FOLLOWUP_DUE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days since last follow-up counts as due

const MONTH_ORDER: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function parseTimestamp(v: string): number {
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

// Keyword → color for status-like fields (Status, Payment Status, Upcoming
// Milestones, Upsell/Cross-Sell) — mirrors STATUS_COLORS used elsewhere in
// the app. Ordered most-specific first since matching stops at the first hit.
const STATUS_KEYWORD_COLORS: [string, string][] = [
  ['closed: good feedback', '#16a34a'],
  ['closed: bad feedback', '#dc2626'],
  ['closed: without feedback', '#6b7280'],
  ['paused', '#7c3aed'],
  ['escalated', '#dc2626'],
  ['not started yet', '#dc2626'],
  ['yet to start', '#dc2626'],
  ['move to next month', '#f59e0b'],
  ['initial setup', '#2563eb'],
  ['automated payment', '#0d9488'],
  ['cross-sell', '#2563eb'],
  ['upsell', '#0d9488'],
  ['no action taken', '#6b7280'],
  ['n/a', '#6b7280'],
  ['to be started', '#dc2626'],
  ['on going', '#16a34a'],
  ['in progress', '#16a34a'],
  ['on hold', '#7c3aed'],
  ['approved', '#16a34a'],
  ['completed', '#16a34a'],
  ['done', '#16a34a'],
  ['submitted', '#10b981'],
  ['pending', '#f59e0b'],
  ['urgent', '#dc2626'],
];
function statusColor(value: string): string {
  const lower = value.trim().toLowerCase();
  if (!lower) return '#6b7280';
  return STATUS_KEYWORD_COLORS.find(([kw]) => lower.includes(kw))?.[1] ?? '#6b7280';
}
const isStatusLikeCol = (h: string) => {
  const l = h.toLowerCase();
  return l.includes('status') || l.includes('upcoming milestones') || l.includes('upsell');
};

// Click-to-edit cell — shows a colored pill for status-like columns, plain
// text otherwise; becomes a text input on click, saves on blur/Enter
function EditableCell({ value, colored, editable, onSave }: {
  value: string; colored: boolean; editable: boolean; onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  const commit = async () => {
    setEditing(false);
    if (draft === value) return;
    setSaving(true);
    try { await onSave(draft); } catch { setDraft(value); } finally { setSaving(false); }
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        className="w-full text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#FE4A23]"
        style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
      />
    );
  }

  const badge = colored ? (
    <span className="inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: statusColor(value), color: '#fff' }}>
      {value || 'No Action Taken'}
    </span>
  ) : (
    <span className="whitespace-nowrap" style={{ color: 'var(--cn-text-secondary)' }}>{value || '—'}</span>
  );

  if (!editable) return badge;

  return (
    <button
      onClick={() => setEditing(true)}
      title="Click to edit"
      className="text-left w-full rounded px-1 py-0.5 -mx-1 transition-colors hover:bg-[var(--cn-bg-hover)] cursor-text"
    >
      {badge}
      {saving && <span className="ml-1 text-[10px] opacity-60">saving…</span>}
    </button>
  );
}

// Sheet stores dates as M/D/YYYY; <input type="date"> needs YYYY-MM-DD.
function toInputDate(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  const [, mo, d, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
function fromInputDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${Number(mo)}/${Number(d)}/${y}`;
}
const isDateCol = (h: string) => h.toLowerCase().includes('date');

// Calendar date cell — click to edit, opens the browser's native date picker
// instead of a free-text field.
function DateCell({ value, editable, onSave }: {
  value: string; editable: boolean; onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      try { inputRef.current.showPicker?.(); } catch { /* not supported — native click still opens it */ }
    }
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        autoFocus
        defaultValue={toInputDate(value)}
        onChange={async e => {
          setEditing(false);
          const iso = e.target.value;
          if (!iso) return;
          const next = fromInputDate(iso);
          if (next === value) return;
          setSaving(true);
          try { await onSave(next); } finally { setSaving(false); }
        }}
        onBlur={() => setEditing(false)}
        className="w-full text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#FE4A23]"
        style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
      />
    );
  }

  const badge = <span className="whitespace-nowrap" style={{ color: 'var(--cn-text-secondary)' }}>{value || '—'}</span>;
  if (!editable) return badge;

  return (
    <button
      onClick={() => setEditing(true)}
      title="Click to pick a date"
      className="text-left w-full rounded px-1 py-0.5 -mx-1 transition-colors hover:bg-[var(--cn-bg-hover)] cursor-pointer"
    >
      {badge}
      {saving && <span className="ml-1 text-[10px] opacity-60">saving…</span>}
    </button>
  );
}

// Total Hours / Current Month Hours / Risk Month Hours — HH.MM dropdown
// entry, same "." notation as Time Logged/Time Estimation (MM is literal
// minutes 00-59, never a decimal fraction: "12.50" means 12h50m, not
// 12.5h). Project-level totals routinely exceed 12h, so the hour dropdown
// goes 0-500 here (unlike the 0-12 used for single-task fields).
const PM_HOUR_OPTIONS = Array.from({ length: 501 }, (_, i) => i); // 0-500

// Existing cells may hold a plain legacy number ("30" = 30h 0m) or the new
// "HH.MM Hours" text — this is for AGGREGATE MATH ONLY (KPI sums, sorting):
// "12.50 Hours" must contribute 12 + 50/60 decimal hours, not 12.50.
function parseDurationDecimal(val: unknown): number {
  const trimmed = String(val ?? '').trim();
  if (!trimmed) return 0;
  if (trimmed.includes('.')) return hhmmToDecimalHours(trimmed);
  const n = Number(trimmed);
  return isNaN(n) ? 0 : n;
}

// Shared by the overall KPI cards and each per-PM summary card — same
// formulas, just scoped to a different row set. `rowsAll` (unfiltered) is
// used only for Yet To Start, which is deliberately filter-independent.
function computeStatsFor(
  rowsFiltered: SheetData[],
  rowsAll: SheetData[],
  cols: {
    totalHoursCol?: string; currentMonthHoursCol?: string; riskMonthHoursCol?: string;
    paymentStatusCol?: string; followupDateCol?: string; statusCol?: string;
  }
) {
  const { totalHoursCol, currentMonthHoursCol, riskMonthHoursCol, paymentStatusCol, followupDateCol, statusCol } = cols;
  const totalHours = totalHoursCol ? rowsFiltered.reduce((s, r) => s + parseDurationDecimal(r[totalHoursCol]), 0) : 0;
  // Only rows whose Payment Status is exactly "Done" count toward Current
  // Month Hours — QA_Done/On Hold/Automated Payment/etc don't count, even
  // though they're distinct real statuses (falls back to summing every row
  // if there's no Payment Status column to check against).
  const currentMonthHoursRaw = currentMonthHoursCol
    ? rowsFiltered.reduce((s, r) => {
        if (paymentStatusCol && String(r[paymentStatusCol] ?? '').trim().toLowerCase() !== 'done') return s;
        return s + parseDurationDecimal(r[currentMonthHoursCol]);
      }, 0)
    : 0;
  const riskMonthHours = riskMonthHoursCol ? rowsFiltered.reduce((s, r) => s + parseDurationDecimal(r[riskMonthHoursCol]), 0) : 0;
  // Current Month Hours nets out the at-risk portion of the month — it's
  // the sum actually secured, not the raw logged total. Pending Hours then
  // cascades off this adjusted figure, not the raw one.
  const currentMonthHours = currentMonthHoursRaw - riskMonthHours;
  const pendingHours = totalHours - currentMonthHours;
  const paymentPendingHours = (paymentStatusCol && currentMonthHoursCol)
    ? rowsFiltered.reduce((s, r) => {
        const isPending = String(r[paymentStatusCol] ?? '').trim().toLowerCase() === 'pending';
        return isPending ? s + parseDurationDecimal(r[currentMonthHoursCol]) : s;
      }, 0)
    : 0;
  const followupDue = followupDateCol
    ? rowsFiltered.filter(r => {
        const raw = String(r[followupDateCol] ?? '').trim();
        if (!raw) return true; // never followed up — counts as due
        const t = parseTimestamp(raw);
        return t === 0 || (Date.now() - t) > FOLLOWUP_DUE_MS;
      }).length
    : 0;
  // Yet To Start is intentionally sourced from the full unfiltered rows, not
  // the filtered set — it's a right-now flag ("has a PM started this yet?"),
  // not scoped to whichever Month/Year/etc filters happen to be active.
  const yetToStart = statusCol ? rowsAll.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'yet to start').length : 0;
  const ongoing = statusCol ? rowsFiltered.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'on going').length : 0;
  return { totalHours, currentMonthHours, riskMonthHours, pendingHours, paymentPendingHours, followupDue, yetToStart, ongoing };
}
type PmStatKey = keyof ReturnType<typeof computeStatsFor>;

// Every metric higher management wants available on a PM card — which ones
// show is driven by the page's Low/Medium/Full Show Data level (see
// pmCardFields in the component below) instead of an explicit picker.
const PM_CARD_METRIC_DEFS: { key: PmStatKey; label: string; color: string; isHours: boolean }[] = [
  { key: 'totalHours', label: 'Total', color: '#2563eb', isHours: true },
  { key: 'currentMonthHours', label: 'Current', color: '#0891b2', isHours: true },
  { key: 'riskMonthHours', label: 'Risk', color: '#dc2626', isHours: true },
  { key: 'pendingHours', label: 'Pending', color: '#d97706', isHours: true },
  { key: 'paymentPendingHours', label: 'Pay Pending', color: '#dc2626', isHours: true },
  { key: 'followupDue', label: 'Follow-up Due', color: '#7c3aed', isHours: false },
  { key: 'yetToStart', label: 'Project Yet To Start', color: '#dc2626', isHours: false },
  { key: 'ongoing', label: 'Project Ongoing', color: '#16a34a', isHours: false },
];

// PM workload badge — bands on raw Total Hours (not a rate, not net of
// current-month progress; deliberately simple per explicit request).
function pmWorkloadStatus(totalHours: number): { label: string; bg: string } {
  if (totalHours < 100) return { label: 'Available', bg: '#22c55e' };
  if (totalHours < 250) return { label: 'Partially Available', bg: '#f59e0b' };
  if (totalHours < 350) return { label: 'Partially Occupied', bg: '#f59e0b' };
  if (totalHours < 450) return { label: 'Occupied', bg: '#f97316' };
  return { label: 'Overload', bg: '#dc2626' };
}

// Same idea, but for populating the H/M dropdowns when opening a cell to edit.
function toHMLiteral(val: string): { h: number; m: number } {
  const trimmed = val.trim();
  if (!trimmed) return { h: 0, m: 0 };
  if (trimmed.includes('.')) return parseHHMM(trimmed);
  const h = parseInt(trimmed, 10);
  return { h: isNaN(h) ? 0 : h, m: 0 };
}

function PmDurationCell({ value, editable, onSave }: {
  value: string; editable: boolean; onSave: (v: string) => Promise<void>;
}) {
  const { h, m } = toHMLiteral(value);
  const [saving, setSaving] = useState(false);

  const commit = async (newH: number, newM: number) => {
    setSaving(true);
    try { await onSave(formatHHMM(newH, newM)); } finally { setSaving(false); }
  };

  if (!editable) {
    return <span className="whitespace-nowrap" style={{ color: 'var(--cn-text-secondary)' }}>{value.trim() ? formatHHMM(h, m) : '—'}</span>;
  }

  const selectStyle = { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' };

  return (
    <div className="flex items-center gap-1">
      <select value={h} onChange={e => commit(Number(e.target.value), m)} disabled={saving}
        className="text-xs rounded px-1.5 py-1 focus:outline-none disabled:opacity-60 cursor-pointer" style={selectStyle}>
        {PM_HOUR_OPTIONS.map(o => <option key={o} value={o}>{String(o).padStart(2, '0')}</option>)}
      </select>
      <span style={{ color: 'var(--cn-text-muted)' }}>.</span>
      <select value={m} onChange={e => commit(h, Number(e.target.value))} disabled={saving}
        className="text-xs rounded px-1.5 py-1 focus:outline-none disabled:opacity-60 cursor-pointer" style={selectStyle}>
        {DURATION_MINUTE_OPTIONS.map(o => <option key={o} value={o}>{String(o).padStart(2, '0')}</option>)}
      </select>
      {saving && <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: 'var(--cn-accent)' }} />}
    </div>
  );
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Canonical dropdown lists, matching the sheet's actual data-validation
// options — unioned with whatever's already in the data as a safety net
// for values outside the current list (older entries, list not updated yet, etc.)
const DEPARTMENT_OPTIONS = ['Web', 'Marketing'];
const YEAR_OPTIONS = ['2026', '2025'];
const STATUS_OPTIONS = [
  'Yet to Start', 'In Progress', 'Initial setup', 'On Going', 'Paused by client',
  'Paused by Cybernext', 'Escalated', 'Completed', 'Submitted - waiting for feedback',
  'Closed: Without feedback', 'Closed: Good Feedback', 'Closed: Bad Feedback', 'Move to Next Month',
];
const PHASE_OPTIONS = ['Initial Setup', 'Design', 'Development', 'Testing', 'Maintenance', 'Ongoing Optimization', 'Need Based Support'];
const MILESTONES_OPTIONS = ['No Action Taken'];
const UPSELL_OPTIONS = ['No Action Taken', 'Upsell', 'Cross-Sell'];
const PAYMENT_STATUS_OPTIONS = ['No Action Taken', 'Pending', 'Done', 'On Hold', 'QA_Done', 'Not Started Yet', 'In Progress', 'Automated Payment'];
const ASSIGNED_OPTIONS = ['Atul', 'Shiwangi', 'Dheeraj', 'Anjali', 'Anurag', 'Vansh', 'Akshay', 'Kshitij', 'Bhavya', 'Payal', 'Akanksha', 'Akash'];

const CHEVRON_WHITE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`;
const CHEVRON_MUTED = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`;

// Dropdown cell — for known enum-ish columns (Department, Year, Month,
// Status, Phase). Always shows an editable select directly (matching the
// Tasks Assigned table's Task Status/PM Status dropdowns), not a
// click-to-reveal control. Options are the sheet's canonical list plus
// anything else already in the data.
function SelectCell({ value, colored, editable, options, onSave }: {
  value: string; colored: boolean; editable: boolean; options: string[]; onSave: (v: string) => Promise<void>;
}) {
  const [current, setCurrent] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (!saving) setCurrent(value); }, [value, saving]);

  if (!editable) {
    return colored ? (
      <span className="inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: statusColor(value), color: '#fff' }}>
        {value || 'No Action Taken'}
      </span>
    ) : (
      <span className="whitespace-nowrap" style={{ color: 'var(--cn-text-secondary)' }}>{value || '—'}</span>
    );
  }

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVal = e.target.value;
    setCurrent(newVal);
    setSaving(true);
    setSaved(false);
    try {
      await onSave(newVal);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setCurrent(value);
    } finally {
      setSaving(false);
    }
  };

  const opts = options.includes(current) || !current ? options : [current, ...options];

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={current}
        onChange={handleChange}
        disabled={saving}
        className={colored
          ? 'text-xs font-semibold rounded-full pl-2.5 pr-7 py-1 border-0 focus:outline-none cursor-pointer disabled:opacity-60 transition-colors appearance-none'
          : 'text-xs font-medium rounded-full pl-2.5 pr-7 py-1 border focus:outline-none cursor-pointer disabled:opacity-60 transition-colors appearance-none'}
        style={colored
          ? { backgroundColor: statusColor(current), color: '#fff', minWidth: '110px', backgroundImage: CHEVRON_WHITE, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }
          : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)', minWidth: '100px', backgroundImage: CHEVRON_MUTED, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
      >
        {!current && <option value="">—</option>}
        {opts.map(o => (
          <option key={o} value={o} style={colored ? { background: '#1a1a1a', color: '#fff' } : undefined}>{o}</option>
        ))}
      </select>
      {saving && <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: 'var(--cn-accent)' }} />}
      {saved && <span className="text-xs shrink-0" style={{ color: '#22c55e' }}>✓</span>}
    </div>
  );
}

// Month filter — same look/behavior as the shared MultiSelect, but the
// option list is visually split into Upcoming/Current/Previous relative to
// today's real calendar month (kept local to this file rather than
// extending the shared MultiSelect, so Tasks Assigned's use of it is
// untouched).
function MonthMultiSelect({ options, selected, onChange }: {
  options: string[]; selected: string[]; onChange: (vals: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const currentIdx = MONTH_ORDER[new Date().toLocaleString('en-US', { month: 'long' }).toLowerCase()] ?? 0;
  const groups = [
    { label: 'Upcoming Months', opts: options.filter(o => (MONTH_ORDER[o.toLowerCase()] ?? 0) > currentIdx) },
    { label: 'Current Month', opts: options.filter(o => (MONTH_ORDER[o.toLowerCase()] ?? 0) === currentIdx) },
    { label: 'Previous Months', opts: options.filter(o => (MONTH_ORDER[o.toLowerCase()] ?? 0) < currentIdx && (MONTH_ORDER[o.toLowerCase()] ?? 0) > 0) },
  ].filter(g => g.opts.length > 0);

  const isActive = selected.length > 0 && selected.length < options.length;
  const btnLabel = selected.length === 0
    ? 'All'
    : selected.length === options.length
    ? 'All'
    : selected.length === 1
    ? selected[0]
    : `${selected.length} selected`;

  const toggle = (val: string) =>
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);

  return (
    <div ref={ref} className="relative flex flex-col gap-1 w-full sm:w-auto sm:min-w-[150px]">
      <label style={{ color: 'var(--cn-text-muted)' }} className="text-xs font-medium">Month</label>
      <button
        onClick={() => setOpen(o => !o)}
        style={!isActive ? { background: 'var(--cn-bg-input)', borderColor: 'var(--cn-border)', color: 'var(--cn-text-primary)' } : undefined}
        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm border transition-colors w-full ${
          isActive ? 'bg-[#FE4A23]/20 border-[#FE4A23] text-[#FE4A23]' : 'hover:border-[#FE4A23]'
        }`}
      >
        <span className="truncate">{btnLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div style={{ background: 'var(--cn-bg-dropdown)', borderColor: 'var(--cn-border)', boxShadow: '0 4px 16px rgba(0,0,0,0.30)' }}
          className="absolute top-full left-0 mt-1 w-[min(16rem,90vw)] border rounded-md z-50 flex flex-col max-h-80">
          <div style={{ borderColor: 'var(--cn-border)' }} className="flex gap-3 px-3 py-1.5 border-b shrink-0">
            <button onClick={() => onChange(options)} className="text-xs text-[#FE4A23] hover:opacity-80 transition-opacity">Select all</button>
            <span style={{ color: 'var(--cn-border)' }}>·</span>
            <button onClick={() => onChange([])} style={{ color: 'var(--cn-text-muted)' }} className="text-xs hover:text-white transition-colors">Clear</button>
          </div>
          <div className="overflow-y-auto flex-1">
            {groups.length === 0 ? (
              <p style={{ color: 'var(--cn-text-faint)' }} className="text-xs text-center py-3">No options</p>
            ) : (
              groups.map(({ label, opts }) => (
                <div key={label}>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest sticky top-0" style={{ color: 'var(--cn-text-faint)', background: 'var(--cn-bg-dropdown)' }}>{label}</p>
                  {opts.map(opt => (
                    <label key={opt} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer"
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--cn-bg-input)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} className="rounded accent-[#FE4A23] cursor-pointer" />
                      <span style={{ color: 'var(--cn-text-primary)' }} className="text-sm truncate">{opt}</span>
                    </label>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  data: SheetData[];
  headers: string[];
  canEdit?: boolean;
  onCellChange?: (row: SheetData, colName: string, value: string) => Promise<void>;
  // Full unfiltered dataset (across every PM) used to build dropdown option
  // lists for Department/Year/Month/Status/Phase — falls back to `data`.
  allData?: SheetData[];
  // False for the "All Data" (historical-only) tab — defaulting its filters
  // to the real current month/year would show zero rows on first load,
  // since that tab never has current-month data.
  defaultToCurrentMonth?: boolean;
}

export default function PMProjectBandwidth({ data, headers, canEdit = false, onCellChange, allData, defaultToCurrentMonth = true }: Props) {
  const optionSourceData = allData ?? data;
  // Cells only become editable after clicking "Edit", same pattern as Tasks Assigned
  const [editMode, setEditMode] = useState(false);
  const isEditable = canEdit && editMode;
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  // Which table columns are shown — starts empty, then gets a real default
  // list applied once headers are known (see the showDataLevel effects
  // below); empty still means "all" as a manual-reset fallback (e.g. after
  // Clear). The Columns picker can still fine-tune on top of whichever
  // Low/Medium/Full preset is active.
  const [visibleCols, setVisibleCols] = useState<string[]>([]);
  // Tracks whether the user has actually touched the Columns picker —
  // no longer feeds a "hidden filters" badge (Columns is always visible
  // now), kept in case a future control needs to know.
  const [colsTouched, setColsTouched] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  // Single Low/Medium/Full control that governs both table column count and
  // how many stats show on each PM Summary card, replacing the separate
  // Columns-only default and the PM cards' own "Show More Data" picker.
  type ShowDataLevel = 'low' | 'medium' | 'full';
  const [showDataLevel, setShowDataLevel] = useState<ShowDataLevel>('medium');

  const projectCol = headers.find(h => h.toLowerCase().includes('project name'));
  const clientCol = headers.find(h => h.toLowerCase().includes('client'));
  const yearCol = headers.find(h => h.toLowerCase() === 'year');
  const monthCol = headers.find(h => h.toLowerCase() === 'month');
  const emailCol = headers.find(h => h.toLowerCase().includes('email'));
  const timestampCol = headers.find(h => h.toLowerCase().includes('timestamp'));
  const departmentCol = headers.find(h => h.toLowerCase() === 'department');
  const statusCol = headers.find(h => h.toLowerCase() === 'status');
  const phaseCol = headers.find(h => h.toLowerCase() === 'phase');
  const milestonesCol = headers.find(h => h.toLowerCase().includes('upcoming milestones'));
  const upsellCol = headers.find(h => h.toLowerCase().includes('upsell'));
  const paymentStatusCol = headers.find(h => h.toLowerCase().includes('payment status'));
  const assignedCol = headers.find(h => h.toLowerCase() === 'assigned');
  const totalHoursCol = headers.find(h => h.toLowerCase() === 'total hours');
  const currentMonthHoursCol = headers.find(h => h.toLowerCase() === 'current month hours');
  const riskMonthHoursCol = headers.find(h => h.toLowerCase() === 'risk month hours');
  const followupDateCol = headers.find(h => h.toLowerCase().includes('follow-up date') || h.toLowerCase().includes('followup date'));
  const commentsCol = headers.find(h => h.toLowerCase().includes('comment'));
  const showPmCol = data.some(r => r['__pm']);
  const isDurationCol = (h: string) => h === totalHoursCol || h === currentMonthHoursCol || h === riskMonthHoursCol;
  // Timestamp/Email stay usable for sorting & filtering but aren't shown as table columns
  const tableCols = headers.filter(h => h !== timestampCol && h !== emailCol);

  // Show Data default, applied once per tab: All Projects (read-only,
  // !canEdit) starts at Medium since the table is shared by every PM at
  // once; My Projects (canEdit) starts at Full since it's a PM's own, much
  // smaller, editable list. Keyed by canEdit (not a plain once-ever flag)
  // since both tabs share this same component instance — switching tabs
  // must re-apply the right default level. The user can still override
  // with the Low/Medium/Full button within either tab.
  const levelDefaultApplied = useRef<boolean | null>(null);
  useEffect(() => {
    if (levelDefaultApplied.current === canEdit || !headers.length) return;
    levelDefaultApplied.current = canEdit;
    setShowDataLevel(canEdit ? 'full' : 'medium');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers.length, canEdit]);

  // Column presets per level — Low is a bare-minimum glance, Medium is the
  // previous curated default, Full is every column.
  const colLevelPresets = useMemo<Record<ShowDataLevel, string[]>>(() => ({
    low: [projectCol, clientCol, totalHoursCol, statusCol].filter((c): c is string => !!c),
    medium: [
      departmentCol, projectCol, clientCol, totalHoursCol,
      statusCol, currentMonthHoursCol, paymentStatusCol, followupDateCol,
    ].filter((c): c is string => !!c),
    full: tableCols,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [projectCol, clientCol, totalHoursCol, statusCol, departmentCol, currentMonthHoursCol, paymentStatusCol, followupDateCol, tableCols]);

  // Re-applies whenever the level changes (button click or the per-tab
  // default above) — manual Columns picker edits in between still work,
  // they just get reset back to the preset on the next level change.
  useEffect(() => {
    if (!headers.length) return;
    setVisibleCols(colLevelPresets[showDataLevel]);
    setColsTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDataLevel, headers.length]);

  // PM Summary card fields per level — Low is Total/Pending, Medium adds
  // Current in between, Full is every metric.
  const PM_FIELDS_LOW = ['Total', 'Pending'];
  const PM_FIELDS_MEDIUM = ['Total', 'Current', 'Pending'];
  const pmCardFields = showDataLevel === 'low' ? PM_FIELDS_LOW : showDataLevel === 'medium' ? PM_FIELDS_MEDIUM : PM_CARD_METRIC_DEFS.map(d => d.label);

  // Dropdown columns — canonical lists (matching the sheet's actual data
  // validation) unioned with anything already in the data, so a value that
  // predates or falls outside the current list still shows up
  const dropdownOptions = useMemo(() => {
    const withExtras = (col: string | undefined, canonical: string[]) => {
      if (!col) return canonical;
      const extras = [...new Set(optionSourceData.map(r => String(r[col] ?? '').trim()).filter(Boolean))]
        .filter(v => !canonical.includes(v));
      return [...canonical, ...extras.sort()];
    };
    const opts: Record<string, string[]> = {};
    if (departmentCol) opts[departmentCol] = withExtras(departmentCol, DEPARTMENT_OPTIONS);
    if (statusCol) opts[statusCol] = withExtras(statusCol, STATUS_OPTIONS);
    if (phaseCol) opts[phaseCol] = withExtras(phaseCol, PHASE_OPTIONS);
    if (yearCol) {
      const years = new Set([...YEAR_OPTIONS, ...withExtras(yearCol, YEAR_OPTIONS)]);
      years.add(String(new Date().getFullYear()));
      opts[yearCol] = [...years].sort((a, b) => Number(b) - Number(a));
    }
    if (monthCol) opts[monthCol] = MONTH_NAMES;
    if (milestonesCol) opts[milestonesCol] = withExtras(milestonesCol, MILESTONES_OPTIONS);
    if (upsellCol) opts[upsellCol] = withExtras(upsellCol, UPSELL_OPTIONS);
    if (paymentStatusCol) opts[paymentStatusCol] = withExtras(paymentStatusCol, PAYMENT_STATUS_OPTIONS);
    if (assignedCol) opts[assignedCol] = withExtras(assignedCol, ASSIGNED_OPTIONS);
    return opts;
  }, [optionSourceData, departmentCol, statusCol, phaseCol, yearCol, monthCol, milestonesCol, upsellCol, paymentStatusCol, assignedCol]);
  const isDropdownCol = (h: string) =>
    h === departmentCol || h === yearCol || h === monthCol || h === statusCol || h === phaseCol ||
    h === milestonesCol || h === upsellCol || h === paymentStatusCol || h === assignedCol;

  const filterCols = useMemo(
    () => ([
      showPmCol ? { col: '__pm', label: 'PM' } : null,
      projectCol ? { col: projectCol, label: 'Project' } : null,
      clientCol ? { col: clientCol, label: 'Client' } : null,
      yearCol ? { col: yearCol, label: 'Year' } : null,
      monthCol ? { col: monthCol, label: 'Month' } : null,
      statusCol ? { col: statusCol, label: 'Status' } : null,
      phaseCol ? { col: phaseCol, label: 'Phase' } : null,
      milestonesCol ? { col: milestonesCol, label: 'Upcoming Milestones' } : null,
      upsellCol ? { col: upsellCol, label: 'Upsell/Cross-Sell' } : null,
      paymentStatusCol ? { col: paymentStatusCol, label: 'Payment Status' } : null,
    ].filter((c): c is { col: string; label: string } => c !== null)),
    [showPmCol, projectCol, clientCol, yearCol, monthCol, statusCol, phaseCol, milestonesCol, upsellCol, paymentStatusCol]
  );
  // PM/Project/Client/Year/Month stay always visible; the rest collapse
  // behind "More Filters" so the primary bar doesn't grow unbounded.
  const secondaryFilterCols = filterCols.filter(({ col }) => col === statusCol || col === phaseCol || col === milestonesCol || col === upsellCol || col === paymentStatusCol);
  const primaryFilterCols = filterCols.filter(fc => !secondaryFilterCols.includes(fc));
  const secondaryActiveCount = secondaryFilterCols.filter(({ col }) => (filters[col] ?? []).length > 0).length;

  // Faceted: each dropdown's options reflect rows matching every OTHER active
  // filter, so e.g. picking Year 2026 narrows Month/Project/Client to values
  // that actually occur in 2026
  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    filterCols.forEach(({ col }) => {
      // Status/Phase/Upcoming Milestones/Upsell/Payment Status are fixed
      // dropdown fields — always offer the full canonical list (same one
      // the edit cells use), not just whatever values happen to occur in
      // the currently-faceted rows, so an unused status is still pickable.
      if (col === statusCol || col === phaseCol || col === milestonesCol || col === upsellCol || col === paymentStatusCol) {
        opts[col] = dropdownOptions[col] ?? [];
        return;
      }
      const rows = data.filter(r =>
        filterCols.every(({ col: otherCol }) => {
          if (otherCol === col) return true;
          const selected = filters[otherCol] ?? [];
          if (selected.length === 0) return true;
          return selected.includes(String(r[otherCol] ?? '').trim());
        })
      );
      const vals = [...new Set(rows.map(r => String(r[col] ?? '').trim()).filter(Boolean))];
      opts[col] = col === yearCol
        ? vals.sort((a, b) => Number(b) - Number(a))
        : col === monthCol
        ? vals.sort((a, b) => (MONTH_ORDER[b.toLowerCase()] ?? 0) - (MONTH_ORDER[a.toLowerCase()] ?? 0))
        : vals.sort();
    });
    return opts;
  }, [data, filterCols, filters, yearCol, monthCol, statusCol, phaseCol, milestonesCol, upsellCol, paymentStatusCol, dropdownOptions]);

  // Default to the current Year/Month once, when they're available as filter
  // columns — skipped on the All Data tab (defaultToCurrentMonth=false),
  // which is historical-only and would show zero rows if pinned to now.
  const defaultsApplied = useRef(false);
  useEffect(() => {
    if (defaultsApplied.current || !yearCol || !monthCol || !defaultToCurrentMonth) return;
    defaultsApplied.current = true;
    const now = new Date();
    setFilters(prev => ({
      ...prev,
      [yearCol]: [String(now.getFullYear())],
      [monthCol]: [now.toLocaleString('en-US', { month: 'long' })],
    }));
  }, [yearCol, monthCol]);

  const filtered = useMemo(() => {
    let rows = data;
    filterCols.forEach(({ col }) => {
      const selected = filters[col] ?? [];
      if (selected.length > 0) rows = rows.filter(r => selected.includes(String(r[col] ?? '').trim()));
    });
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      rows = rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(term)));
    }
    return rows;
  }, [data, filters, filterCols, searchTerm]);

  // Top KPI cards and PM summary cards now share the same filtered rows as
  // the table below — every bottom-bar filter (PM/Project/Client/Year/
  // Month/Status/.../search) affects them too. Year/Month default to the
  // real current month/year on first load (see defaultsApplied above), so
  // out of the box this still reads as a current-month snapshot; picking a
  // different Year/Month/PM/etc. now updates these cards to match. Yet To
  // Start is the one exception — it deliberately ignores every filter, see
  // computeStatsFor.
  const statsCols = { totalHoursCol, currentMonthHoursCol, riskMonthHoursCol, paymentStatusCol, followupDateCol, statusCol };
  const stats = useMemo(
    () => computeStatsFor(filtered, data, statsCols),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, filtered, totalHoursCol, currentMonthHoursCol, riskMonthHoursCol, paymentStatusCol, followupDateCol, statusCol]
  );

  // Per-PM summary cards — only meaningful when this view spans more than
  // one PM (the All Projects tab; My Projects is always a single PM
  // already). That "can this view ever have multiple PMs" check has to run
  // against the full unfiltered data, not the filtered rows — otherwise
  // narrowing a filter down to a single PM's projects (very easy to do)
  // made the whole section disappear instead of just showing that one card.
  // Only PMs actually present in the filtered rows get a card, so e.g.
  // filtering to one Project doesn't clutter the row with 0h cards for PMs
  // who have nothing in it.
  const pmSummaries = useMemo(() => {
    if (!showPmCol) return [];
    const allNames = new Set(data.map(r => String(r['__pm'] ?? '').trim()).filter(Boolean));
    if (allNames.size <= 1) return [];
    const names = [...new Set(filtered.map(r => String(r['__pm'] ?? '').trim()).filter(Boolean))].sort();
    return names.map(name => ({
      name,
      ...computeStatsFor(
        filtered.filter(r => String(r['__pm'] ?? '').trim() === name),
        data.filter(r => String(r['__pm'] ?? '').trim() === name),
        statsCols
      ),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filtered, showPmCol, totalHoursCol, currentMonthHoursCol, riskMonthHoursCol, paymentStatusCol, followupDateCol, statusCol]);

  const fmtHours = (n: number) => `${Math.round(n * 10) / 10}h`;

  // Default: newest project period first (Year desc, then calendar Month desc,
  // then Timestamp desc as a tiebreaker); any clicked column overrides this.
  const sorted = useMemo(() => {
    if (!sortCol) {
      return [...filtered].sort((a, b) => {
        const yd = yearCol ? Number(b[yearCol] ?? 0) - Number(a[yearCol] ?? 0) : 0;
        if (yd !== 0) return yd;
        const md = monthCol
          ? (MONTH_ORDER[String(b[monthCol] ?? '').trim().toLowerCase()] ?? 0) - (MONTH_ORDER[String(a[monthCol] ?? '').trim().toLowerCase()] ?? 0)
          : 0;
        if (md !== 0) return md;
        return timestampCol ? parseTimestamp(String(b[timestampCol] ?? '')) - parseTimestamp(String(a[timestampCol] ?? '')) : 0;
      });
    }
    if (sortCol === totalHoursCol || sortCol === currentMonthHoursCol || sortCol === riskMonthHoursCol) {
      return [...filtered].sort((a, b) => {
        const av = parseDurationDecimal(a[sortCol]);
        const bv = parseDurationDecimal(b[sortCol]);
        return sortDir === 'asc' ? av - bv : bv - av;
      });
    }
    return [...filtered].sort((a, b) => {
      const av = a[sortCol] ?? '';
      const bv = b[sortCol] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [filtered, sortCol, sortDir, yearCol, monthCol, timestampCol, totalHoursCol, currentMonthHoursCol, riskMonthHoursCol]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageData = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('desc'); }
    setPage(1);
  };

  const handleFilter = (col: string, vals: string[]) => {
    setFilters(prev => ({ ...prev, [col]: vals }));
    setPage(1);
  };

  const activeFilterCount = Object.values(filters).filter(v => v.length > 0).length;
  const clearAll = () => { setFilters({}); setPage(1); };

  const visibleHeaders = visibleCols.length === 0 ? tableCols : tableCols.filter(h => visibleCols.includes(h));

  if (!headers.length) {
    return <div className="text-center py-12 text-sm" style={{ color: 'var(--cn-text-muted)' }}>No data available</div>;
  }

  const statCards = [
    { label: 'Total', value: fmtHours(stats.totalHours) },
    { label: 'Current', value: fmtHours(stats.currentMonthHours) },
    { label: 'Risk', value: fmtHours(stats.riskMonthHours) },
    { label: 'Pending', value: fmtHours(stats.pendingHours) },
    { label: 'Pay Pending', value: fmtHours(stats.paymentPendingHours) },
    { label: 'Follow-up Due', value: stats.followupDue },
    { label: 'Project Yet To Start', value: stats.yetToStart },
    { label: 'Project Ongoing', value: stats.ongoing },
  ];
  // Overview cards follow the same Low/Medium/Full ladder as everything
  // else: Low = the first 4 (Total/Current/Risk/Pending), Medium adds Pay
  // Pending + Follow-up Due (6), Full shows all 8.
  const statCardCounts: Record<ShowDataLevel, number> = { low: 4, medium: 6, full: 8 };
  const visibleStatCards = statCards.slice(0, statCardCounts[showDataLevel]);
  const statGridCols = showDataLevel === 'low'
    ? 'grid-cols-2 sm:grid-cols-4'
    : showDataLevel === 'medium'
      ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'
      : 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-8';

  return (
    <div className="space-y-4">
      <div className="sticky top-16 z-10 space-y-2 py-2 -mx-3 sm:-mx-6 px-3 sm:px-6 border-b" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
        <SearchFilter
          searchTerm={searchTerm}
          totalCount={data.length}
          filteredCount={filtered.length}
          onChange={val => { setSearchTerm(val); setPage(1); }}
        />

        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-2 sm:gap-3">
            {primaryFilterCols.map(({ col, label }) =>
              col === monthCol ? (
                <MonthMultiSelect
                  key={col}
                  options={filterOptions[col] ?? []}
                  selected={filters[col] ?? []}
                  onChange={vals => handleFilter(col, vals)}
                />
              ) : (
                <MultiSelect
                  key={col}
                  label={label}
                  options={filterOptions[col] ?? []}
                  selected={filters[col] ?? []}
                  onChange={vals => handleFilter(col, vals)}
                />
              )
            )}
            <MultiSelect
              label="Columns"
              options={tableCols}
              selected={visibleCols}
              onChange={vals => { setVisibleCols(vals); setColsTouched(true); setPage(1); }}
            />
            <div className="flex items-end">
              <button
                onClick={() => setShowMoreFilters(o => !o)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg cursor-pointer transition-all text-sm border"
                style={showMoreFilters || secondaryActiveCount > 0
                  ? { background: 'rgba(254,74,35,0.12)', borderColor: '#FE4A23', color: '#FE4A23' }
                  : { background: 'var(--cn-bg-input)', borderColor: 'var(--cn-border)', color: 'var(--cn-text-primary)' }}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                More Filters
                {secondaryActiveCount > 0 && (
                  <span className="text-[10px] font-bold px-1.5 rounded-full" style={{ background: '#FE4A23', color: '#fff' }}>{secondaryActiveCount}</span>
                )}
              </button>
            </div>
            {activeFilterCount > 0 && (
              <div className="flex items-end col-span-2 sm:col-span-1">
                <button
                  onClick={clearAll}
                  title={`Clear all ${activeFilterCount} filter(s)`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all text-xs font-medium"
                  style={{ background: 'var(--cn-bg-input)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
                >
                  <X className="w-3.5 h-3.5" />
                  Clear all ({activeFilterCount})
                </button>
              </div>
            )}
          </div>

          {showMoreFilters && (
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-2 sm:gap-3 p-3 rounded-lg" style={{ background: 'var(--cn-bg-input)', border: '1px solid var(--cn-border)' }}>
              {secondaryFilterCols.map(({ col, label }) => (
                <MultiSelect
                  key={col}
                  label={label}
                  options={filterOptions[col] ?? []}
                  selected={filters[col] ?? []}
                  onChange={vals => handleFilter(col, vals)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>Overview</p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: 'var(--cn-text-muted)' }}>Show Data</span>
            <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--cn-border)' }}>
              {(['low', 'medium', 'full'] as const).map(level => (
                <button
                  key={level}
                  onClick={() => setShowDataLevel(level)}
                  className="px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all capitalize"
                  style={showDataLevel === level
                    ? { background: 'var(--cn-accent)', color: '#fff' }
                    : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)' }}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
        <div className={`grid ${statGridCols} gap-px`} style={{ background: 'var(--cn-border)' }}>
          {visibleStatCards.map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-1.5 p-3" style={{ background: 'var(--cn-bg-card)' }}>
              <p className="text-[9px] font-semibold uppercase tracking-wide leading-tight" style={{ color: 'var(--cn-text-muted)' }}>{label}</p>
              <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--cn-text-primary)' }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {pmSummaries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>PM Summary</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {pmSummaries.map(pm => {
              const photo = memberPhoto(pm.name);
              const bg = memberColor(pm.name);
              const initials = pm.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
              const activeMetrics = PM_CARD_METRIC_DEFS.filter(d => pmCardFields.includes(d.label));
              // Low/Medium (2-3 fields) fit one row; Full (8 fields) wraps two-per-row.
              const metricsGridCols = showDataLevel === 'full' ? 'grid-cols-2' : showDataLevel === 'medium' ? 'grid-cols-3' : 'grid-cols-2';
              const workload = pmWorkloadStatus(pm.totalHours);
              return (
                <div key={pm.name} className="rounded-xl border overflow-hidden" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
                  <div className="flex items-center gap-2.5 px-3.5 pt-3.5 pb-3">
                    {photo ? (
                      <img src={photo} alt={pm.name} className="w-9 h-9 rounded-full object-cover shrink-0"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ background: `linear-gradient(135deg, ${bg}cc, ${bg}66)` }}>{initials}</div>
                    )}
                    <p className="text-sm font-semibold truncate min-w-0 flex-1" style={{ color: 'var(--cn-text-primary)' }}>{pm.name}</p>
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0" style={{ background: workload.bg + '22', color: workload.bg }}>
                      {workload.label}
                    </span>
                  </div>
                  {activeMetrics.length > 0 && (
                    <div className={`grid ${metricsGridCols} gap-px`} style={{ background: 'var(--cn-border)', borderTop: '1px solid var(--cn-border)' }}>
                      {activeMetrics.map(({ key, label, color, isHours }) => (
                        <div key={key} className="flex flex-col gap-1 px-3.5 py-2.5" style={{ background: 'var(--cn-bg-card)' }}>
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                            <span className="text-[9px] font-semibold uppercase tracking-wide leading-tight" style={{ color: 'var(--cn-text-muted)' }}>{label}</span>
                          </div>
                          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--cn-text-primary)' }}>
                            {isHours ? fmtHours(pm[key]) : pm[key]}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p style={{ color: 'var(--cn-text-muted)' }} className="text-sm">
          <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{sorted.length}</span> of {data.length} records
          {activeFilterCount > 0 && <span className="text-[#FE4A23]"> (filtered)</span>}
        </p>
        {canEdit && (
          <button
            onClick={() => setEditMode(m => !m)}
            title={editMode ? 'Stop editing' : 'Edit'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all text-xs font-semibold"
            style={editMode
              ? { background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }
              : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
          >
            <Pencil className="w-3.5 h-3.5" />
            {editMode ? 'Done Editing' : 'Edit'}
          </button>
        )}
      </div>

      <div style={{ borderColor: 'var(--cn-border)' }} className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs text-left">
          <thead>
            <tr style={{ background: 'var(--cn-bg-input)', borderColor: 'var(--cn-border)' }} className="border-b">
              <th style={{ color: 'var(--cn-text-muted)' }} className="px-4 py-2 font-semibold uppercase tracking-wide text-[10px] w-12">#</th>
              {showPmCol && (
                <th style={{ color: 'var(--cn-text-muted)' }} className="px-4 py-2 font-semibold uppercase tracking-wide text-[10px] min-w-[100px]">PM</th>
              )}
              {visibleHeaders.map(h => (
                <th
                  key={h}
                  onClick={() => handleSort(h)}
                  style={{ color: 'var(--cn-text-muted)' }}
                  className="px-4 py-2 font-semibold uppercase tracking-wide text-[10px] cursor-pointer hover:text-[var(--cn-text-primary)] select-none min-w-[120px]"
                >
                  <div className="flex items-center gap-1">
                    {h}
                    {sortCol === h ? (
                      sortDir === 'asc'
                        ? <ChevronUp className="w-3 h-3 text-[#FE4A23]" />
                        : <ChevronDown className="w-3 h-3 text-[#FE4A23]" />
                    ) : (
                      <ChevronsUpDown style={{ color: 'var(--cn-text-faint)' }} className="w-3 h-3" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 ? (
              <tr>
                <td colSpan={visibleHeaders.length + (showPmCol ? 2 : 1)} style={{ color: 'var(--cn-text-muted)' }} className="text-center py-12">
                  No records found
                </td>
              </tr>
            ) : (
              pageData.map((row, i) => (
                <tr
                  key={String(row['__id'] ?? i)}
                  style={{ backgroundColor: i % 2 === 0 ? 'var(--cn-bg-row-even)' : 'var(--cn-bg-row-odd)', borderColor: 'var(--cn-border-light)' }}
                  className="border-b transition-colors hover:bg-[var(--cn-bg-hover)]"
                >
                  <td style={{ color: 'var(--cn-text-faint)' }} className="px-4 py-2 tabular-nums">
                    {(currentPage - 1) * PAGE_SIZE + i + 1}
                  </td>
                  {showPmCol && (
                    <td style={{ color: 'var(--cn-text-primary)' }} className="px-4 py-2 font-medium">
                      {String(row['__pm'] ?? '')}
                    </td>
                  )}
                  {visibleHeaders.map(h => {
                    const val = String(row[h] ?? '');
                    const isUrl = h.toLowerCase().includes('url') || h.toLowerCase().includes('link');
                    return (
                      <td key={h} className={`px-4 py-2 ${isDropdownCol(h) || isStatusLikeCol(h) || isDateCol(h) || isDurationCol(h) ? 'whitespace-nowrap' : 'break-words min-w-[120px] max-w-xs'}`}>
                        {isUrl && val && !isEditable ? (
                          <a href={val} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: 'var(--cn-accent)' }}>{val}</a>
                        ) : isDropdownCol(h) ? (
                          <SelectCell
                            value={val}
                            colored={isStatusLikeCol(h)}
                            editable={isEditable && !!onCellChange}
                            options={dropdownOptions[h] ?? []}
                            onSave={async v => { if (onCellChange) await onCellChange(row, h, v); }}
                          />
                        ) : isDateCol(h) ? (
                          <DateCell
                            value={val}
                            editable={isEditable && !!onCellChange}
                            onSave={async v => { if (onCellChange) await onCellChange(row, h, v); }}
                          />
                        ) : isDurationCol(h) ? (
                          <PmDurationCell
                            value={val}
                            editable={isEditable && !!onCellChange}
                            onSave={async v => { if (onCellChange) await onCellChange(row, h, v); }}
                          />
                        ) : (
                          <EditableCell
                            value={val}
                            colored={isStatusLikeCol(h)}
                            editable={isEditable && !!onCellChange}
                            onSave={async v => { if (onCellChange) await onCellChange(row, h, v); }}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ color: 'var(--cn-text-muted)' }} className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            title="Previous"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--cn-bg-input)', border: '1px solid var(--cn-border)', color: 'var(--cn-text-muted)' }}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span style={{ color: 'var(--cn-text-faint)' }} className="text-xs">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            title="Next"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--cn-bg-input)', border: '1px solid var(--cn-border)', color: 'var(--cn-text-muted)' }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
