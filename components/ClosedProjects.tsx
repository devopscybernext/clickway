'use client';

import { useMemo, useState } from 'react';
import { X, CalendarDays, User } from 'lucide-react';
import { SheetData } from '@/lib/googleSheets';
import { MultiSelect } from './FilteredDataTable';
import { statusColor } from './PMProjectBandwidth';

// Statuses that put a project on this tab — compared lowercase/trimmed so
// "Closed: Good Feedback" vs "Closed: Good feedback" in the sheet both match.
const CLOSED_STATUS_OPTIONS = ['Escalated', 'Closed: Without feedback', 'Closed: Bad Feedback', 'Closed: Good Feedback'];
const CLOSED_STATUS_KEYS = CLOSED_STATUS_OPTIONS.map(s => s.toLowerCase());

// Sheet dates are M/D/YYYY — returns local-midnight epoch ms, or null when
// blank/unparseable so such rows can be told apart from real dates.
function parseSheetDate(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2])).getTime();
  const t = new Date(raw).getTime();
  return isNaN(t) || !raw.trim() ? null : t;
}

function parseInputDate(iso: string): number | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
}

interface Props {
  // Every project row from both Current Month and Previous Months sheets.
  data: SheetData[];
  headers: string[];
}

// Closed Project tab — read-only cards for every project (current or
// previous month) whose Status is Escalated or one of the three Closed
// outcomes, with filters on top.
export default function ClosedProjects({ data, headers }: Props) {
  const col = (name: string) => headers.find(h => h.toLowerCase() === name);
  const projectCol = headers.find(h => h.toLowerCase().includes('project name'));
  const statusCol = col('status');
  const assignedCol = col('assigned');
  const phaseCol = col('phase');
  const startCol = col('project start date');
  const endCol = col('target end date');
  const paymentCol = headers.find(h => h.toLowerCase().includes('payment status'));
  const commentsCol = headers.find(h => h.toLowerCase().includes('comment'));

  const [statusSel, setStatusSel] = useState<string[]>([]);
  const [projectSel, setProjectSel] = useState<string[]>([]);
  const [pmSel, setPmSel] = useState<string[]>([]);
  const [paymentSel, setPaymentSel] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const get = (r: SheetData, c?: string) => (c ? String(r[c] ?? '').trim() : '');

  const closedRows = useMemo(
    () => data.filter(r => statusCol && CLOSED_STATUS_KEYS.includes(get(r, statusCol).toLowerCase())),
     
    [data, statusCol]
  );

  // Option lists come from the closed rows only, so every choice is
  // guaranteed to match at least one card.
  const unique = (vals: string[]) => [...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const projectOptions = useMemo(() => unique(closedRows.map(r => get(r, projectCol))), [closedRows, projectCol]);  
  const pmOptions = useMemo(() => unique(closedRows.map(r => get(r, '__pm'))), [closedRows]);  
  const paymentOptions = useMemo(() => unique(closedRows.map(r => get(r, paymentCol))), [closedRows, paymentCol]);  

  const fromMs = parseInputDate(from);
  const toMs = parseInputDate(to);

  const rows = useMemo(() => {
    const filtered = closedRows.filter(r => {
      if (statusSel.length && !statusSel.map(s => s.toLowerCase()).includes(get(r, statusCol).toLowerCase())) return false;
      if (projectSel.length && !projectSel.includes(get(r, projectCol))) return false;
      if (pmSel.length && !pmSel.includes(get(r, '__pm'))) return false;
      if (paymentSel.length && !paymentSel.includes(get(r, paymentCol))) return false;
      if (fromMs !== null || toMs !== null) {
        const end = parseSheetDate(get(r, endCol));
        if (end === null) return false; // no Target End Date can't fall in a range
        if (fromMs !== null && end < fromMs) return false;
        if (toMs !== null && end > toMs) return false;
      }
      return true;
    });
    // Latest Target End Date first; rows without one sink to the bottom.
    return filtered.sort((a, b) => (parseSheetDate(get(b, endCol)) ?? -Infinity) - (parseSheetDate(get(a, endCol)) ?? -Infinity));
     
  }, [closedRows, statusSel, projectSel, pmSel, paymentSel, fromMs, toMs, statusCol, projectCol, paymentCol, endCol]);

  const activeFilterCount =
    [statusSel, projectSel, pmSel, paymentSel].filter(s => s.length > 0).length + (from || to ? 1 : 0);
  const clearAll = () => { setStatusSel([]); setProjectSel([]); setPmSel([]); setPaymentSel([]); setFrom(''); setTo(''); };

  const dateInputStyle = { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)' };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <MultiSelect label="Status" options={CLOSED_STATUS_OPTIONS} selected={statusSel} onChange={setStatusSel} />
        <MultiSelect label="Project Name" options={projectOptions} selected={projectSel} onChange={setProjectSel} />
        <MultiSelect label="PM" options={pmOptions} selected={pmSel} onChange={setPmSel} />
        <MultiSelect label="Payment Status" options={paymentOptions} selected={paymentSel} onChange={setPaymentSel} />
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium" style={{ color: 'var(--cn-text-muted)' }}>Target End Date</span>
          <div className="flex items-center gap-1.5">
            <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} aria-label="Target end date from"
              className="text-sm rounded-lg px-2.5 py-2 border focus:outline-none focus:ring-1 focus:ring-[#FE4A23]" style={dateInputStyle} />
            <span className="text-xs" style={{ color: 'var(--cn-text-muted)' }}>to</span>
            <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} aria-label="Target end date to"
              className="text-sm rounded-lg px-2.5 py-2 border focus:outline-none focus:ring-1 focus:ring-[#FE4A23]" style={dateInputStyle} />
          </div>
        </div>
        {activeFilterCount > 0 && (
          <button
            onClick={clearAll}
            title={`Clear all ${activeFilterCount} filter(s)`}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all text-xs font-medium"
            style={{ background: 'var(--cn-bg-input)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            <X className="w-3.5 h-3.5" />
            Clear all ({activeFilterCount})
          </button>
        )}
      </div>

      <p className="text-sm" style={{ color: 'var(--cn-text-muted)' }}>
        <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{rows.length}</span> of {closedRows.length} closed projects
        {activeFilterCount > 0 && <span style={{ color: 'var(--cn-accent)' }}> (filtered)</span>}
      </p>

      {rows.length === 0 ? (
        <div className="text-center py-12 text-sm" style={{ color: 'var(--cn-text-muted)' }}>No closed projects found</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map(r => {
            const id = String(r['__id']);
            const status = get(r, statusCol);
            const payment = get(r, paymentCol);
            const comments = get(r, commentsCol);
            const assigned = get(r, assignedCol).split(',').map(s => s.trim()).filter(Boolean);
            const isLong = comments.length > 140;
            const isOpen = expanded.has(id);
            return (
              <div
                key={id}
                className="rounded-lg border p-4 flex flex-col gap-3 min-w-0"
                style={{ background: 'var(--cn-bg-row-even)', borderColor: 'var(--cn-border)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm break-words" style={{ color: 'var(--cn-text-primary)' }}>
                      {get(r, projectCol) || 'Untitled project'}
                    </h3>
                    <p className="text-xs mt-0.5 inline-flex items-center gap-1" style={{ color: 'var(--cn-text-muted)' }}>
                      <User className="w-3 h-3" />{get(r, '__pm') || '—'}
                    </p>
                  </div>
                  <span className="shrink-0 inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: statusColor(status), color: '#fff' }}>
                    {status}
                  </span>
                </div>

                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <Field label="Phase" value={get(r, phaseCol)} />
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>Payment Status</dt>
                    <dd className="mt-0.5">
                      {payment
                        ? <span className="inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: statusColor(payment), color: '#fff' }}>{payment}</span>
                        : <span style={{ color: 'var(--cn-text-secondary)' }}>—</span>}
                    </dd>
                  </div>
                  <Field label="Project Start Date" value={get(r, startCol)} icon />
                  <Field label="Target End Date" value={get(r, endCol)} icon />
                </dl>

                <div className="text-xs">
                  <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>Assigned</div>
                  {assigned.length ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {assigned.map(n => (
                        <span key={n} className="px-2 py-0.5 rounded-full text-[11px]" style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>{n}</span>
                      ))}
                    </div>
                  ) : <div className="mt-0.5" style={{ color: 'var(--cn-text-secondary)' }}>—</div>}
                </div>

                <div className="text-xs">
                  <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>Comments</div>
                  <p className={`mt-0.5 whitespace-pre-wrap break-words ${isLong && !isOpen ? 'line-clamp-3' : ''}`} style={{ color: 'var(--cn-text-secondary)' }}>
                    {comments || '—'}
                  </p>
                  {isLong && (
                    <button
                      onClick={() => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
                      className="mt-1 text-[11px] font-semibold cursor-pointer hover:opacity-80"
                      style={{ color: 'var(--cn-accent)' }}
                    >
                      {isOpen ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, icon = false }: { label: string; value: string; icon?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>{label}</dt>
      <dd className="mt-0.5 inline-flex items-center gap-1 break-words" style={{ color: 'var(--cn-text-secondary)' }}>
        {icon && <CalendarDays className="w-3 h-3 shrink-0" style={{ color: 'var(--cn-text-faint)' }} />}
        {value || '—'}
      </dd>
    </div>
  );
}
