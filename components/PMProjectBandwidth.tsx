'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, X, ChevronLeft, ChevronRight, Pencil, SlidersHorizontal } from 'lucide-react';
import { SheetData } from '@/lib/googleSheets';
import { MultiSelect } from './FilteredDataTable';
import { parseHHMM, formatHHMM, hhmmToDecimalHours, DURATION_MINUTE_OPTIONS, formatHoursClock } from './SpecificCharts';
import { memberPhoto, memberColor } from '@/lib/memberColors';
import ClampedText from './ClampedText';

const PAGE_SIZE = 50;
const FOLLOWUP_DUE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days since last follow-up counts as due

// Synthetic table column — Pending Hours isn't a raw sheet column (it's
// Total Hours minus Current Month Hours (only for rows that countsAsCurrent
// — computed same as the Overview/PM Summary figure), so it's rendered as an extra always-read-only column
// rather than a real header, the same way the PM column already is.
const PENDING_HOURS_COL = '__pendingHours';

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
export function statusColor(value: string): string {
  const lower = value.trim().toLowerCase();
  if (!lower) return '#6b7280';
  return STATUS_KEYWORD_COLORS.find(([kw]) => lower.includes(kw))?.[1] ?? '#6b7280';
}
const isStatusLikeCol = (h: string) => {
  const l = h.toLowerCase();
  // "Upsell/Cross-Sell" is the dropdown; the newer plain "Upsell" column is
  // free text and must not get a coloured status pill.
  return l.includes('status') || l.includes('cross-sell');
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
    // Free-text fields (Comments, Client Name, etc.) need to wrap within
    // the cell's own max-w-xs — nowrap here was forcing the whole row
    // wider instead, pushing long text outside the table.
    <span className="break-words" style={{ color: 'var(--cn-text-secondary)' }}>{value || '—'}</span>
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
// Whole-word match — a bare substring test also caught "Project Progress
// Up-DATE", which is free text, not a calendar date.
const isDateCol = (h: string) => /\bdate\b/i.test(h);

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

// Total Hours / AC Hours / Current Month Hours / Risk Month Hours — HH.MM dropdown
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

// A row's Current Month Hours only count as Current (and so only come off
// Pending Hours) when BOTH hold:
//  1. its Status has moved past active work — completed, paused,
//     escalated, closed, handed back for feedback, rolled to next month.
//     Any other Status (On Going, In Progress, Yet to Start, Initial
//     setup, No Action Taken, blank) means the work is still live.
//  2. its Payment Status is actually paid — Done, Automated Payment, or
//     Direct Billing. A settled project that's still unpaid (No Action
//     Taken, Pending, On Hold, QA_Done, Not Started Yet, In Progress,
//     Ongoing) stays in Pending.
const SETTLED_STATUSES = [
  'completed', 'paused by client', 'paused by cybernext', 'escalated',
  'submitted - waiting for feedback', 'closed: without feedback',
  'closed: good feedback', 'closed: bad feedback', 'move to next month', 'on hold',
];
const PAID_PAYMENT_STATUSES = ['done', 'automated payment', 'direct billing'];

// Free-text columns that get a multi-line box in the My Projects edit popup.
const LONG_TEXT_COLS = [
  'payment details', 'week1', 'week2', 'week3', 'week4', 'week5', 'monthly', 'checklist',
  'project progress update', 'upsell', 'escalation',
  'client feedback', 'resource feedback', 'problems - next month needs',
];

// Unchecked by default in the Columns picker on Current Month, Previous
// Months and My Projects alike (lowercase header names).
// Week1-Week5 are the weekly report columns (filled in via Generate Report);
// the older single-purpose report column names are kept in case a sheet
// still has them.
const ALWAYS_DEFAULT_HIDDEN_COLS = [
  'week1', 'week2', 'week3', 'week4', 'week5', 'monthly', 'checklist',
  'project progress update', 'upsell', 'escalation', 'client feedback',
  'resource feedback', 'problems - next month needs',
];

// Columns left unchecked by default in My Projects (lowercase header names).
const MY_PROJECTS_DEFAULT_HIDDEN_COLS = [
  'department', 'year', 'month', 'client name', 'communication channel', 'tech',
  'assigned', 'milestone', 'risk month hours', 'upcoming milestones',
  'project start date', 'target end date',
];
function countsAsCurrent(row: SheetData, statusCol?: string, paymentStatusCol?: string): boolean {
  if (statusCol && !SETTLED_STATUSES.includes(String(row[statusCol] ?? '').trim().toLowerCase())) return false;
  if (paymentStatusCol && !PAID_PAYMENT_STATUSES.includes(String(row[paymentStatusCol] ?? '').trim().toLowerCase())) return false;
  return true;
}

// Shared by the overall KPI cards and each per-PM summary card — same
// formulas, just scoped to a different row set.
function computeStatsFor(
  rowsFiltered: SheetData[],
  cols: {
    totalHoursCol?: string; currentMonthHoursCol?: string; riskMonthHoursCol?: string;
    paymentStatusCol?: string; followupDateCol?: string; statusCol?: string;
  }
) {
  const { totalHoursCol, currentMonthHoursCol, riskMonthHoursCol, paymentStatusCol, followupDateCol, statusCol } = cols;
  const totalHours = totalHoursCol ? rowsFiltered.reduce((s, r) => s + parseDurationDecimal(r[totalHoursCol]), 0) : 0;
  // Only rows that countsAsCurrent (settled Status AND paid Payment Status)
  // contribute their Current Month Hours.
  const currentMonthHoursRaw = currentMonthHoursCol
    ? rowsFiltered.reduce((s, r) => {
        if (!countsAsCurrent(r, statusCol, paymentStatusCol)) return s;
        return s + parseDurationDecimal(r[currentMonthHoursCol]);
      }, 0)
    : 0;
  const riskMonthHours = riskMonthHoursCol ? rowsFiltered.reduce((s, r) => s + parseDurationDecimal(r[riskMonthHoursCol]), 0) : 0;
  // Current Month Hours nets out the at-risk portion of the month — it's
  // the sum actually secured, not the raw logged total. Pending Hours then
  // cascades off this adjusted figure, not the raw one.
  const currentMonthHours = currentMonthHoursRaw - riskMonthHours;
  const pendingHours = totalHours - currentMonthHours;
  const followupDue = followupDateCol
    ? rowsFiltered.filter(r => {
        const raw = String(r[followupDateCol] ?? '').trim();
        if (!raw) return true; // never followed up — counts as due
        const t = parseTimestamp(raw);
        return t === 0 || (Date.now() - t) > FOLLOWUP_DUE_MS;
      }).length
    : 0;
  const ongoing = statusCol ? rowsFiltered.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'in progress').length : 0;
  // Same bandwidth-formula ceiling as the workload badge (pmWorkloadStatus)
  // below — how much headroom is left before Total Hours tips into Overload.
  const availableHours = Math.max(0, PM_BANDWIDTH_CAPACITY - totalHours);
  return { totalHours, availableHours, currentMonthHours, riskMonthHours, pendingHours, followupDue, ongoing };
}
type PmStatKey = keyof ReturnType<typeof computeStatsFor>;

// Every metric higher management wants available on a PM card — which ones
// show is driven by the page's Low/Medium/Full Show Data level (see
// pmCardFields in the component below) instead of an explicit picker.
// Risk Month Hours is deliberately not shown here — it still feeds the
// Current Month Hours net calculation above, just isn't surfaced as its own
// card anywhere on Overview/PM Summary per request.
// Label text pulled into a constant since it's compared against by string in
// several field-list/lookup spots below — keeps them all in sync.
const AVAILABLE_LABEL = 'Bandwidth';
const PM_CARD_METRIC_DEFS: { key: PmStatKey; label: string; color: string; isHours: boolean }[] = [
  { key: 'totalHours', label: 'Total', color: '#2563eb', isHours: true },
  { key: 'availableHours', label: AVAILABLE_LABEL, color: '#22c55e', isHours: true },
  { key: 'currentMonthHours', label: 'Current', color: '#0891b2', isHours: true },
  { key: 'pendingHours', label: 'Pending', color: '#d97706', isHours: true },
  { key: 'followupDue', label: 'Follow-up Due', color: '#7c3aed', isHours: false },
  { key: 'ongoing', label: 'Project Ongoing', color: '#16a34a', isHours: false },
];
// Medium/Full are identical between Overview and PM Summary; Low differs —
// Overview's Low still gives a fuller glance (4 fields) since it's one
// company-wide snapshot, while PM Summary's Low is deliberately bare (2
// fields) since it repeats per PM card.
const LEVEL_FIELDS_SHARED: Record<'medium' | 'full', string[]> = {
  medium: ['Total', AVAILABLE_LABEL, 'Current', 'Pending'],
  full: PM_CARD_METRIC_DEFS.map(d => d.label),
};
const LEVEL_FIELDS_OVERVIEW: Record<'low' | 'medium' | 'full', string[]> = {
  low: ['Total', AVAILABLE_LABEL, 'Current', 'Pending'],
  ...LEVEL_FIELDS_SHARED,
};
const LEVEL_FIELDS_PM: Record<'low' | 'medium' | 'full', string[]> = {
  low: ['Total', AVAILABLE_LABEL],
  ...LEVEL_FIELDS_SHARED,
};

// Bandwidth-formula ceiling — same 300h threshold pmWorkloadStatus already
// bands Overload at. Available Hours = how much headroom is left under it.
const PM_BANDWIDTH_CAPACITY = 300;

// PM workload badge — bands on raw Total Hours (not a rate, not net of
// current-month progress; deliberately simple per explicit request).
function pmWorkloadStatus(totalHours: number): { label: string; bg: string } {
  if (totalHours < 100) return { label: 'Available', bg: '#22c55e' };
  if (totalHours < 180) return { label: 'Partially Available', bg: '#f59e0b' };
  if (totalHours < 230) return { label: 'Partially Occupied', bg: '#f59e0b' };
  if (totalHours < PM_BANDWIDTH_CAPACITY) return { label: 'Occupied', bg: '#f97316' };
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
const YEAR_OPTIONS = ['2027', '2026', '2025'];
const STATUS_OPTIONS = [
  'No Action Taken', 'Yet to Start', 'In Progress', 'Initial setup', 'On Going', 'Paused by client',
  'Paused by Cybernext', 'Escalated', 'Completed', 'Submitted - waiting for feedback',
  'Closed: Without feedback', 'Closed: Good Feedback', 'Closed: Bad Feedback', 'Move to Next Month', 'On Hold',
];
const PHASE_OPTIONS = ['No Action Taken', 'Requirement Gathering', 'Design', 'Development', 'QA', 'Deployed', 'Marketing', 'Maintenance', 'Retainer', 'On Hold', 'Completed', 'Design + Dev'];
const UPSELL_OPTIONS = ['No Action Taken', 'Upsell', 'Cross-Sell'];
const PAYMENT_STATUS_OPTIONS = ['No Action Taken', 'Pending', 'Done', 'On Hold', 'QA_Done', 'Not Started Yet', 'In Progress', 'Ongoing', 'Automated Payment', 'Direct Billing'];
const ASSIGNED_OPTIONS = ['No Action Taken', 'Akash', 'Pawan', 'Dhruv', 'Robin', 'Shubham', 'Lovepreet', 'Atul', 'Anjali', 'Dheeraj', 'Shiwangi', 'Anurag', 'Vansh', 'Manas', 'Akshay', 'Kshitij', 'Bhavya', 'Payal', 'Akanksha'];

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

// Multi-select checkbox dropdown — for "Assigned", which (unlike every
// other dropdown-ish column here) holds several comma-separated names at
// once, e.g. "Dhruv, Robin, Shubham", matching the sheet's own multi-select
// chip column. A plain single-value <select> would silently drop every
// name but the one picked, so this stores/writes back the full
// comma-joined list instead.
function MultiSelectCell({ value, editable, options, onSave }: {
  value: string; editable: boolean; options: string[]; onSave: (v: string) => Promise<void>;
}) {
  const parseSelected = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean);
  const [selected, setSelected] = useState<string[]>(() => parseSelected(value));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!saving) setSelected(parseSelected(value)); }, [value, saving]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!editable) {
    return <span className="whitespace-nowrap" style={{ color: 'var(--cn-text-secondary)' }}>{value || '—'}</span>;
  }

  const commit = async (next: string[]) => {
    const prev = selected;
    setSelected(next);
    setSaving(true);
    setSaved(false);
    try {
      await onSave(next.join(', '));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSelected(prev);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (opt: string) => {
    commit(selected.includes(opt) ? selected.filter(v => v !== opt) : [...selected, opt]);
  };

  const btnLabel = selected.length === 0 ? 'No Action Taken' : selected.join(', ');

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving}
        className="flex items-center gap-1.5 text-xs font-medium rounded-full pl-2.5 pr-2.5 py-1 border cursor-pointer disabled:opacity-60 transition-colors max-w-[220px]"
        style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)' }}
      >
        <span className="truncate">{btnLabel}</span>
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        {saving && <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: 'var(--cn-accent)' }} />}
        {saved && <span className="text-xs shrink-0" style={{ color: '#22c55e' }}>✓</span>}
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 w-52 border rounded-lg z-50 max-h-64 overflow-y-auto"
          style={{ background: 'var(--cn-bg-dropdown)', borderColor: 'var(--cn-border)', boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}
        >
          {selected.length > 0 && (
            <button
              onClick={() => commit([])}
              className="w-full text-left px-3 py-1.5 text-[11px] font-semibold border-b"
              style={{ color: 'var(--cn-text-muted)', borderColor: 'var(--cn-border)' }}
            >
              Clear
            </button>
          )}
          {options.filter(o => o.toLowerCase() !== 'no action taken').map(opt => (
            <label key={opt} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs"
              style={{ color: 'var(--cn-text-primary)' }}
              onMouseEnter={e => ((e.currentTarget as HTMLLabelElement).style.background = 'var(--cn-bg-input)')}
              onMouseLeave={e => ((e.currentTarget as HTMLLabelElement).style.background = '')}
            >
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} className="cursor-pointer" />
              <span className="truncate">{opt}</span>
            </label>
          ))}
        </div>
      )}
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

type PopupFieldKind = 'assigned' | 'select' | 'date' | 'duration' | 'textarea' | 'text';

// My Projects' per-row edit popup — shows every field of one project in a
// single form, edits are held as a local draft, and nothing reaches the
// sheet until Save (only the fields that actually changed are written);
// Cancel / X / Esc throw the draft away.
function PmRowEditModal({ row, fields, kindOf, optionsFor, pendingHoursOf, onSave, onCancel }: {
  row: SheetData;
  fields: string[];
  kindOf: (h: string) => PopupFieldKind;
  optionsFor: (h: string) => string[];
  pendingHoursOf: (draft: Record<string, string>) => string | null;
  onSave: (changes: Record<string, string>) => Promise<void>;
  onCancel: () => void;
}) {
  const original = useMemo(() => {
    const o: Record<string, string> = {};
    fields.forEach(h => { o[h] = String(row[h] ?? ''); });
    return o;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [draft, setDraft] = useState<Record<string, string>>(original);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [saving, onCancel]);

  const set = (h: string, v: string) => setDraft(d => ({ ...d, [h]: v }));
  const changed = fields.filter(h => draft[h] !== original[h]);

  const handleSave = async () => {
    if (!changed.length) { onCancel(); return; }
    setSaving(true);
    setError('');
    try {
      const changes: Record<string, string> = {};
      changed.forEach(h => { changes[h] = draft[h]; });
      await onSave(changes);
    } catch {
      setError('Could not save — nothing was lost, please try again.');
      setSaving(false);
    }
  };

  const inputStyle = { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' };
  const inputCls = 'w-full text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#FE4A23] disabled:opacity-60';
  const pending = pendingHoursOf(draft);

  const renderField = (h: string) => {
    const v = draft[h];
    switch (kindOf(h)) {
      case 'assigned': {
        const selected = v.split(',').map(s => s.trim()).filter(Boolean);
        const opts = [...new Set([...optionsFor(h).filter(o => o.toLowerCase() !== 'no action taken'), ...selected])];
        return (
          <div className="flex flex-wrap gap-1.5">
            {opts.map(o => {
              const on = selected.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  disabled={saving}
                  onClick={() => set(h, (on ? selected.filter(s => s !== o) : [...selected, o]).join(', '))}
                  className="px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors disabled:opacity-60"
                  style={on
                    ? { background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }
                    : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
                >
                  {o}
                </button>
              );
            })}
          </div>
        );
      }
      case 'select': {
        const opts = optionsFor(h);
        const all = v && !opts.includes(v) ? [v, ...opts] : opts;
        return (
          <select value={v} onChange={e => set(h, e.target.value)} disabled={saving} className={`${inputCls} cursor-pointer`} style={inputStyle}>
            {!v && <option value="">—</option>}
            {all.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      }
      case 'date':
        return (
          <input type="date" value={toInputDate(v)} disabled={saving}
            onChange={e => set(h, fromInputDate(e.target.value))} className={inputCls} style={inputStyle} />
        );
      case 'duration': {
        const { h: hh, m: mm } = toHMLiteral(v);
        const sel = 'text-sm rounded-lg px-2 py-2 focus:outline-none disabled:opacity-60 cursor-pointer';
        return (
          <div className="flex items-center gap-1.5">
            <select value={hh} disabled={saving} onChange={e => set(h, formatHHMM(Number(e.target.value), mm))} className={sel} style={inputStyle}>
              {PM_HOUR_OPTIONS.map(o => <option key={o} value={o}>{String(o).padStart(2, '0')}</option>)}
            </select>
            <span style={{ color: 'var(--cn-text-muted)' }}>h</span>
            <select value={mm} disabled={saving} onChange={e => set(h, formatHHMM(hh, Number(e.target.value)))} className={sel} style={inputStyle}>
              {DURATION_MINUTE_OPTIONS.map(o => <option key={o} value={o}>{String(o).padStart(2, '0')}</option>)}
            </select>
            <span style={{ color: 'var(--cn-text-muted)' }}>m</span>
          </div>
        );
      }
      case 'textarea':
        return <textarea value={v} rows={3} disabled={saving} onChange={e => set(h, e.target.value)} className={`${inputCls} resize-y`} style={inputStyle} />;
      default:
        return <input type="text" value={v} disabled={saving} onChange={e => set(h, e.target.value)} className={inputCls} style={inputStyle} />;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div
        role="dialog"
        aria-modal="true"
        className="rounded-lg w-full flex flex-col"
        style={{ background: 'var(--cn-bg-card)', maxWidth: 1280, height: '94vh', border: '1px solid var(--cn-border)' }}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--cn-border)' }}>
          <div className="min-w-0">
            <h2 className="font-semibold text-base truncate" style={{ color: 'var(--cn-text-primary)' }}>Edit Project</h2>
            <p className="text-xs truncate" style={{ color: 'var(--cn-text-muted)' }}>
              {original[fields.find(f => f.toLowerCase().includes('project name')) ?? ''] || 'Untitled project'}
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={saving}
            title="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors hover:opacity-80 shrink-0 disabled:opacity-50"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4 content-start flex-1">
          {fields.map(h => {
            const wide = ['assigned', 'textarea'].includes(kindOf(h));
            return (
              <div key={h} className={`flex flex-col gap-1 ${wide ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
                <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>
                  {h}
                  {draft[h] !== original[h] && <span className="ml-1.5 normal-case" style={{ color: 'var(--cn-accent)' }}>edited</span>}
                </label>
                {renderField(h)}
              </div>
            );
          })}
          {pending !== null && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>Pending Hours (calculated)</label>
              <div className="text-sm px-3 py-2" style={{ color: 'var(--cn-text-secondary)' }}>{pending}</div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: 'var(--cn-border)' }}>
          {error && <span className="text-xs mr-auto" style={{ color: '#ef4444' }}>{error}</span>}
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all disabled:opacity-50"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all disabled:opacity-60"
            style={{ background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }}
          >
            {saving && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body
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
  // True for the "Current Month" tab — that tab's data is already scoped to
  // a single month server-side, so Year/Month filters are redundant; Status
  // takes their place in the always-visible primary row instead.
  hideYearMonthFilter?: boolean;
  // True for "My Projects" — a single PM's own, much smaller list, so it
  // always shows every column/PM-card metric and skips the Low/Medium/Full
  // control entirely instead of offering tiers that don't add much value
  // at this scale.
  lockShowDataFull?: boolean;
  // True for "Previous Months" — every sheet column (including the
  // report-style ones hidden elsewhere) shown by default, at the Full level
  // with no Low/Medium/Full toggle.
  showAllColumns?: boolean;
  // True for "My Projects" — the PM filter is meaningless there since the
  // whole tab is already scoped to one PM (the logged-in user).
  hidePmFilter?: boolean;
  // True for "Previous Months" — PM Summary's per-PM totals are dominated
  // by however many old months happen to be in that sheet, which reads as
  // noise rather than a useful workload snapshot for a historical tab.
  hidePmSummary?: boolean;
  // Every PM's display name (from UserDetails, regardless of whether they
  // have any project rows yet) — merged into PM Summary and the PM filter
  // so a PM with zero projects still gets a card (full Bandwidth,
  // Available) instead of being invisible until their first submission.
  allPmNames?: string[];
}

export default function PMProjectBandwidth({ data, headers, canEdit = false, onCellChange, allData, defaultToCurrentMonth = true, hideYearMonthFilter = false, lockShowDataFull = false, showAllColumns = false, hidePmFilter = false, hidePmSummary = false, allPmNames = [] }: Props) {
  const optionSourceData = allData ?? data;
  // Cells only become editable after clicking "Edit", same pattern as Tasks Assigned
  const [editMode, setEditMode] = useState(false);
  // My Projects (lockShowDataFull) edits one project at a time through a
  // popup instead of making every cell inline-editable — "Edit" there just
  // reveals a per-row edit button (see popupRow below).
  const popupEditing = lockShowDataFull && canEdit && editMode;
  const isEditable = canEdit && editMode && !lockShowDataFull;
  const [popupRow, setPopupRow] = useState<SheetData | null>(null);
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
  const upsellCol = headers.find(h => h.toLowerCase().includes('cross-sell'));
  const paymentStatusCol = headers.find(h => h.toLowerCase().includes('payment status'));
  const assignedCol = headers.find(h => h.toLowerCase() === 'assigned');
  const totalHoursCol = headers.find(h => h.toLowerCase() === 'total hours');
  const currentMonthHoursCol = headers.find(h => h.toLowerCase() === 'current month hours');
  const riskMonthHoursCol = headers.find(h => h.toLowerCase() === 'risk month hours');
  const followupDateCol = headers.find(h => h.toLowerCase().includes('follow-up date') || h.toLowerCase().includes('followup date'));
  const commentsCol = headers.find(h => h.toLowerCase().includes('comment'));
  const showPmCol = data.some(r => r['__pm']);
  const acHoursCol = headers.find(h => h.toLowerCase() === 'ac hours');
  const isDurationCol = (h: string) => h === totalHoursCol || h === acHoursCol || h === currentMonthHoursCol || h === riskMonthHoursCol;
  // Timestamp/Email stay usable for sorting & filtering but aren't shown as table columns
  // A second column with an already-used header (e.g. a stray extra "Month"
  // at the end of the sheet) arrives renamed "Month (2)" — see
  // fetchSheetData's renameDuplicateHeaders — and is left out of the table.
  const allCols = headers.filter(h => h !== timestampCol && h !== emailCol && !/ \(\d+\)$/.test(h));
  // The report-style columns (Project Progress Update, Upsell, Escalation, ...)
  // are kept out of the table, the Columns picker and the My Projects edit
  // popup; they're only filled in through the Generate Report view.
  const tableCols = showAllColumns ? allCols : allCols.filter(h => !ALWAYS_DEFAULT_HIDDEN_COLS.includes(h.trim().toLowerCase()));

  // Show Data always starts at Low, except My Projects (lockShowDataFull)
  // which always shows Full and has no toggle to change it. Dashboard.tsx
  // remounts this component (key={effectivePmBandwidthSubTab}) on every tab
  // switch, so a plain once-per-mount flag is enough; the user can still
  // override with the Low/Medium/Full button on any other tab.
  const levelDefaultApplied = useRef(false);
  useEffect(() => {
    if (levelDefaultApplied.current || !headers.length) return;
    levelDefaultApplied.current = true;
    setShowDataLevel(lockShowDataFull || showAllColumns ? 'full' : 'low');
  }, [headers.length, lockShowDataFull, showAllColumns]);

  // Column presets per level — Low is a bare-minimum glance, Medium is the
  // previous curated default, Full is every column. PM itself isn't part of
  // this list — it's a separate always-shown column (see showPmCol) whenever
  // the view spans more than one PM.
  const colLevelPresets = useMemo<Record<ShowDataLevel, string[]>>(() => ({
    low: [projectCol, clientCol, totalHoursCol, currentMonthHoursCol, statusCol].filter((c): c is string => !!c).concat(PENDING_HOURS_COL),
    medium: [
      departmentCol, projectCol, clientCol, totalHoursCol,
      statusCol, currentMonthHoursCol, paymentStatusCol, followupDateCol,
    ].filter((c): c is string => !!c),
    // My Projects (lockShowDataFull) opens with these unchecked in the
    // Columns picker to keep the table compact — still one click away to
    // re-enable. Other tabs' Full level keeps every column.
    // The newer report-style columns are hidden by default on every tab
    // (still in the Columns picker, and editable in the My Projects popup).
    full: tableCols.filter(h => {
      const k = h.trim().toLowerCase();
      if (showAllColumns) return true;
      return !ALWAYS_DEFAULT_HIDDEN_COLS.includes(k) && !(lockShowDataFull && MY_PROJECTS_DEFAULT_HIDDEN_COLS.includes(k));
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [projectCol, clientCol, totalHoursCol, currentMonthHoursCol, statusCol, departmentCol, paymentStatusCol, followupDateCol, tableCols, lockShowDataFull, showAllColumns]);

  // Re-applies whenever the level changes (button click or the per-tab
  // default above) — manual Columns picker edits in between still work,
  // they just get reset back to the preset on the next level change.
  useEffect(() => {
    if (!headers.length) return;
    setVisibleCols(colLevelPresets[showDataLevel]);
    setColsTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDataLevel, headers.length]);

  const pmCardFields = LEVEL_FIELDS_PM[showDataLevel];

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
    if (upsellCol) opts[upsellCol] = withExtras(upsellCol, UPSELL_OPTIONS);
    if (paymentStatusCol) opts[paymentStatusCol] = withExtras(paymentStatusCol, PAYMENT_STATUS_OPTIONS);
    // Assigned holds several comma-separated names per cell (e.g. "Dhruv,
    // Robin, Shubham") — split before unioning, otherwise withExtras would
    // add each whole multi-name cell as if it were one option.
    if (assignedCol) {
      const individualExtras = new Set<string>();
      optionSourceData.forEach(r => {
        String(r[assignedCol] ?? '').split(',').forEach(s => {
          const name = s.trim();
          if (name && !ASSIGNED_OPTIONS.includes(name)) individualExtras.add(name);
        });
      });
      opts[assignedCol] = [...ASSIGNED_OPTIONS, ...[...individualExtras].sort()];
    }
    return opts;
  }, [optionSourceData, departmentCol, statusCol, phaseCol, yearCol, monthCol, upsellCol, paymentStatusCol, assignedCol]);
  const isDropdownCol = (h: string) =>
    h === departmentCol || h === yearCol || h === monthCol || h === statusCol || h === phaseCol ||
    h === upsellCol || h === paymentStatusCol || h === assignedCol;

  // Current Month tab is already scoped to one month server-side, so
  // Year/Month are redundant there — drop them and promote Status into the
  // always-visible row in their place.
  const filterCols = useMemo(
    () => ([
      (showPmCol && !hidePmFilter) ? { col: '__pm', label: 'PM' } : null,
      projectCol ? { col: projectCol, label: 'Project' } : null,
      clientCol ? { col: clientCol, label: 'Client' } : null,
      (yearCol && !hideYearMonthFilter) ? { col: yearCol, label: 'Year' } : null,
      (monthCol && !hideYearMonthFilter) ? { col: monthCol, label: 'Month' } : null,
      statusCol ? { col: statusCol, label: 'Status' } : null,
      phaseCol ? { col: phaseCol, label: 'Phase' } : null,
      milestonesCol ? { col: milestonesCol, label: 'Upcoming Milestones' } : null,
      upsellCol ? { col: upsellCol, label: 'Upsell/Cross-Sell' } : null,
      paymentStatusCol ? { col: paymentStatusCol, label: 'Payment Status' } : null,
    ].filter((c): c is { col: string; label: string } => c !== null)),
    [showPmCol, projectCol, clientCol, yearCol, monthCol, statusCol, phaseCol, milestonesCol, upsellCol, paymentStatusCol, hideYearMonthFilter, hidePmFilter]
  );
  // PM/Project/Client/Year/Month stay always visible; the rest collapse
  // behind "More Filters" so the primary bar doesn't grow unbounded. Status
  // joins the primary row instead when Year/Month are hidden (Current Month
  // tab), so the bar still leads with a genuinely useful filter.
  const secondaryFilterCols = filterCols.filter(({ col }) =>
    (col === statusCol && !hideYearMonthFilter) || col === phaseCol || col === milestonesCol || col === upsellCol || col === paymentStatusCol
  );
  const primaryFilterCols = filterCols.filter(fc => !secondaryFilterCols.includes(fc));
  const secondaryActiveCount = secondaryFilterCols.filter(({ col }) => (filters[col] ?? []).length > 0).length;

  // Faceted: each dropdown's options reflect rows matching every OTHER active
  // filter, so e.g. picking Year 2026 narrows Month/Project/Client to values
  // that actually occur in 2026
  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    filterCols.forEach(({ col }) => {
      // Status/Phase/Upsell/Payment Status are fixed dropdown fields —
      // always offer the full canonical list (same one the edit cells
      // use), not just whatever values happen to occur in the currently-
      // faceted rows, so an unused status is still pickable. Upcoming
      // Milestones is free text now, so it facets like any other text
      // column below instead.
      if (col === statusCol || col === phaseCol || col === upsellCol || col === paymentStatusCol) {
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
      // PM filter also offers every known PM (allPmNames), not just those
      // with rows already — same reasoning as PM Summary's cards below.
      const extra = col === '__pm' ? allPmNames : [];
      const vals = [...new Set([...rows.map(r => String(r[col] ?? '').trim()).filter(Boolean), ...extra])];
      opts[col] = col === yearCol
        ? vals.sort((a, b) => Number(b) - Number(a))
        : col === monthCol
        ? vals.sort((a, b) => (MONTH_ORDER[b.toLowerCase()] ?? 0) - (MONTH_ORDER[a.toLowerCase()] ?? 0))
        : vals.sort();
    });
    return opts;
  }, [data, filterCols, filters, yearCol, monthCol, statusCol, phaseCol, upsellCol, paymentStatusCol, dropdownOptions, allPmNames]);

  // Default to the current Year/Month once, when they're available as filter
  // columns — skipped on the All Data tab (defaultToCurrentMonth=false),
  // which is historical-only and would show zero rows if pinned to now, and
  // skipped entirely on Current Month (hideYearMonthFilter=true), which has
  // no Year/Month controls to default and no need for a hidden filter.
  const defaultsApplied = useRef(false);
  useEffect(() => {
    if (defaultsApplied.current || !yearCol || !monthCol || !defaultToCurrentMonth || hideYearMonthFilter) return;
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
    return rows;
  }, [data, filters, filterCols]);

  // Top KPI cards and PM summary cards now share the same filtered rows as
  // the table below — every bottom-bar filter (PM/Project/Client/Year/
  // Month/Status/.../search) affects them too. Year/Month default to the
  // real current month/year on first load (see defaultsApplied above), so
  // out of the box this still reads as a current-month snapshot; picking a
  // different Year/Month/PM/etc. now updates these cards to match.
  const statsCols = { totalHoursCol, currentMonthHoursCol, riskMonthHoursCol, paymentStatusCol, followupDateCol, statusCol };

  // Hour totals (Total/Bandwidth/Current/Pending) come straight from the
  // hour columns for whoever/whatever is in scope (PM/Project/Client/Year/
  // Month) — they deliberately ignore the attribute filters (Status/Phase/
  // Upcoming Milestones/Upsell/Payment Status), so picking e.g. a Status
  // doesn't change someone's Total Hours. Count-style cards (Follow-up Due,
  // Ongoing) still follow every filter, since those are about the rows
  // shown.
  const attributeFilterCols = [statusCol, phaseCol, milestonesCol, upsellCol, paymentStatusCol];
  const scopedRows = useMemo(() => {
    let rows = data;
    filterCols.forEach(({ col }) => {
      if (attributeFilterCols.includes(col)) return;
      const selected = filters[col] ?? [];
      if (selected.length > 0) rows = rows.filter(r => selected.includes(String(r[col] ?? '').trim()));
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filters, filterCols, statusCol, phaseCol, milestonesCol, upsellCol, paymentStatusCol]);
  const withScopedHours = (rowsFiltered: SheetData[], rowsScoped: SheetData[]) => {
    const counts = computeStatsFor(rowsFiltered, statsCols);
    const hours = computeStatsFor(rowsScoped, statsCols);
    return {
      ...counts,
      totalHours: hours.totalHours,
      availableHours: hours.availableHours,
      currentMonthHours: hours.currentMonthHours,
      riskMonthHours: hours.riskMonthHours,
      pendingHours: hours.pendingHours,
    };
  };
  const stats = useMemo(
    () => withScopedHours(filtered, scopedRows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, filtered, scopedRows, totalHoursCol, currentMonthHoursCol, riskMonthHoursCol, paymentStatusCol, followupDateCol, statusCol]
  );

  // Overview's Available Hours has to be summed per-PM, not derived from the
  // combined Total Hours — the 300h capacity is a per-PM ceiling, so running
  // it against everyone's hours added together (e.g. 1000h+) always clamps
  // to 0. Each PM's own headroom is summed instead, same figure the PM
  // Summary cards below already show individually.
  const availableHoursTotal = useMemo(() => {
    if (!totalHoursCol) return 0;
    if (!showPmCol) {
      const total = scopedRows.reduce((s, r) => s + parseDurationDecimal(r[totalHoursCol]), 0);
      return Math.max(0, PM_BANDWIDTH_CAPACITY - total);
    }
    const totalsByPm = new Map<string, number>();
    scopedRows.forEach(r => {
      const pm = String(r['__pm'] ?? '').trim();
      totalsByPm.set(pm, (totalsByPm.get(pm) ?? 0) + parseDurationDecimal(r[totalHoursCol]));
    });
    return [...totalsByPm.values()].reduce((sum, total) => sum + Math.max(0, PM_BANDWIDTH_CAPACITY - total), 0);
  }, [scopedRows, totalHoursCol, showPmCol]);

  // Per-PM summary cards — only meaningful when this view spans more than
  // one PM (the All Projects tab; My Projects is always a single PM
  // already). That "can this view ever have multiple PMs" check has to run
  // against the full unfiltered data (not allPmNames — My Projects would
  // otherwise wrongly see every PM merged in), not the filtered rows —
  // otherwise narrowing a filter down to a single PM's projects (very easy
  // to do) made the whole section disappear instead of just showing that
  // one card.
  // Only PMs actually present in the filtered rows get a card when a
  // filter is active, so e.g. filtering to one Project doesn't clutter the
  // row with 0h cards for PMs who have nothing in it — but with no active
  // filter, every known PM (allPmNames) gets a card too, even ones with
  // zero project rows yet, so a new PM shows up immediately at full
  // Bandwidth/Available instead of staying invisible until their first
  // submission.
  const hasActiveFilter = Object.values(filters).some(v => v.length > 0);
  const pmSummaries = useMemo(() => {
    if (!showPmCol) return [];
    const allNames = new Set(data.map(r => String(r['__pm'] ?? '').trim()).filter(Boolean));
    if (allNames.size <= 1) return [];
    const fromFiltered = filtered.map(r => String(r['__pm'] ?? '').trim()).filter(Boolean);
    const names = [...new Set(hasActiveFilter ? fromFiltered : [...fromFiltered, ...allPmNames])].sort();
    return names.map(name => ({
      name,
      ...withScopedHours(
        filtered.filter(r => String(r['__pm'] ?? '').trim() === name),
        scopedRows.filter(r => String(r['__pm'] ?? '').trim() === name)
      ),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filtered, scopedRows, showPmCol, hasActiveFilter, allPmNames, totalHoursCol, currentMonthHoursCol, riskMonthHoursCol, paymentStatusCol, followupDateCol, statusCol]);

  const fmtHours = (n: number) => `${formatHoursClock(n)}h`;

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
    if (sortCol === totalHoursCol || sortCol === acHoursCol || sortCol === currentMonthHoursCol || sortCol === riskMonthHoursCol) {
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
  }, [filtered, sortCol, sortDir, yearCol, monthCol, timestampCol, totalHoursCol, acHoursCol, currentMonthHoursCol, riskMonthHoursCol]);

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
  const showPendingCol = visibleCols.includes(PENDING_HOURS_COL);

  if (!headers.length) {
    return <div className="text-center py-12 text-sm" style={{ color: 'var(--cn-text-muted)' }}>No data available</div>;
  }

  // Same metric list/order as PM Summary (PM_CARD_METRIC_DEFS) — Overview is
  // just those metrics scoped to the whole filtered view instead of one PM.
  // Available is the one exception — it uses availableHoursTotal (summed
  // per-PM) instead of stats.availableHours (see that comment above).
  const statCards = PM_CARD_METRIC_DEFS.map(({ key, label, isHours }) => ({
    label,
    value: label === AVAILABLE_LABEL ? fmtHours(availableHoursTotal) : isHours ? fmtHours(stats[key]) : stats[key],
  }));
  const visibleStatCards = statCards.filter(c => LEVEL_FIELDS_OVERVIEW[showDataLevel].includes(c.label));
  const statGridCols = showDataLevel === 'low'
    ? 'grid-cols-2 sm:grid-cols-4'
    : showDataLevel === 'medium'
      ? 'grid-cols-2 sm:grid-cols-4'
      : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6';

  return (
    <div className="space-y-4">
      <div className="sticky top-16 z-10 space-y-2 py-2 -mx-3 sm:-mx-6 px-3 sm:px-6 border-b" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
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
                  className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all text-xs font-medium"
                  style={{ background: 'var(--cn-bg-input)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
                >
                  <X className="w-3.5 h-3.5" />
                  Clear all ({activeFilterCount})
                </button>
              </div>
            )}
            {!lockShowDataFull && !showAllColumns && (
              <div className="flex flex-col gap-1 col-span-2 sm:col-span-1 sm:ml-auto">
                <span className="text-xs font-medium" style={{ color: 'var(--cn-text-muted)' }}>Show Data</span>
                <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--cn-border)' }}>
                  {(['low', 'medium', 'full'] as const).map(level => (
                    <button
                      key={level}
                      onClick={() => setShowDataLevel(level)}
                      className="px-3 py-2 text-xs font-semibold cursor-pointer transition-all capitalize"
                      style={showDataLevel === level
                        ? { background: 'var(--cn-accent)', color: '#fff' }
                        : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)' }}
                    >
                      {level}
                    </button>
                  ))}
                </div>
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

      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>Overview</p>
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

      {!hidePmSummary && pmSummaries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>PM Summary</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {pmSummaries.map(pm => {
              const photo = memberPhoto(pm.name);
              const bg = memberColor(pm.name);
              const initials = pm.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
              const activeMetrics = PM_CARD_METRIC_DEFS.filter(d => pmCardFields.includes(d.label));
              // Two-per-row at every level — gives each label enough width to
              // avoid truncation (grid-cols-3+ was cutting off longer labels
              // like "Bandwidth"/"Follow-up Due").
              const metricsGridCols = 'grid-cols-2';
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
                    {/* Workload status is a "right now" concept — doesn't
                        make sense against a past month's totals, so it's
                        hidden on the historical-only Previous Months tab. */}
                    {defaultToCurrentMonth && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0" style={{ background: workload.bg + '22', color: workload.bg }}>
                        {workload.label}
                      </span>
                    )}
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

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <p style={{ color: 'var(--cn-text-muted)' }} className="text-sm">
          <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{sorted.length}</span> of {data.length} records
          {activeFilterCount > 0 && <span className="text-[#FE4A23]"> (filtered)</span>}
        </p>
        <div className="flex items-end gap-3">
          <MultiSelect
            label="Columns"
            options={tableCols}
            selected={visibleCols}
            onChange={vals => { setVisibleCols(vals); setColsTouched(true); setPage(1); }}
          />
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
      </div>

      <div style={{ borderColor: 'var(--cn-border)' }} className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs text-left">
          <thead>
            <tr style={{ background: 'var(--cn-bg-input)', borderColor: 'var(--cn-border)' }} className="border-b">
              {popupEditing && <th className="px-2 py-2 w-10" aria-label="Edit row" />}
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
              {showPendingCol && (
                <th style={{ color: 'var(--cn-text-muted)' }} className="px-4 py-2 font-semibold uppercase tracking-wide text-[10px] min-w-[120px]">Pending Hours</th>
              )}
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 ? (
              <tr>
                <td colSpan={visibleHeaders.length + (showPmCol ? 2 : 1) + (showPendingCol ? 1 : 0) + (popupEditing ? 1 : 0)} style={{ color: 'var(--cn-text-muted)' }} className="text-center py-12">
                  No records found
                </td>
              </tr>
            ) : (
              pageData.map((row, i) => (
                <tr
                  key={String(row['__id'] ?? i)}
                  style={{ backgroundColor: i % 2 === 0 ? 'var(--cn-bg-row-even)' : 'var(--cn-bg-row-odd)', borderColor: 'var(--cn-border-light)' }}
                  className={`border-b transition-colors hover:bg-[var(--cn-bg-hover)] ${popupEditing ? 'cursor-pointer' : ''}`}
                  onClick={popupEditing ? () => setPopupRow(row) : undefined}
                >
                  {popupEditing && (
                    <td className="px-2 py-2">
                      <button
                        onClick={e => { e.stopPropagation(); setPopupRow(row); }}
                        title="Edit this project"
                        className="w-7 h-7 rounded-lg inline-flex items-center justify-center cursor-pointer transition-colors hover:opacity-80"
                        style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-accent)', border: '1px solid var(--cn-border)' }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
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
                          <a href={val} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="hover:underline" style={{ color: 'var(--cn-accent)' }}>{val}</a>
                        ) : h.trim().toLowerCase() === 'checklist' ? (
                          // Multi-select in the sheet ("A, B") — read-only text here
                          // (it's filled in via Generate Report), first 30 words.
                          <div className="min-w-[260px] max-w-sm break-words" style={{ color: 'var(--cn-text-secondary)' }}>
                            <ClampedText text={val.split(',').map(x => x.trim()).filter(Boolean).join(', ')} limit={30} />
                          </div>
                        ) : h === assignedCol ? (
                          <MultiSelectCell
                            value={val}
                            editable={isEditable && !!onCellChange}
                            options={dropdownOptions[h] ?? []}
                            onSave={async v => { if (onCellChange) await onCellChange(row, h, v); }}
                          />
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
                  {showPendingCol && (
                    <td className="px-4 py-2 whitespace-nowrap" style={{ color: 'var(--cn-text-primary)' }}>
                      {totalHoursCol && currentMonthHoursCol
                        ? fmtHours(
                            parseDurationDecimal(row[totalHoursCol]) -
                            (countsAsCurrent(row, statusCol, paymentStatusCol)
                              ? parseDurationDecimal(row[currentMonthHoursCol])
                              : 0)
                          )
                        : '—'}
                    </td>
                  )}
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

      {popupRow && onCellChange && (
        <PmRowEditModal
          key={String(popupRow['__id'] ?? '')}
          row={popupRow}
          fields={tableCols.filter(h => h !== yearCol && h !== monthCol)}
          kindOf={h =>
            h === assignedCol ? 'assigned'
            : isDropdownCol(h) ? 'select'
            : isDateCol(h) ? 'date'
            : isDurationCol(h) ? 'duration'
            : (h === commentsCol || h === milestonesCol || LONG_TEXT_COLS.includes(h.toLowerCase())) ? 'textarea'
            : 'text'}
          optionsFor={h => dropdownOptions[h] ?? []}
          pendingHoursOf={draft =>
            totalHoursCol && currentMonthHoursCol
              ? fmtHours(
                  parseDurationDecimal(draft[totalHoursCol]) -
                  (countsAsCurrent(draft as SheetData, statusCol, paymentStatusCol) ? parseDurationDecimal(draft[currentMonthHoursCol]) : 0)
                )
              : null}
          onSave={async changes => {
            // One write per changed column, in order — a failure throws and
            // leaves the popup open (earlier columns already saved stay saved).
            for (const [col, val] of Object.entries(changes)) {
              await onCellChange(popupRow, col, val);
            }
            setPopupRow(null);
          }}
          onCancel={() => setPopupRow(null)}
        />
      )}
    </div>
  );
}
