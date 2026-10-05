'use client';

import { useMemo, useState } from 'react';
import { X, Check, ArrowRight } from 'lucide-react';
import { SheetData } from '@/lib/googleSheets';
import { memberPhoto, memberColor } from '@/lib/memberColors';
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

// "9/30/2026" -> "Sep 30, 2026"
function friendlyDate(raw: string): string {
  const ms = parseSheetDate(raw);
  return ms === null ? '' : new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Round headshot when we have one, otherwise a colored initial.
function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  const photo = memberPhoto(name);
  const style = { width: size, height: size, fontSize: size * 0.45 };
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo} alt={name} title={name} style={style} className="rounded-full object-cover shrink-0 ring-2 ring-[var(--cn-bg-row-even)]" />
  ) : (
    <span title={name} style={{ ...style, background: memberColor(name) }}
      className="rounded-full inline-flex items-center justify-center text-white font-bold shrink-0 ring-2 ring-[var(--cn-bg-row-even)]">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
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
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    closedRows.forEach(r => { const k = get(r, statusCol).toLowerCase(); counts[k] = (counts[k] ?? 0) + 1; });
    return counts;
  }, [closedRows, statusCol]);

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
  const toggleStatus = (s: string) =>
    setStatusSel(prev => (prev.includes(s) ? prev.filter(v => v !== s) : [...prev, s]));

  const dateInputStyle = { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)' };

  return (
    <div className="space-y-5">
      {/* Status — one tap each, none selected = everything */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setStatusSel([])}
          className="px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all"
          style={statusSel.length === 0
            ? { background: 'var(--cn-text-primary)', color: 'var(--cn-bg-card)' }
            : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-secondary)', border: '1px solid var(--cn-border)' }}
        >
          All <span className="opacity-70 ml-1">{closedRows.length}</span>
        </button>
        {CLOSED_STATUS_OPTIONS.map(s => {
          const on = statusSel.includes(s);
          const color = statusColor(s);
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              aria-pressed={on}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all"
              style={on
                ? { background: color, color: '#fff', border: `1px solid ${color}` }
                : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-secondary)', border: '1px solid var(--cn-border)' }}
            >
              {on ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <span className="w-2 h-2 rounded-full" style={{ background: color }} />}
              {s}
              <span className="opacity-70">{statusCounts[s.toLowerCase()] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* Narrow it down */}
      <div className="flex flex-wrap items-end gap-3">
        <MultiSelect label="Project" options={projectOptions} selected={projectSel} onChange={setProjectSel} />
        <MultiSelect label="PM" options={pmOptions} selected={pmSel} onChange={setPmSel} />
        <MultiSelect label="Payment" options={paymentOptions} selected={paymentSel} onChange={setPaymentSel} />
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium" style={{ color: 'var(--cn-text-muted)' }}>Target end date</span>
          <div className="flex items-center gap-1.5">
            <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} aria-label="Target end date from"
              className="text-sm rounded-lg px-2.5 py-2 border focus:outline-none focus:ring-1 focus:ring-[#FE4A23]" style={dateInputStyle} />
            <ArrowRight className="w-3.5 h-3.5" style={{ color: 'var(--cn-text-muted)' }} />
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
            Clear filters
          </button>
        )}
      </div>

      <p className="text-sm" style={{ color: 'var(--cn-text-muted)' }}>
        Showing <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{rows.length}</span> of {closedRows.length} closed projects
      </p>

      {rows.length === 0 ? (
        <div className="text-center py-16 text-sm" style={{ color: 'var(--cn-text-muted)' }}>
          No closed projects match these filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map(r => {
            const id = String(r['__id']);
            const status = get(r, statusCol);
            const color = statusColor(status);
            const payment = get(r, paymentCol);
            const phase = get(r, phaseCol);
            const pm = get(r, '__pm');
            const comments = get(r, commentsCol);
            const start = friendlyDate(get(r, startCol));
            const end = friendlyDate(get(r, endCol));
            const assigned = get(r, assignedCol).split(',').map(s => s.trim()).filter(n => n && n.toLowerCase() !== 'no action taken');
            const isLong = comments.length > 110;
            const isOpen = expanded.has(id);
            return (
              <article
                key={id}
                className="rounded-3xl p-6 flex flex-col gap-5 min-w-0 transition-shadow hover:shadow-lg"
                style={{ background: 'var(--cn-bg-row-even)', border: '1px solid var(--cn-border)' }}
              >
                <div className="flex flex-col gap-3">
                  {/* When */}
                  <div className="text-sm font-semibold" style={{ color: 'var(--cn-text-primary)' }}>
                    {start || end ? <>{start || '—'} → {end || 'no end date'}</> : <span style={{ color: 'var(--cn-text-faint)' }}>No dates set</span>}
                  </div>

                  {/* What */}
                  <h3 className="text-2xl font-bold leading-tight break-words" style={{ color: 'var(--cn-text-primary)' }}>
                    {get(r, projectCol) || 'Untitled project'}
                  </h3>

                  {/* Who */}
                  {(pm || assigned.length > 0) && (
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                      {pm && (
                        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--cn-text-muted)' }}>
                          <Avatar name={pm} size={28} />
                          <span>Managed by <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{pm}</span></span>
                        </div>
                      )}
                      {assigned.length > 0 && (
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex -space-x-2">
                            {assigned.slice(0, 5).map(n => <Avatar key={n} name={n} size={28} />)}
                            {assigned.length > 5 && (
                              <span className="w-7 h-7 rounded-full inline-flex items-center justify-center text-[10px] font-semibold ring-2 ring-[var(--cn-bg-row-even)]"
                                style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-secondary)' }}>+{assigned.length - 5}</span>
                            )}
                          </div>
                          <span className="text-xs truncate" style={{ color: 'var(--cn-text-muted)' }}>{assigned.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Note */}
                {comments && (
                  <div>
                    <h4 className="text-base font-semibold" style={{ color: 'var(--cn-text-primary)' }}>Comments</h4>
                    <p className={`mt-1.5 text-base leading-snug whitespace-pre-wrap break-words ${isLong && !isOpen ? 'line-clamp-3' : ''}`} style={{ color: 'var(--cn-text-secondary)' }}>
                      {comments}
                    </p>
                    {isLong && (
                      <button
                        onClick={() => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
                        className="mt-1 text-sm font-semibold cursor-pointer hover:opacity-80"
                        style={{ color: 'var(--cn-accent)' }}
                      >
                        {isOpen ? 'Show less' : 'Read more'}
                      </button>
                    )}
                  </div>
                )}

                {/* Status / phase / payment — pushed to the bottom so cards in a row line up */}
                <div className="mt-auto pt-4 flex flex-wrap items-center gap-2" style={{ borderTop: '1px solid var(--cn-border)' }}>
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)' }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                    {status}
                  </span>
                  {phase && (
                    <span className="px-3.5 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)' }}>{phase}</span>
                  )}
                  {payment && (
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)' }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: statusColor(payment) }} />
                      {payment}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
