'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { SheetData } from '@/lib/dataStore';
import { ENTRY_FORMS } from '@/lib/forms';
import { parseTimestamp, startOfMonth, startOfWeek, DAY_MS } from '@/lib/dates';
import { taskInPeriodAt, type PeriodInfo } from '@/lib/period';
import { PM_STATUS_COLORS } from '@/lib/pmStatusColors';
import { parseHours, formatHoursClock } from './SpecificCharts';
import type { PersonStats } from './Leaderboard';

// The charts of a team's Dashboard (Web now, Marketing next), below the Team Bandwidth part of the page. They follow the
// page's Today / Weekly / Monthly switch (lib/period.ts: the same tasks as the Project State and Team Workload cards)
// and the person picked in Team Workload, if any. Everything is read from the team's task rows by column name.
// A person who is not an admin gets the same charts for their own tasks only.

interface Task {
  project: string; person: string; status: string; pm: string; bucket: string;
  est: number; spent: number; added: number; group: string;
}

const REVIEW = ['submitted to pm', 'submitted to web admin', 'submitted to akash', 'submitted to admin'];
const lc = (v: unknown) => String(v ?? '').trim().toLowerCase();

const STATUS_GROUPS: { label: string; color: string; match: (s: string) => boolean }[] = [
  { label: 'To Be Started', color: '#dc2626', match: s => s === 'to be started' },
  { label: 'In Progress', color: '#16a34a', match: s => s === 'in progress' },
  { label: 'Testing', color: '#2563eb', match: s => s === 'testing' },
  { label: 'On Hold', color: '#7c3aed', match: s => s === 'on hold' },
  { label: 'Submitted', color: '#10b981', match: s => REVIEW.includes(s) || s === 'submitted to client' },
  { label: 'Closed', color: '#6b7280', match: s => s === 'task closed' },
  { label: 'No Action Taken', color: '#9ca3af', match: s => s === 'no action taken' },
];

const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const monthShort = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
const hoursLabel = (h: number) => `${formatHoursClock(h)}h`;

export function Card({ title, children, right, className = '' }: { title: string; children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <section className={`cn-card rounded-lg border p-4 ${className}`} style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--cn-text-muted)' }}>{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export const Empty = ({ text = 'Nothing in this period.' }: { text?: string }) => (
  <p className="text-sm py-10 text-center" style={{ color: 'var(--cn-text-muted)' }}>{text}</p>
);

const axisProps = { tick: { fill: 'var(--cn-text-muted)', fontSize: 11 }, stroke: 'var(--cn-border)' };
const tooltipStyle = { background: 'var(--cn-bg-card)', border: '1px solid var(--cn-border)', borderRadius: 8, fontSize: 12, color: 'var(--cn-text-primary)' };

// Estimated against spent hours, horizontal bars (by person, by project)
// Big counts as coloured tiles
export function CountTiles({ rows, cols = 2 }: { rows: { name: string; value: number; color: string }[]; cols?: 2 | 3 }) {
  const shown = rows.filter(r => r.value > 0);
  if (shown.length === 0) return <Empty />;
  return (
    <div className={`grid ${cols === 3 ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
      {shown.map(r => (
        <div key={r.name} className="rounded-lg border px-3 py-2.5" style={{ background: 'var(--cn-bg-input)', borderColor: 'var(--cn-border)', borderLeft: `4px solid ${r.color}` }}>
          <p className="text-2xl font-bold tabular-nums leading-none" style={{ color: 'var(--cn-text-primary)' }}>{r.value}</p>
          <p data-testid="rank-label" className="text-xs font-medium mt-1.5" style={{ color: 'var(--cn-text-muted)' }}>{r.name}</p>
        </div>
      ))}
    </div>
  );
}

// One column per group, the tallest is the biggest
export function CountColumns({ rows }: { rows: { name: string; value: number; color: string }[] }) {
  if (rows.length === 0) return <Empty />;
  const top = Math.max(1, ...rows.map(r => r.value));
  return (
    <div className="flex items-end gap-3 overflow-x-auto pb-1" style={{ minHeight: 230 }}>
      {rows.map(r => (
        <div key={r.name} className="flex-1 min-w-[40px] max-w-[130px] flex flex-col items-center justify-end gap-1.5" style={{ height: 230 }}>
          <span className="text-lg font-bold tabular-nums" style={{ color: 'var(--cn-text-primary)' }}>{r.value}</span>
          <div className="w-full rounded-t-md" style={{ height: `${r.value === 0 ? 3 : Math.max(8, (r.value / top) * 160)}px`, background: r.value === 0 ? 'var(--cn-border)' : r.color }} />
          <span data-testid="rank-label" className="text-[11px] font-medium text-center leading-tight" style={{ color: 'var(--cn-text-muted)' }}>{r.name}</span>
        </div>
      ))}
    </div>
  );
}

// Hours spent against hours estimated, one row each, the share used as a coloured bar (red once over the estimate)
export function HoursList({ rows }: { rows: { name: string; est: number; spent: number }[] }) {
  if (rows.length === 0) return <Empty />;
  return (
    <ul className="space-y-3.5">
      {rows.map(r => {
        const pct = r.est > 0 ? Math.round((r.spent / r.est) * 100) : null;
        const color = pct === null ? '#6b7280' : pct > 100 ? '#dc2626' : pct >= 75 ? '#f59e0b' : '#16a34a';
        return (
          <li key={r.name}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium min-w-0" style={{ color: 'var(--cn-text-primary)' }}>{r.name}</span>
              <span className="text-xs font-bold tabular-nums shrink-0" style={{ color }}>{pct === null ? '' : `${pct}%`}</span>
            </div>
            <div className="mt-1 h-2 rounded-full" style={{ background: 'var(--cn-bg-input)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct ?? 0)}%`, background: color }} />
            </div>
            <p className="mt-0.5 text-[11px] tabular-nums" style={{ color: 'var(--cn-text-muted)' }}>{hoursLabel(r.spent)} spent of {hoursLabel(r.est)} estimated</p>
          </li>
        );
      })}
    </ul>
  );
}

export function HoursBars({ rows }: { rows: { name: string; est: number; spent: number }[] }) {
  if (rows.length === 0) return <Empty />;
  return (
    <div style={{ height: Math.max(180, rows.length * 38 + 40) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid horizontal={false} stroke="var(--cn-border)" strokeDasharray="3 3" />
          <XAxis type="number" {...axisProps} tickFormatter={v => `${v}h`} />
          <YAxis type="category" dataKey="name" width={110} {...axisProps} />
          <Tooltip contentStyle={tooltipStyle} formatter={v => hoursLabel(Number(v))} cursor={{ fill: 'rgba(128,128,128,0.08)' }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar isAnimationActive={false} dataKey="est" name="Estimated" fill="#f59e0b" radius={[0, 3, 3, 0]} />
          <Bar isAnimationActive={false} dataKey="spent" name="Spent" fill="#16a34a" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// A ranked list: the biggest first, each with its count, its share of the whole and a bar to compare them by eye
export function RankedBars({ rows, unit = 'tasks', keepZero = false }: { rows: { name: string; value: number; color: string }[]; unit?: string; keepZero?: boolean }) {
  const shown = rows.filter(r => keepZero || r.value > 0).sort((x, y) => y.value - x.value);
  if (shown.length === 0 || shown.every(r => r.value === 0)) return <Empty />;
  const total = shown.reduce((s, r) => s + r.value, 0);
  const top = shown[0].value;
  return (
    <div className="space-y-3 py-1">
      <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--cn-bg-input)' }} aria-hidden>
        {shown.map(r => <div key={r.name} style={{ width: `${(r.value / total) * 100}%`, background: r.color }} />)}
      </div>
      <ul className="space-y-2.5">
        {shown.map(r => (
          <li key={r.name}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: r.color }} />
                <span data-testid="rank-label" className="truncate font-medium" style={{ color: 'var(--cn-text-primary)' }}>{r.name}</span>
              </span>
              <span className="shrink-0 tabular-nums" style={{ color: 'var(--cn-text-muted)' }}>
                <b style={{ color: 'var(--cn-text-primary)' }}>{r.value}</b> {r.value === 1 ? unit.replace(/s$/, '') : unit} ·{Math.round((r.value / total) * 100)}%
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full" style={{ background: 'var(--cn-bg-input)' }}>
              <div className="h-full rounded-full" style={{ width: `${(r.value / top) * 100}%`, background: r.color }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TeamDashboard({ team, data, headers, scope, viewerName, person, leaderboard, period }: {
  team: 'web' | 'marketing';
  data: SheetData[];            // every task of the team, including the ones nobody has yet
  headers: string[];
  scope: 'team' | 'mine';       // mine: only the viewer's own tasks
  viewerName: string;
  person: string | null;        // the person picked in Team Workload: the charts show only their tasks
  leaderboard: PersonStats[];   // this month's points (team scope only)
  period: PeriodInfo;
}) {
  const tasks = useMemo<Task[]>(() => {
    const col = (...names: string[]) => headers.find(h => names.includes(lc(h)));
    const c = {
      project: col('project name'), person: col('assigned person', 'assigned to'), bucket: col('task daily bucket'),
      status: col('task status updation'), pm: col('pm status'), est: col('time estimation', 'task estimation'),
      spent: col('total time', 'total hours'), ts: col('timestamp'),
      group: team === 'web' ? col('team required') : col('department'),
    };
    const get = (r: SheetData, h?: string) => (h ? String(r[h] ?? '').trim() : '');
    const all = data.map(r => ({
      project: get(r, c.project), person: get(r, c.person), bucket: lc(get(r, c.bucket)),
      status: lc(get(r, c.status)), pm: lc(get(r, c.pm)),
      est: parseHours(get(r, c.est)), spent: parseHours(get(r, c.spent)),
      added: parseTimestamp(get(r, c.ts), period.dateOrder), group: get(r, c.group),
    }));
    const who = scope === 'mine' ? viewerName : person;
    return who ? all.filter(t => lc(t.person) === lc(who)) : all;
  }, [data, headers, team, scope, viewerName, person, period.dateOrder]);

  const view = useMemo(() => {
    const now = period.from;     // inside the period: the window start is enough to anchor the trend
    const inRange = tasks.filter(t => taskInPeriodAt(period, t.bucket, t.added));

    // tasks added over time, split by whether they are closed now: by day (Today), by week (Weekly), by month (Monthly)
    const starts: number[] = period.kind === 'today'
      ? (() => { const d = new Date(period.from); const n = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); return Array.from({ length: n }, (_, i) => new Date(d.getFullYear(), d.getMonth(), i + 1).getTime()); })()
      : period.kind === 'weekly'
        ? Array.from({ length: 8 }, (_, i) => startOfWeek(now) - (7 - i) * 7 * DAY_MS)
        : Array.from({ length: 6 }, (_, i) => startOfMonth(now, 5 - i));
    const label = (ms: number) => (period.kind === 'monthly' ? monthShort(ms) : period.kind === 'today' ? String(new Date(ms).getDate()) : day(ms));
    const trend = starts.map(s => ({ start: s, label: label(s), open: 0, closed: 0 }));
    for (const t of tasks) {
      if (isNaN(t.added) || t.added < starts[0]) continue;
      let i = trend.length - 1;
      while (i > 0 && trend[i].start > t.added) i--;
      if (t.status === 'task closed') trend[i].closed++; else trend[i].open++;
    }

    const statusRows = STATUS_GROUPS.map(g => ({ name: g.label, value: inRange.filter(t => g.match(t.status)).length, color: g.color }));
    const pmOrder = ['approved', 'changes', 'submitted to client', 'ticketclosed'];
    const pmLabels: Record<string, string> = { approved: 'Approved', changes: 'Changes', 'submitted to client': 'Submitted To Client', ticketclosed: 'TicketClosed' };
    const pmRows = pmOrder.map(k => ({ name: pmLabels[k], value: inRange.filter(t => t.pm === k).length, color: PM_STATUS_COLORS[k] }));

    const sumBy = (key: (t: Task) => string, limit: number) => {
      const m = new Map<string, { name: string; est: number; spent: number }>();
      for (const t of inRange) {
        const k = key(t); if (!k) continue;
        const e = m.get(k) ?? { name: k, est: 0, spent: 0 };
        e.est += t.est; e.spent += t.spent; m.set(k, e);
      }
      return [...m.values()].sort((a, b2) => b2.est + b2.spent - (a.est + a.spent)).slice(0, limit).map(e => ({ ...e, est: +e.est.toFixed(2), spent: +e.spent.toFixed(2) }));
    };
    const palette = ['#3b82f6', '#f59e0b', '#16a34a', '#8b5cf6', '#ec4899', '#06b6d4', '#9ca3af'];
    // Web: every Team Required option is listed, even before anyone has a task in it
    const groupCount = new Map<string, number>(team === 'web' ? (ENTRY_FORMS['web-task'].fields.find(f => f.header === 'Team Required')?.options ?? []).map(o => [o, 0] as [string, number]) : []);
    for (const t of inRange) groupCount.set(t.group || 'Not set', (groupCount.get(t.group || 'Not set') ?? 0) + 1);
    const groupRows = [...groupCount.entries()].sort((a, b2) => b2[1] - a[1]).map(([name, value], i) => ({ name, value, color: palette[i % palette.length] }));

    return { trend, statusRows, pmRows, hasPm: pmRows[0].value + pmRows[1].value > 0, byPerson: sumBy(t => t.person, 8), byProject: sumBy(t => t.project, 8), groupRows };
  }, [tasks, period, team]);

  const teamName = team === 'web' ? 'Web' : 'Marketing';
  const who = scope === 'mine' ? 'My work' : person ?? `${teamName} team`;
  const what = period.kind === 'today' ? "today's tasks (Today and Everyday)"
    : period.kind === 'weekly' ? 'tasks added this week, and the Everyday ones' : 'tasks added this month, and the Everyday ones';
  const trendTitle = period.kind === 'today' ? 'Tasks added per day (current month)'
    : period.kind === 'weekly' ? 'Tasks added per week (last 8 weeks)' : 'Tasks added per month (last 6 months)';
  const topThree = leaderboard.filter(p => p.totalPoints !== 0).slice(0, 3);

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--cn-text-primary)' }}>
        {who} — {what}
      </h2>

      {/* the shape of the work, in one row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <Card title="Status of the tasks"><CountTiles rows={view.statusRows} /></Card>

        <Card title="PM review outcome"
          right={view.hasPm ? <span className="text-xs font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{view.pmRows[0].value} approved · {view.pmRows[1].value} waiting on changes</span> : undefined}>
          {view.pmRows.every(r => r.value === 0) ? <Empty text="No PM reviews on the tasks of this period yet." /> : (
            <>
              <CountTiles rows={view.pmRows} />
              <p className="text-[11px] mt-3" style={{ color: 'var(--cn-text-muted)' }}>The latest PM Status of each task in the period.</p>
            </>
          )}
        </Card>

        <Card title={team === 'web' ? 'By team required' : 'By department'}>
          <CountColumns rows={view.groupRows} />
        </Card>
      </div>

      {team === 'web' && (
      <Card title={trendTitle}>
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={view.trend} margin={{ left: -10, right: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--cn-border)" strokeDasharray="3 3" />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis allowDecimals={false} {...axisProps} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(128,128,128,0.08)' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar isAnimationActive={false} dataKey="closed" name="Closed now" stackId="w" fill="#6b7280" />
              <Bar isAnimationActive={false} dataKey="open" name="Still open" stackId="w" fill="#FE4A23" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {scope === 'team' && (
          <Card title="Hours by person — spent of estimated"><HoursList rows={view.byPerson} /></Card>
        )}
        <Card title="Top projects — spent of estimated" className={scope === 'team' ? '' : 'lg:col-span-2'}>
          <HoursList rows={view.byProject} />
        </Card>
      </div>

      {scope === 'team' && !person && topThree.length > 0 && (
        <Card title="Top performers this month">
          <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {topThree.map((p, i) => (
              <li key={p.name} className="flex items-center gap-3 rounded-lg border p-3" style={{ borderColor: 'var(--cn-border)', background: 'var(--cn-bg-input)' }}>
                <span className="w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-bold text-white" style={{ background: ['#f59e0b', '#9ca3af', '#b45309'][i] }}>{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate" style={{ color: 'var(--cn-text-primary)' }}>{p.name}</span>
                  <span className="block text-[11px]" style={{ color: 'var(--cn-text-muted)' }}>{p.totalPoints} points</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
