'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { SheetData } from '@/lib/googleSheets';
import { MultiSelect } from './FilteredDataTable';
import SearchFilter from './SearchFilter';

const PAGE_SIZE = 30;

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
  ['yet to start', '#dc2626'],
  ['move to next month', '#f59e0b'],
  ['initial setup', '#2563eb'],
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
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: statusColor(value), color: '#fff' }}>
      {value || 'No Action Taken'}
    </span>
  ) : (
    <span style={{ color: 'var(--cn-text-secondary)' }}>{value || '—'}</span>
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

// Dropdown cell — for known enum-ish columns (Department, Year, Month,
// Status, Phase). Options are the union of values seen across every PM's
// rows so far, plus the cell's own current value as a safety net.
function SelectCell({ value, colored, editable, options, onSave }: {
  value: string; colored: boolean; editable: boolean; options: string[]; onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const commit = async (newVal: string) => {
    setEditing(false);
    if (newVal === value) return;
    setSaving(true);
    try { await onSave(newVal); } finally { setSaving(false); }
  };

  if (editing) {
    const opts = options.includes(value) || !value ? options : [value, ...options];
    return (
      <select
        autoFocus
        defaultValue={value}
        onChange={e => commit(e.target.value)}
        onBlur={() => setEditing(false)}
        className="w-full text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#FE4A23]"
        style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
      >
        {!value && <option value="">—</option>}
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  const badge = colored ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: statusColor(value), color: '#fff' }}>
      {value || 'No Action Taken'}
    </span>
  ) : (
    <span style={{ color: 'var(--cn-text-secondary)' }}>{value || '—'}</span>
  );

  if (!editable) return badge;

  return (
    <button
      onClick={() => setEditing(true)}
      title="Click to edit"
      className="text-left w-full rounded px-1 py-0.5 -mx-1 transition-colors hover:bg-[var(--cn-bg-hover)] cursor-pointer"
    >
      {badge}
      {saving && <span className="ml-1 text-[10px] opacity-60">saving…</span>}
    </button>
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
  const showPmCol = data.some(r => r['__pm']);

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
    return opts;
  }, [optionSourceData, departmentCol, statusCol, phaseCol, yearCol, monthCol]);
  const isDropdownCol = (h: string) => h === departmentCol || h === yearCol || h === monthCol || h === statusCol || h === phaseCol;

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
    return [...filtered].sort((a, b) => {
      const av = a[sortCol] ?? '';
      const bv = b[sortCol] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [filtered, sortCol, sortDir, yearCol, monthCol, timestampCol]);

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

  return (
    <div className="space-y-4">
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

      <p style={{ color: 'var(--cn-text-muted)' }} className="text-sm">
        <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{sorted.length}</span> of {data.length} records
        {activeFilterCount > 0 && <span className="text-[#FE4A23]"> (filtered)</span>}
      </p>

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
                      <td key={h} className="px-4 py-2 break-words min-w-[120px] max-w-xs">
                        {isUrl && val && !canEdit ? (
                          <a href={val} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: 'var(--cn-accent)' }}>{val}</a>
                        ) : isDropdownCol(h) ? (
                          <SelectCell
                            value={val}
                            colored={isStatusLikeCol(h)}
                            editable={canEdit && !!onCellChange}
                            options={dropdownOptions[h] ?? []}
                            onSave={async v => { if (onCellChange) await onCellChange(row, h, v); }}
                          />
                        ) : (
                          <EditableCell
                            value={val}
                            colored={isStatusLikeCol(h)}
                            editable={canEdit && !!onCellChange}
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
