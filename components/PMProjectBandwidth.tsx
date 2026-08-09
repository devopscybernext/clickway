'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, X, ChevronLeft, ChevronRight, Clock, CalendarClock, Hourglass, Rocket, Activity, AlertTriangle, Wallet, PhoneCall, Pencil } from 'lucide-react';
import { SheetData } from '@/lib/googleSheets';
import { MultiSelect } from './FilteredDataTable';
import SearchFilter from './SearchFilter';
import { parseHHMM, formatHHMM, hhmmToDecimalHours, DURATION_MINUTE_OPTIONS } from './SpecificCharts';

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

interface Props {
  data: SheetData[];
  headers: string[];
  canEdit?: boolean;
  onCellChange?: (row: SheetData, colName: string, value: string) => Promise<void>;
  // Full unfiltered dataset (across every PM) used to build dropdown option
  // lists for Department/Year/Month/Status/Phase — falls back to `data`.
  allData?: SheetData[];
}

export default function PMProjectBandwidth({ data, headers, canEdit = false, onCellChange, allData }: Props) {
  const optionSourceData = allData ?? data;
  // Cells only become editable after clicking "Edit", same pattern as Tasks Assigned
  const [editMode, setEditMode] = useState(false);
  const isEditable = canEdit && editMode;
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filters, setFilters] = useState<Record<string, string[]>>({});

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
  const showPmCol = data.some(r => r['__pm']);
  const isDurationCol = (h: string) => h === totalHoursCol || h === currentMonthHoursCol || h === riskMonthHoursCol;

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
    ].filter((c): c is { col: string; label: string } => c !== null)),
    [showPmCol, projectCol, clientCol, yearCol, monthCol]
  );

  // Faceted: each dropdown's options reflect rows matching every OTHER active
  // filter, so e.g. picking Year 2026 narrows Month/Project/Client to values
  // that actually occur in 2026
  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    filterCols.forEach(({ col }) => {
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
  }, [data, filterCols, filters, yearCol, monthCol]);

  // Default to the current Year/Month once, when they're available as filter columns
  const defaultsApplied = useRef(false);
  useEffect(() => {
    if (defaultsApplied.current || !yearCol || !monthCol) return;
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

  // Top KPI cards — scoped to the currently filtered/searched rows, same as
  // the "N of M records" count below.
  const stats = useMemo(() => {
    const totalHours = totalHoursCol ? filtered.reduce((s, r) => s + parseDurationDecimal(r[totalHoursCol]), 0) : 0;
    const currentMonthHours = currentMonthHoursCol ? filtered.reduce((s, r) => s + parseDurationDecimal(r[currentMonthHoursCol]), 0) : 0;
    const riskMonthHours = riskMonthHoursCol ? filtered.reduce((s, r) => s + parseDurationDecimal(r[riskMonthHoursCol]), 0) : 0;
    const pendingHours = totalHours - currentMonthHours;
    const paymentPendingHours = (paymentStatusCol && currentMonthHoursCol)
      ? filtered.reduce((s, r) => {
          const isPending = String(r[paymentStatusCol] ?? '').trim().toLowerCase() === 'pending';
          return isPending ? s + parseDurationDecimal(r[currentMonthHoursCol]) : s;
        }, 0)
      : 0;
    const followupDue = followupDateCol
      ? filtered.filter(r => {
          const raw = String(r[followupDateCol] ?? '').trim();
          if (!raw) return true; // never followed up — counts as due
          const t = parseTimestamp(raw);
          return t === 0 || (Date.now() - t) > FOLLOWUP_DUE_MS;
        }).length
      : 0;
    const yetToStart = statusCol ? filtered.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'yet to start').length : 0;
    const ongoing = statusCol ? filtered.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'on going').length : 0;
    return { totalHours, currentMonthHours, riskMonthHours, pendingHours, paymentPendingHours, followupDue, yetToStart, ongoing };
  }, [filtered, totalHoursCol, currentMonthHoursCol, riskMonthHoursCol, paymentStatusCol, followupDateCol, statusCol]);

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

  // Timestamp/Email stay usable for sorting & filtering but aren't shown as table columns
  const visibleHeaders = headers.filter(h => h !== timestampCol && h !== emailCol);

  if (!headers.length) {
    return <div className="text-center py-12 text-sm" style={{ color: 'var(--cn-text-muted)' }}>No data available</div>;
  }

  const statCards = [
    { label: 'Total Hours', value: fmtHours(stats.totalHours), color: '#2563eb', icon: <Clock className="w-4 h-4" /> },
    { label: 'Current Month Hours', value: fmtHours(stats.currentMonthHours), color: '#0891b2', icon: <CalendarClock className="w-4 h-4" /> },
    { label: 'Risk Month Hours', value: fmtHours(stats.riskMonthHours), color: '#dc2626', icon: <AlertTriangle className="w-4 h-4" /> },
    { label: 'Pending Hours', value: fmtHours(stats.pendingHours), color: '#d97706', icon: <Hourglass className="w-4 h-4" /> },
    { label: 'Payment Pending', value: fmtHours(stats.paymentPendingHours), color: '#dc2626', icon: <Wallet className="w-4 h-4" /> },
    { label: 'Follow-up Due', value: stats.followupDue, color: '#7c3aed', icon: <PhoneCall className="w-4 h-4" /> },
    { label: 'Project Yet To Start', value: stats.yetToStart, color: '#dc2626', icon: <Rocket className="w-4 h-4" /> },
    { label: 'Project Ongoing', value: stats.ongoing, color: '#16a34a', icon: <Activity className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px" style={{ background: 'var(--cn-border)' }}>
          {statCards.map(({ label, value, color, icon }) => (
            <div key={label} className="flex flex-col gap-1.5 p-4" style={{ background: 'var(--cn-bg-card)' }}>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide leading-tight" style={{ color: 'var(--cn-text-muted)' }}>{label}</p>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + '18', color }}>{icon}</div>
              </div>
              <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--cn-text-primary)' }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      <SearchFilter
        searchTerm={searchTerm}
        totalCount={data.length}
        filteredCount={filtered.length}
        onChange={val => { setSearchTerm(val); setPage(1); }}
      />

      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-2 sm:gap-3">
        {filterCols.map(({ col, label }) => (
          <MultiSelect
            key={col}
            label={label}
            options={filterOptions[col] ?? []}
            selected={filters[col] ?? []}
            onChange={vals => handleFilter(col, vals)}
          />
        ))}
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
