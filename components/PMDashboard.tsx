'use client';

import { useMemo, useState } from 'react';
import { SheetData } from '@/lib/dataStore';
import { Card, Empty, CountCards } from './TeamDashboard';
import { computeStatsFor, statusColor, STATUS_OPTIONS, PHASE_OPTIONS, PAYMENT_STATUS_OPTIONS } from './PMProjectBandwidth';
import WorkloadBar, { workloadColor } from './WorkloadBar';
import { memberPhoto, memberColor } from '@/lib/memberColors';
import { hhmmToDecimalHours, formatHoursClock } from './SpecificCharts';

// PM Projects > Dashboard: how this month's projects are going. Admin, HM and Mod see every project and can pick one PM
// (click a name in "Project managers") to see only theirs; a PM sees their own projects, or everyone's with the switch.
// Everything is read from the project rows by column name, the same columns and formulas as the Current Month page.

const lc = (v: unknown) => String(v ?? '').trim().toLowerCase();
const FOLLOWUP_DUE_DAYS = 7;
const PM_CAPACITY = 300;   // same ceiling as the PM workload bar on Current Month
const palette = ['#3b82f6', '#f59e0b', '#16a34a', '#8b5cf6', '#ec4899', '#06b6d4', '#ef4444', '#9ca3af'];

// A time cell is either a plain number of hours or "HH.MM Hours" (see parseDurationDecimal on the Current Month page)
function hoursOf(v: unknown): number {
  const t = String(v ?? '').trim();
  if (!t) return 0;
  if (t.includes('.')) return hhmmToDecimalHours(t);
  const n = Number(t);
  return isNaN(n) ? 0 : n;
}
const clock = (h: number) => `${formatHoursClock(h)}h`;

// how long a project has waited for its follow-up: red once it is a month or never, orange from two weeks, amber after that
const ageColor = (days: number | null) => (days === null || days >= 30 ? '#dc2626' : days >= 14 ? '#f97316' : '#f59e0b');

interface Project { name: string; client: string; pm: string; status: string; phase: string; payment: string; total: number; ac: number; followUp: number | null; row: SheetData }

export default function PMDashboard({ data, headers, viewerName, isAdmin, allPmNames = [] }: {
  data: SheetData[];        // this month's projects (every PM's)
  headers: string[];
  viewerName: string;
  isAdmin: boolean;         // sees everyone's projects and can pick a PM
  allPmNames?: string[];    // every PM, so one with no project yet still has a card
}) {
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [pick, setPick] = useState<string | null>(null);
  const [now] = useState(() => Date.now());   // the page's "today" for follow-up ages

  const col = (pred: (l: string) => boolean) => headers.find(h => pred(h.toLowerCase()));
  const c = useMemo(() => ({
    project: col(l => l === 'project name'), client: col(l => l === 'client name'), status: col(l => l === 'status'), phase: col(l => l === 'phase'),
    payment: col(l => l.includes('payment status')), total: col(l => l === 'total hours'), ac: col(l => l === 'ac hours'),
    current: col(l => l === 'current month hours'), risk: col(l => l === 'risk month hours'),
    follow: col(l => l.includes('follow-up date') || l.includes('followup date')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [headers]);

  const all = useMemo<Project[]>(() => {
    const get = (r: SheetData, h?: string) => (h ? String(r[h] ?? '').trim() : '');
    return data.map(r => {
      const f = get(r, c.follow); const t = f ? new Date(f).getTime() : NaN;
      return {
        name: get(r, c.project) || 'Untitled project', client: get(r, c.client), pm: String(r['__pm'] ?? '').trim(),
        status: get(r, c.status) || 'No Action Taken', phase: get(r, c.phase) || 'No Action Taken', payment: get(r, c.payment) || 'No Action Taken',
        total: hoursOf(get(r, c.total)), ac: hoursOf(get(r, c.ac)), followUp: isNaN(t) ? null : t, row: r,
      };
    });
  }, [data, c]);

  const everyone = isAdmin || scope === 'all';
  const projects = useMemo(() => {
    const mineOnly = !isAdmin && scope === 'mine';
    return all.filter(p => (mineOnly ? lc(p.pm) === lc(viewerName) : true) && (!pick || lc(p.pm) === lc(pick)));
  }, [all, isAdmin, scope, viewerName, pick]);

  const view = (() => {
    const rowsOf = projects.map(p => p.row);
    const statCols = { totalHoursCol: c.total, currentMonthHoursCol: c.current, riskMonthHoursCol: c.risk, paymentStatusCol: c.payment, followupDateCol: c.follow, statusCol: c.status };
    const stats = computeStatsFor(rowsOf, statCols);
    // the options of the dropdown that have projects (in the dropdown's order), then anything else found in the data
    const count = (key: (p: Project) => string, options: string[], colorOf: (name: string, i: number) => string) => {
      const m = new Map<string, number>(options.map(o => [o, 0] as [string, number]));
      const byLower = new Map(options.map(o => [lc(o), o]));
      for (const p of projects) { const k = byLower.get(lc(key(p))) ?? key(p); m.set(k, (m.get(k) ?? 0) + 1); }
      return [...m.entries()].map(([name, value], i) => ({ name, value, color: colorOf(name, i) })).filter(r => r.value > 0);
    };
    // PM Summary: each PM's own figures, from their projects (not narrowed by the PM pick); a PM with none still has a card
    const scopedAll = all.filter(p => !(!isAdmin && scope === 'mine') || lc(p.pm) === lc(viewerName));
    const names = [...new Set([...allPmNames.map(n => n.trim()).filter(Boolean), ...scopedAll.map(p => p.pm).filter(Boolean)])]
      .filter(n => isAdmin || scope === 'all' || lc(n) === lc(viewerName)).sort((x, y) => x.localeCompare(y));
    const pms = names.map(name => {
      const mine = scopedAll.filter(p => lc(p.pm) === lc(name));
      return { name, projects: mine.length, ...computeStatsFor(mine.map(p => p.row), statCols) };
    });
    const due = projects
      .filter(p => p.followUp === null || now - p.followUp > FOLLOWUP_DUE_DAYS * 86_400_000)
      .map(p => ({ ...p, days: p.followUp === null ? null : Math.floor((now - p.followUp) / 86_400_000) }))
      .sort((a, b) => (b.days ?? 1e9) - (a.days ?? 1e9));
    const dueByPm = (() => {
      const groups = new Map<string, { pm: string; items: { name: string; client: string; days: number | null; count: number }[] }>();
      for (const p of due) {
        const pm = p.pm || 'No PM';
        const g = groups.get(pm) ?? { pm, items: [] }; groups.set(pm, g);
        const same = g.items.find(x => x.name === p.name && x.client === p.client);
        if (same) same.count++; else g.items.push({ name: p.name, client: p.client, days: p.days, count: 1 });
      }
      // the longest-waiting first inside a PM (never = longest), and the PM with the most waiting first
      return [...groups.values()].sort((x, y) => y.items.reduce((n, p) => n + p.count, 0) - x.items.reduce((n, p) => n + p.count, 0));
    })();
    return {
      stats,
      status: count(p => p.status, STATUS_OPTIONS, name => statusColor(name)),
      payment: count(p => p.payment, PAYMENT_STATUS_OPTIONS, name => statusColor(name)),
      pms,
      phases: count(p => p.phase, PHASE_OPTIONS, (_n, i) => palette[i % palette.length]),
      burn: [...projects].filter(p => p.total > 0).sort((a, b) => b.total - a.total).slice(0, 8)
        .map(p => ({ name: p.name, client: p.client, pm: p.pm, total: p.total, ac: p.ac, pct: Math.round((p.ac / p.total) * 100) })),
      due,
      dueByPm,
    };
  })();

  // each PM has their own 300 h ceiling, so across several PMs the headroom is the sum of theirs
  const bandwidth = everyone && !pick ? view.pms.reduce((s, p) => s + p.availableHours, 0) : view.stats.availableHours;
  const who = pick ?? (everyone ? 'All projects' : 'My projects');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>PM Dashboard</h2>
        {!isAdmin && (
          <div role="tablist" aria-label="Scope" className="flex gap-1.5">
            {([['mine', 'My projects'], ['all', 'All projects']] as const).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={scope === k} onClick={() => { setScope(k); setPick(null); }}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all"
                style={scope === k
                  ? { background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }
                  : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* the same greeting bar as the Web and Marketing dashboards */}
      <div className="cn-card rounded-lg px-6 py-3 border" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
        <h2 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--cn-text-primary)' }}>
          {(() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; })()}, {viewerName}!
        </h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          {' · '}{isAdmin || scope === 'all' ? "Here's your team overview for today." : "Here's your personal project overview for today."}
        </p>
      </div>

      {/* Overview and PM Summary: the same look and formulas as the Current Month page */}
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>Overview</p>
      <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px" style={{ background: 'var(--cn-border)' }}>
          {[
            ['Occupied', clock(view.stats.totalHours)],
            ['Bandwidth', clock(bandwidth)],
            ['Current', clock(view.stats.currentMonthHours)],
            ['Pending', clock(view.stats.pendingHours)],
            ['Follow-up Due', String(view.stats.followupDue)],
            ['Project Ongoing', String(view.stats.ongoing)],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1.5 p-3" style={{ background: 'var(--cn-bg-card)' }}>
              <p className="text-[9px] font-semibold uppercase tracking-wide leading-tight" style={{ color: 'var(--cn-text-muted)' }}>{label}</p>
              <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--cn-text-primary)' }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {everyone && view.pms.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>PM Summary</p>
            {pick && <button onClick={() => setPick(null)} className="text-xs font-semibold cursor-pointer" style={{ color: 'var(--cn-accent)' }}>Show everyone</button>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {view.pms.map(pm => {
              const photo = memberPhoto(pm.name);
              const bg = memberColor(pm.name);
              const initials = pm.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
              const pct = Math.round((pm.totalHours / PM_CAPACITY) * 100);
              const on = lc(pick) === lc(pm.name);
              return (
                <div key={pm.name} role="button" tabIndex={0} aria-pressed={on} title={on ? 'Show everyone again' : `Show only ${pm.name}'s projects`}
                  onClick={() => setPick(on ? null : pm.name)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPick(on ? null : pm.name); } }}
                  className="rounded-xl border overflow-hidden transition-opacity cursor-pointer"
                  style={{ background: 'var(--cn-bg-card)', borderColor: on ? 'rgba(254, 74, 35, 0.5)' : 'var(--cn-border)', opacity: pick && !on ? 0.55 : 1 }}>
                  <div className="flex items-center gap-2.5 px-3.5 pt-3.5 pb-3">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt={pm.name} className="w-9 h-9 rounded-full object-cover shrink-0" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: `linear-gradient(135deg, ${bg}cc, ${bg}66)` }}>{initials}</div>
                    )}
                    <p className="text-sm font-semibold truncate min-w-0 flex-1" style={{ color: 'var(--cn-text-primary)' }}>{pm.name}</p>
                    <WorkloadBar status={{ label: '', bg: workloadColor(pct), pct }} />
                  </div>
                  <div className="grid grid-cols-2 gap-px" style={{ background: 'var(--cn-border)', borderTop: '1px solid var(--cn-border)' }}>
                    {([['Occupied', pm.totalHours, '#2563eb'], ['Bandwidth', pm.availableHours, '#22c55e']] as const).map(([label, v, color]) => (
                      <div key={label} className="flex flex-col gap-1 px-3.5 py-2.5" style={{ background: 'var(--cn-bg-card)' }}>
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                          <span className="text-[9px] font-semibold uppercase tracking-wide leading-tight" style={{ color: 'var(--cn-text-muted)' }}>{label}</span>
                        </div>
                        <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--cn-text-primary)' }}>{clock(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="font-semibold text-sm pt-1" style={{ color: 'var(--cn-text-primary)' }}>{who} — this month&apos;s projects</p>
      {projects.length === 0 ? (
        <Card title="Projects"><Empty text="No projects this month." /></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* the shape of the projects, in one row: the same compact cards as the Web and Marketing dashboards */}
          <div className="lg:col-span-2 grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
            <Card title="Project status"><CountCards rows={view.status} /></Card>
            <Card title="Phase"><CountCards rows={view.phases} /></Card>
            <Card title="Payments"><CountCards rows={view.payment} /></Card>
          </div>

          <Card title="Hours used — the biggest projects" className="lg:col-span-2">
            {view.burn.length === 0 ? <Empty text="No hours on these projects yet." /> : (
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                {view.burn.map((p, i) => {
                  const color = p.pct > 100 ? '#dc2626' : p.pct >= 75 ? '#f59e0b' : '#16a34a';
                  return (
                    <li key={`${p.name}-${i}`}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium min-w-0" style={{ color: 'var(--cn-text-primary)' }}>{p.name}</span>
                        <span className="text-xs font-bold tabular-nums shrink-0" style={{ color }}>{p.pct}%</span>
                      </div>
                      <p className="text-[11px]" style={{ color: 'var(--cn-text-muted)' }}>{[p.client, everyone ? p.pm : ''].filter(Boolean).join(' · ')}</p>
                      <div className="mt-1.5 h-2 rounded-full" style={{ background: 'var(--cn-bg-input)' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, p.pct)}%`, background: color }} />
                      </div>
                      <p className="mt-1 text-[11px] tabular-nums" style={{ color: 'var(--cn-text-muted)' }}>{clock(p.ac)} spent of {clock(p.total)}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* who needs a nudge: one card per PM, the longest-waiting projects first, the age colour-coded */}
          <Card title={`Follow-up due (${FOLLOWUP_DUE_DAYS}+ days, or never)`} className="lg:col-span-2"
            right={view.due.length > 0 ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#dc262618', color: '#dc2626' }}>{view.due.length} to follow up</span> : undefined}>
            {view.due.length === 0 ? <Empty text="Every project has been followed up recently." /> : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {view.dueByPm.map(g => (
                  <div key={g.pm} className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--cn-border)', background: 'var(--cn-bg-input)' }}>
                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--cn-border)' }}>
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--cn-text-primary)' }}>{g.pm}</span>
                      <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-full text-white" style={{ background: ageColor(g.items[0].days) }}>{g.items.reduce((n, p) => n + p.count, 0)}</span>
                    </div>
                    <ul>
                      {g.items.slice(0, 5).map((p, i) => (
                        <li key={`${p.name}-${i}`} data-testid="follow-up-row" className="flex items-center justify-between gap-3 px-3 py-2 text-sm" style={{ background: 'var(--cn-bg-card)', borderTop: i ? '1px solid var(--cn-border)' : undefined }}>
                          <span className="min-w-0">
                            <span className="font-medium" style={{ color: 'var(--cn-text-primary)' }}>{p.name}</span>
                            {p.count > 1 && <span className="text-xs font-semibold" style={{ color: 'var(--cn-text-muted)' }}> ×{p.count}</span>}
                            {p.client && <span className="block text-[11px]" style={{ color: 'var(--cn-text-muted)' }}>{p.client}</span>}
                          </span>
                          <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: ageColor(p.days) + '1f', color: ageColor(p.days) }}>
                            {p.days === null ? 'never followed up' : `${p.days} days`}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {g.items.length > 5 && <p className="px-3 py-1.5 text-[11px]" style={{ color: 'var(--cn-text-muted)', background: 'var(--cn-bg-card)', borderTop: '1px solid var(--cn-border)' }}>and {g.items.length - 5} more</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
