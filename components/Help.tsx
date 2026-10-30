'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, X, MessageSquarePlus } from 'lucide-react';
import EntryForm from './EntryForm';
import { HELP_STATUSES, HELP_TYPES, HelpRequest } from '@/lib/help';

export type HelpSubTab = 'apply' | 'queries';

const STATUS_COLORS: Record<string, string> = {
  'New': '#2563eb', 'In Review': '#f59e0b', 'In Progress': '#f97316', 'Resolved': '#16a34a', 'Closed': '#6b7280',
};
const TYPE_COLORS: Record<string, string> = { Help: '#2563eb', Suggestion: '#7c3aed', Complaint: '#dc2626' };

// "10/30/2026 14:05:09" -> "Oct 30, 2026"
function friendlyDate(raw: string): string {
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return raw || '—';
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap" style={{ background: color + '20', color }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      {children}
    </span>
  );
}

// Help tab. "Apply": the form anyone can use to ask for help, suggest something or
// complain about the dashboard. "My Queries" / "All Queries": the table of requests —
// each person sees their own; the Super Admin sees everyone's and sets the status.
export default function Help({ subTab, onOpenQueries }: { subTab: HelpSubTab; onOpenQueries: () => void }) {
  return subTab === 'apply' ? <Apply onOpenQueries={onOpenQueries} /> : <Queries />;
}

function Apply({ onOpenQueries }: { onOpenQueries: () => void }) {
  const [sent, setSent] = useState(false);
  return (
    <section className="cn-card rounded-lg border p-3 sm:p-6 space-y-4 max-w-3xl" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--cn-accent)' + '18', color: 'var(--cn-accent)' }}>
          <MessageSquarePlus className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>Help, suggestion or complaint</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>
            Tell us what you need help with, what could be better, or what isn&apos;t working in the dashboard. You can follow it under My Queries.
          </p>
        </div>
      </div>
      <EntryForm formKey="help" compact onSubmitted={() => setSent(true)} />
      {sent && (
        <button onClick={onOpenQueries} className="text-sm font-semibold cursor-pointer hover:opacity-80" style={{ color: 'var(--cn-accent)' }}>
          See my queries →
        </button>
      )}
    </section>
  );
}

function Queries() {
  const [requests, setRequests] = useState<HelpRequest[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState<number | null>(null);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/help')
      .then(res => res.json())
      .then(json => {
        if (!alive) return;
        if (json.success) { setRequests(json.requests); setCanManage(json.canManage); }
        else setError(json.error || 'Could not load the queries');
      })
      .catch(() => { if (alive) setError('Could not load the queries'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    requests.forEach(r => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [requests]);

  const q = search.trim().toLowerCase();
  const shown = requests.filter(r =>
    (!statusFilter || r.status === statusFilter) &&
    (!typeFilter || r.type === typeFilter) &&
    (!q || [r.subject, r.details, r.name, r.area, r.type, String(r.id)].some(v => v.toLowerCase().includes(q))));

  const setStatus = async (r: HelpRequest, status: string) => {
    const previous = r.status;
    setSaveError('');
    setSaving(r.id);
    setRequests(prev => prev.map(x => x.id === r.id ? { ...x, status } : x));
    try {
      const res = await fetch('/api/help', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, status }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Save failed');
    } catch (e) {
      setRequests(prev => prev.map(x => x.id === r.id ? { ...x, status: previous } : x));
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-lg animate-pulse" style={{ background: 'var(--cn-bg-input)' }} />)}
      </div>
    );
  }
  if (error) return <div className="text-sm" style={{ color: '#ef4444' }}>{error}</div>;

  const th = 'px-4 py-3 font-semibold whitespace-nowrap text-xs uppercase tracking-wide';
  const chip = (on: boolean) => on
    ? { background: 'var(--cn-text-primary)', color: 'var(--cn-bg-card)' }
    : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-secondary)', border: '1px solid var(--cn-border)' };

  return (
    <section className="cn-card rounded-lg border p-3 sm:p-6 space-y-4" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
      <div>
        <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>{canManage ? 'All Queries' : 'My Queries'}</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>
          {canManage
            ? 'Everything people have sent from the Apply form. Change a status to let them know where it stands.'
            : 'The help requests, suggestions and complaints you have sent, and where each one stands.'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setStatusFilter('')} className="px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer" style={chip(!statusFilter)}>
          All <span className="opacity-70 ml-1">{requests.length}</span>
        </button>
        {HELP_STATUSES.map(s => (
          <button key={s} onClick={() => setStatusFilter(statusFilter === s ? '' : s)} aria-pressed={statusFilter === s}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer"
            style={statusFilter === s ? { background: STATUS_COLORS[s], color: '#fff' } : chip(false)}>
            {statusFilter !== s && <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[s] }} />}
            {s} <span className="opacity-70">{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--cn-text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search subject, details, area…"
            className="w-full pl-9 pr-8 py-2 rounded-lg text-xs focus:outline-none"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }} />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer" style={{ color: 'var(--cn-text-muted)' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label="Type"
          className="px-3 py-2 rounded-lg text-xs focus:outline-none cursor-pointer"
          style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>
          <option value="">All types</option>
          {HELP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {saveError && <p role="alert" className="text-xs font-medium" style={{ color: '#ef4444' }}>{saveError}</p>}

      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--cn-border)' }}>
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b" style={{ background: 'var(--cn-bg-row-even)', borderColor: 'var(--cn-border)', color: 'var(--cn-text-secondary)' }}>
              <th className={th}>Ref</th>
              <th className={th}>Date</th>
              {canManage && <th className={th}>Raised by</th>}
              <th className={th}>Type</th>
              <th className={th}>Subject</th>
              <th className={th}>Area</th>
              <th className={th}>Details</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => {
              const open = expanded.has(r.id);
              const long = r.details.length > 120;
              return (
                <tr key={r.id} className="border-b align-top" style={{ borderColor: 'var(--cn-border-light, var(--cn-border))' }}>
                  <td className="px-4 py-3 tabular-nums whitespace-nowrap" style={{ color: 'var(--cn-text-muted)' }}>#{r.id}</td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--cn-text-secondary)' }}>{friendlyDate(r.when)}</td>
                  {canManage && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{r.name || r.username}</div>
                      <div className="text-xs" style={{ color: 'var(--cn-text-muted)' }}>{r.role}</div>
                    </td>
                  )}
                  <td className="px-4 py-3"><Pill color={TYPE_COLORS[r.type] ?? '#6b7280'}>{r.type || '—'}</Pill></td>
                  <td className="px-4 py-3 font-semibold min-w-[160px]" style={{ color: 'var(--cn-text-primary)' }}>{r.subject}</td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--cn-text-secondary)' }}>{r.area || '—'}</td>
                  <td className="px-4 py-3 min-w-[240px] max-w-md" style={{ color: 'var(--cn-text-secondary)' }}>
                    <p className={`whitespace-pre-wrap break-words ${long && !open ? 'line-clamp-2' : ''}`}>{r.details}</p>
                    {long && (
                      <button onClick={() => setExpanded(prev => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                        className="mt-1 text-xs font-semibold cursor-pointer hover:opacity-80" style={{ color: 'var(--cn-accent)' }}>
                        {open ? 'Show less' : 'Read more'}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {canManage ? (
                      <div className="flex items-center gap-2">
                        <select aria-label={`Status of request ${r.id}`} value={r.status} disabled={saving === r.id} onChange={e => setStatus(r, e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold focus:outline-none disabled:opacity-60 cursor-pointer"
                          style={{ background: (STATUS_COLORS[r.status] ?? '#6b7280') + '20', color: STATUS_COLORS[r.status] ?? '#6b7280', border: `1px solid ${(STATUS_COLORS[r.status] ?? '#6b7280')}55` }}>
                          {[...HELP_STATUSES, ...(HELP_STATUSES as readonly string[]).includes(r.status) ? [] : [r.status]].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        {saving === r.id && <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: 'var(--cn-accent)' }} />}
                      </div>
                    ) : (
                      <Pill color={STATUS_COLORS[r.status] ?? '#6b7280'}>{r.status}</Pill>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--cn-text-muted)' }}>
            {requests.length === 0
              ? (canManage ? 'Nobody has sent a query yet.' : 'You haven’t sent anything yet. Use Apply to send your first one.')
              : 'No queries match these filters.'}
          </div>
        )}
      </div>
    </section>
  );
}
