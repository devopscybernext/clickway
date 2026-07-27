'use client';

import { useState, useMemo } from 'react';
import { SheetData } from '@/lib/googleSheets';
import { X, Clock, Calendar, CalendarDays, CheckCircle2 } from 'lucide-react';
import { memberColor } from '@/lib/memberColors';
import { PersonStats } from './Leaderboard';
import { DonutCard, BarCard, STATUS_COLORS, sumHoursByCol, parseHours } from './SpecificCharts';

// ─── Hardcoded team photo map ─────────────────────────────────────────────────
const TEAM_PHOTOS: Record<string, string> = {
  'akash':      '/team/Akash.png',
  'lovepreet':  '/team/Lovepreet.png',
  'manpreet':   '/team/Manpreet.png',
  'pawan':      '/team/Pawan.png',
  'robin':      '/team/Robin.png',
  'shubham':    '/team/Shubham.png',
  'vinay':      '/team/Vinay.png',
  'dhruv':      '/team/Dhruv.png',
  'kiran':      '/team/Kiran.png',
  'yash':       '/team/Yash.png',
  'muskan':     '/team/Muskan.png',
  'moon':       '/team/Moon.png',
  'sameer':     '/team/Sameer.png',
};

function teamPhoto(name: string): string {
  const lower = name.toLowerCase();
  const key = Object.keys(TEAM_PHOTOS).find(k => lower.includes(k));
  return key ? TEAM_PHOTOS[key] : '';
}

const avatarColor = memberColor;

function initials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function findCol(headers: string[], ...terms: string[]): string | undefined {
  for (const term of terms) {
    const t = term.toLowerCase();
    const found = headers.find(h => h.toLowerCase().includes(t));
    if (found) return found;
  }
  return undefined;
}

function statusStyle(val: string): { bg: string; text: string } {
  const v = val.toLowerCase();
  if (v.includes('occupied'))  return { bg: '#f97316', text: '#fff' };
  if (v.includes('partially')) return { bg: '#fbbf24', text: '#1c1917' };
  if (v.includes('available')) return { bg: '#22c55e', text: '#fff' };
  if (v.includes('leave'))     return { bg: '#ef4444', text: '#fff' };
  return { bg: '#6b7280', text: '#fff' };
}

function timeColor(val: string | number | undefined): string {
  const n = typeof val === 'number' ? val : parseFloat(String(val ?? ''));
  if (isNaN(n) || String(val ?? '').trim() === '') return 'var(--cn-text-muted)';
  if (n > 7)  return '#ef4444';
  if (n === 7) return '#f97316';
  if (n >= 5) return '#fbbf24';
  return '#22c55e';
}

function timePct(val: string | number | undefined): number {
  const n = typeof val === 'number' ? val : parseFloat(String(val ?? '0'));
  return isNaN(n) ? 0 : Math.min(100, (n / 7) * 100);
}

// ─── Time Card ────────────────────────────────────────────────────────────────
function TimeCard({ label, value, icon, accent }: { label: string; value: string | number | undefined; icon: React.ReactNode; accent: string }) {
  const display = value !== undefined && String(value).trim() !== '' ? String(value) : '0';
  const pct = timePct(value);
  const color = timeColor(value);
  return (
    <div className="rounded-md p-4 border" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: accent }}>{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>{label}</span>
      </div>
      <div className="flex items-end gap-1">
        <span className="text-3xl font-bold tabular-nums" style={{ color }}>{display}</span>
        <span className="text-sm mb-1" style={{ color: 'var(--cn-text-muted)' }}>hrs</span>
      </div>
      <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: 'var(--cn-border)' }}>
        <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="text-xs mt-1.5" style={{ color: 'var(--cn-text-faint)' }}>out of 7 hrs</p>
    </div>
  );
}

// ─── Per-person stat lookup ───────────────────────────────────────────────────
function findStats(name: string, memberStats: PersonStats[]): { tasksClosed: number; totalHours: number; pmApproved: number } {
  const s = memberStats.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (!s) return { tasksClosed: 0, totalHours: 0, pmApproved: 0 };
  return {
    tasksClosed: s.taskClosedCount,
    totalHours:  Math.round((s.taskClosedHours + s.qaTestingHours) * 10) / 10,
    pmApproved:  s.pmApprovedCount,
  };
}

// ─── Admin card grid view ─────────────────────────────────────────────────────
function AdminCardGrid({
  employees, nameCol, memberStats,
  onSelect, selectedName, showHours,
}: {
  employees: SheetData[];
  nameCol: string;
  memberStats: PersonStats[];
  onSelect: (name: string) => void;
  selectedName: string | null;
  showHours?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {employees.map((emp, i) => {
        const name    = String(emp[nameCol] ?? '');
        const photo   = teamPhoto(name);
        const color   = avatarColor(name);
        const stats   = findStats(name, memberStats);
        const isSelected = selectedName === name;

        return (
          <button
            key={i}
            onClick={() => onSelect(name)}
            className="relative flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all focus:outline-none cursor-pointer"
            style={{
              background:  isSelected ? `${color}12` : 'var(--cn-bg-card)',
              borderColor: isSelected ? color : 'var(--cn-border)',
              boxShadow:   isSelected ? `0 0 0 1px ${color}44` : undefined,
              borderLeft:  `3px solid ${color}`,
            }}
            onMouseEnter={e => {
              if (!isSelected) (e.currentTarget as HTMLButtonElement).style.borderColor = `${color}88`;
            }}
            onMouseLeave={e => {
              if (!isSelected) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--cn-border)';
            }}
          >
            {/* Avatar */}
            {photo ? (
              <div className="w-12 h-12 rounded-full p-[2px] shrink-0" style={{ background: `conic-gradient(${color}, var(--cn-bg-input), ${color})` }}>
                <img src={photo} alt={name} className="w-full h-full rounded-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-base text-white select-none shrink-0" style={{ background: `linear-gradient(135deg, ${color}cc, ${color}66)` }}>
                {initials(name)}
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate" style={{ color: isSelected ? color : 'var(--cn-text-primary)' }}>{name}</p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-xs font-bold tabular-nums" style={{ color: '#22c55e' }}>{stats.tasksClosed} <span className="font-normal" style={{ color: 'var(--cn-text-muted)' }}>tasks</span></span>
                {showHours && (
                  <span className="text-xs font-bold tabular-nums" style={{ color: '#38bdf8' }}>{stats.totalHours}h <span className="font-normal" style={{ color: 'var(--cn-text-muted)' }}>hrs</span></span>
                )}
                <span className="text-xs font-bold tabular-nums" style={{ color: '#f59e0b' }}>{stats.pmApproved} <span className="font-normal" style={{ color: 'var(--cn-text-muted)' }}>PM OK</span></span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Resource Task Panel ──────────────────────────────────────────────────────
const TASK_STATUS_COLORS: Record<string, string> = {
  'to be started':      '#dc2626',
  'in progress':        '#16a34a',
  'testing':            '#2563eb',
  'on hold':            '#7c3aed',
  'submitted to akash': '#d97706',
  'submitted to pm':    '#10b981',
  'submitted to client':'#6d28d9',
  'n/a':                '#6b7280',
};
const PM_COLOR: Record<string, string> = {
  'approved':           '#16a34a',
  'submitted to client':'#6d28d9',
  'changes':            '#dc2626',
  'no action taken':    '#6b7280',
  'n/a':                '#6b7280',
};

const PM_STATUS_OPTIONS = ['No Action Taken', 'Changes', 'Approved', 'Submitted To Client', 'TicketClosed'];
const PM_STATUS_COLORS_MAP: Record<string, string> = {
  'no action taken': '#6b7280', 'changes': '#f59e0b', 'approved': '#16a34a', 'submitted to client': '#3b82f6', 'ticketclosed': '#7c3aed',
};

function InlinePmSelect({ value, row, col, onStatusChange }: { value: string; row: SheetData; col: string; onStatusChange: (row: SheetData, col: string, val: string) => Promise<void> }) {
  const match = PM_STATUS_OPTIONS.find(o => o.toLowerCase() === value.toLowerCase()) ?? 'No Action Taken';
  const [current, setCurrent] = useState(match);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const color = PM_STATUS_COLORS_MAP[current.toLowerCase()] ?? '#6b7280';
  const chevron = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`;
  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value; setCurrent(v); setSaving(true); setSaved(false);
    try { await onStatusChange(row, col, v); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch { setCurrent(match); } finally { setSaving(false); }
  };
  return (
    <div className="flex items-center gap-1">
      <select value={current} onChange={handleChange} disabled={saving}
        className="text-[10px] rounded-full border-0 font-semibold focus:outline-none cursor-pointer appearance-none disabled:opacity-60"
        style={{ background: color + '20', color, padding: '3px 20px 3px 8px', backgroundImage: chevron, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center' }}>
        {PM_STATUS_OPTIONS.map(o => <option key={o} value={o} style={{ background: '#1a1a1a', color: '#fff' }}>{o}</option>)}
      </select>
      {saving && <span className="w-2.5 h-2.5 border border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: '#6b7280' }} />}
      {saved  && <span className="text-[10px] shrink-0" style={{ color: '#22c55e' }}>✓</span>}
    </div>
  );
}

function ResourceCharts({ name, bwData, bwHeaders }: { name: string; bwData: SheetData[]; bwHeaders: string[] }) {
  const resourceCol = findCol(bwHeaders, 'assigned person');
  const statusCol   = findCol(bwHeaders, 'task status') || findCol(bwHeaders, 'status');
  const projectCol  = findCol(bwHeaders, 'project name') || findCol(bwHeaders, 'project');
  const bucketCol   = findCol(bwHeaders, 'task daily bucket') || findCol(bwHeaders, 'daily bucket');
  const timeEstCol  = findCol(bwHeaders, 'time estimation') || findCol(bwHeaders, 'time estimate') || findCol(bwHeaders, 'estimation');

  if (!resourceCol) return null;

  const scoped = bwData.filter(r => String(r[resourceCol] ?? '').trim().toLowerCase() === name.trim().toLowerCase());

  const statusData     = (statusCol && timeEstCol)  ? sumHoursByCol(scoped, statusCol,  timeEstCol) : [];
  const bucketData     = (bucketCol && timeEstCol)  ? sumHoursByCol(scoped, bucketCol,  timeEstCol) : [];
  const tasksByProject = (projectCol && timeEstCol) ? sumHoursByCol(scoped, projectCol, timeEstCol).slice(0, 10).map(d => ({ name: d.name, Hours: d.value })) : [];

  if (statusData.length === 0 && bucketData.length === 0 && tasksByProject.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DonutCard title="Hours by Status" sub={`Estimated hours by task status — ${name}`} data={statusData} colorMap={STATUS_COLORS} />
        <DonutCard title="Hours by Daily Bucket" sub={`Estimated hours by bucket — ${name}`} data={bucketData} />
      </div>
      <BarCard
        title="Hours per Project"
        sub={`Estimated hours per client / project — ${name} (top 10)`}
        data={tasksByProject}
        dataKey="Hours"
        color="#10b981"
      />
    </div>
  );
}

function ResourceTaskPanel({ name, bwData, bwHeaders, onStatusChange, canEditPmStatus }: {
  name: string; bwData: SheetData[]; bwHeaders: string[];
  onStatusChange?: (row: SheetData, col: string, val: string) => Promise<void>;
  canEditPmStatus?: boolean;
}) {
  const resourceCol = bwHeaders.find(h => h.toLowerCase().includes('assigned person'));
  const statusCol          = bwHeaders.find(h => h.toLowerCase().includes('task status') || h.toLowerCase() === 'status');
  const projectCol         = bwHeaders.find(h => h.toLowerCase().includes('project name') || h.toLowerCase().includes('project'));
  const taskCol            = bwHeaders.find(h => h.toLowerCase().includes('task name') || h.toLowerCase().includes('task information'));
  const taskUrlCol         = bwHeaders.find(h => h.toLowerCase().includes('task url') || h.toLowerCase().includes('task link'));
  const pmStatusCol        = bwHeaders.find(h => h.toLowerCase().includes('pm status'));
  const timeEstCol         = bwHeaders.find(h => h.toLowerCase().includes('time estimation') || h.toLowerCase().includes('time estimate') || h.toLowerCase().includes('estimation'));
  const bucketCol          = bwHeaders.find(h => h.toLowerCase().includes('task daily bucket') || h.toLowerCase().includes('daily bucket'));
  const todayBucketSetCol  = bwHeaders.find(h => h.toLowerCase().includes('today bucket') || h.toLowerCase().includes('bucket set'));

  const [bucketTab, setBucketTab] = useState<'all' | 'today' | 'tomorrow' | 'day after tomorrow'>('all');

  if (!resourceCol || !statusCol) return null;

  const NON_PENDING = ['task closed', 'submitted to client', 'n/a', ''];

  const normBucket = (s: string) => {
    const l = s.trim().toLowerCase();
    if (l === 'tommorow' || l === 'tommorrow' || l === 'tomorow') return 'tomorrow';
    if (l === 'day after tommorow' || l === 'day after tommorrow') return 'day after tomorrow';
    return l;
  };

  const allTasks = bwData.filter(r =>
    String(r[resourceCol] ?? '').trim().toLowerCase() === name.toLowerCase()
  ).filter(r => !NON_PENDING.includes(String(r[statusCol] ?? '').trim().toLowerCase()));

  const BUCKET_ORDER = ['today', 'tomorrow', 'day after tomorrow', 'everyday'];
  const sortedAllTasks = [...allTasks].sort((a, b) => {
    const ba = normBucket(bucketCol ? String(a[bucketCol] ?? '') : '');
    const bb = normBucket(bucketCol ? String(b[bucketCol] ?? '') : '');
    const ia = BUCKET_ORDER.indexOf(ba);
    const ib = BUCKET_ORDER.indexOf(bb);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const myTasks = bucketTab === 'all'
    ? sortedAllTasks
    : sortedAllTasks.filter(r => normBucket(bucketCol ? String(r[bucketCol] ?? '') : '') === bucketTab);

  const todayCount    = allTasks.filter(r => normBucket(bucketCol ? String(r[bucketCol] ?? '') : '') === 'today').length;
  const tomorrowCount = allTasks.filter(r => normBucket(bucketCol ? String(r[bucketCol] ?? '') : '') === 'tomorrow').length;
  const datCount      = allTasks.filter(r => normBucket(bucketCol ? String(r[bucketCol] ?? '') : '') === 'day after tomorrow').length;

  const activeTasks  = myTasks.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'in progress').length;
  const onHoldTasks  = myTasks.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'on hold').length;
  const pendingPM    = myTasks.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'submitted to pm').length;
  const toBeStarted  = myTasks.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'to be started').length;

  if (!allTasks.length) return (
    <p className="text-xs text-center py-4" style={{ color: 'var(--cn-text-muted)' }}>No open tasks</p>
  );

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--cn-border)' }}>
      {/* Summary pills */}
      <div className="flex items-center gap-4 px-4 py-3 flex-wrap" style={{ background: 'var(--cn-bg-input)', borderBottom: '1px solid var(--cn-border)' }}>
        <span className="text-xs font-semibold" style={{ color: 'var(--cn-text-muted)' }}>Open Tasks</span>
        <div className="flex items-center gap-3 ml-auto flex-wrap">
          {[
            { label: 'In Progress',    count: activeTasks,  color: '#16a34a' },
            { label: 'On Hold',        count: onHoldTasks,  color: '#7c3aed' },
            { label: 'Submitted To PM',count: pendingPM,    color: '#065f46' },
            { label: 'To Be Started',  count: toBeStarted,  color: '#f59e0b' },
          ].map(({ label, count, color }) => (
            <span key={label} className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
              <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{count}</span>
              <span style={{ color: 'var(--cn-text-muted)' }}>{label}</span>
            </span>
          ))}
          <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: 'var(--cn-accent)' + '18', color: 'var(--cn-accent)' }}>
            {myTasks.length} total
          </span>
        </div>
      </div>
      {/* Bucket filter tabs */}
      <div className="flex items-center gap-1 px-4 py-2 flex-wrap" style={{ borderBottom: '1px solid var(--cn-border)', background: 'var(--cn-bg-card)' }}>
        {([
          { key: 'all',               label: 'All',               count: allTasks.length,  color: '#6b7280' },
          { key: 'today',             label: 'Today',             count: todayCount,        color: '#16a34a' },
          { key: 'tomorrow',          label: 'Tomorrow',          count: tomorrowCount,     color: '#3b82f6' },
          { key: 'day after tomorrow',label: 'Day After Tomorrow',count: datCount,          color: '#f59e0b' },
        ] as const).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setBucketTab(key)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer"
            style={bucketTab === key
              ? { background: 'var(--cn-accent)', color: '#fff' }
              : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }
            }
          >
            {label}
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: bucketTab === key ? 'rgba(255,255,255,0.25)' : 'var(--cn-border)', color: bucketTab === key ? '#fff' : 'var(--cn-text-primary)' }}>
              {count}
            </span>
          </button>
        ))}
      </div>
      {myTasks.length === 0 && (
        <p className="text-xs text-center py-4" style={{ color: 'var(--cn-text-muted)' }}>No tasks for this bucket</p>
      )}
      {/* Table */}
      {myTasks.length > 0 && <table className="w-full text-xs">
        <thead>
          <tr style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)', borderBottom: '1px solid var(--cn-border)' }}>
            <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Project</th>
            <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Task</th>
            <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Link</th>
            <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Est.</th>
            <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Bucket</th>
            <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Bucket Set</th>
            <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Status</th>
            <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">PM Status</th>
          </tr>
        </thead>
        <tbody>
          {myTasks.map((t, i) => {
            const task          = taskCol           ? String(t[taskCol]           ?? '') : '';
            const project       = projectCol        ? String(t[projectCol]        ?? '') : '';
            const taskUrl       = taskUrlCol        ? String(t[taskUrlCol]        ?? '') : '';
            const est           = timeEstCol        ? String(t[timeEstCol]        ?? '') : '';
            const bucket        = bucketCol         ? String(t[bucketCol]         ?? '') : '';
            const todayBucket   = todayBucketSetCol ? String(t[todayBucketSetCol] ?? '') : '';
            const pmStatus      = pmStatusCol       ? String(t[pmStatusCol]       ?? '') : '';
            const status        = String(t[statusCol] ?? '').trim();
            const sColor        = TASK_STATUS_COLORS[status.toLowerCase()] ?? '#6b7280';
            const pmC           = PM_COLOR[pmStatus.toLowerCase()] ?? '#6b7280';
            return (
              <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--cn-border)' : undefined }}>
                <td className="px-4 py-2.5" style={{ color: 'var(--cn-text-muted)', maxWidth: 140 }}>
                  <span className="line-clamp-1">{project || '—'}</span>
                </td>
                <td className="px-4 py-2.5" style={{ color: 'var(--cn-text-primary)', maxWidth: 200 }}>
                  <span className="line-clamp-1">{task || '—'}</span>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {taskUrl ? (
                    <a href={taskUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-80 transition-opacity" style={{ color: 'var(--cn-accent)' }}>Open</a>
                  ) : <span style={{ color: 'var(--cn-text-muted)' }}>—</span>}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--cn-text-muted)' }}>
                  {est || '—'}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap capitalize" style={{ color: 'var(--cn-text-primary)' }}>
                  {bucket || '—'}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--cn-text-muted)' }}>
                  {todayBucket || '—'}
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize" style={{ background: sColor + '20', color: sColor }}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sColor }} />
                    {status}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {canEditPmStatus && onStatusChange && pmStatusCol ? (
                    <InlinePmSelect value={pmStatus} row={t} col={pmStatusCol} onStatusChange={onStatusChange} />
                  ) : pmStatus && pmStatus.toLowerCase() !== 'n/a' && pmStatus !== '' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize" style={{ background: pmC + '20', color: pmC }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: pmC }} />
                      {pmStatus}
                    </span>
                  ) : <span style={{ color: 'var(--cn-text-muted)' }}>—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props {
  data: SheetData[];
  headers: string[];
  onUpdate?: (row: SheetData, col: string, value: string) => Promise<void>;
  onBandwidthStatusChange?: (row: SheetData, col: string, val: string) => Promise<void>;
  adminView?: boolean;
  canEditPmStatus?: boolean;
  isAdmin?: boolean;
  memberStats?: PersonStats[];
  bandwidthData?: SheetData[];
  bandwidthHeaders?: string[];
  layout?: 'grid' | 'list';
  excludedMembers?: string[];
}

export default function EmployeeGallery({ data, headers, adminView, canEditPmStatus, isAdmin, onBandwidthStatusChange, memberStats = [], bandwidthData = [], bandwidthHeaders = [], layout = 'grid', excludedMembers = [] }: Props) {
  const nameCol = findCol(headers, 'name');

  const [selectedName, setSelectedName] = useState<string | null>(() => {
    if (!nameCol) return null;
    const first = data.find(r => String(r[nameCol] ?? '').trim());
    return first ? String(first[nameCol]).trim() : null;
  });

  const photoCol        = findCol(headers, 'photo', 'image', 'avatar', 'picture');
  const statusCol       = findCol(headers, 'daily status');
  const tasksCol        = findCol(headers, "today's project", 'project and task', 'task');
  const timeCol         = findCol(headers, 'dailytime', 'daily time');
  const tomTimeCol      = findCol(headers, 'tomorrow time', 'tommorow time');
  const tomTaskCol      = findCol(headers, 'tommorow task name', 'tomorrow task name');
  const todayManualCol  = findCol(headers, 'today manual');
  const tomManualCol    = findCol(headers, 'tommorow manual', 'tomorrow manual');
  const dayAfterCol     = findCol(headers, 'day after tomorrow', 'day after tommorow');
  const dayAfterTaskCol = findCol(headers, 'day after task name');
  const dayAfterManCol  = findCol(headers, 'day after manual');
  const leaveCol        = findCol(headers, 'leave zone', 'leave');
  const ongoingCol      = findCol(headers, 'ongoing');

  const knownCols = [nameCol, photoCol, statusCol, tasksCol, timeCol, tomTimeCol, tomTaskCol, todayManualCol, tomManualCol, dayAfterCol, dayAfterTaskCol, dayAfterManCol, leaveCol, ongoingCol]
    .filter(Boolean) as string[];

  const EXTRA_EXCLUDE = ['running task', 'manual', 'tommorow', 'tomorrow', 'day after', 'leave', 'photo', 'image', 'avatar', 'picture'];
  const extraCols = useMemo(
    () => headers.filter(h => {
      const lower = h.toLowerCase();
      return !knownCols.includes(h)
        && !/^column\s+\w+$/i.test(h.trim())
        && !EXTRA_EXCLUDE.some(t => lower.includes(t));
    }),
    [headers, knownCols]
  );

  const employees = useMemo(
    () => nameCol ? data.filter(r => {
      const n = String(r[nameCol] ?? '').trim();
      if (!n) return false;
      if (excludedMembers.length && excludedMembers.some(ex => n.toLowerCase() === ex.toLowerCase())) return false;
      return true;
    }) : [],
    [data, nameCol, excludedMembers]
  );

  if (!employees.length || !nameCol) return null;

  // ── Detail panel (shared between both views) ──────────────────────────────
  const DetailPanel = () => {
    if (!selectedName) return null;
    const selected = employees.find(e => String(e[nameCol] ?? '') === selectedName);
    if (!selected) return null;

    const name        = selectedName;
    const photo       = teamPhoto(name) || (photoCol ? String(selected[photoCol] ?? '') : '');
    const status      = statusCol       ? String(selected[statusCol]       ?? '') : '';
    const tasks       = tasksCol        ? String(selected[tasksCol]        ?? '') : '';
    const timeVal     = timeCol         ? selected[timeCol]                        : undefined;
    const tomTime     = tomTimeCol      ? selected[tomTimeCol]                     : undefined;
    const tomTask     = tomTaskCol      ? String(selected[tomTaskCol]      ?? '') : '';
    const tomManual   = tomManualCol    ? selected[tomManualCol]                   : undefined;
    const dayAfter    = dayAfterCol     ? selected[dayAfterCol]                    : undefined;
    const dayAfterTask= dayAfterTaskCol ? String(selected[dayAfterTaskCol] ?? '') : '';
    const dayAfterMan = dayAfterManCol  ? selected[dayAfterManCol]                 : undefined;
    const leave       = leaveCol        ? String(selected[leaveCol]        ?? '') : '';
    const ongoing     = ongoingCol      ? String(selected[ongoingCol]      ?? '') : '';
    const color       = avatarColor(name);
    const sStyle      = status ? statusStyle(status) : null;
    const bwStats     = adminView ? findStats(name, memberStats) : null;

    return (
      <div
        className="rounded-xl border p-4 sm:p-6 space-y-5 transition-colors mt-4"
        style={{
          background:   'var(--cn-bg-card)',
          borderColor:  `${color}55`,
        }}
      >
        {/* Profile header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {photo ? (
              <img src={photo} alt={name} className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover shrink-0" style={{ outline: `4px solid ${color}`, outlineOffset: '2px' }} />
            ) : (
              <div
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-white font-bold text-2xl sm:text-3xl shrink-0"
                style={{ background: color }}
              >
                {initials(name)}
              </div>
            )}
            <div>
              <h3 className="font-bold text-xl sm:text-2xl" style={{ color: 'var(--cn-text-primary)' }}>
                {name}
              </h3>
              {sStyle && (
                <span className="inline-block mt-1.5 px-3 py-1 rounded-full text-xs font-semibold" style={{ background: sStyle.bg, color: sStyle.text }}>
                  {status}
                </span>
              )}
              {/* Admin stats summary row */}
              {adminView && bwStats && (
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-xs font-semibold" style={{ color: '#22c55e' }}>
                    <CheckCircle2 className="inline w-3.5 h-3.5 mr-1" />{bwStats.tasksClosed} Closed
                  </span>
                  <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>
                    {bwStats.pmApproved} PM Approved
                  </span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setSelectedName(null)}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--cn-bg-input)] shrink-0"
            style={{ color: 'var(--cn-text-muted)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Time cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {timeCol    && <TimeCard label="Daily Time"           value={timeVal}  accent={color} icon={<Clock        className="w-4 h-4" />} />}
          {tomTimeCol && <TimeCard label="Tomorrow Time"        value={tomTime}  accent={color} icon={<Calendar     className="w-4 h-4" />} />}
          {dayAfterCol&& <TimeCard label="Day After Tomorrow"   value={dayAfter} accent={color} icon={<CalendarDays className="w-4 h-4" />} />}
        </div>


        {extraCols.map(col => {
          const val = String(selected[col] ?? '');
          if (!val.trim()) return null;
          return (
            <div key={col} className="rounded-md p-4 border" style={{ background: 'var(--cn-bg-input)', borderColor: 'var(--cn-border)' }}>
              <span className="text-xs font-semibold uppercase tracking-wide block mb-2" style={{ color: 'var(--cn-text-muted)' }}>
                {col}
              </span>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--cn-text-primary)' }}>{val}</p>
            </div>
          );
        })}

        {/* Open task list from bandwidth data */}
        {bandwidthData.length > 0 && bandwidthHeaders.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--cn-text-muted)' }}>
              Open Tasks
            </p>
            <ResourceTaskPanel name={name} bwData={bandwidthData} bwHeaders={bandwidthHeaders} onStatusChange={onBandwidthStatusChange} canEditPmStatus={canEditPmStatus} />
          </div>
        )}

        {/* Graphical representation */}
        {bandwidthData.length > 0 && bandwidthHeaders.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--cn-text-muted)' }}>
              Graphical Representation
            </p>
            <ResourceCharts name={name} bwData={bandwidthData} bwHeaders={bandwidthHeaders} />
          </div>
        )}
      </div>
    );
  };

  // ── List layout: 20% left rail of names, 80% right detail ──────────────────
  if (layout === 'list') {
    return (
      <section className="flex gap-5 items-start">
        <div className="w-1/5 shrink-0 space-y-1 cn-card rounded-xl p-2" style={{ background: 'var(--cn-bg-card)' }}>
          {employees.map((emp, i) => {
            const name = String(emp[nameCol] ?? '');
            const isSelected = selectedName === name;
            const bg = avatarColor(name);
            const photo = teamPhoto(name);
            return (
              <button
                key={i}
                onClick={() => setSelectedName(name)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all cursor-pointer"
                style={{ background: isSelected ? `${bg}14` : 'transparent' }}
              >
                {photo ? (
                  <img src={photo} alt={name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{ background: `linear-gradient(135deg, ${bg}cc, ${bg}66)` }}>
                    {initials(name)}
                  </div>
                )}
                <span className="text-xs font-medium truncate" style={{ color: isSelected ? bg : 'var(--cn-text-primary)' }}>{name}</span>
              </button>
            );
          })}
        </div>
        <div className="flex-1 min-w-0">
          <DetailPanel />
        </div>
      </section>
    );
  }

  // ── Admin view ────────────────────────────────────────────────────────────
  if (adminView) {
    return (
      <section className="space-y-5">
        <h2 className="font-semibold text-base sm:text-lg" style={{ color: 'var(--cn-text-primary)' }}>
          Team
          <span className="ml-2 text-sm font-normal" style={{ color: 'var(--cn-text-muted)' }}>
            {employees.length} members
          </span>
        </h2>

        <AdminCardGrid
          employees={employees}
          nameCol={nameCol}
          memberStats={memberStats}
          onSelect={name => setSelectedName(selectedName === name ? null : name)}
          selectedName={selectedName}
          showHours={isAdmin}
        />

        <DetailPanel />
      </section>
    );
  }

  // ── Default (non-admin) view ──────────────────────────────────────────────
  return (
    <section className="space-y-5">
      <h2 className="font-semibold text-base sm:text-lg" style={{ color: 'var(--cn-text-primary)' }}>
        Team
        <span className="ml-2 text-sm font-normal" style={{ color: 'var(--cn-text-muted)' }}>
          {employees.length} members
        </span>
      </h2>

      <div className="flex gap-3 overflow-x-auto pb-2 snap-x scroll-smooth">
        {employees.map((emp, i) => {
          const name      = String(emp[nameCol] ?? '');
          const photo     = teamPhoto(name) || (photoCol ? String(emp[photoCol] ?? '') : '');
          const status    = statusCol ? String(emp[statusCol] ?? '') : '';
          const isSelected= selectedName === name;
          const color     = avatarColor(name);
          const sStyle    = status ? statusStyle(status) : null;

          return (
            <button
              key={i}
              onClick={() => setSelectedName(isSelected ? null : name)}
              className="flex flex-col items-center gap-2 p-3 rounded-lg border transition-all snap-start shrink-0 w-[88px] sm:w-[100px] focus:outline-none cursor-pointer"
              style={{
                background:  isSelected ? `${color}18` : 'var(--cn-bg-card)',
                borderColor: isSelected ? color : 'var(--cn-border)',
              }}
              onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.borderColor = color; }}
              onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--cn-border)'; }}
            >
              <div className="relative">
                {photo ? (
                  <div className="w-14 h-14 rounded-full p-0.5 shrink-0" style={{ background: color }}>
                    <img src={photo} alt={name} className="w-full h-full rounded-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg select-none" style={{ background: color }}>
                    {initials(name)}
                  </div>
                )}
                {sStyle && (
                  <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2" style={{ background: sStyle.bg, borderColor: 'var(--cn-bg-card)' }} />
                )}
              </div>
              <span className="text-xs font-medium text-center leading-tight line-clamp-2 w-full" style={{ color: isSelected ? color : 'var(--cn-text-primary)' }}>
                {name}
              </span>
            </button>
          );
        })}
      </div>

      <DetailPanel />
    </section>
  );
}
