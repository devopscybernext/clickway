'use client';

import { useState, useRef, useEffect, ChangeEvent } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, Label,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { CheckCircle2, PauseCircle, LayoutGrid, Send, CalendarCheck, CalendarClock, UserCheck, ChevronDown, ChevronUp, AlertTriangle, ThumbsUp, RefreshCw, BadgeCheck, Copy, Check, Search, X, Pencil } from 'lucide-react';
import { SheetData } from '@/lib/googleSheets';
import { memberColor, MONTHLY_BLOCK_MARKETING_NAMES } from '@/lib/memberColors';
import { MARKETING_STATUS_OPTIONS } from '@/lib/config';
import { MultiSelect } from './FilteredDataTable';

// "Task Closed" is a Tasks Assigned-only action — Tasks Overview (team's own
// view of their work) doesn't offer it.
const MARKETING_STATUS_OPTIONS_OVERVIEW = MARKETING_STATUS_OPTIONS.filter(o => o !== 'Task Closed');

// ─── Shared date-filter util (also used per-section) ──────────────────────────
export type DateFilter = 'all' | 'daily' | 'weekly' | 'monthly';
export function filterByDate(data: SheetData[], headers: string[], filter: DateFilter): SheetData[] {
  if (filter === 'all') return data;
  const bucketCol   = headers.find(h => h.toLowerCase().includes('task daily bucket') || h.toLowerCase().includes('bucket'));
  const deadlineCol = headers.find(h => h.toLowerCase().includes('deadline'));
  const tsCol       = headers.find(h => h.toLowerCase().includes('timestamp'));
  const parseDate = (raw: string): Date | null => {
    if (!raw) return null;
    let d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) { d = new Date(+m[3], +m[2] - 1, +m[1]); if (!isNaN(d.getTime())) return d; }
    return null;
  };
  const now = new Date();
  const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sow = new Date(sod); sow.setDate(sod.getDate() - sod.getDay());
  const som = new Date(now.getFullYear(), now.getMonth(), 1);
  return data.filter(row => {
    const bucket = String(row[bucketCol ?? ''] ?? '').trim().toLowerCase();
    // Recurring/pending tasks always included regardless of date filter
    if (bucket === 'everyday' || bucket === 'to be expected') return true;
    if (filter === 'daily') return bucket === 'today';
    const dateRaw = String(row[deadlineCol ?? ''] ?? row[tsCol ?? ''] ?? '').trim();
    const d = parseDate(dateRaw);
    if (!d) return false;
    const since = filter === 'weekly' ? sow : som;
    return d >= since && d < new Date(now.getFullYear(), now.getMonth() + (filter === 'monthly' ? 1 : 0), filter === 'weekly' ? sod.getDate() + (7 - sod.getDay()) : 1);
  });
}

function ChartShell({ title, sub, filter: f, onFilter, children }: { title: string; sub?: string; filter: DateFilter; onFilter: (v: DateFilter) => void; children: React.ReactNode }) {
  return (
    <div className="cn-card rounded-xl overflow-hidden" style={{ background: 'var(--cn-bg-card)' }}>
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-3 border-b" style={{ borderColor: 'var(--cn-border)' }}>
        <div>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--cn-text-primary)' }}>{title}</h3>
          {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>{sub}</p>}
        </div>
        <DateFilterPills value={f} onChange={onFilter} />
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

function DateFilterPills({ value, onChange }: { value: DateFilter; onChange: (f: DateFilter) => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      {(['all', 'daily', 'weekly', 'monthly'] as const).map(f => (
        <button key={f} type="button" onClick={e => { e.stopPropagation(); onChange(f); }}
          className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all cursor-pointer"
          style={{
            background: value === f ? 'var(--cn-accent)' : 'var(--cn-bg-input)',
            color: value === f ? '#fff' : 'var(--cn-text-muted)',
            border: `1px solid ${value === f ? 'var(--cn-accent)' : 'var(--cn-border)'}`,
          }}>
          {f === 'all' ? 'All' : f === 'daily' ? 'Today' : f === 'weekly' ? 'Week' : 'Month'}
        </button>
      ))}
    </div>
  );
}
import QATesting from './QATesting';

interface Props {
  sheet1Data: SheetData[];
  sheet1Headers: string[];
  pmView?: boolean;
  resourceView?: boolean;
  resourceName?: string;
  isAdmin?: boolean;
  availData?: SheetData[];
  availHeaders?: string[];
  onStatusChange?: (row: SheetData, col: string, val: string) => Promise<void>;
  pmStatusColName?: string;
  currentUserName?: string;
  currentUserEmail?: string;
  showFilter?: boolean;
  hideKpi?: boolean;
  hidePmStatus?: boolean;
  hideBreakdownCharts?: boolean;
}

function findCol(headers: string[], ...terms: string[]): string | undefined {
  for (const term of terms) {
    const t = term.toLowerCase();
    const found = headers.find(h => h.toLowerCase().includes(t));
    if (found) return found;
  }
  return undefined;
}

export function countValues(data: SheetData[], col: string): { name: string; value: number }[] {
  const counts: Record<string, number> = {};
  data.forEach(row => {
    const val = String(row[col] ?? '').trim();
    if (val) counts[val] = (counts[val] ?? 0) + 1;
  });
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

// Sum time-estimate hours grouped by a column value
export function sumHoursByCol(data: SheetData[], groupCol: string, timeCol: string): { name: string; value: number }[] {
  const totals: Record<string, number> = {};
  data.forEach(row => {
    const key = String(row[groupCol] ?? '').trim();
    if (!key) return;
    totals[key] = (totals[key] ?? 0) + parseHours(String(row[timeCol] ?? '').trim());
  });
  return Object.entries(totals)
    .map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 }))
    .sort((a, b) => b.value - a.value);
}


const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#3b82f6', high: '#ef4444', medium: '#f59e0b', low: '#10b981',
};
const TEAM_COLORS: Record<string, string> = {
  'ui/ux': '#3b82f6', uiux: '#3b82f6', frontend: '#ef4444', front: '#ef4444',
  backend: '#f59e0b', back: '#f59e0b', qa: '#10b981',
};
const TASK_INFO_COLORS: Record<string, string> = {
  new: '#3b82f6', running: '#ef4444', 'to be expected': '#f59e0b', expected: '#f59e0b',
};
export const STATUS_COLORS: Record<string, string> = {
  'no action taken':     '#6b7280',
  'n/a':                 '#6b7280',
  'to be started':       '#dc2626',
  'in progress':         '#16a34a',
  'testing':             '#2563eb',
  'on hold':             '#7c3aed',
  'submitted to akash':  '#d97706',
  'submitted to admin':  '#d97706',
  'submitted to pm':     '#10b981',
  'submitted to client': '#6d28d9',
  'task closed':         '#4b5563',
};
const PALETTE = ['#FE4A23','#3b82f6','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#84cc16','#ef4444','#14b8a6'];
const PM_STATUS_COLORS_MAP: Record<string, string> = {
  'no action taken':     '#6b7280',
  'n/a':                 '#6b7280',
  'rework':              '#dc2626',
  'approved':            '#16a34a',
  'submitted to client': '#6d28d9',
  'changes':             '#0a53a8',
  'ticketclosed':        '#7c3aed',
};

function resolveColor(name: string, colorMap: Record<string, string>, index: number): string {
  const lower = name.toLowerCase();
  for (const [key, color] of Object.entries(colorMap)) {
    if (lower.includes(key)) return color;
  }
  return PALETTE[index % PALETTE.length];
}

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'var(--cn-bg-card)',
    border: '1px solid var(--cn-border)',
    borderRadius: 6,
    color: 'var(--cn-text-primary)',
    fontSize: 12,
  },
};

// ─── Resource Overview ────────────────────────────────────────────────────────
const EXCLUDED_PERSONS = ['admin', 'test'];

const TEAM_PHOTOS: Record<string, string> = {
  akash: '/team/Akash.png', lovepreet: '/team/Lovepreet.png',
  manpreet: '/team/Manpreet.png', pawan: '/team/Pawan.png',
  robin: '/team/Robin.png', shubham: '/team/Shubham.png',
  vinay: '/team/Vinay.png', dhruv: '/team/Dhruv.png',
  kiran: '/team/Kiran.png', yash: '/team/Yash.png',
  muskan: '/team/Muskan.png', moon: '/team/Moon.png',
  sameer: '/team/Sameer.png',
  atul: '/team/PPC/Atul.png', shiwangi: '/team/PPC/Shiwangi.png',
  dheeraj: '/team/PPC/Dheeraj.png', anjali: '/team/PPC/Anjali.png',
  anurag: '/team/PPC/Anurag.png', vansh: '/team/PPC/Vansh.png',
  akshay: '/team/SEO/Akshay.png', bhavya: '/team/SEO/Bhavya.png',
  kshitij: '/team/SEO/Kshitij.png',
  payal: '/team/SMM/Payal.png', akanksha: '/team/SMM/Akanksha.png',
};

const TEAM_DESIGNATIONS: Record<string, string> = {
  // Web — Development
  lovepreet: 'Web Development', shubham: 'Web Development',
  dhruv: 'Web Development', pawan: 'Web Development',
  // Web — UI/UX Design
  akash: 'UI/UX Design', robin: 'UI/UX Design',
  // Project Management
  yash: 'Project Management', kiran: 'Project Management',
  muskan: 'Project Management', moon: 'Project Management',
  sameer: 'Project Management',
  // Marketing — PPC
  atul: 'PPC', anjali: 'PPC', anurag: 'PPC',
  vansh: 'PPC', dheeraj: 'PPC', shiwangi: 'PPC',
  // Marketing — SMM
  payal: 'SMM', akanksha: 'SMM',
  // Marketing — SEO
  akshay: 'SEO', bhavya: 'SEO', kshitij: 'SEO',
};

function teamDesignation(name: string): string {
  const lower = name.toLowerCase();
  const key = Object.keys(TEAM_DESIGNATIONS).find(k => lower.includes(k));
  return key ? TEAM_DESIGNATIONS[key] : '';
}

function teamPhoto(name: string): string {
  const lower = name.toLowerCase();
  const key = Object.keys(TEAM_PHOTOS).find(k => lower.includes(k));
  return key ? TEAM_PHOTOS[key] : '';
}

// Marketing sub-department rosters — used only for Team Workload's SEO/PPC/
// SMM filter. Akshay is deliberately in both SEO and PPC (does work for
// both), unlike teamDesignation() above which only ever shows one label.
const SEO_NAMES = ['bhavya', 'kshitij', 'akshay'];
const PPC_NAMES = ['atul', 'shiwangi', 'anjali', 'dheeraj', 'anurag', 'vansh', 'akshay'];
const SMM_NAMES = ['payal', 'akanksha'];
function inMarketingSubDept(name: string, dept: 'seo' | 'ppc' | 'smm'): boolean {
  const lower = name.trim().toLowerCase();
  const list = dept === 'seo' ? SEO_NAMES : dept === 'ppc' ? PPC_NAMES : SMM_NAMES;
  return list.some(n => lower.includes(n));
}

// Web sub-department rosters — same purpose as the Marketing split above,
// for Team Workload's UIUX/Front End/Back End filter. Shubham deliberately
// in both Front End and Back End (does work for both).
const UIUX_NAMES = ['akash', 'robin'];
const FRONTEND_NAMES = ['lovepreet', 'shubham'];
const BACKEND_NAMES = ['pawan', 'dhruv', 'shubham'];
function inWebSubDept(name: string, dept: 'uiux' | 'frontend' | 'backend'): boolean {
  const lower = name.trim().toLowerCase();
  const list = dept === 'uiux' ? UIUX_NAMES : dept === 'frontend' ? FRONTEND_NAMES : BACKEND_NAMES;
  return list.some(n => lower.includes(n));
}
type SubDept = 'all' | 'seo' | 'ppc' | 'smm' | 'uiux' | 'frontend' | 'backend';
function matchesSubDept(name: string, dept: SubDept): boolean {
  if (dept === 'all') return true;
  if (dept === 'seo' || dept === 'ppc' || dept === 'smm') return inMarketingSubDept(name, dept);
  return inWebSubDept(name, dept);
}

// Parse time strings like "3 Hours", "0.5 Hour", "1.5 Hours", "90 min", "3",
// or the new "HH.MM Hours" literal-minutes notation ("01.30 Hours" = 1h30m =
// 1.5 decimal hours here, not 1.3) → number of decimal hours. Every "Time
// Estimation"/"Total Hours" sum in the app (bandwidth thresholds, PPC/SEO
// stat cards, Push to Admin) goes through this, so it must recognize
// whichever notation the cell actually holds.
export function parseHours(val: string): number {
  if (!val) return 0;
  const trimmed = val.trim();
  const { h, m } = parseHHMM(trimmed);
  if (h || m) return h + m / 60;
  const lower = trimmed.toLowerCase();
  // "X hour(s)" or "X hr(s)"
  const hourMatch = lower.match(/^([\d.]+)\s*h/);
  if (hourMatch) return parseFloat(hourMatch[1]) || 0;
  // "X min(s)" — minutes only, no hour part
  const minMatch = lower.match(/^([\d.]+)\s*m/);
  if (minMatch) return (parseFloat(minMatch[1]) || 0) / 60;
  // plain number
  const num = parseFloat(lower);
  return isNaN(num) ? 0 : num;
}

// The Leave sheet's Leave column holds free text ("No Action Taken" = not on
// leave, anything else the admin types — "Two Days Leave", "Half Day",
// whatever — = on leave) rather than a fixed yes/no enum, so any non-blank
// value other than the default overrides a resource's status everywhere.
function isOnLeaveText(v: string): boolean {
  const t = v.trim().toLowerCase();
  return t !== '' && t !== 'no action taken';
}

// Deadline column is "M/D/YYYY" (confirmed against the live Marketing sheet,
// e.g. "8/31/2026" = Aug 31) — parse to a local Date, or null if unparseable.
function parseDeadlineDate(val: string): Date | null {
  const m = val.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, mo, d, y] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return isNaN(date.getTime()) ? null : date;
}

// Workload status bands — shared by every "who's Available/Occupied" badge
// in the app (Tasks Overview resource cards, Team Bandwidth, Dashboard's
// Team Workload cards, and the bandwidth chips above Tasks Assigned).
// Web & SMM band on today's daily task hours; PPC & SEO log "Everyday"
// tasks as a monthly retainer block instead of a daily one, so they band
// on a much larger monthly-hours scale.
function workloadStatus(hours: number, isMonthlyBlock: boolean): { label: string; bg: string } {
  if (isMonthlyBlock) {
    if (hours <= 40)  return { label: 'Available',           bg: '#22c55e' };
    if (hours <= 70)  return { label: 'Partially Available', bg: '#16a34a' };
    if (hours <= 100) return { label: 'Partially Occupied',  bg: '#f59e0b' };
    if (hours <= 125) return { label: 'Occupied',            bg: '#ea580c' };
    return                     { label: 'Overload',            bg: '#dc2626' };
  }
  if (hours === 0)  return { label: 'Available',           bg: '#22c55e' };
  if (hours <= 3.5) return { label: 'Partially Available', bg: '#16a34a' };
  if (hours <= 6.5) return { label: 'Partially Occupied',  bg: '#f59e0b' };
  if (hours <= 7.3) return { label: 'Occupied',            bg: '#ea580c' };
  return                     { label: 'Overload',            bg: '#dc2626' };
}

// Status based on todayHours (today+everyday) — matches the badge shown on the card.
function resourceStatus(row: ResourceRow, onLeave = false): { label: string; bg: string; text: string } {
  if (onLeave) return { label: 'On Leave', bg: '#ef4444', text: '#fff' };
  const s = workloadStatus(row.todayHours, MONTHLY_BLOCK_MARKETING_NAMES.has(row.name.trim().toLowerCase()));
  return { ...s, text: '#fff' };
}


interface ResourceRow {
  name: string;
  department: string;
  activeProject: string;
  activeTasks: number;
  onHoldTasks: number;
  pendingPM: number;
  toBeStarted: number;
  testingTasks: number;
  totalHours: number;
  todayHours: number;
  todayTasks: number;
  pendingTasks: { task: string; project: string; status: string; pmStatus: string; timeEst: string; taskUrl: string; bucketSet: string; bucket: string; timeLogged: string; totalHoursVal: string; actionTakenToday: string; performanceSignal: string; blocker: string; nextSteps: string; deadline: string; _raw: SheetData }[];
}

const PM_STATUS_OPTIONS_RO = ['No Action Taken', 'Changes', 'Approved', 'Submitted To Client', 'TicketClosed'];
const PM_STATUS_COLORS_RO: Record<string, string> = {
  'no action taken': '#6b7280', 'n/a': '#6b7280',
  'approved': '#16a34a', 'submitted to client': '#6d28d9', 'changes': '#dc2626',
  'ticketclosed': '#7c3aed',
};

function ResourcePmSelect({ value, raw, colName, onStatusChange }: {
  value: string; raw: SheetData; colName: string;
  onStatusChange: (row: SheetData, col: string, val: string) => Promise<void>;
}) {
  const match = PM_STATUS_OPTIONS_RO.find(o => o.toLowerCase() === value.toLowerCase()) ?? 'No Action Taken';
  const [current, setCurrent] = useState(match);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Re-sync when the underlying row/value changes (e.g. component reused across a filter switch)
  useEffect(() => {
    if (!saving) setCurrent(match);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, raw]);

  const color = PM_STATUS_COLORS_RO[current.toLowerCase()] ?? '#6b7280';

  const handleChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    const newVal = e.target.value;
    setCurrent(newVal);
    setSaving(true);
    setSaved(false);
    try {
      await onStatusChange(raw, colName, newVal);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setCurrent(match);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={current}
        onChange={handleChange}
        disabled={saving}
        className="text-[10px] font-semibold rounded-full pl-2.5 pr-6 py-0.5 border-0 focus:outline-none cursor-pointer disabled:opacity-60 appearance-none"
        style={{
          backgroundColor: color, color: '#fff', minWidth: '120px',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center',
        }}
      >
        {PM_STATUS_OPTIONS_RO.map(opt => (
          <option key={opt} value={opt} style={{ background: '#1a1a1a', color: '#fff' }}>{opt}</option>
        ))}
      </select>
      {saving && <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin inline-block" style={{ borderColor: 'var(--cn-accent)' }} />}
      {saved && <span className="text-[10px]" style={{ color: '#22c55e' }}>✓</span>}
    </div>
  );
}

const STATUS_OPTIONS_RO = ['No Action Taken', 'To Be Started', 'In Progress', 'Testing', 'On Hold', 'Submitted To Akash', 'Submitted To PM'];

function ResourceStatusSelect({ value, raw, colName, onStatusChange, options = STATUS_OPTIONS_RO }: {
  value: string; raw: SheetData; colName: string;
  onStatusChange: (row: SheetData, col: string, val: string) => Promise<void>;
  options?: string[];
}) {
  const match = options.find(o => o.toLowerCase() === value.toLowerCase()) ?? value;
  const [current, setCurrent] = useState(match || 'No Action Taken');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Re-sync when the underlying row/value changes (e.g. component reused across a filter switch)
  useEffect(() => {
    if (!saving) setCurrent(match || 'No Action Taken');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, raw]);

  const color = STATUS_COLORS[current.toLowerCase()] ?? '#6b7280';

  const handleChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    const newVal = e.target.value;
    setCurrent(newVal);
    setSaving(true);
    setSaved(false);
    try {
      await onStatusChange(raw, colName, newVal);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setCurrent(match);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={current}
        onChange={handleChange}
        disabled={saving}
        className="text-[10px] font-semibold rounded-full pl-2.5 pr-6 py-0.5 border-0 focus:outline-none cursor-pointer disabled:opacity-60 appearance-none"
        style={{
          backgroundColor: color, color: '#fff', minWidth: '110px',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center',
        }}
      >
        {options.map(opt => (
          <option key={opt} value={opt} style={{ background: '#1a1a1a', color: '#fff' }}>{opt}</option>
        ))}
        {current && !options.map(o => o.toLowerCase()).includes(current.toLowerCase()) && (
          <option value={current}>{current}</option>
        )}
      </select>
      {saving && <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin inline-block" style={{ borderColor: 'var(--cn-accent)' }} />}
      {saved && <span className="text-[10px]" style={{ color: '#22c55e' }}>✓</span>}
    </div>
  );
}

const BUCKET_OPTIONS_RO = ['Today', 'Tomorrow', 'Day After Tomorrow', 'Everyday', 'No Action Taken', 'Submitted', 'To Be Expected'];
const BUCKET_COLORS_RO: Record<string, string> = {
  today: '#16a34a', tomorrow: '#3b82f6', 'day after tomorrow': '#f59e0b',
};

function ResourceBucketSelect({ value, raw, colName, onStatusChange }: {
  value: string; raw: SheetData; colName: string;
  onStatusChange: (row: SheetData, col: string, val: string) => Promise<void>;
}) {
  const match = BUCKET_OPTIONS_RO.find(o => o.toLowerCase() === value.toLowerCase()) ?? value;
  const [current, setCurrent] = useState(match || 'No Action Taken');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saving) setCurrent(match || 'No Action Taken');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, raw]);

  const color = BUCKET_COLORS_RO[current.toLowerCase()] ?? '#6b7280';

  const handleChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    const newVal = e.target.value;
    setCurrent(newVal);
    setSaving(true);
    setSaved(false);
    try {
      await onStatusChange(raw, colName, newVal);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setCurrent(match);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={current}
        onChange={handleChange}
        disabled={saving}
        className="text-[10px] font-semibold rounded-full pl-2.5 pr-6 py-0.5 border-0 focus:outline-none cursor-pointer disabled:opacity-60 appearance-none capitalize"
        style={{
          backgroundColor: color + '20', color, minWidth: '90px',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(color)}' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center',
        }}
      >
        {BUCKET_OPTIONS_RO.map(opt => (
          <option key={opt} value={opt} style={{ background: '#1a1a1a', color: '#fff' }}>{opt}</option>
        ))}
        {current && !BUCKET_OPTIONS_RO.map(o => o.toLowerCase()).includes(current.toLowerCase()) && (
          <option value={current}>{current}</option>
        )}
      </select>
      {saving && <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin inline-block" style={{ borderColor: 'var(--cn-accent)' }} />}
      {saved && <span className="text-[10px]" style={{ color: '#22c55e' }}>✓</span>}
    </div>
  );
}

function ResourceTimeLoggedEdit({ value, raw, colName, onStatusChange, widthClass = 'w-16' }: {
  value: string; raw: SheetData; colName: string;
  onStatusChange: (row: SheetData, col: string, val: string) => Promise<void>;
  widthClass?: string;
}) {
  const [current, setCurrent] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const original = useRef(value);

  // Re-sync when the underlying row/value changes (e.g. component reused across a filter switch)
  useEffect(() => {
    if (!saving) {
      setCurrent(value);
      original.current = value;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, raw]);

  const handleSave = async () => {
    if (current === original.current) return;
    setSaving(true);
    setSaved(false);
    try {
      await onStatusChange(raw, colName, current);
      original.current = current;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setCurrent(original.current);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={current}
        onChange={e => { setCurrent(e.target.value); setSaved(false); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
        onBlur={handleSave}
        disabled={saving}
        placeholder="—"
        className={`${widthClass} px-1.5 py-0.5 text-[10px] rounded border focus:outline-none disabled:opacity-60 transition-colors`}
        style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)' }}
      />
      {saving && <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: 'var(--cn-accent)' }} />}
      {saved && <span className="text-[10px] shrink-0" style={{ color: '#22c55e' }}>✓</span>}
    </div>
  );
}

// ─── Time Logged On AC — HH.MM duration entry for the "Push to Admin"
// self-logging workflow (own tasks only). Stored as "HH.MM" (e.g. "01.30" =
// 1h30m) — the "." separates literal hours/minutes, it is not a decimal point.
export const DURATION_HOUR_OPTIONS = Array.from({ length: 13 }, (_, i) => i); // 0-12
export const DURATION_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => i); // 0-59

export function parseHHMM(val: string): { h: number; m: number } {
  // Tolerates a trailing " Hours" (or anything else) after the HH.MM part —
  // formatHHMM writes "03.45 Hours", but older/manually-entered values may
  // be bare "03.45". Hours allows up to 3 digits since PM Projects totals
  // can run into the hundreds (e.g. "500.00 Hours").
  const match = val.trim().match(/^(\d{1,3})\.(\d{2})/);
  if (!match) return { h: 0, m: 0 };
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  // Minutes above 59 mean this wasn't actually HH.MM — e.g. a pre-existing
  // decimal-hours value like "0.75 Hour" (legacy, meaning 45 minutes) has a
  // 2-digit fraction that would otherwise misparse as "0h 75m". Reject it so
  // callers (toHM()) fall back to decimal parsing instead.
  if (isNaN(h) || isNaN(m) || m > 59) return { h: 0, m: 0 };
  return { h, m };
}
export function formatHHMM(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}.${String(m).padStart(2, '0')} Hours`;
}
export function hhmmToDecimalHours(val: string): number {
  const { h, m } = parseHHMM(val);
  return h + m / 60;
}
// H/M pair for display — tries the strict HH.MM read first, falls back to
// converting a legacy decimal-hours value (e.g. "1.5 Hour" -> 1h30m).
export function toHM(val: string): { h: number; m: number } {
  const strict = parseHHMM(val);
  if (strict.h || strict.m) return strict;
  const decimal = parseHours(val);
  if (!decimal) return { h: 0, m: 0 };
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 60);
  return m === 60 ? { h: h + 1, m: 0 } : { h, m };
}

function ResourceDurationEdit({ value, raw, colName, onStatusChange }: {
  value: string; raw: SheetData; colName: string;
  onStatusChange: (row: SheetData, col: string, val: string) => Promise<void>;
}) {
  const { h, m } = parseHHMM(value);
  const [saving, setSaving] = useState(false);

  const commit = async (newH: number, newM: number) => {
    setSaving(true);
    try { await onStatusChange(raw, colName, formatHHMM(newH, newM)); }
    finally { setSaving(false); }
  };

  const selectStyle = { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)' };

  return (
    <div className="flex items-center gap-1">
      <select value={h} onChange={e => commit(Number(e.target.value), m)} disabled={saving}
        className="text-[10px] rounded border px-1 py-0.5 focus:outline-none disabled:opacity-60 cursor-pointer" style={selectStyle}>
        {DURATION_HOUR_OPTIONS.map(o => <option key={o} value={o}>{String(o).padStart(2, '0')}</option>)}
      </select>
      <span style={{ color: 'var(--cn-text-muted)' }}>.</span>
      <select value={m} onChange={e => commit(h, Number(e.target.value))} disabled={saving}
        className="text-[10px] rounded border px-1 py-0.5 focus:outline-none disabled:opacity-60 cursor-pointer" style={selectStyle}>
        {DURATION_MINUTE_OPTIONS.map(o => <option key={o} value={o}>{String(o).padStart(2, '0')}</option>)}
      </select>
      {saving && <span className="w-2.5 h-2.5 border border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: 'var(--cn-accent)' }} />}
    </div>
  );
}

function ResourceCard({ row, onLeave, isOpen, onToggle, onStatusChange, pmStatusColName, canEditPmStatus = true, statusColName, timeLoggedColName, totalHoursColName, canEditStatus = false, canCopy = false, pmEmailCol, currentUserEmail, showMarketingCols = false, showTimeLogged = true, showTotalHours = false, bucketColName, actionTakenColName, performanceSignalColName, blockerColName, nextStepsColName }: {
  row: ResourceRow; onLeave: boolean;
  isOpen: boolean; onToggle: () => void;
  onStatusChange?: (row: SheetData, col: string, val: string) => Promise<void>;
  pmStatusColName?: string;
  canEditPmStatus?: boolean;
  statusColName?: string;
  timeLoggedColName?: string;
  totalHoursColName?: string;
  canEditStatus?: boolean;
  canCopy?: boolean;
  pmEmailCol?: string;
  currentUserEmail?: string;
  showMarketingCols?: boolean;
  showTimeLogged?: boolean;
  showTotalHours?: boolean;
  bucketColName?: string;
  actionTakenColName?: string;
  performanceSignalColName?: string;
  blockerColName?: string;
  nextStepsColName?: string;
}) {
  // Fields (including Time Logged On AC) only become editable after clicking
  // "Edit" — Push to Admin only appears once Edit mode is off again, so
  // logging hours and pushing them are two clearly separate steps.
  const [editMode, setEditMode] = useState(false);
  const canEditFields = canEditStatus && editMode;

  // PPC/SEO only — Web and SMM project cards don't get the Est/Total/Pending
  // Hours + Days Left summary (MONTHLY_BLOCK_MARKETING_NAMES is exactly the
  // PPC+SEO roster already used elsewhere for the monthly-hour-block status).
  const showProjectStats = showMarketingCols && MONTHLY_BLOCK_MARKETING_NAMES.has(row.name.trim().toLowerCase());

  const visibleTasks = row.pendingTasks;
  // Group into one card per project, largest project first — mirrors the
  // Team Bandwidth/Team Workload layout instead of one long flat table.
  const projectGroups = (() => {
    const map = new Map<string, typeof visibleTasks>();
    visibleTasks.forEach(t => {
      const key = t.project || 'No Project';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  })();
  // Web and SMM just get one flat list of rows — grouping by project (with
  // the Est/Total/Pending/Days Left header) is PPC/SEO-only, same gate as
  // showProjectStats.
  const groupByProject = showProjectStats;
  const displayGroups: typeof projectGroups = groupByProject ? projectGroups : [['', visibleTasks]];
  // Fixed per-column pixel widths so the table never squishes/overlaps —
  // once the sum exceeds the container, overflow-x-auto scrolls instead.
  const cardTableMinWidth =
    (canCopy ? 40 : 0) + (groupByProject ? 0 : 140) + (showMarketingCols ? 160 : 220) + 70 + 70 +
    (showTotalHours ? 90 : 0) + 120 + 110 +
    (showMarketingCols ? 140 + 160 + 110 + 110 : 0) +
    (showTimeLogged ? 110 : 0) + 140 + 160;
  const open = isOpen;
  const initials = row.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  const bg      = memberColor(row.name);
  const photo   = teamPhoto(row.name);
  const status  = resourceStatus(row, onLeave);
  const isOccupied = row.activeTasks > 0;
  const highlightColor = onLeave ? '#ef4444' : bg;
  const [copiedRowIdx, setCopiedRowIdx] = useState<number | null>(null);
  const [copiedTable, setCopiedTable] = useState(false);

  const statusDot = (color: string) => (
    <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
  );

  // Same row-copy format as the Tasks Bucket table (FilteredDataTable.copyRow)
  const copyRow = (t: ResourceRow['pendingTasks'][number], idx: number) => {
    const text = `Project Name: ${t.project}\nTask URL: ${t.taskUrl}\nEst Time: `;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedRowIdx(idx);
    setTimeout(() => setCopiedRowIdx(null), 2000);
  };

  // Same columns/format as the Tasks Bucket table (FilteredDataTable.copyTable)
  // for Web; Marketing gets its own detail-field set instead.
  const COPY_COLS = showMarketingCols
    ? ['Project Name', 'Task Name', 'Est. Hours', 'Total Hours', 'Time Logged On AC', 'Action Taken Today', 'Performance Signal/Insights', 'Blocker', 'Next Steps', 'Task Status Updation']
    : ['Project Name', 'Task Name', 'Task URL', 'Time Estimation', 'Time Logged On AC', 'Task Status'];
  const copyTable = async () => {
    // Only Today / Everyday tasks get copied — others (Tomorrow, Submitted, etc.) are excluded
    const copyableTasks = visibleTasks.filter(t => {
      const b = t.bucket.trim().toLowerCase();
      return b === 'today' || b === 'everyday';
    });
    const rowsToCopy = showMarketingCols
      ? copyableTasks.map(t => [t.project, t.task, t.timeEst, t.totalHoursVal, t.timeLogged, t.actionTakenToday, t.performanceSignal, t.blocker, t.nextSteps, t.status])
      : copyableTasks.map(t => [t.project, t.task, t.taskUrl, t.timeEst, t.timeLogged, t.status]);
    const html = `
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;color:#111;">
  <thead>
    <tr style="background-color:#FE4A23;color:#ffffff;">
      <th style="border:1px solid #555;padding:8px 12px;text-align:left;white-space:nowrap;">#</th>
      ${COPY_COLS.map(h => `<th style="border:1px solid #555;padding:8px 12px;text-align:left;white-space:nowrap;">${h}</th>`).join('')}
    </tr>
  </thead>
  <tbody>
    ${rowsToCopy.map((r, i) => `
    <tr style="background-color:${i % 2 === 0 ? '#ffffff' : '#fafafa'};">
      <td style="border:1px solid #ddd;padding:6px 12px;color:#888;">${i + 1}</td>
      ${r.map(v => `<td style="border:1px solid #ddd;padding:6px 12px;">${v ?? ''}</td>`).join('')}
    </tr>`).join('')}
  </tbody>
</table>`;
    const text = [
      ['#', ...COPY_COLS].join('\t'),
      ...rowsToCopy.map((r, i) => [i + 1, ...r].join('\t')),
    ].join('\n');
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html':  new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(text);
    }
    setCopiedTable(true);
    setTimeout(() => setCopiedTable(false), 2500);
  };

  // ─── Push to Admin — Time Logged On AC -> Total Hours (own tasks only) ──────
  const pushableTasks = (onStatusChange && canEditStatus && timeLoggedColName && totalHoursColName)
    ? visibleTasks.filter(t => hhmmToDecimalHours(t.timeLogged) > 0)
    : [];
  const pushTotalHours = pushableTasks.reduce((s, t) => s + hhmmToDecimalHours(t.timeLogged), 0);
  const [showPushConfirm, setShowPushConfirm] = useState(false);
  const [pushing, setPushing] = useState(false);

  const handlePushToAdmin = async () => {
    if (!onStatusChange || !timeLoggedColName || !totalHoursColName) return;
    setPushing(true);
    try {
      for (const t of pushableTasks) {
        const logged = hhmmToDecimalHours(t.timeLogged);
        const existing = parseHours(t.totalHoursVal);
        const sum = Math.round((existing + logged) * 100) / 100;
        await onStatusChange(t._raw, totalHoursColName, `${sum} Hours`);
        await onStatusChange(t._raw, timeLoggedColName, '');
      }
    } finally {
      setPushing(false);
      setShowPushConfirm(false);
    }
  };

  return (
    <div
      className="cn-card rounded-xl overflow-hidden"
      style={{
        background:  (isOccupied || onLeave) ? `${highlightColor}08` : 'var(--cn-bg-card)',
        borderLeft:  `3px solid ${highlightColor}`,
        boxShadow:   (isOccupied || onLeave) ? `inset 0 0 0 1px ${highlightColor}22` : undefined,
      }}
    >
      {/* Main row — entire row is clickable */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={visibleTasks.length > 0 ? onToggle : undefined}
        style={{ cursor: visibleTasks.length > 0 ? 'pointer' : 'default' }}
      >
        {/* Avatar */}
        {photo ? (
          <div className="w-10 h-10 rounded-full p-[2px] shrink-0" style={{ background: `conic-gradient(${highlightColor}, #e5e7eb, ${highlightColor})` }}>
            <img src={photo} alt={row.name} className="w-full h-full rounded-full object-cover"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ background: `linear-gradient(135deg, ${bg}cc, ${bg}66)` }}>
            {initials}
          </div>
        )}

        {/* Name + status badge + current project */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--cn-text-primary)' }}>{row.name}</p>
            <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: status.bg, color: status.text }}>
              {status.label}
            </span>
          </div>
          <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>
            {teamDesignation(row.name) || row.activeProject || '—'}
          </p>
        </div>

        {/* Stat pills */}
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          {row.todayTasks > 0 && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shrink-0"
              style={{ background: '#f59e0b22', color: '#f59e0b' }}
              title="Today + Everyday Tasks & Hours">
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {row.todayTasks} Tasks · {Math.round(row.todayHours * 10) / 10}h
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs" title="In Progress">
            {statusDot('#16a34a')}
            <span style={{ color: 'var(--cn-text-primary)' }} className="font-semibold">{row.activeTasks}</span>
            <span style={{ color: 'var(--cn-text-muted)' }}>in progress</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs" title="On Hold">
            {statusDot('#7c3aed')}
            <span style={{ color: 'var(--cn-text-primary)' }} className="font-semibold">{row.onHoldTasks}</span>
            <span style={{ color: 'var(--cn-text-muted)' }}>on hold</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs" title="Pending PM Review">
            {statusDot('#10b981')}
            <span style={{ color: 'var(--cn-text-primary)' }} className="font-semibold">{row.pendingPM}</span>
            <span style={{ color: 'var(--cn-text-muted)' }}>PM</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs" title="To Be Started">
            {statusDot('#dc2626')}
            <span style={{ color: 'var(--cn-text-primary)' }} className="font-semibold">{row.toBeStarted}</span>
            <span style={{ color: 'var(--cn-text-muted)' }}>to be started</span>
          </div>
        </div>

        {/* Total badge */}
        <div className="px-2.5 py-1 rounded-full text-xs font-bold shrink-0" style={{ background: bg + '18', color: bg }}>
          {row.activeTasks + row.onHoldTasks + row.pendingPM + row.toBeStarted}
        </div>

        {/* Edit toggle */}
        {canEditStatus && visibleTasks.length > 0 && (
          <button
            onClick={e => { e.stopPropagation(); setEditMode(m => !m); }}
            title={editMode ? 'Stop editing' : 'Edit'}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold cursor-pointer transition-all"
            style={editMode
              ? { background: 'var(--cn-accent)', color: '#fff' }
              : { background: 'var(--cn-bg-input)', border: '1px solid var(--cn-border)', color: 'var(--cn-text-primary)' }}
          >
            <Pencil className="w-3 h-3" />
            {editMode ? 'Done' : 'Edit'}
          </button>
        )}

        {/* Push to Admin button — only once Edit mode is off, so logging
            hours and pushing them are two clearly separate steps */}
        {!editMode && pushableTasks.length > 0 && (
          <button
            onClick={e => { e.stopPropagation(); setShowPushConfirm(true); }}
            title="Push logged hours to Total Hours"
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold cursor-pointer transition-all"
            style={{ background: 'var(--cn-accent)', color: '#fff' }}
          >
            <Send className="w-3 h-3" />
            Push to Admin ({pushableTasks.length})
          </button>
        )}

        {/* Copy table button */}
        {canCopy && visibleTasks.length > 0 && (
          <button
            onClick={e => { e.stopPropagation(); copyTable(); }}
            title="Copy table"
            className="shrink-0 w-7 h-7 rounded-lg inline-flex items-center justify-center cursor-pointer transition-all"
            style={copiedTable
              ? { background: '#16a34a18', border: '1px solid #16a34a40', color: '#16a34a' }
              : { background: 'var(--cn-bg-input)', border: '1px solid var(--cn-border)', color: 'var(--cn-text-muted)' }}
          >
            {copiedTable ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* Expand indicator */}
        {visibleTasks.length > 0 && (
          <div
            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}
          >
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        )}
      </div>

      {/* Push to Admin confirmation bar — sits right below the info bar,
          left = summary text, right = Yes/No, instead of a centered popup */}
      {showPushConfirm && (
        <div
          className="flex items-center justify-between gap-3 px-4 py-2.5 flex-wrap"
          style={{ borderTop: '1px solid var(--cn-border)', background: 'var(--cn-accent)' + '0d' }}
          onClick={e => e.stopPropagation()}
        >
          <p className="text-xs leading-snug" style={{ color: 'var(--cn-text-primary)' }}>
            Are you sure you want to push to admin? This adds{' '}
            <span className="font-semibold">{Math.round(pushTotalHours * 100) / 100}h</span>{' '}
            across {pushableTasks.length} task{pushableTasks.length === 1 ? '' : 's'} onto Total Hours, and clears Time Logged On Ac.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={e => { e.stopPropagation(); setShowPushConfirm(false); }}
              disabled={pushing}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-colors disabled:opacity-50"
              style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
            >
              No
            </button>
            <button
              onClick={e => { e.stopPropagation(); handlePushToAdmin(); }}
              disabled={pushing}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-colors disabled:opacity-50"
              style={{ background: 'var(--cn-accent)', color: '#fff' }}
            >
              {pushing ? 'Pushing…' : 'Yes'}
            </button>
          </div>
        </div>
      )}

      {/* Expanded task list — grouped into one card per project for PPC/SEO,
          one flat list of rows for Web/SMM */}
      {open && visibleTasks.length > 0 && (
        <div style={{ borderTop: '1px solid var(--cn-border)' }} className="p-3 sm:p-4 flex flex-col gap-3">
          {displayGroups.map(([project, tasks]) => {
            const sumEst = tasks.reduce((s, t) => s + parseHours(t.timeEst), 0);
            const sumTotal = tasks.reduce((s, t) => s + parseHours(t.totalHoursVal), 0);
            const pending = sumEst - sumTotal;
            const isSurpassed = pending < 0;
            const pendingWordLabel = isSurpassed ? 'Surpass Hours' : 'Pending Hours';
            const pendingValueLabel = isSurpassed ? `+${Math.abs(pending).toFixed(2)}h` : `${pending.toFixed(2)}h`;
            const deadlines = tasks.map(t => parseDeadlineDate(t.deadline)).filter((d): d is Date => d !== null);
            const earliestDeadline = deadlines.length ? new Date(Math.min(...deadlines.map(d => d.getTime()))) : null;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const daysLeft = earliestDeadline
              ? Math.round((earliestDeadline.getTime() - today.getTime()) / 86_400_000)
              : null;
            const daysLeftColor = daysLeft === null ? 'var(--cn-text-muted)' : daysLeft <= 0 ? '#dc2626' : daysLeft <= 3 ? '#f59e0b' : '#16a34a';
            return (
          <div key={project || 'flat'} className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--cn-border)', background: 'var(--cn-bg-card)' }}>
            {groupByProject && (
              <div className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--cn-border)', background: 'var(--cn-bg-input)' }}>
                <p className="text-xs font-bold truncate" style={{ color: 'var(--cn-text-primary)' }}>{project}</p>
                <div className="flex items-center gap-2 shrink-0">
                  {showProjectStats && (
                    <div className="flex items-center gap-2 text-[10px]">
                      <span style={{ color: 'var(--cn-text-muted)' }}>Est. Hours <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{sumEst.toFixed(2)}h</span></span>
                      <span style={{ color: 'var(--cn-text-muted)' }}>Spend Hours <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{sumTotal.toFixed(2)}h</span></span>
                      <span style={{ color: isSurpassed ? '#dc2626' : 'var(--cn-text-muted)' }}>{pendingWordLabel} <span className="font-semibold">{pendingValueLabel}</span></span>
                      {daysLeft !== null && (
                        <span className="px-1.5 py-0.5 rounded-full font-semibold" style={{ background: daysLeftColor + '18', color: daysLeftColor }}>
                          {daysLeft} Day{Math.abs(daysLeft) === 1 ? '' : 's'} Left
                        </span>
                      )}
                    </div>
                  )}
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'var(--cn-bg-card)', color: 'var(--cn-text-muted)' }}>{tasks.length}</span>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
          <table className="text-xs table-fixed" style={{ width: '100%', minWidth: cardTableMinWidth }}>
            <colgroup>
              {canCopy && <col style={{ width: '40px' }} />}  {/* Copy */}
              {!groupByProject && <col style={{ width: '140px' }} />}  {/* Project — redundant when already shown as the group header */}
              <col style={{ width: showMarketingCols ? '160px' : '220px' }} />  {/* Task */}
              <col style={{ width: '70px' }} />   {/* Link */}
              <col style={{ width: '70px' }} />   {/* Est. */}
              {showTotalHours && <col style={{ width: '90px' }} />}  {/* Total Hours */}
              <col style={{ width: '120px' }} />  {/* Task Daily Bucket */}
              <col style={{ width: '150px' }} />  {/* Bucket Set */}
              {showMarketingCols && <col style={{ width: '140px' }} />}  {/* Action Taken Today */}
              {showMarketingCols && <col style={{ width: '160px' }} />}  {/* Performance Signal/Insights */}
              {showMarketingCols && <col style={{ width: '110px' }} />}  {/* Blocker */}
              {showMarketingCols && <col style={{ width: '110px' }} />}  {/* Next Steps */}
              {showTimeLogged && <col style={{ width: '110px' }} />}  {/* Time Logged On AC */}
              <col style={{ width: '140px' }} />  {/* Status */}
              <col style={{ width: '160px' }} />  {/* PM Status */}
            </colgroup>
            <thead>
              <tr style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}>
                {canCopy && <th className="px-2 py-2 w-10" />}
                {!groupByProject && <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Project</th>}
                <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Task</th>
                <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Link</th>
                <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Est.</th>
                {showTotalHours && <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Total Hours</th>}
                <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Task Daily Bucket</th>
                <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Bucket Set</th>
                {showMarketingCols && <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Action Taken Today</th>}
                {showMarketingCols && <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Performance Signal/Insights</th>}
                {showMarketingCols && <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Blocker</th>}
                {showMarketingCols && <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Next Steps</th>}
                {showTimeLogged && <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Time Logged On AC</th>}
                <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Status</th>
                <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">PM Status</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t, i) => {
                const sColor  = STATUS_COLORS[t.status.toLowerCase()] ?? '#6b7280';
                const pmColor: Record<string,string> = {
                  'approved': '#16a34a', 'submitted to client': '#6d28d9',
                  'changes': '#dc2626', 'no action taken': '#6b7280', 'n/a': '#6b7280', 'ticketclosed': '#7c3aed',
                };
                const pmC = pmColor[t.pmStatus.toLowerCase()] ?? '#6b7280';
                const bucketColors: Record<string, string> = {
                  today: '#16a34a', tomorrow: '#3b82f6', 'day after tomorrow': '#f59e0b',
                };
                const normBucket = (s: string) => {
                  const l = s.trim().toLowerCase();
                  if (l === 'tommorow' || l === 'tommorrow' || l === 'tomorow') return 'tomorrow';
                  if (l === 'day after tommorow' || l === 'day after tommorrow') return 'day after tomorrow';
                  return l;
                };
                const bColor = bucketColors[normBucket(t.bucket)] ?? '#6b7280';
                const rowCanEditPmStatus = canEditPmStatus && (
                  !pmEmailCol || !currentUserEmail ||
                  String(t._raw[pmEmailCol] ?? '').trim().toLowerCase() === currentUserEmail.trim().toLowerCase()
                );
                return (
                  <tr key={String(t._raw['__row'] ?? i)} style={{ borderTop: '1px solid var(--cn-border-light, var(--cn-border))' }}>
                    {/* Copy row */}
                    {canCopy && (
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={() => copyRow(t, i)}
                          title="Copy task info"
                          className="w-7 h-7 rounded-lg inline-flex items-center justify-center cursor-pointer transition-all"
                          style={{
                            background: copiedRowIdx === i ? '#16a34a18' : 'var(--cn-bg-input)',
                            color:      copiedRowIdx === i ? '#16a34a'   : 'var(--cn-text-muted)',
                            border:     `1px solid ${copiedRowIdx === i ? '#16a34a40' : 'var(--cn-border)'}`,
                          }}
                        >
                          {copiedRowIdx === i ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </td>
                    )}
                    {/* Project — redundant when already shown as the group header */}
                    {!groupByProject && (
                      <td className="px-4 py-2 truncate" style={{ color: 'var(--cn-text-muted)' }}>
                        <span className="truncate block">{t.project || '—'}</span>
                      </td>
                    )}
                    {/* Task */}
                    <td className="px-4 py-2 truncate" style={{ color: 'var(--cn-text-primary)' }}>
                      <span className="truncate block">{t.task || '—'}</span>
                    </td>
                    {/* Link */}
                    <td className="px-4 py-2">
                      {t.taskUrl ? (
                        <a href={t.taskUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: 'var(--cn-accent)', background: 'var(--cn-accent)' + '15' }}
                        >
                          Open ↗
                        </a>
                      ) : <span style={{ color: 'var(--cn-text-muted)' }}>—</span>}
                    </td>
                    {/* Est. */}
                    <td className="px-4 py-2 whitespace-nowrap" style={{ color: 'var(--cn-text-muted)' }}>
                      {t.timeEst.trim() ? formatHHMM(toHM(t.timeEst).h, toHM(t.timeEst).m) : '—'}
                    </td>
                    {/* Total Hours — always read-only, sourced from the sheet */}
                    {showTotalHours && (
                      <td className="px-4 py-2 whitespace-nowrap" style={{ color: 'var(--cn-text-muted)' }}>
                        {t.totalHoursVal.trim() ? formatHHMM(toHM(t.totalHoursVal).h, toHM(t.totalHoursVal).m) : '—'}
                      </td>
                    )}
                    {/* Task Daily Bucket */}
                    <td className="px-4 py-2">
                      {onStatusChange && bucketColName && canEditFields ? (
                        <ResourceBucketSelect value={t.bucket || 'No Action Taken'} raw={t._raw} colName={bucketColName} onStatusChange={onStatusChange} />
                      ) : t.bucket ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize" style={{ background: bColor + '20', color: bColor }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: bColor }} />
                          {normBucket(t.bucket)}
                        </span>
                      ) : <span style={{ color: 'var(--cn-text-muted)' }}>—</span>}
                    </td>
                    {/* Bucket Set */}
                    <td className="px-4 py-2">
                      {t.bucketSet ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize whitespace-nowrap" style={{ background: bColor + '20', color: bColor }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: bColor }} />
                          {t.bucketSet.toLowerCase() === 'tommorow' ? 'Tomorrow' : t.bucketSet}
                        </span>
                      ) : <span style={{ color: 'var(--cn-text-muted)' }}>—</span>}
                    </td>
                    {/* Action Taken Today */}
                    {showMarketingCols && (
                      <td className="px-4 py-2 truncate" style={{ color: 'var(--cn-text-muted)' }}>
                        {onStatusChange && actionTakenColName && canEditFields ? (
                          <ResourceTimeLoggedEdit value={t.actionTakenToday} raw={t._raw} colName={actionTakenColName} onStatusChange={onStatusChange} widthClass="w-full min-w-[90px]" />
                        ) : <span className="truncate block">{t.actionTakenToday || '—'}</span>}
                      </td>
                    )}
                    {/* Performance Signal/Insights */}
                    {showMarketingCols && (
                      <td className="px-4 py-2 truncate" style={{ color: 'var(--cn-text-muted)' }}>
                        {onStatusChange && performanceSignalColName && canEditFields ? (
                          <ResourceTimeLoggedEdit value={t.performanceSignal} raw={t._raw} colName={performanceSignalColName} onStatusChange={onStatusChange} widthClass="w-full min-w-[90px]" />
                        ) : <span className="truncate block">{t.performanceSignal || '—'}</span>}
                      </td>
                    )}
                    {/* Blocker */}
                    {showMarketingCols && (
                      <td className="px-4 py-2 truncate" style={{ color: 'var(--cn-text-muted)' }}>
                        {onStatusChange && blockerColName && canEditFields ? (
                          <ResourceTimeLoggedEdit value={t.blocker} raw={t._raw} colName={blockerColName} onStatusChange={onStatusChange} widthClass="w-full min-w-[70px]" />
                        ) : <span className="truncate block">{t.blocker || '—'}</span>}
                      </td>
                    )}
                    {/* Next Steps */}
                    {showMarketingCols && (
                      <td className="px-4 py-2 truncate" style={{ color: 'var(--cn-text-muted)' }}>
                        {onStatusChange && nextStepsColName && canEditFields ? (
                          <ResourceTimeLoggedEdit value={t.nextSteps} raw={t._raw} colName={nextStepsColName} onStatusChange={onStatusChange} widthClass="w-full min-w-[70px]" />
                        ) : <span className="truncate block">{t.nextSteps || '—'}</span>}
                      </td>
                    )}
                    {/* Time Logged On AC */}
                    {showTimeLogged && (
                      <td className="px-4 py-2 whitespace-nowrap" style={{ color: 'var(--cn-text-muted)' }}>
                        {onStatusChange && timeLoggedColName && canEditFields ? (
                          <ResourceDurationEdit
                            value={t.timeLogged}
                            raw={t._raw}
                            colName={timeLoggedColName}
                            onStatusChange={onStatusChange}
                          />
                        ) : (t.timeLogged || '—')}
                      </td>
                    )}
                    {/* Status */}
                    <td className="px-4 py-2">
                      {onStatusChange && statusColName && canEditFields ? (
                        <ResourceStatusSelect
                          value={t.status || 'No Action Taken'}
                          raw={t._raw}
                          colName={statusColName}
                          onStatusChange={onStatusChange}
                          options={showMarketingCols ? MARKETING_STATUS_OPTIONS_OVERVIEW : undefined}
                        />
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize" style={{ background: sColor + '20', color: sColor }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sColor }} />
                          {t.status}
                        </span>
                      )}
                    </td>
                    {/* PM Status */}
                    <td className="px-4 py-2">
                      {onStatusChange && pmStatusColName && rowCanEditPmStatus ? (
                        <ResourcePmSelect
                          value={t.pmStatus || 'No Action Taken'}
                          raw={t._raw}
                          colName={pmStatusColName}
                          onStatusChange={onStatusChange}
                        />
                      ) : (
                        t.pmStatus && t.pmStatus.toLowerCase() !== 'n/a' && t.pmStatus !== '' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize" style={{ background: pmC + '20', color: pmC }}>
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: pmC }} />
                            {t.pmStatus}
                          </span>
                        ) : <span style={{ color: 'var(--cn-text-muted)' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
            </div>
          </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ─── Flat Tasks Table (all resources' tasks in a single table, no grouping) ────
function FlatTasksTable({ rows, onStatusChange, pmStatusColName, canEditPmStatus = true, statusColName, timeLoggedColName, canEditStatus = false, canCopy = false, currentUserName, pmEmailCol, currentUserEmail, vinayQaMode = false, showMarketingCols = false, showTotalHours = false, bucketColName }: {
  rows: ResourceRow[];
  onStatusChange?: (row: SheetData, col: string, val: string) => Promise<void>;
  pmStatusColName?: string;
  canEditPmStatus?: boolean;
  statusColName?: string;
  timeLoggedColName?: string;
  canEditStatus?: boolean;
  canCopy?: boolean;
  currentUserName?: string;
  pmEmailCol?: string;
  currentUserEmail?: string;
  vinayQaMode?: boolean;
  showMarketingCols?: boolean;
  showTotalHours?: boolean;
  bucketColName?: string;
}) {
  const [copiedRowIdx, setCopiedRowIdx] = useState<number | null>(null);
  const [copiedTable, setCopiedTable] = useState(false);

  const allFlatTasks = rows.flatMap(row => row.pendingTasks.map(t => ({ ...t, person: row.name })));
  // Vinay's QA view only shows tasks someone has flagged as "Testing"
  const flatTasks = vinayQaMode
    ? allFlatTasks.filter(t => t.status.trim().toLowerCase() === 'testing')
    : allFlatTasks;
  // Fixed minimum width so the table scrolls instead of squishing columns
  const flatTableMinWidth =
    (canCopy ? 40 : 0) + 140 + 130 + 160 + 70 +
    (!vinayQaMode && !showMarketingCols ? 70 : 0) +
    (showTotalHours && !vinayQaMode && !showMarketingCols ? 90 : 0) +
    120 + (!vinayQaMode ? 110 : 0) + 140 + (!vinayQaMode ? 160 : 0);

  const copyRow = (t: typeof flatTasks[number], idx: number) => {
    const text = `Project Name: ${t.project}\nTask URL: ${t.taskUrl}\nEst Time: `;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedRowIdx(idx);
    setTimeout(() => setCopiedRowIdx(null), 2000);
  };

  const COPY_COLS = vinayQaMode
    ? ['Assigned Person', 'Project Name', 'Task Name', 'Task URL', 'Task Daily Bucket', 'Task Status']
    : showMarketingCols
      ? ['Assigned Person', 'Project Name', 'Task Name', 'Est. Hours', 'Total Hours', 'Time Logged On AC', 'Action Taken Today', 'Performance Signal/Insights', 'Blocker', 'Next Steps', 'Task Status Updation']
      : ['Assigned Person', 'Project Name', 'Task Name', 'Task URL', 'Time Estimation', 'Time Logged On AC', 'Task Status'];
  const copyTable = async () => {
    const rowsToCopy = vinayQaMode
      ? flatTasks.map(t => [t.person, t.project, t.task, t.taskUrl, t.bucket, t.status])
      : showMarketingCols
        ? flatTasks.map(t => [t.person, t.project, t.task, t.timeEst, t.totalHoursVal, t.timeLogged, t.actionTakenToday, t.performanceSignal, t.blocker, t.nextSteps, t.status])
        : flatTasks.map(t => [t.person, t.project, t.task, t.taskUrl, t.timeEst, t.timeLogged, t.status]);
    const html = `
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;color:#111;">
  <thead>
    <tr style="background-color:#FE4A23;color:#ffffff;">
      <th style="border:1px solid #555;padding:8px 12px;text-align:left;white-space:nowrap;">#</th>
      ${COPY_COLS.map(h => `<th style="border:1px solid #555;padding:8px 12px;text-align:left;white-space:nowrap;">${h}</th>`).join('')}
    </tr>
  </thead>
  <tbody>
    ${rowsToCopy.map((r, i) => `
    <tr style="background-color:${i % 2 === 0 ? '#ffffff' : '#fafafa'};">
      <td style="border:1px solid #ddd;padding:6px 12px;color:#888;">${i + 1}</td>
      ${r.map(v => `<td style="border:1px solid #ddd;padding:6px 12px;">${v ?? ''}</td>`).join('')}
    </tr>`).join('')}
  </tbody>
</table>`;
    const text = [
      ['#', ...COPY_COLS].join('\t'),
      ...rowsToCopy.map((r, i) => [i + 1, ...r].join('\t')),
    ].join('\n');
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html':  new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(text);
    }
    setCopiedTable(true);
    setTimeout(() => setCopiedTable(false), 2500);
  };

  const normBucket = (s: string) => {
    const l = s.trim().toLowerCase();
    if (l === 'tommorow' || l === 'tommorrow' || l === 'tomorow') return 'tomorrow';
    if (l === 'day after tommorow' || l === 'day after tommorrow') return 'day after tomorrow';
    return l;
  };
  const bucketColors: Record<string, string> = {
    today: '#16a34a', tomorrow: '#3b82f6', 'day after tomorrow': '#f59e0b',
  };

  if (flatTasks.length === 0) {
    return (
      <p className="text-center py-6 text-sm" style={{ color: 'var(--cn-text-muted)' }}>
        {vinayQaMode ? 'No tasks marked "Testing" right now.' : 'No tasks found.'}
      </p>
    );
  }

  return (
    <div className="cn-card rounded-xl overflow-hidden" style={{ background: 'var(--cn-bg-card)' }}>
      {canCopy && (
        <div className="flex items-center justify-end px-4 py-2" style={{ borderBottom: '1px solid var(--cn-border)' }}>
          <button
            onClick={copyTable}
            title="Copy table"
            className="w-7 h-7 inline-flex items-center justify-center rounded-lg cursor-pointer transition-all"
            style={copiedTable
              ? { background: '#16a34a18', border: '1px solid #16a34a40', color: '#16a34a' }
              : { background: 'var(--cn-bg-input)', border: '1px solid var(--cn-border)', color: 'var(--cn-text-muted)' }}
          >
            {copiedTable ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="text-xs table-fixed" style={{ width: '100%', minWidth: flatTableMinWidth }}>
          <thead>
            <tr style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}>
              {canCopy && <th className="px-2 py-2 w-10" />}
              <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Assigned Person</th>
              <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Project</th>
              <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Task</th>
              <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Link</th>
              {!vinayQaMode && !showMarketingCols && <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Est.</th>}
              {showTotalHours && !vinayQaMode && !showMarketingCols && <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Total Hours</th>}
              <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Task Daily Bucket</th>
              {!vinayQaMode && <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Bucket Set</th>}
              <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Status</th>
              {!vinayQaMode && <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">PM Status</th>}
            </tr>
          </thead>
          <tbody>
            {flatTasks.map((t, i) => {
              const sColor = STATUS_COLORS[t.status.toLowerCase()] ?? '#6b7280';
              const pmColor: Record<string,string> = {
                'approved': '#16a34a', 'submitted to client': '#6d28d9',
                'changes': '#dc2626', 'no action taken': '#6b7280', 'n/a': '#6b7280', 'ticketclosed': '#7c3aed',
              };
              const pmC = pmColor[t.pmStatus.toLowerCase()] ?? '#6b7280';
              const bColor = bucketColors[normBucket(t.bucket)] ?? '#6b7280';
              const bg = memberColor(t.person);
              const photo = teamPhoto(t.person);
              const initials = t.person.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
              const rowCanEditStatus = canEditStatus && (vinayQaMode || !currentUserName || t.person.trim().toLowerCase() === currentUserName.trim().toLowerCase());
              const rowCanEditPmStatus = canEditPmStatus && (
                !pmEmailCol || !currentUserEmail ||
                String(t._raw[pmEmailCol] ?? '').trim().toLowerCase() === currentUserEmail.trim().toLowerCase()
              );
              return (
                <tr key={String(t._raw['__row'] ?? i)} style={{ borderTop: '1px solid var(--cn-border-light, var(--cn-border))' }}>
                  {canCopy && (
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => copyRow(t, i)}
                        title="Copy task info"
                        className="w-7 h-7 rounded-lg inline-flex items-center justify-center cursor-pointer transition-all"
                        style={{
                          background: copiedRowIdx === i ? '#16a34a18' : 'var(--cn-bg-input)',
                          color:      copiedRowIdx === i ? '#16a34a'   : 'var(--cn-text-muted)',
                          border:     `1px solid ${copiedRowIdx === i ? '#16a34a40' : 'var(--cn-border)'}`,
                        }}
                      >
                        {copiedRowIdx === i ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </td>
                  )}
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {photo ? (
                        <img src={photo} alt={t.person} className="w-5 h-5 rounded-full object-cover shrink-0" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0" style={{ background: `linear-gradient(135deg, ${bg}cc, ${bg}66)` }}>{initials}</div>
                      )}
                      <span className="truncate" style={{ color: 'var(--cn-text-primary)' }}>{t.person}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 truncate" style={{ color: 'var(--cn-text-muted)' }}>
                    <span className="truncate block">{t.project || '—'}</span>
                  </td>
                  <td className="px-4 py-2 truncate" style={{ color: 'var(--cn-text-primary)' }}>
                    <span className="truncate block">{t.task || '—'}</span>
                  </td>
                  <td className="px-4 py-2">
                    {t.taskUrl ? (
                      <a href={t.taskUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ color: 'var(--cn-accent)', background: 'var(--cn-accent)' + '15' }}
                      >
                        Open ↗
                      </a>
                    ) : <span style={{ color: 'var(--cn-text-muted)' }}>—</span>}
                  </td>
                  {!vinayQaMode && !showMarketingCols && (
                    <td className="px-4 py-2 whitespace-nowrap" style={{ color: 'var(--cn-text-muted)' }}>
                      {t.timeEst.trim() ? formatHHMM(toHM(t.timeEst).h, toHM(t.timeEst).m) : '—'}
                    </td>
                  )}
                  {showTotalHours && !vinayQaMode && !showMarketingCols && (
                    <td className="px-4 py-2 whitespace-nowrap" style={{ color: 'var(--cn-text-muted)' }}>
                      {t.totalHoursVal.trim() ? formatHHMM(toHM(t.totalHoursVal).h, toHM(t.totalHoursVal).m) : '—'}
                    </td>
                  )}
                  <td className="px-4 py-2">
                    {onStatusChange && bucketColName && rowCanEditStatus ? (
                      <ResourceBucketSelect value={t.bucket || 'No Action Taken'} raw={t._raw} colName={bucketColName} onStatusChange={onStatusChange} />
                    ) : t.bucket ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize" style={{ background: bColor + '20', color: bColor }}>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: bColor }} />
                        {normBucket(t.bucket)}
                      </span>
                    ) : <span style={{ color: 'var(--cn-text-muted)' }}>—</span>}
                  </td>
                  {!vinayQaMode && (
                    <td className="px-4 py-2">
                      {t.bucketSet ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize" style={{ background: bColor + '20', color: bColor }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: bColor }} />
                          {t.bucketSet.toLowerCase() === 'tommorow' ? 'Tomorrow' : t.bucketSet}
                        </span>
                      ) : <span style={{ color: 'var(--cn-text-muted)' }}>—</span>}
                    </td>
                  )}
                  <td className="px-4 py-2">
                    {onStatusChange && statusColName && rowCanEditStatus ? (
                      <ResourceStatusSelect value={t.status || 'No Action Taken'} raw={t._raw} colName={statusColName} onStatusChange={onStatusChange} options={showMarketingCols ? MARKETING_STATUS_OPTIONS_OVERVIEW : undefined} />
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize" style={{ background: sColor + '20', color: sColor }}>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sColor }} />
                        {t.status}
                      </span>
                    )}
                  </td>
                  {!vinayQaMode && (
                  <td className="px-4 py-2">
                    {onStatusChange && pmStatusColName && rowCanEditPmStatus ? (
                      <ResourcePmSelect value={t.pmStatus || 'No Action Taken'} raw={t._raw} colName={pmStatusColName} onStatusChange={onStatusChange} />
                    ) : (
                      t.pmStatus && t.pmStatus.toLowerCase() !== 'n/a' && t.pmStatus !== '' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize" style={{ background: pmC + '20', color: pmC }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: pmC }} />
                          {t.pmStatus}
                        </span>
                      ) : <span style={{ color: 'var(--cn-text-muted)' }}>—</span>
                    )}
                  </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ResourceOverview({ data, headers, availData = [], availHeaders = [], onStatusChange, pmStatusColName, currentUserName, currentUserEmail, showFilter, canEditPmStatus = true, canEditStatus = false, canCopy = false, restrictToMine = false, defaultFilter = 'all', restrictPmStatusToOwn = false, vinayQaMode = false, showQaTab = false, qaData = [], qaHeaders = [], onQaCellChange }: { data: SheetData[]; headers: string[]; availData?: SheetData[]; availHeaders?: string[]; onStatusChange?: (row: SheetData, col: string, val: string) => Promise<void>; pmStatusColName?: string; currentUserName?: string; currentUserEmail?: string; showFilter?: boolean; canEditPmStatus?: boolean; canEditStatus?: boolean; canCopy?: boolean; restrictToMine?: boolean; defaultFilter?: 'all' | 'me'; restrictPmStatusToOwn?: boolean; vinayQaMode?: boolean; showQaTab?: boolean; qaData?: SheetData[]; qaHeaders?: string[]; onQaCellChange?: (row: SheetData, colName: string, value: string) => Promise<void> }) {
  const [openName, setOpenName] = useState<string | null>(null);
  const [pmFilter, setPmFilter] = useState<'all' | 'me' | 'today' | 'me-today' | 'flat' | 'qa'>(restrictToMine ? 'me' : vinayQaMode ? 'flat' : defaultFilter);
  const [search, setSearch] = useState('');

  // Close all rows whenever the filter switches
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleFilterChange = (f: 'all' | 'me' | 'today' | 'me-today' | 'flat' | 'qa') => { setPmFilter(f); setOpenName(null); };

  // Find the email column in the sheet (used to match tasks to the logged-in PM)
  const emailCol = headers.find(h => h.toLowerCase().includes('email'));

  // Build leave map from the Leave spreadsheet — its name column is
  // literally headed "Team" (despite holding a person's name), and its
  // status is free text like "Two Days Leave", not a fixed yes/no enum.
  const availNameCol   = availHeaders.find(h => h.toLowerCase().includes('name') || h.toLowerCase() === 'team');
  const availStatusCol = availHeaders.find(h => h.toLowerCase().includes('daily status'));
  const availLeaveCol  = availHeaders.find(h => h.toLowerCase().includes('leave zone') || h.toLowerCase().includes('leave'));
  const leaveSet = new Set<string>();
  if (availData.length && (availStatusCol || availLeaveCol)) {
    availData.forEach(r => {
      const name   = availNameCol ? String(r[availNameCol] ?? '').trim().toLowerCase() : '';
      const status = availStatusCol ? String(r[availStatusCol] ?? '').trim().toLowerCase() : '';
      const leave  = availLeaveCol  ? String(r[availLeaveCol]  ?? '').trim().toLowerCase() : '';
      if (name && (status.includes('leave') || isOnLeaveText(leave))) {
        leaveSet.add(name);
      }
    });
  }

  const resourceCol  = headers.find(h => h.toLowerCase().includes('assigned person'));
  const deptCol      = headers.find(h => h.toLowerCase() === 'department');
  const statusCol    = headers.find(h => h.toLowerCase().includes('task status') || h.toLowerCase() === 'status');
  const projectCol   = headers.find(h => h.toLowerCase().includes('project name') || h.toLowerCase().includes('project'));
  const taskCol      = headers.find(h => h.toLowerCase().includes('task name') || h.toLowerCase().includes('task title') || h.toLowerCase().includes('task information'));
  const pmStatusCol  = headers.find(h => h.toLowerCase().includes('pm status'));
  const timeEstCol   = headers.find(h => h.toLowerCase().includes('time estimation') || h.toLowerCase().includes('time estimate') || h.toLowerCase().includes('estimation'));
  const taskUrlCol   = headers.find(h => h.toLowerCase().includes('task url') || h.toLowerCase().includes('task link') || h.toLowerCase() === 'url');
  const bucketSetCol = headers.find(h => h.toLowerCase().includes('today bucket set') || h.toLowerCase().includes('bucket set'));
  const bucketCol    = headers.find(h => h.toLowerCase().includes('task daily bucket') || h.toLowerCase().includes('daily bucket'));
  const timeLoggedCol = headers.find(h => h.toLowerCase().includes('time logged'));
  const deadlineCol  = headers.find(h => h.toLowerCase().includes('deadline'));
  // "Total Hours" on the Marketing Tasks sheet, "Total Time" on Bandwidth Allocation
  const totalHoursCol = headers.find(h => h.toLowerCase().includes('total hours') || h.toLowerCase().includes('total time'));
  // Marketing-only fields — absent from Bandwidth Allocation, present on the Marketing Tasks sheet
  const actionTakenCol = headers.find(h => h.toLowerCase().includes('action taken today'));
  const performanceSignalCol = headers.find(h => h.toLowerCase().includes('performance signal'));
  const blockerCol = headers.find(h => h.toLowerCase() === 'blocker' || h.toLowerCase().includes('blocker'));
  const nextStepsCol = headers.find(h => h.toLowerCase().includes('next steps'));
  const isMarketingSheet = !!actionTakenCol;
  // Action Taken/Performance Signal/Blocker/Next Steps are Marketing-only
  // fields, only shown to MarketingTeam members viewing their own tasks.
  // Time Logged On AC is shown to any individual-tier viewer (WebTeam or
  // MarketingTeam) on their own tasks, but never to admin/PM/team-admin.
  // Total Hours is independent of both — shown whenever the sheet has it,
  // to everyone, and never editable (it's sourced from the sheet).
  const showMarketingCols = isMarketingSheet && canEditStatus;
  const showTimeLogged = canEditStatus;
  const showTotalHours = !!totalHoursCol;
  // Task Daily Bucket is only editable on Marketing data — Web team members
  // don't get an editable bucket dropdown.
  const editableBucketCol = isMarketingSheet ? bucketCol : undefined;

  if (!resourceCol || !statusCol) return null;

  const names = [...new Set(data.map(r => String(r[resourceCol] ?? '').trim()).filter(Boolean))]
    .filter(n => !EXCLUDED_PERSONS.includes(n.toLowerCase()))
    .sort();

  // Excluded from hours total (closed/submitted statuses inflate hours)
  const NON_PENDING = ['task closed', 'submitted to client', 'submitted to pm', 'submitted to akash', 'n/a', ''];
  // Excluded from the task table rows (truly done tasks only)
  const HIDE_FROM_TABLE = ['task closed', 'submitted to client', 'n/a', ''];

  const rows: ResourceRow[] = names.map(name => {
    const myTasks = data.filter(r => String(r[resourceCol] ?? '').trim().toLowerCase() === name.toLowerCase());
    const department = deptCol ? String(myTasks.find(r => String(r[deptCol] ?? '').trim())?.[deptCol] ?? '').trim() : '';
    const getStatus    = (r: SheetData) => String(r[statusCol!]   ?? '').trim().toLowerCase();
    const getProject   = (r: SheetData) => projectCol   ? String(r[projectCol]   ?? '').trim() : '';
    const getTask      = (r: SheetData) => taskCol      ? String(r[taskCol]      ?? '').trim() : '';
    const getPmStatus  = (r: SheetData) => pmStatusCol  ? String(r[pmStatusCol]  ?? '').trim() : '';
    const getTimeEst   = (r: SheetData) => timeEstCol   ? String(r[timeEstCol]   ?? '').trim() : '';
    const getTaskUrl   = (r: SheetData) => taskUrlCol   ? String(r[taskUrlCol]   ?? '').trim() : '';
    const getBucketSet = (r: SheetData) => bucketSetCol ? String(r[bucketSetCol] ?? '').trim() : '';
    const getBucket    = (r: SheetData) => bucketCol    ? String(r[bucketCol]    ?? '').trim().toLowerCase() : '';
    const getTimeLogged = (r: SheetData) => timeLoggedCol ? String(r[timeLoggedCol] ?? '').trim() : '';
    const getTotalHoursVal = (r: SheetData) => totalHoursCol ? String(r[totalHoursCol] ?? '').trim() : '';
    const getActionTaken = (r: SheetData) => actionTakenCol ? String(r[actionTakenCol] ?? '').trim() : '';
    const getPerformanceSignal = (r: SheetData) => performanceSignalCol ? String(r[performanceSignalCol] ?? '').trim() : '';
    const getBlocker = (r: SheetData) => blockerCol ? String(r[blockerCol] ?? '').trim() : '';
    const getNextSteps = (r: SheetData) => nextStepsCol ? String(r[nextStepsCol] ?? '').trim() : '';
    const getDeadline = (r: SheetData) => deadlineCol ? String(r[deadlineCol] ?? '').trim() : '';

    const activeTasks  = myTasks.filter(r => getStatus(r) === 'in progress').length;
    const onHoldTasks  = myTasks.filter(r => getStatus(r) === 'on hold').length;
    const pendingPM    = myTasks.filter(r => ['submitted to pm', 'submitted to akash'].includes(getStatus(r))).length;
    const toBeStarted  = myTasks.filter(r => getStatus(r) === 'to be started').length;
    const testingTasks = myTasks.filter(r => getStatus(r) === 'testing').length;
    // Sum time estimates for all non-closed tasks (mirrors sheet column C formula)
    const totalHours = myTasks
      .filter(r => !NON_PENDING.includes(getStatus(r)))
      .reduce((sum, r) => sum + parseHours(getTimeEst(r)), 0);
    // Sum hours + count for today + everyday tasks only, excluding closed/n/a
    const todayFiltered = myTasks.filter(r => { const b = getBucket(r); return (b === 'today' || b === 'everyday') && !NON_PENDING.includes(getStatus(r)); });
    const todayHours = todayFiltered.reduce((sum, r) => sum + parseHours(getTimeEst(r)), 0);
    const todayTasks = todayFiltered.length;

    const inProgressTask = myTasks.find(r => getStatus(r) === 'in progress');
    const activeProject  = inProgressTask ? getProject(inProgressTask) : '';

    const pendingTasks = myTasks
      .filter(r => !HIDE_FROM_TABLE.includes(getStatus(r)))
      .map(r => ({
        task: getTask(r), project: getProject(r),
        status: String(r[statusCol!] ?? '').trim(),
        pmStatus: getPmStatus(r), timeEst: getTimeEst(r),
        taskUrl: getTaskUrl(r), bucketSet: getBucketSet(r), bucket: getBucket(r),
        timeLogged: getTimeLogged(r), totalHoursVal: getTotalHoursVal(r),
        actionTakenToday: getActionTaken(r), performanceSignal: getPerformanceSignal(r),
        blocker: getBlocker(r), nextSteps: getNextSteps(r), deadline: getDeadline(r),
        _raw: r,
      }))
      .slice(0, 20);

    return { name, department, activeProject, activeTasks, onHoldTasks, pendingPM, toBeStarted, testingTasks, totalHours, todayHours, todayTasks, pendingTasks };
  }).filter(r => r.totalHours > 0 || r.activeTasks + r.onHoldTasks + r.pendingPM + r.toBeStarted + r.testingTasks > 0)
    .sort((a, b) => (b.activeTasks + b.onHoldTasks) - (a.activeTasks + a.onHoldTasks));

  // Show filter if caller forces it (PM role), we have email to match against, or the
  // logged-in user's name matches one of the resource rows (resource role)
  const myNameMatch = currentUserName && names.some(n => {
    const nL = n.toLowerCase(), uL = currentUserName.trim().toLowerCase();
    return nL === uL || nL.includes(uL) || uL.includes(nL);
  });
  const canFilterByMe = !!(showFilter || (emailCol && currentUserEmail) || myNameMatch);

  const isMyRow = (row: ResourceRow) => {
    if (!myNameMatch) return true;
    const rL = row.name.toLowerCase(), uL = currentUserName!.trim().toLowerCase();
    return rL === uL || rL.includes(uL) || uL.includes(rL);
  };

  const applyFilter = (row: ResourceRow) => {
    const taskList = row.pendingTasks;
    // Assigned Person name is the authoritative "who is this task for" field —
    // prefer it over an "Email" column, which on some sheets (e.g. Marketing
    // Tasks' "Email Address") records who submitted the task, not who it's
    // assigned to, and would otherwise silently show zero results.
    if (pmFilter === 'me' && myNameMatch)
      return isMyRow(row) ? taskList : [];
    if (pmFilter === 'me' && emailCol && currentUserEmail)
      return taskList.filter(t => String(t._raw[emailCol!] ?? '').trim().toLowerCase() === currentUserEmail!.toLowerCase());
    if (pmFilter === 'today') {
      // Resource accounts (whose name matches one of the rows) only see their own today tasks;
      // PM/admin viewing the team-wide list still see everyone's today tasks.
      if (myNameMatch && !isMyRow(row)) return [];
      return taskList.filter(t => { const b = t.bucket.toLowerCase(); return b === 'today' || b === 'everyday'; });
    }
    if (pmFilter === 'me-today') {
      const isToday = (t: { bucket: string }) => { const b = t.bucket.toLowerCase(); return b === 'today' || b === 'everyday'; };
      if (myNameMatch)
        return isMyRow(row) ? taskList.filter(isToday) : [];
      if (emailCol && currentUserEmail)
        return taskList.filter(t => String(t._raw[emailCol!] ?? '').trim().toLowerCase() === currentUserEmail!.toLowerCase() && isToday(t));
      return [];
    }
    return taskList;
  };

  const filteredRows = pmFilter !== 'all'
    ? rows.map(row => {
        const myTasks = applyFilter(row);
        const activeTasks   = myTasks.filter(t => t.status.toLowerCase() === 'in progress').length;
        const onHoldTasks   = myTasks.filter(t => t.status.toLowerCase() === 'on hold').length;
        const pendingPM     = myTasks.filter(t => t.status.toLowerCase() === 'submitted to pm').length;
        const toBeStarted   = myTasks.filter(t => t.status.toLowerCase() === 'to be started').length;
        const activeProject = myTasks.find(t => t.status.toLowerCase() === 'in progress')?.project || row.activeProject;
        const todayFiltered = myTasks.filter(r => { const b = r.bucket.toLowerCase(); return (b === 'today' || b === 'everyday') && !NON_PENDING.includes(r.status.trim().toLowerCase()); });
        const todayHours = todayFiltered.reduce((sum, r) => sum + parseHours(r.timeEst), 0);
        const todayTasks = todayFiltered.length;
        return { ...row, pendingTasks: myTasks, activeTasks, onHoldTasks, pendingPM, toBeStarted, activeProject, todayHours, todayTasks };
      }).filter(row => row.pendingTasks.length > 0)
    : rows;

  // Search by project, task name, status, PM status or bucket
  const searchQ = search.trim().toLowerCase();
  const matchesSearch = (t: ResourceRow['pendingTasks'][number], personName: string) =>
    !searchQ || [personName, t.task, t.project, t.status, t.pmStatus, t.bucket, t.bucketSet]
      .some(v => v.toLowerCase().includes(searchQ));

  const searchedRows = searchQ
    ? filteredRows
        .map(row => ({ ...row, pendingTasks: row.pendingTasks.filter(t => matchesSearch(t, row.name)) }))
        .filter(row => row.pendingTasks.length > 0)
    : filteredRows;

  const flatSearchedRows = searchQ
    ? rows.map(row => ({ ...row, pendingTasks: row.pendingTasks.filter(t => matchesSearch(t, row.name)) }))
    : rows;

  if (!searchedRows.length && pmFilter === 'all' && !searchQ) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--cn-text-primary)' }}>
            {restrictToMine ? 'My Tasks' : 'Tasks Overview'}
          </h3>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>
            {restrictToMine ? 'Your current workload and pending tasks' : 'Current workload and pending tasks per team member'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--cn-bg-input)' }}>
            {vinayQaMode ? (
              <>
                <button
                  onClick={() => handleFilterChange('flat')}
                  className="px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer"
                  style={pmFilter === 'flat' ? { background: 'var(--cn-accent)', color: '#fff' } : { background: 'transparent', color: 'var(--cn-text-muted)' }}
                >Tasks</button>
                <button
                  onClick={() => handleFilterChange('today')}
                  className="px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer"
                  style={pmFilter === 'today' ? { background: '#16a34a', color: '#fff' } : { background: 'transparent', color: 'var(--cn-text-muted)' }}
                >Dev Tasks</button>
                <button
                  onClick={() => handleFilterChange('qa')}
                  className="px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer"
                  style={pmFilter === 'qa' ? { background: '#7c3aed', color: '#fff' } : { background: 'transparent', color: 'var(--cn-text-muted)' }}
                >QA Testing</button>
              </>
            ) : restrictToMine ? (
              <>
                <button
                  onClick={() => handleFilterChange('me')}
                  className="px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer"
                  style={pmFilter === 'me' ? { background: 'var(--cn-accent)', color: '#fff' } : { background: 'transparent', color: 'var(--cn-text-muted)' }}
                >My Tasks</button>
                <button
                  onClick={() => handleFilterChange('me-today')}
                  className="px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer"
                  style={pmFilter === 'me-today' ? { background: '#16a34a', color: '#fff' } : { background: 'transparent', color: 'var(--cn-text-muted)' }}
                >Today&apos;s Tasks</button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleFilterChange('flat')}
                  className="px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer"
                  style={pmFilter === 'flat' ? { background: 'var(--cn-accent)', color: '#fff' } : { background: 'transparent', color: 'var(--cn-text-muted)' }}
                >All Tasks</button>
                {canFilterByMe && (
                  <button
                    onClick={() => handleFilterChange('me')}
                    className="px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer"
                    style={pmFilter === 'me' ? { background: 'var(--cn-accent)', color: '#fff' } : { background: 'transparent', color: 'var(--cn-text-muted)' }}
                  >My Tasks</button>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-4 text-[11px]" style={{ color: 'var(--cn-text-muted)' }}>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#16a34a] inline-block" />In Progress</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#7c3aed] inline-block" />On Hold</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#10b981] inline-block" />PM Review</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#dc2626] inline-block" />To Be Started</span>
          </div>
        </div>
      </div>

      {/* Search — QA Testing has its own search bar, so skip this one for that tab */}
      {pmFilter !== 'qa' && (
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--cn-text-muted)' }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search project, task, status..."
          className="w-full pl-9 pr-8 py-2 rounded-lg text-xs focus:outline-none"
          style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
            style={{ color: 'var(--cn-text-muted)' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      )}

      {/* Cards / flat table */}
      {pmFilter === 'qa' ? (
        <QATesting data={qaData} headers={qaHeaders} onCellChange={onQaCellChange ?? (async () => {})} canEdit={vinayQaMode} />
      ) : pmFilter === 'flat' ? (
        <FlatTasksTable
          rows={flatSearchedRows}
          onStatusChange={onStatusChange}
          pmStatusColName={pmStatusColName}
          canEditPmStatus={canEditPmStatus}
          statusColName={statusCol}
          timeLoggedColName={timeLoggedCol}
          canEditStatus={canEditStatus}
          canCopy={canCopy}
          currentUserName={currentUserName}
          pmEmailCol={restrictPmStatusToOwn ? emailCol : undefined}
          currentUserEmail={currentUserEmail}
          vinayQaMode={vinayQaMode}
          showMarketingCols={showMarketingCols}
          showTotalHours={showTotalHours}
          bucketColName={editableBucketCol}
        />
      ) : (
        <div className="space-y-2">
          {searchedRows.length === 0 && (
            <p className="text-center py-6 text-sm" style={{ color: 'var(--cn-text-muted)' }}>
              {searchQ ? 'No tasks match your search.' : 'No tasks assigned to you.'}
            </p>
          )}
          {searchedRows.map(row => (
            <ResourceCard
              key={row.name}
              row={row}
              onLeave={leaveSet.has(row.name.toLowerCase())}
              isOpen={pmFilter !== 'all' || !!searchQ || openName === row.name}
              onToggle={() => pmFilter === 'all' && !searchQ && setOpenName(openName === row.name ? null : row.name)}
              onStatusChange={onStatusChange}
              pmStatusColName={pmStatusColName}
              canEditPmStatus={canEditPmStatus}
              statusColName={statusCol}
              timeLoggedColName={timeLoggedCol}
              totalHoursColName={totalHoursCol}
              canEditStatus={canEditStatus && isMyRow(row)}
              canCopy={canCopy}
              pmEmailCol={restrictPmStatusToOwn ? emailCol : undefined}
              currentUserEmail={currentUserEmail}
              showMarketingCols={showMarketingCols}
              showTimeLogged={showTimeLogged}
              showTotalHours={showTotalHours}
              bucketColName={editableBucketCol}
              actionTakenColName={actionTakenCol}
              performanceSignalColName={performanceSignalCol}
              blockerColName={blockerCol}
              nextStepsColName={nextStepsCol}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PM Status Overview (admin only) ───────────────────────────────────────────

export function PmStatusOverview({ data, headers, pmUsers, layout = 'grid' }: {
  data: SheetData[]; headers: string[]; pmUsers: { displayName: string; email?: string }[]; layout?: 'grid' | 'list';
}) {
  const emailCol     = headers.find(h => h.toLowerCase().includes('email'));
  const pmStatusCol  = headers.find(h => h.toLowerCase().includes('pm status'));
  const statusCol    = headers.find(h => h.toLowerCase().includes('task status') || h.toLowerCase() === 'status');
  const projectCol   = headers.find(h => h.toLowerCase().includes('project name') || h.toLowerCase().includes('project'));
  const bucketCol    = headers.find(h => h.toLowerCase().includes('task daily bucket') || h.toLowerCase().includes('daily bucket'));
  const taskCol      = headers.find(h => h.toLowerCase().includes('task name') || h.toLowerCase().includes('task title') || h.toLowerCase().includes('task information'));
  const taskUrlCol   = headers.find(h => h.toLowerCase().includes('task url') || h.toLowerCase().includes('task link') || h.toLowerCase() === 'url');
  const timeEstCol   = headers.find(h => h.toLowerCase().includes('time estimation') || h.toLowerCase().includes('time estimate') || h.toLowerCase().includes('estimation'));
  const bucketSetCol = headers.find(h => h.toLowerCase().includes('today bucket set') || h.toLowerCase().includes('bucket set'));

  const validPms = pmUsers.filter(p => !!p.email);

  const rows = validPms.map(pm => {
    const myTasks = emailCol
      ? data.filter(r => String(r[emailCol] ?? '').trim().toLowerCase() === pm.email!.trim().toLowerCase())
      : [];
    const noActionTaken = (pmStatusCol && statusCol) ? myTasks.filter(r =>
      String(r[pmStatusCol] ?? '').trim().toLowerCase() === 'no action taken'
      && String(r[statusCol] ?? '').trim().toLowerCase() === 'submitted to pm'
    ).length : 0;
    return { name: pm.displayName, email: pm.email!, noActionTaken, total: myTasks.length };
  }).sort((a, b) => b.noActionTaken - a.noActionTaken);

  const [selectedName, setSelectedName] = useState<string | null>(rows[0]?.name ?? null);
  const selected = rows.find(r => r.name === selectedName);

  if (!emailCol || !pmStatusCol) {
    return (
      <div className="cn-card rounded-xl p-6 text-center text-sm" style={{ background: 'var(--cn-bg-card)', color: 'var(--cn-text-muted)' }}>
        Email or PM Status column not found in sheet.
      </div>
    );
  }

  const scopedData = selected
    ? data.filter(r => String(r[emailCol] ?? '').trim().toLowerCase() === selected.email.trim().toLowerCase())
    : [];

  const getPmStatus = (r: SheetData) => pmStatusCol ? String(r[pmStatusCol] ?? '').trim().toLowerCase() : '';
  const getTaskStatus = (r: SheetData) => statusCol ? String(r[statusCol] ?? '').trim().toLowerCase() : '';
  const noActionTaken      = scopedData.filter(r => getPmStatus(r) === 'no action taken' && getTaskStatus(r) === 'submitted to pm').length;
  const changes            = scopedData.filter(r => getPmStatus(r) === 'changes').length;
  const approved           = scopedData.filter(r => getPmStatus(r) === 'approved').length;
  const submittedToClient  = scopedData.filter(r => getPmStatus(r) === 'submitted to client').length;
  const todayTasks         = bucketCol ? scopedData.filter(r => String(r[bucketCol] ?? '').trim().toLowerCase() === 'today').length : 0;
  const scopedTotal        = scopedData.length;

  const statusData    = (statusCol && timeEstCol)   ? sumHoursByCol(scopedData, statusCol,   timeEstCol) : [];
  const pmStatusData  = (pmStatusCol && timeEstCol) ? sumHoursByCol(scopedData, pmStatusCol, timeEstCol) : [];
  const tasksByProject = (projectCol && timeEstCol) ? sumHoursByCol(scopedData, projectCol, timeEstCol).slice(0, 15).map(d => ({ name: d.name, Hours: d.value })) : [];

  const detailContent = selected && (
    <div className="space-y-4">
      <PmTasksTable
        data={scopedData}
        personName={selected.name}
        projectCol={projectCol}
        taskCol={taskCol}
        taskUrlCol={taskUrlCol}
        timeEstCol={timeEstCol}
        bucketCol={bucketCol}
        bucketSetCol={bucketSetCol}
        statusCol={statusCol}
        pmStatusCol={pmStatusCol}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard label="No Action Taken"     value={noActionTaken}      total={scopedTotal} color="#f59e0b" icon={<AlertTriangle className="w-4 h-4" />} adminStyle={true} />
        <StatCard label="Changes"              value={changes}           total={scopedTotal} color="#7c3aed" icon={<RefreshCw     className="w-4 h-4" />} adminStyle={true} />
        <StatCard label="Approved"             value={approved}          total={scopedTotal} color="#16a34a" icon={<ThumbsUp       className="w-4 h-4" />} adminStyle={true} />
        <StatCard label="Submitted to Client"  value={submittedToClient} total={scopedTotal} color="#10b981" icon={<BadgeCheck     className="w-4 h-4" />} adminStyle={true} />
        <StatCard label="Today's Tasks"        value={todayTasks}        total={scopedTotal} color="#FE4A23" icon={<CalendarCheck  className="w-4 h-4" />} adminStyle={true} />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6">
          <DonutCard title="Hours by Status" sub={`Estimated hours by task status — ${selected.name}`} data={statusData} colorMap={STATUS_COLORS} />
        </div>
        <div className="col-span-12 lg:col-span-6">
          <DonutCard title="Hours by PM Status" sub="Estimated hours by PM approval stage" data={pmStatusData} colorMap={PM_STATUS_COLORS_MAP} />
        </div>
      </div>

      <BarCard
        title="Hours per Project"
        sub={`Estimated hours per client / project — ${selected.name} (top 15)`}
        data={tasksByProject}
        dataKey="Hours"
        color="#10b981"
      />
    </div>
  );

  if (layout === 'list') {
    return (
      <section className="flex gap-5 items-start">
        <div className="w-1/5 shrink-0 space-y-1 cn-card rounded-xl p-2" style={{ background: 'var(--cn-bg-card)' }}>
          {rows.map(row => {
            const isSelected = selectedName === row.name;
            const bg = memberColor(row.name);
            const photo = teamPhoto(row.name);
            const initials = row.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
            return (
              <button
                key={row.name}
                onClick={() => setSelectedName(row.name)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all cursor-pointer"
                style={{ background: isSelected ? `${bg}14` : 'transparent' }}
              >
                {photo ? (
                  <img src={photo} alt={row.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{ background: `linear-gradient(135deg, ${bg}cc, ${bg}66)` }}>
                    {initials}
                  </div>
                )}
                <span className="text-xs font-medium truncate flex-1 min-w-0" style={{ color: isSelected ? bg : 'var(--cn-text-primary)' }}>{row.name}</span>
                {row.noActionTaken > 0 && (
                  <span className="text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: '#ef444420', color: '#ef4444' }}>
                    {row.noActionTaken}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex-1 min-w-0">
          {detailContent}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* PM picker gallery */}
      <div className="cn-card cn-card-static rounded-xl overflow-hidden" style={{ background: 'var(--cn-bg-card)' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--cn-border)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--cn-text-primary)' }}>Project Managers</h3>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>
            Select a PM to see their submission status and task breakdown
          </p>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {rows.length === 0 && (
            <p className="text-center py-6 text-sm col-span-full" style={{ color: 'var(--cn-text-muted)' }}>No PM data found.</p>
          )}
          {rows.map(row => {
            const isSelected = selectedName === row.name;
            const bg = memberColor(row.name);
            const photo = teamPhoto(row.name);
            const initials = row.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
            return (
              <button
                key={row.name}
                onClick={() => setSelectedName(row.name)}
                className="relative flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all cursor-pointer"
                style={{
                  background:  isSelected ? `${bg}12` : 'var(--cn-bg-card)',
                  borderColor: isSelected ? bg : 'var(--cn-border)',
                  borderLeft:  `3px solid ${row.noActionTaken > 0 ? '#ef4444' : bg}`,
                }}
              >
                {photo ? (
                  <img src={photo} alt={row.name} className="w-11 h-11 rounded-full object-cover shrink-0"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ background: `linear-gradient(135deg, ${bg}cc, ${bg}66)` }}>
                    {initials}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: isSelected ? bg : 'var(--cn-text-primary)' }}>{row.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {row.noActionTaken > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#ef444420', color: '#ef4444' }}>
                        {row.noActionTaken} pending
                      </span>
                    )}
                    <span className="text-[11px]" style={{ color: 'var(--cn-text-muted)' }}>{row.total} tasks</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected PM detail */}
      {detailContent}
    </div>
  );
}

// ─── Tiny multi-select dropdown (checkbox list) ────────────────────────────────
function MiniMultiSelect({ label, options, selected, onChange }: {
  label: string; options: string[]; selected: string[]; onChange: (vals: string[]) => void;
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

  const toggle = (val: string) =>
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);

  const btnLabel = selected.length === 0
    ? `All ${label}`
    : selected.length === 1
    ? selected[0]
    : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs rounded-lg border px-2.5 py-1.5 cursor-pointer"
        style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)' }}
      >
        <span className="truncate max-w-[120px]">{btnLabel}</span>
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 w-52 border rounded-lg z-50 max-h-64 overflow-y-auto"
          style={{ background: 'var(--cn-bg-dropdown)', borderColor: 'var(--cn-border)', boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}
        >
          <div className="flex gap-3 px-3 py-2 border-b" style={{ borderColor: 'var(--cn-border)' }}>
            <button onClick={() => onChange(options)} className="text-[11px] font-semibold" style={{ color: 'var(--cn-accent)' }}>Select all</button>
            <button onClick={() => onChange([])} className="text-[11px]" style={{ color: 'var(--cn-text-muted)' }}>Clear</button>
          </div>
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs"
              style={{ color: 'var(--cn-text-primary)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--cn-bg-input)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
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

// ─── PM Tasks Table (all tasks assigned to the selected PM) ────────────────────
function PmTasksTable({ data, personName, projectCol, taskCol, taskUrlCol, timeEstCol, bucketCol, bucketSetCol, statusCol, pmStatusCol }: {
  data: SheetData[]; personName: string;
  projectCol?: string; taskCol?: string; taskUrlCol?: string; timeEstCol?: string;
  bucketCol?: string; bucketSetCol?: string; statusCol?: string; pmStatusCol?: string;
}) {
  const normBucket = (s: string) => {
    const l = s.trim().toLowerCase();
    if (l === 'tommorow' || l === 'tommorrow' || l === 'tomorow') return 'tomorrow';
    if (l === 'day after tommorow' || l === 'day after tommorrow') return 'day after tomorrow';
    return l;
  };
  const bucketColors: Record<string, string> = {
    today: '#16a34a', tomorrow: '#3b82f6', 'day after tomorrow': '#f59e0b',
  };
  const pmColor: Record<string,string> = {
    'approved': '#16a34a', 'submitted to client': '#6d28d9',
    'changes': '#dc2626', 'no action taken': '#6b7280', 'n/a': '#6b7280', 'ticketclosed': '#7c3aed',
  };

  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [bucketFilter, setBucketFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [pmStatusFilter, setPmStatusFilter] = useState<string[]>([]);
  const [statusDefaultApplied, setStatusDefaultApplied] = useState(false);

  const uniq = (col?: string) => col
    ? [...new Set(data.map(r => String(r[col] ?? '').trim()).filter(Boolean))].sort()
    : [];
  const projectOptions   = uniq(projectCol);
  const bucketOptions    = uniq(bucketCol);
  const statusOptions    = uniq(statusCol);
  const pmStatusOptions  = uniq(pmStatusCol);

  // By default exclude "Task Closed" — admin can re-include it via the Status filter
  useEffect(() => {
    if (!statusDefaultApplied && statusOptions.length > 0) {
      setStatusFilter(statusOptions.filter(o => o.toLowerCase() !== 'task closed'));
      setStatusDefaultApplied(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusOptions.join('|'), statusDefaultApplied]);

  const filteredData = data.filter(r => {
    if (projectFilter.length > 0 && projectCol && !projectFilter.includes(String(r[projectCol] ?? '').trim())) return false;
    if (bucketFilter.length > 0 && bucketCol && !bucketFilter.includes(String(r[bucketCol] ?? '').trim())) return false;
    if (statusFilter.length > 0 && statusCol && !statusFilter.includes(String(r[statusCol] ?? '').trim())) return false;
    if (pmStatusFilter.length > 0 && pmStatusCol && !pmStatusFilter.includes(String(r[pmStatusCol] ?? '').trim())) return false;
    return true;
  });

  return (
    <div className="cn-card rounded-xl overflow-hidden" style={{ background: 'var(--cn-bg-card)' }}>
      <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap" style={{ borderBottom: '1px solid var(--cn-border)' }}>
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--cn-text-primary)' }}>All Tasks Assigned By {personName}</h3>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>
            {filteredData.length} of {data.length} tasks
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <MiniMultiSelect label="Projects"    options={projectOptions}   selected={projectFilter}   onChange={setProjectFilter} />
          <MiniMultiSelect label="Buckets"     options={bucketOptions}    selected={bucketFilter}    onChange={setBucketFilter} />
          <MiniMultiSelect label="Statuses"    options={statusOptions}    selected={statusFilter}    onChange={setStatusFilter} />
          <MiniMultiSelect label="PM Statuses" options={pmStatusOptions}  selected={pmStatusFilter}  onChange={setPmStatusFilter} />
        </div>
      </div>
      {filteredData.length === 0 ? (
        <p className="text-center py-6 text-sm" style={{ color: 'var(--cn-text-muted)' }}>No tasks match the selected filters.</p>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-xs table-fixed">
          <thead>
            <tr style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}>
              <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Project Name</th>
              <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Task Name</th>
              <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Task URL</th>
              <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Time Estimate</th>
              <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Task Daily Bucket</th>
              <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Bucket Set</th>
              <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Status</th>
              <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">PM Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((r, i) => {
              const project   = projectCol   ? String(r[projectCol]   ?? '').trim() : '';
              const task      = taskCol      ? String(r[taskCol]      ?? '').trim() : '';
              const taskUrl   = taskUrlCol   ? String(r[taskUrlCol]   ?? '').trim() : '';
              const timeEst   = timeEstCol   ? String(r[timeEstCol]   ?? '').trim() : '';
              const bucket    = bucketCol    ? String(r[bucketCol]    ?? '').trim() : '';
              const bucketSet = bucketSetCol ? String(r[bucketSetCol] ?? '').trim() : '';
              const status    = statusCol    ? String(r[statusCol]    ?? '').trim() : '';
              const pmStatus  = pmStatusCol  ? String(r[pmStatusCol]  ?? '').trim() : '';
              const sColor  = STATUS_COLORS[status.toLowerCase()] ?? '#6b7280';
              const pmC     = pmColor[pmStatus.toLowerCase()] ?? '#6b7280';
              const bColor  = bucketColors[normBucket(bucket)] ?? '#6b7280';
              return (
                <tr key={String(r['__row'] ?? i)} style={{ borderTop: '1px solid var(--cn-border-light, var(--cn-border))' }}>
                  <td className="px-4 py-2 truncate" style={{ color: 'var(--cn-text-muted)' }}>
                    <span className="truncate block">{project || '—'}</span>
                  </td>
                  <td className="px-4 py-2 truncate" style={{ color: 'var(--cn-text-primary)' }}>
                    <span className="truncate block">{task || '—'}</span>
                  </td>
                  <td className="px-4 py-2">
                    {taskUrl ? (
                      <a href={taskUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ color: 'var(--cn-accent)', background: 'var(--cn-accent)' + '15' }}
                      >
                        Open ↗
                      </a>
                    ) : <span style={{ color: 'var(--cn-text-muted)' }}>—</span>}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap" style={{ color: 'var(--cn-text-muted)' }}>
                    {timeEst || '—'}
                  </td>
                  <td className="px-4 py-2">
                    {bucket ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize" style={{ background: bColor + '20', color: bColor }}>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: bColor }} />
                        {normBucket(bucket)}
                      </span>
                    ) : <span style={{ color: 'var(--cn-text-muted)' }}>—</span>}
                  </td>
                  <td className="px-4 py-2">
                    {bucketSet ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize" style={{ background: bColor + '20', color: bColor }}>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: bColor }} />
                        {bucketSet.toLowerCase() === 'tommorow' ? 'Tomorrow' : bucketSet}
                      </span>
                    ) : <span style={{ color: 'var(--cn-text-muted)' }}>—</span>}
                  </td>
                  <td className="px-4 py-2">
                    {status ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize" style={{ background: sColor + '20', color: sColor }}>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sColor }} />
                        {status}
                      </span>
                    ) : <span style={{ color: 'var(--cn-text-muted)' }}>—</span>}
                  </td>
                  <td className="px-4 py-2">
                    {pmStatus && pmStatus.toLowerCase() !== 'n/a' ? (
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
        </table>
      </div>
      )}
    </div>
  );
}

// ─── Radial Progress ──────────────────────────────────────────────────────────
function RadialProgress({ value, max, color, label }: {
  value: number; max: number; color: string; label: string;
}) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <svg width={68} height={68} viewBox="0 0 68 68">
          <circle cx={34} cy={34} r={r} fill="none" stroke="var(--cn-bg-input)" strokeWidth={6} />
          <circle
            cx={34} cy={34} r={r} fill="none" stroke={color} strokeWidth={6}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeLinecap="round"
            transform="rotate(-90 34 34)"
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className="text-base font-bold" style={{ color: 'var(--cn-text-primary)' }}>{value}</span>
          <span className="text-[9px] mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>{Math.round(pct * 100)}%</span>
        </div>
      </div>
      <span className="text-[11px] font-medium text-center leading-tight" style={{ color: 'var(--cn-text-muted)' }}>{label}</span>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, total, color, icon, adminStyle }: {
  label: string; value: number; total: number; color: string; icon: React.ReactNode; adminStyle?: boolean;
}) {
  const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0;

  if (adminStyle) {
    return (
      <div
        className="cn-card rounded-xl p-5 flex flex-col gap-2 cursor-default relative overflow-hidden"
        style={{ background: 'var(--cn-bg-card)', borderLeft: `3px solid ${color}` }}
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--cn-text-muted)' }}>{label}</p>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}15`, color }}>
            {icon}
          </div>
        </div>
        <p className="text-3xl font-bold tabular-nums leading-none mt-1" style={{ color: 'var(--cn-text-primary)' }}>{value}</p>
        <div className="space-y-1 mt-1">
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--cn-bg-input)' }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, transition: 'width 0.8s ease' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="cn-card rounded-xl p-5 flex flex-col gap-3 cursor-default"
      style={{ background: 'var(--cn-bg-card)' }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--cn-text-muted)' }}>{label}</p>
        <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0" style={{ background: `${color}18`, color }}>
          {icon}
        </div>
      </div>
      <p className="text-4xl font-bold tabular-nums leading-none" style={{ color: 'var(--cn-text-primary)' }}>{value}</p>
      <div className="space-y-1">
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--cn-bg-input)' }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, transition: 'width 0.8s ease' }} />
        </div>
      </div>
    </div>
  );
}

// ─── Distribution Card (replaces DonutCard) ──────────────────────────────────
export function DonutCard({ title, sub, data, colorMap = {} }: {
  title: string; sub?: string;
  data: { name: string; value: number }[];
  colorMap?: Record<string, string>;
  adminStyle?: boolean;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const sorted = [...data].sort((a, b) => b.value - a.value);
  return (
    <div className="cn-card rounded-xl p-4 sm:p-5 flex flex-col h-full" style={{ background: 'var(--cn-bg-card)' }}>
      <div className="mb-4">
        <h3 className="font-semibold text-sm" style={{ color: 'var(--cn-text-primary)' }}>{title}</h3>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>{sub}</p>}
      </div>
      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--cn-text-muted)' }}>No data</div>
      ) : (
        <div className="flex-1 flex flex-col justify-center gap-3">
          {sorted.map((entry, i) => {
            const color = resolveColor(entry.name, colorMap, i);
            const pct = total > 0 ? (entry.value / total) * 100 : 0;
            return (
              <div key={entry.name} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-xs truncate" style={{ color: 'var(--cn-text-muted)', maxWidth: 140 }}>{entry.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--cn-text-primary)' }}>{entry.value}</span>
                    <span className="text-[10px] w-7 text-right tabular-nums" style={{ color: 'var(--cn-text-muted)' }}>{pct.toFixed(0)}%</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--cn-bg-input)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, transition: 'width 0.8s ease' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Bar Card ─────────────────────────────────────────────────────────────────
export function BarCard({ title, sub, data, dataKey, color, unit = '' }: {
  title: string; sub?: string;
  data: Record<string, unknown>[];
  dataKey: string; color: string; unit?: string;
}) {
  const barH = Math.max(220, data.length * 36);
  return (
    <div className="cn-card rounded-xl p-4 sm:p-5 h-full" style={{ background: 'var(--cn-bg-card)' }}>
      <h3 className="font-semibold text-sm mb-0.5" style={{ color: 'var(--cn-text-primary)' }}>{title}</h3>
      {sub && <p className="text-xs mb-3" style={{ color: 'var(--cn-text-muted)' }}>{sub}</p>}
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-52 text-sm" style={{ color: 'var(--cn-text-muted)' }}>No data</div>
      ) : (
        <ResponsiveContainer width="100%" height={barH}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--cn-border)" horizontal={false} />
            <XAxis type="number" tick={{ fill: 'var(--cn-text-muted)', fontSize: 11 }} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: 'var(--cn-text-muted)', fontSize: 11 }} width={80} />
            <Tooltip {...tooltipStyle} formatter={(val: unknown) => [`${val}${unit}`, dataKey]} />
            <Bar dataKey={dataKey} fill={color} radius={[0, 4, 4, 0]} maxBarSize={28}
              label={{ position: 'right', fill: 'var(--cn-text-muted)', fontSize: 11 }}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Stacked Bar Card ─────────────────────────────────────────────────────────
function StackedBarCard({ title, sub, data, statuses }: {
  title: string; sub?: string;
  data: Record<string, unknown>[];
  statuses: string[];
}) {
  return (
    <div className="cn-card rounded-xl p-4 sm:p-5 h-full" style={{ background: 'var(--cn-bg-card)' }}>
      <h3 className="font-semibold text-sm mb-0.5" style={{ color: 'var(--cn-text-primary)' }}>{title}</h3>
      {sub && <p className="text-xs mb-3" style={{ color: 'var(--cn-text-muted)' }}>{sub}</p>}
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-52 text-sm" style={{ color: 'var(--cn-text-muted)' }}>No data</div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--cn-border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: 'var(--cn-text-muted)', fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
            <YAxis tick={{ fill: 'var(--cn-text-muted)', fontSize: 11 }} allowDecimals={false} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ color: 'var(--cn-text-muted)', fontSize: 11, paddingTop: 8 }} />
            {statuses.map((s, i) => (
              <Bar key={s} dataKey={s} stackId="a"
                fill={STATUS_COLORS[s.toLowerCase()] ?? PALETTE[i % PALETTE.length]}
                radius={i === statuses.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                maxBarSize={56}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Status Breakdown Panel (replaces RadialPanel) ───────────────────────────
function StatusBreakdown({ title, sub, items }: {
  title: string; sub?: string;
  items: { label: string; value: number; max: number; color: string }[];
}) {
  return (
    <div
      className="cn-card rounded-xl p-4 sm:p-5 h-full flex flex-col"
      style={{ background: 'var(--cn-bg-card)' }}
    >
      <div className="mb-4">
        <h3 className="font-semibold text-sm" style={{ color: 'var(--cn-text-primary)' }}>{title}</h3>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>{sub}</p>}
      </div>
      <div className="flex-1 flex flex-col justify-center gap-4">
        {items.map(({ label, value, max, color }) => {
          const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
          return (
            <div key={label} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--cn-text-muted)' }}>{label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--cn-text-primary)' }}>{value}</span>
                  <span className="text-[10px] w-8 text-right tabular-nums" style={{ color: 'var(--cn-text-muted)' }}>{pct.toFixed(0)}%</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--cn-bg-input)' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, transition: 'width 0.8s ease' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Radial Panel (kept for compat) ──────────────────────────────────────────
function RadialPanel({ title, sub, items }: {
  title: string; sub?: string;
  items: { label: string; value: number; max: number; color: string }[];
}) {
  return (
    <div
      className="cn-card border rounded-lg p-4 sm:p-5 h-full flex flex-col"
      style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}
    >
      <div className="mb-4">
        <h3 className="font-semibold text-sm" style={{ color: 'var(--cn-text-primary)' }}>{title}</h3>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>{sub}</p>}
      </div>
      <div className="flex-1 grid grid-cols-2 gap-4 place-items-center py-2">
        {items.map((item, i) => <RadialProgress key={i} {...item} />)}
      </div>
    </div>
  );
}

const BUCKET_ORDER2 = ['today', 'everyday', 'inprogress', 'tomorrow', 'tobeexpected', 'submitted'] as const;
const BUCKET_LABELS2: Record<string, string> = { today: 'Today', everyday: 'Everyday', inprogress: 'In Progress', tomorrow: 'Tomorrow', tobeexpected: 'To Be Expected', submitted: 'Submitted' };
const BUCKET_COLORS2: Record<string, string> = { today: '#16a34a', everyday: '#f59e0b', inprogress: '#3b82f6', tomorrow: '#7c3aed', tobeexpected: '#d97706', submitted: '#10b981' };
const SKIP_STATUSES = ['task closed', 'n/a', ''];
const PM_COLOR: Record<string, string> = {
  'approved': '#22c55e', 'no action taken': '#6b7280', 'rejected': '#ef4444',
  'needs revision': '#f59e0b', 'in review': '#3b82f6', 'submitted to pm': '#8b5cf6',
};

// ─── Resource Status Grid (today workload summary for main dashboard) ──────────
export function ResourceStatusGrid({ sheet1Data, sheet1Headers, availData, availHeaders, onStatusChange, pmStatusColName, canEditPmStatus = false, isAdmin = false, currentUserEmail = '', autoOpenFirst = false }: {
  sheet1Data: SheetData[]; sheet1Headers: string[];
  availData?: SheetData[]; availHeaders?: string[];
  onStatusChange?: (row: SheetData, colName: string, newValue: string) => Promise<void>;
  pmStatusColName?: string;
  canEditPmStatus?: boolean;
  isAdmin?: boolean;
  currentUserEmail?: string;
  autoOpenFirst?: boolean;
}) {
  const [openName, setOpenName] = useState<string | null>(null);
  const [tab, setTab] = useState<'today' | 'tomorrow' | 'dayafter'>('today');
  const gridRef = useRef<HTMLDivElement>(null);
  const autoOpenedRef = useRef(false);

  // Reset open state on mount (prevents stale open from preserved React tree)
  useEffect(() => { setOpenName(null); }, []);


  const resourceCol = findCol(sheet1Headers, 'assigned person', 'assigned to', 'resource');
  const statusCol   = findCol(sheet1Headers, 'task status', 'status');
  const bucketCol   = findCol(sheet1Headers, 'task daily bucket', 'bucket');
  const timeEstCol  = findCol(sheet1Headers, 'time estimation', 'time estimate', 'estimation');
  const taskCol      = findCol(sheet1Headers, 'task name', 'task title', 'task');
  const projectCol   = findCol(sheet1Headers, 'project name', 'project');
  const taskUrlCol   = findCol(sheet1Headers, 'task url', 'task link', 'link', 'url');
  const bucketSetCol = sheet1Headers.find(h => h.toLowerCase().includes('today bucket set') || h.toLowerCase().includes('bucket set'));
  const pmStatusCol2 = sheet1Headers.find(h => h.toLowerCase().includes('pm status'));
  // "Total Hours" on the Marketing Tasks sheet, "Total Time" on Bandwidth Allocation
  const totalHoursCol2 = sheet1Headers.find(h => h.toLowerCase().includes('total hours') || h.toLowerCase().includes('total time'));
  // Team Bandwidth has no individual-tier viewers — Time Logged On AC never
  // shows here (only in Tasks Overview, for the row's own owner). Total Hours
  // shows whenever the sheet has it, independent of team.
  const showTotalHours2 = !!totalHoursCol2;
  const pmEmailCol   = findCol(sheet1Headers, 'pm email', 'email');
  const availNameCol   = availHeaders ? findCol(availHeaders, 'name', 'resource', 'person', 'team') : undefined;
  const availStatusCol = availHeaders ? findCol(availHeaders, 'availability', 'status', 'leave') : undefined;

  // Auto-open the first card once data is available (opt-in — the main
  // Dashboard's Team Workload widget doesn't pass this, only Team Bandwidth does)
  useEffect(() => {
    if (!autoOpenFirst || autoOpenedRef.current || !resourceCol) return;
    const firstName = [...new Set(sheet1Data.map(r => String(r[resourceCol] ?? '').trim()).filter(Boolean))].sort()[0];
    if (firstName) { autoOpenedRef.current = true; setOpenName(firstName); }
  }, [autoOpenFirst, sheet1Data, resourceCol]);

  if (!sheet1Data.length || !resourceCol) return null;

  const getStatus    = (r: SheetData) => statusCol    ? String(r[statusCol]    ?? '').trim() : '';
  const getBucket    = (r: SheetData) => bucketCol    ? String(r[bucketCol]    ?? '').trim().toLowerCase() : '';
  const getTask      = (r: SheetData) => taskCol      ? String(r[taskCol]      ?? '').trim() : '';
  const getProj      = (r: SheetData) => projectCol   ? String(r[projectCol]   ?? '').trim() : '';
  const getTime      = (r: SheetData) => timeEstCol   ? parseHours(String(r[timeEstCol]   ?? '').trim()) : 0;
  const getTaskUrl   = (r: SheetData) => taskUrlCol   ? String(r[taskUrlCol]   ?? '').trim() : '';
  const getBucketSet = (r: SheetData) => bucketSetCol ? String(r[bucketSetCol] ?? '').trim() : '';
  const getPmStatus  = (r: SheetData) => pmStatusCol2 ? String(r[pmStatusCol2] ?? '').trim() : '';
  const getTotalHoursVal2 = (r: SheetData) => totalHoursCol2 ? String(r[totalHoursCol2] ?? '').trim() : '';

  const names = [...new Set(sheet1Data.map(r => String(r[resourceCol] ?? '').trim()).filter(Boolean))].sort();

  // tab → which primary bucket to include (everyday always included)
  const tabBucket = tab === 'today' ? 'today' : tab === 'tomorrow' ? 'tomorrow' : 'dayafter';

  const rows = names.map(name => {
    const myTasks = sheet1Data.filter(r => String(r[resourceCol] ?? '').trim() === name);
    const isMonthlyBlock = MONTHLY_BLOCK_MARKETING_NAMES.has(name.trim().toLowerCase());
    // Show tasks filtered by tab — exclude closed tasks and tomorrow/dayafter from Today's tab
    const tabTasks = myTasks.filter(r => {
      const st = getStatus(r).toLowerCase();
      if (SKIP_STATUSES.includes(st)) return false; // never show closed/n/a
      const b = getBucket(r);
      // Exclude tomorrow/day-after tasks from Today's tab
      if (tab === 'today' && (b === 'tomorrow' || b === 'tommorow' || b === 'day after tomorrow' || b === 'dayafter' || b === 'day after')) return false;
      // Tomorrow tab: tomorrow-bucket tasks plus recurring Everyday tasks
      if (tab === 'tomorrow') return (b === 'tomorrow' || b === 'tommorow' || b === 'everyday');
      // Day After tab: day-after-bucket tasks plus recurring Everyday tasks
      if (tab === 'dayafter') return (b === 'day after tomorrow' || b === 'dayafter' || b === 'day after' || b === 'everyday');
      return true;
    });
    // Hours drive both the status badge and the header display, so they're
    // summed straight from tabTasks (the same set tabCount and the task list
    // use) rather than re-filtering myTasks — otherwise a resource with only
    // e.g. a Today task and nothing for Tomorrow would show "0 Tasks" on the
    // Tomorrow tab while the badge still read "Partially Occupied" from
    // stale Today hours.
    const displayHours = tabTasks.reduce((s, r) => s + getTime(r), 0);
    const tabHours = displayHours;
    const tabCount = tabTasks.length;

    let onLeave = false;
    if (availData && availNameCol && availStatusCol) {
      const av = availData.find(r => String(r[availNameCol] ?? '').trim().toLowerCase() === name.toLowerCase());
      if (av) { const v = String(av[availStatusCol] ?? '').trim().toLowerCase(); onLeave = isOnLeaveText(v); }
    }

    const status = onLeave
      ? { label: 'On Leave', bg: '#ef4444' }
      : workloadStatus(displayHours, isMonthlyBlock);

    // Build grouped tasks for dropdown (tab-relevant tasks only, exclude task closed)
    const grouped: Record<string, { task: string; project: string; status: string; hours: number; taskUrl: string; bucketSet: string; pmStatus: string; totalHoursVal: string; realBucket: string; _raw: SheetData }[]> = {};
    tabTasks.forEach(r => {
      const st = getStatus(r).toLowerCase();
      if (SKIP_STATUSES.includes(st)) return;
      const b = getBucket(r);
      let bucket = b;
      if (['submitted to pm', 'submitted to akash', 'submitted to client'].includes(st)) bucket = 'submitted';
      else if (st === 'in progress') bucket = 'inprogress';
      else if (b === 'tommorow') bucket = 'tomorrow';
      else if (b === 'to be expected') bucket = 'tobeexpected';
      if (!BUCKET_ORDER2.includes(bucket as typeof BUCKET_ORDER2[number])) bucket = 'everyday';
      if (!grouped[bucket]) grouped[bucket] = [];
      grouped[bucket].push({
        task: getTask(r), project: getProj(r), status: getStatus(r), hours: getTime(r),
        taskUrl: getTaskUrl(r), bucketSet: getBucketSet(r), pmStatus: getPmStatus(r),
        totalHoursVal: getTotalHoursVal2(r),
        realBucket: b, _raw: r,
      });
    });

    return { name, tabHours, displayHours, tabCount, status, grouped };
  });

  const openRow = rows.find(r => r.name === openName);

  // Team Current State summary from rows
  const stateCount = (label: string) => rows.filter(r => r.status.label === label).length;
  const stateSummary = [
    { label: 'Available',          color: '#22c55e' },
    { label: 'Partially Occupied', color: '#f59e0b' },
    { label: 'Occupied',           color: '#ea580c' },
    { label: 'On Leave',           color: '#8b5cf6' },
    // Only shown when at least one row actually lands in that band
    ...(rows.some(r => r.status.label === 'Partially Available') ? [{ label: 'Partially Available', color: '#16a34a' }] : []),
    ...(rows.some(r => r.status.label === 'Overload') ? [{ label: 'Overload', color: '#dc2626' }] : []),
  ];

  return (
    <div ref={gridRef} className="cn-card rounded-xl border overflow-hidden" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
      {/* Header with tabs + Team Current State summary */}
      <div className="px-4 pt-4 pb-0">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>Team Workload</p>
          <div className="flex gap-1">
            {([['today', "Today's"], ['tomorrow', 'Tomorrow'], ['dayafter', 'Day After']] as const).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                className="px-3 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer"
                style={tab === t
                  ? { background: 'var(--cn-accent)', color: '#fff', border: 'none' }
                  : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)', border: '1px solid var(--cn-border)' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {/* Team Current State badges */}
        <div className="flex items-center gap-3 pb-3 border-b flex-wrap" style={{ borderColor: 'var(--cn-border)' }}>
          {stateSummary.map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold tabular-nums" style={{ color }}>{stateCount(label)}</span>
              <span className="text-[11px]" style={{ color: 'var(--cn-text-muted)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="h-2" />

      {/* Member list (sidebar) + detail panel — was a horizontal card row,
          which got unreadably cramped once rosters grew past ~6 people */}
      <div className="flex flex-col md:flex-row border-t" style={{ borderColor: 'var(--cn-border)' }}>
        <div className="md:w-64 shrink-0 md:border-r overflow-y-auto" style={{ borderColor: 'var(--cn-border)', maxHeight: 560 }}>
          {rows.map(row => {
            const bg    = memberColor(row.name);
            const photo = teamPhoto(row.name);
            const initials = row.name.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase();
            const isOpen = openName === row.name;
            return (
              <button key={row.name}
                onClick={() => setOpenName(isOpen ? null : row.name)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left cursor-pointer select-none transition-colors border-b"
                style={{ background: isOpen ? row.status.bg + '10' : 'transparent', borderColor: 'var(--cn-border-light, var(--cn-border))' }}>
                {photo ? (
                  <div className="w-9 h-9 rounded-full p-[2px] shrink-0" style={{ background: `conic-gradient(${bg}, #e5e7eb, ${bg})` }}>
                    <img src={photo} alt={row.name} className="w-full h-full rounded-full object-cover"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ background: `linear-gradient(135deg, ${bg}cc, ${bg}66)` }}>{initials}</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--cn-text-primary)' }}>{row.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                      style={{ background: row.status.bg + '22', color: row.status.bg }}>{row.status.label}</span>
                    {row.tabCount > 0 && (
                      <span className="text-[10px] font-semibold truncate" style={{ color: '#f59e0b' }}>
                        {row.tabCount} Tasks · {Math.round(row.displayHours * 10) / 10}h
                      </span>
                    )}
                  </div>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="shrink-0" style={{ color: 'var(--cn-text-muted)', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                  <polyline points="9 6 15 12 9 18"/>
                </svg>
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-w-0">
          {!openRow ? (
            <div className="flex items-center justify-center py-16 text-sm" style={{ color: 'var(--cn-text-muted)' }}>
              Select a team member to see their tasks
            </div>
          ) : (() => {
        const allTasks: { task: string; project: string; status: string; hours: number; taskUrl: string; bucketSet: string; pmStatus: string; totalHoursVal: string; _raw: SheetData; bucket: string; realBucket?: string }[] = [];
        BUCKET_ORDER2.forEach(bucket => {
          (openRow.grouped[bucket] ?? []).forEach(t => allTasks.push({ ...t, bucket: t.realBucket ?? bucket }));
        });
        // Group into one card per project, largest project first
        const projectGroups = new Map<string, typeof allTasks>();
        allTasks.forEach(t => {
          const key = t.project || 'No Project';
          if (!projectGroups.has(key)) projectGroups.set(key, []);
          projectGroups.get(key)!.push(t);
        });
        const projectEntries = [...projectGroups.entries()].sort((a, b) => b[1].length - a[1].length);

        const getStatusLower = (t: typeof allTasks[number]) => (t.status || '').toLowerCase();
        const activeTasks  = allTasks.filter(t => getStatusLower(t) === 'in progress').length;
        const onHoldTasks  = allTasks.filter(t => getStatusLower(t) === 'on hold').length;
        const pendingPM    = allTasks.filter(t => ['submitted to pm', 'submitted to akash'].includes(getStatusLower(t))).length;
        const toBeStarted  = allTasks.filter(t => getStatusLower(t) === 'to be started').length;

        const bg = memberColor(openRow.name);
        const photo = teamPhoto(openRow.name);
        const initials = openRow.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
        const statusDot = (color: string) => <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: color }} />;

        return (
          <div style={{ background: 'var(--cn-bg-card)' }}>
            {/* Header — avatar, status badge, designation, stat pills, total badge */}
            <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
              {photo ? (
                <div className="w-10 h-10 rounded-full p-[2px] shrink-0" style={{ background: `conic-gradient(${bg}, #e5e7eb, ${bg})` }}>
                  <img src={photo} alt={openRow.name} className="w-full h-full rounded-full object-cover"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ background: `linear-gradient(135deg, ${bg}cc, ${bg}66)` }}>{initials}</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--cn-text-primary)' }}>{openRow.name}</p>
                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: openRow.status.bg, color: '#fff' }}>
                    {openRow.status.label}
                  </span>
                </div>
                <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>{teamDesignation(openRow.name) || '—'}</p>
              </div>
              <div className="hidden sm:flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5 text-xs" title="In Progress">
                  {statusDot('#16a34a')}
                  <span style={{ color: 'var(--cn-text-primary)' }} className="font-semibold">{activeTasks}</span>
                  <span style={{ color: 'var(--cn-text-muted)' }}>in progress</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs" title="On Hold">
                  {statusDot('#7c3aed')}
                  <span style={{ color: 'var(--cn-text-primary)' }} className="font-semibold">{onHoldTasks}</span>
                  <span style={{ color: 'var(--cn-text-muted)' }}>on hold</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs" title="Pending PM Review">
                  {statusDot('#10b981')}
                  <span style={{ color: 'var(--cn-text-primary)' }} className="font-semibold">{pendingPM}</span>
                  <span style={{ color: 'var(--cn-text-muted)' }}>PM</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs" title="To Be Started">
                  {statusDot('#dc2626')}
                  <span style={{ color: 'var(--cn-text-primary)' }} className="font-semibold">{toBeStarted}</span>
                  <span style={{ color: 'var(--cn-text-muted)' }}>to be started</span>
                </div>
              </div>
              <div className="px-2.5 py-1 rounded-full text-xs font-bold shrink-0" style={{ background: bg + '18', color: bg }}>
                {allTasks.length}
              </div>
            </div>

            {allTasks.length === 0 ? (
              <p className="px-4 pb-6 text-center text-xs" style={{ color: 'var(--cn-text-faint)' }}>No active tasks</p>
            ) : (
              <div className="px-4 pb-4 flex flex-col gap-3">
                {projectEntries.map(([project, tasks]) => (
                  <div key={project} className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--cn-border)', background: 'var(--cn-bg-card)' }}>
                    <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--cn-border)', background: 'var(--cn-bg-input)' }}>
                      <p className="text-xs font-bold truncate" style={{ color: 'var(--cn-text-primary)' }}>{project}</p>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'var(--cn-bg-card)', color: 'var(--cn-text-muted)' }}>{tasks.length}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--cn-border)', background: 'var(--cn-bg-input)' }}>
                            {['TASK', 'LINK', 'EST.',
                              ...(showTotalHours2 ? ['TOTAL HOURS'] : []),
                              'TASK DAILY BUCKET', 'BUCKET SET',
                              'STATUS', 'PM STATUS'].map(h => (
                              <th key={h} className="text-left px-3 py-2 font-semibold tracking-wide whitespace-nowrap" style={{ color: 'var(--cn-text-muted)', fontSize: '11px' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tasks.map((t, i) => {
                            const pmC = PM_COLOR[(t.pmStatus || '').toLowerCase()] ?? '#6b7280';
                            return (
                              <tr key={i} style={{ borderBottom: '1px solid var(--cn-border-light, var(--cn-border))' }} className="transition-colors hover:bg-[var(--cn-bg-input)]">
                                <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--cn-text-primary)', minWidth: 160 }}>{t.task || '—'}</td>
                                <td className="px-3 py-2.5" style={{ minWidth: 60 }}>
                                  {t.taskUrl
                                    ? <a href={t.taskUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-[11px]" style={{ color: '#ef4444' }}>Open ↗</a>
                                    : <span style={{ color: 'var(--cn-text-faint)' }}>—</span>}
                                </td>
                                <td className="px-3 py-2.5" style={{ minWidth: 60 }}>
                                  {!!t.hours && t.hours > 0
                                    ? <span className="font-bold px-1.5 py-0.5 rounded-full text-[11px]" style={{ background: '#f59e0b22', color: '#f59e0b' }}>{Math.round(t.hours * 10) / 10}h</span>
                                    : <span style={{ color: 'var(--cn-text-faint)' }}>—</span>}
                                </td>
                                {showTotalHours2 && (
                                  <td className="px-3 py-2.5" style={{ minWidth: 60, color: 'var(--cn-text-muted)' }}>
                                    {t.totalHoursVal.trim() ? formatHHMM(toHM(t.totalHoursVal).h, toHM(t.totalHoursVal).m) : '—'}
                                  </td>
                                )}
                                <td className="px-3 py-2.5" style={{ minWidth: 110 }}>
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                                    style={{ background: BUCKET_COLORS2[t.bucket] + '22', color: BUCKET_COLORS2[t.bucket] }}>
                                    {BUCKET_LABELS2[t.bucket]}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5" style={{ minWidth: 80 }}>
                                  {t.bucketSet
                                    ? <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>{t.bucketSet}</span>
                                    : <span style={{ color: 'var(--cn-text-faint)' }}>—</span>}
                                </td>
                                <td className="px-3 py-2.5" style={{ minWidth: 120 }}>
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                                    style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)', border: '1px solid var(--cn-border)' }}>
                                    {t.status}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5" style={{ minWidth: 150 }}>
                                  {(() => {
                                    const rowEmail = pmEmailCol ? String(t._raw[pmEmailCol] ?? '').trim().toLowerCase() : '';
                                    const rowCanEdit = canEditPmStatus && onStatusChange && (pmStatusColName || pmStatusCol2) &&
                                      (isAdmin || !currentUserEmail || !rowEmail || rowEmail === currentUserEmail.trim().toLowerCase());
                                    return rowCanEdit ? (
                                      <ResourcePmSelect
                                        value={t.pmStatus || 'No Action Taken'}
                                        raw={t._raw}
                                        colName={pmStatusColName ?? pmStatusCol2 ?? ''}
                                        onStatusChange={onStatusChange}
                                      />
                                    ) : t.pmStatus ? (
                                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                                        style={{ background: pmC + '22', color: pmC }}>
                                        {t.pmStatus}
                                      </span>
                                    ) : <span style={{ color: 'var(--cn-text-faint)' }}>—</span>;
                                  })()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
        </div>
      </div>
    </div>
  );
}

// ─── Team Workload cards — Dashboard's simplified, read-only "today" snapshot
// of the whole team, 4-per-row. No click-to-expand, no editing — same status
// thresholds as ResourceStatusGrid, just a flat glance instead of a
// list+detail layout (that's what the standalone Team Bandwidth tab was for,
// and it's been retired).
const TEAM_CARD_STAT_DEFS: { key: string; label: string; full?: boolean }[] = [
  { key: 'tasks', label: 'Tasks' },
  { key: 'hours', label: 'Hours' },
  { key: 'inProgress', label: 'In Progress', full: true },
  { key: 'onHold', label: 'On Hold' },
  { key: 'submittedPm', label: 'Submitted To PM' },
  { key: 'submittedAdmin', label: 'Submitted To Admin', full: true },
];
const DEFAULT_TEAM_CARD_FIELDS = ['Tasks', 'Hours', 'In Progress'];

export function TeamWorkloadCards({ sheet1Data, sheet1Headers, availData, availHeaders }: {
  sheet1Data: SheetData[]; sheet1Headers: string[];
  availData?: SheetData[]; availHeaders?: string[];
}) {
  const [subDept, setSubDept] = useState<SubDept>('all');
  const [cardFields, setCardFields] = useState<string[]>(DEFAULT_TEAM_CARD_FIELDS);
  const resourceCol = findCol(sheet1Headers, 'assigned person', 'assigned to', 'resource');
  const statusCol   = findCol(sheet1Headers, 'task status', 'status');
  const bucketCol   = findCol(sheet1Headers, 'task daily bucket', 'bucket');
  const timeEstCol  = findCol(sheet1Headers, 'time estimation', 'time estimate', 'estimation');
  const projectCol  = findCol(sheet1Headers, 'project name', 'project');
  const availNameCol   = availHeaders ? findCol(availHeaders, 'name', 'resource', 'person', 'team') : undefined;
  const availStatusCol = availHeaders ? findCol(availHeaders, 'availability', 'status', 'leave') : undefined;

  if (!sheet1Data.length || !resourceCol) return null;

  const getStatus = (r: SheetData) => statusCol  ? String(r[statusCol]  ?? '').trim().toLowerCase() : '';
  const getBucket = (r: SheetData) => bucketCol  ? String(r[bucketCol]  ?? '').trim().toLowerCase() : '';
  const getProj   = (r: SheetData) => projectCol ? String(r[projectCol] ?? '').trim() : '';
  const getTime   = (r: SheetData) => timeEstCol ? parseHours(String(r[timeEstCol] ?? '').trim()) : 0;

  const names = [...new Set(sheet1Data.map(r => String(r[resourceCol] ?? '').trim()).filter(Boolean))].sort();

  const cards = names.map(name => {
    const myTasks = sheet1Data.filter(r => String(r[resourceCol] ?? '').trim() === name);
    const isMonthlyBlock = MONTHLY_BLOCK_MARKETING_NAMES.has(name.trim().toLowerCase());
    // Strictly Today/Everyday bucketed tasks, excluding closed/n-a. This is
    // the base set the On Hold/Submitted/In Progress counts are drawn from.
    const todayTasks = myTasks.filter(r => {
      const st = getStatus(r);
      if (SKIP_STATUSES.includes(st)) return false;
      const b = getBucket(r);
      return b === 'today' || b === 'everyday';
    });
    // Tasks/Hours/Status reflect only what's still actively pending — a task
    // already handed off (Submitted To PM/Admin/Akash/Client) shouldn't keep
    // counting toward someone's workload.
    const SUBMITTED_STATUSES = ['submitted to client', 'submitted to pm', 'submitted to akash', 'submitted to admin'];
    const activeTasks = todayTasks.filter(r => !SUBMITTED_STATUSES.includes(getStatus(r)));
    const displayHours = activeTasks.reduce((s, r) => s + getTime(r), 0);

    let onLeave = false;
    if (availData && availNameCol && availStatusCol) {
      const av = availData.find(r => String(r[availNameCol] ?? '').trim().toLowerCase() === name.toLowerCase());
      if (av) { const v = String(av[availStatusCol] ?? '').trim().toLowerCase(); onLeave = isOnLeaveText(v); }
    }

    const status = onLeave
      ? { label: 'On Leave', bg: '#ef4444' }
      : workloadStatus(displayHours, isMonthlyBlock);

    const inProgressTask = todayTasks.find(r => getStatus(r) === 'in progress');
    const onHoldCount = todayTasks.filter(r => getStatus(r) === 'on hold').length;
    // Marketing's real stored value is "Submitted To Admin"; Web/Bandwidth's
    // is still "Submitted To Akash" (same status, unrenamed on that sheet) —
    // count both so this works identically for either team.
    const submittedAdminCount = todayTasks.filter(r => ['submitted to akash', 'submitted to admin'].includes(getStatus(r))).length;
    const submittedPmCount = todayTasks.filter(r => getStatus(r) === 'submitted to pm').length;

    return {
      name, status, tabCount: activeTasks.length, displayHours,
      department: teamDesignation(name),
      inProgressProject: inProgressTask ? getProj(inProgressTask) : '',
      onHoldCount, submittedAdminCount, submittedPmCount,
    };
  });

  const Stat = ({ label, value, full }: { label: string; value: React.ReactNode; full?: boolean }) => (
    <div className={`px-3.5 py-2.5 ${full ? 'col-span-2' : ''}`} style={{ background: 'var(--cn-bg-card)' }}>
      <p className="text-[9px] font-semibold uppercase tracking-wide leading-tight" style={{ color: 'var(--cn-text-muted)' }}>{label}</p>
      <p className="text-sm font-bold tabular-nums truncate mt-0.5" style={{ color: 'var(--cn-text-primary)' }}>{value}</p>
    </div>
  );
  const statValue = (c: (typeof cards)[number], key: string): React.ReactNode => {
    switch (key) {
      case 'tasks': return c.tabCount;
      case 'hours': return `${Math.round(c.displayHours * 10) / 10}h`;
      case 'inProgress': return c.inProgressProject || '—';
      case 'onHold': return c.onHoldCount;
      case 'submittedPm': return c.submittedPmCount;
      case 'submittedAdmin': return c.submittedAdminCount;
      default: return '';
    }
  };

  // Marketing rosters get SEO/PPC/SMM tabs, Web rosters get UIUX/Front End/
  // Back End — auto-detected from the names present, so this same component
  // renders the right tab set (or none) for whichever team it's fed.
  const isMarketingRoster = names.some(n => inMarketingSubDept(n, 'seo') || inMarketingSubDept(n, 'ppc') || inMarketingSubDept(n, 'smm'));
  const isWebRoster = names.some(n => inWebSubDept(n, 'uiux') || inWebSubDept(n, 'frontend') || inWebSubDept(n, 'backend'));
  const subDeptTabs: { key: SubDept; label: string }[] = isMarketingRoster
    ? [{ key: 'all', label: 'All' }, { key: 'seo', label: 'SEO' }, { key: 'ppc', label: 'PPC' }, { key: 'smm', label: 'SMM' }]
    : isWebRoster
      ? [{ key: 'all', label: 'All' }, { key: 'uiux', label: 'UIUX' }, { key: 'frontend', label: 'Front End' }, { key: 'backend', label: 'Back End' }]
      : [];
  const visibleCards = cards.filter(c => matchesSubDept(c.name, subDept));
  const activeStats = TEAM_CARD_STAT_DEFS.filter(d => cardFields.includes(d.label));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          {subDeptTabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSubDept(key)}
              className="px-3 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer"
              style={{
                background: subDept === key ? 'var(--cn-accent)' : 'var(--cn-bg-input)',
                color: subDept === key ? '#fff' : 'var(--cn-text-muted)',
                border: `1px solid ${subDept === key ? 'var(--cn-accent)' : 'var(--cn-border)'}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <MultiSelect
          label="Show More Data"
          options={TEAM_CARD_STAT_DEFS.map(d => d.label)}
          selected={cardFields}
          onChange={setCardFields}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {visibleCards.map(c => {
        const photo = teamPhoto(c.name);
        const bg = memberColor(c.name);
        const initials = c.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
        return (
          <div key={c.name} className="rounded-xl border overflow-hidden" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
            <div className="flex items-center gap-2.5 px-3.5 pt-3.5 pb-3">
              {photo ? (
                <img src={photo} alt={c.name} className="w-9 h-9 rounded-full object-cover shrink-0"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ background: `linear-gradient(135deg, ${bg}cc, ${bg}66)` }}>{initials}</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--cn-text-primary)' }}>{c.name}</p>
                <p className="text-[11px] truncate" style={{ color: 'var(--cn-text-muted)' }}>{c.department || '—'}</p>
              </div>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0" style={{ background: c.status.bg + '22', color: c.status.bg }}>
                {c.status.label}
              </span>
            </div>
            {activeStats.length > 0 && (
              <div className="grid grid-cols-2 gap-px" style={{ background: 'var(--cn-border)', borderTop: '1px solid var(--cn-border)' }}>
                {activeStats.map(({ key, label, full }) => (
                  <Stat key={key} label={label} value={statValue(c, key)} full={full} />
                ))}
              </div>
            )}
          </div>
        );
        })}
      </div>
    </div>
  );
}

// ─── My Workload — individual-contributor Dashboard widget: their own
// workload badge + hours-vs-band gauge + leave flag, plus today's actual
// task list (Web/Marketing individual viewers only; admin/PM/team-admin
// never see this, they get TeamWorkloadCards instead).
export function MyWorkloadSummary({ sheet1Data, sheet1Headers, availData, availHeaders, personName }: {
  sheet1Data: SheetData[]; sheet1Headers: string[];
  availData?: SheetData[]; availHeaders?: string[];
  personName: string;
}) {
  const resourceCol = findCol(sheet1Headers, 'assigned person', 'assigned to', 'resource');
  const statusCol   = findCol(sheet1Headers, 'task status', 'status');
  const bucketCol   = findCol(sheet1Headers, 'task daily bucket', 'bucket');
  const timeEstCol  = findCol(sheet1Headers, 'time estimation', 'time estimate', 'estimation');
  const availNameCol   = availHeaders ? findCol(availHeaders, 'name', 'resource', 'person', 'team') : undefined;
  const availStatusCol = availHeaders ? findCol(availHeaders, 'availability', 'status', 'leave') : undefined;

  if (!sheet1Data.length || !resourceCol || !personName) return null;

  const getStatus  = (r: SheetData) => statusCol  ? String(r[statusCol]  ?? '').trim() : '';
  const getBucket  = (r: SheetData) => bucketCol  ? String(r[bucketCol]  ?? '').trim().toLowerCase() : '';
  const getTime    = (r: SheetData) => timeEstCol ? parseHours(String(r[timeEstCol] ?? '').trim()) : 0;

  const myTasks = sheet1Data.filter(r => String(r[resourceCol] ?? '').trim().toLowerCase() === personName.trim().toLowerCase());
  const isMonthlyBlock = MONTHLY_BLOCK_MARKETING_NAMES.has(personName.trim().toLowerCase());

  // Same today/everyday scope as TeamWorkloadCards, so this badge always
  // matches what the admin sees on the team-wide cards.
  const todayTasks = myTasks.filter(r => {
    const st = getStatus(r).toLowerCase();
    if (SKIP_STATUSES.includes(st)) return false;
    const b = getBucket(r);
    return b === 'today' || b === 'everyday';
  });
  const SUBMITTED_STATUSES = ['submitted to client', 'submitted to pm', 'submitted to akash', 'submitted to admin'];
  const activeTasks = todayTasks.filter(r => !SUBMITTED_STATUSES.includes(getStatus(r).toLowerCase()));
  const displayHours = activeTasks.reduce((s, r) => s + getTime(r), 0);

  let onLeave = false;
  if (availData && availNameCol && availStatusCol) {
    const av = availData.find(r => String(r[availNameCol] ?? '').trim().toLowerCase() === personName.trim().toLowerCase());
    if (av) { const v = String(av[availStatusCol] ?? '').trim().toLowerCase(); onLeave = isOnLeaveText(v); }
  }

  const status = onLeave ? { label: 'On Leave', bg: '#ef4444' } : workloadStatus(displayHours, isMonthlyBlock);
  // Gauge reads against the Overload threshold — 125h/month for PPC & SEO,
  // 7.3h/day for everyone else.
  const cap = isMonthlyBlock ? 125 : 7.3;
  const pct = Math.min((displayHours / cap) * 100, 100);
  const hoursLabel = isMonthlyBlock
    ? `${Math.round(displayHours * 10) / 10}h of ${cap}h this month`
    : `${Math.round(displayHours * 10) / 10}h of ${cap}h today`;

  return (
    <div className="cn-card rounded-xl border p-5 flex flex-col gap-4" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--cn-text-muted)' }}>My Workload</p>
        <span className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0" style={{ background: status.bg + '22', color: status.bg }}>
          {status.label}
        </span>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs" style={{ color: 'var(--cn-text-muted)' }}>{hoursLabel}</p>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--cn-bg-input)' }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: status.bg, transition: 'width 0.8s ease' }} />
        </div>
      </div>
      {onLeave && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: '#ef444418', color: '#ef4444' }}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          You&apos;re marked on leave today
        </div>
      )}
    </div>
  );
}

// ─── Resource Bandwidth chips — compact "who has room for a new task" strip,
// used above Tasks Assigned. Same status thresholds as ResourceStatusGrid
// (Team Bandwidth), sorted most-available first.
export function ResourceBandwidthChips({ sheet1Data, sheet1Headers, availData, availHeaders }: {
  sheet1Data: SheetData[]; sheet1Headers: string[];
  availData?: SheetData[]; availHeaders?: string[];
}) {
  const resourceCol = findCol(sheet1Headers, 'assigned person', 'assigned to', 'resource');
  const bucketCol   = findCol(sheet1Headers, 'task daily bucket', 'bucket');
  const timeEstCol  = findCol(sheet1Headers, 'time estimation', 'time estimate', 'estimation');
  const statusCol   = findCol(sheet1Headers, 'task status', 'status');
  const availNameCol   = availHeaders ? findCol(availHeaders, 'name', 'resource', 'person', 'team') : undefined;
  const availStatusCol = availHeaders ? findCol(availHeaders, 'availability', 'status', 'leave') : undefined;

  if (!sheet1Data.length || !resourceCol) return null;

  const getBucket = (r: SheetData) => bucketCol  ? String(r[bucketCol]  ?? '').trim().toLowerCase() : '';
  const getTime   = (r: SheetData) => timeEstCol ? parseHours(String(r[timeEstCol] ?? '').trim()) : 0;
  const getStatus = (r: SheetData) => statusCol  ? String(r[statusCol]  ?? '').trim().toLowerCase() : '';

  const names = [...new Set(sheet1Data.map(r => String(r[resourceCol] ?? '').trim()).filter(Boolean))];

  const rows = names.map(name => {
    // Closed tasks no longer count toward someone's bandwidth — a task
    // marked Task Closed shouldn't keep occupying their hours.
    const displayHours = sheet1Data
      .filter(r => String(r[resourceCol] ?? '').trim() === name && ['today', 'everyday'].includes(getBucket(r)) && !SKIP_STATUSES.includes(getStatus(r)))
      .reduce((s, r) => s + getTime(r), 0);

    let onLeave = false;
    if (availData && availNameCol && availStatusCol) {
      const av = availData.find(r => String(r[availNameCol] ?? '').trim().toLowerCase() === name.toLowerCase());
      if (av) { const v = String(av[availStatusCol] ?? '').trim().toLowerCase(); onLeave = isOnLeaveText(v); }
    }

    const isMonthlyBlock = MONTHLY_BLOCK_MARKETING_NAMES.has(name.trim().toLowerCase());
    const status = onLeave
      ? { label: 'On Leave', bg: '#8b5cf6' }
      : workloadStatus(displayHours, isMonthlyBlock);

    return { name, displayHours, status };
  }).sort((a, b) => a.displayHours - b.displayHours);

  // Grouped into columns by status — lets an admin scan straight to
  // "who's Available" instead of hunting through one long wrapped row.
  const GROUP_ORDER = ['Available', 'Partially Available', 'Partially Occupied', 'Occupied', 'Overload', 'On Leave'];
  const GROUP_COLORS: Record<string, string> = {
    'Available': '#22c55e', 'Partially Available': '#16a34a', 'Partially Occupied': '#f59e0b',
    'Occupied': '#ea580c', 'Overload': '#dc2626', 'On Leave': '#8b5cf6',
  };
  const groups = GROUP_ORDER
    .map(label => ({ label, color: GROUP_COLORS[label], members: rows.filter(r => r.status.label === label) }))
    .filter(g => g.members.length > 0);

  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
      <div className="px-4 py-2.5 border-b" style={{ borderColor: 'var(--cn-border)', background: 'var(--cn-bg-input)' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--cn-text-muted)' }}>Resource Bandwidth</p>
      </div>
      <div className="flex flex-wrap gap-px" style={{ background: 'var(--cn-border)' }}>
        {groups.map(g => (
          <div key={g.label} className="flex-1 min-w-[200px] flex flex-col gap-2 p-3" style={{ background: 'var(--cn-bg-card)' }}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: g.color }}>{g.label}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums" style={{ background: g.color + '18', color: g.color }}>{g.members.length}</span>
            </div>
            <div className="flex flex-col gap-1">
              {g.members.map(m => (
                <div key={m.name} className="flex items-center justify-between gap-2 text-[12px] px-2 py-1.5 rounded-lg border" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: m.status.bg }} />
                    <span className="truncate" style={{ color: 'var(--cn-text-primary)' }}>{m.name}</span>
                  </span>
                  <span className="tabular-nums font-semibold shrink-0" style={{ color: 'var(--cn-text-muted)' }}>{Math.round(m.displayHours * 10) / 10}h</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Insight Cards (Resource Health / Project Health / Trends) ────────────────
export function InsightCards({ sheet1Data, sheet1Headers, availData, availHeaders, mode, personFilter }: {
  sheet1Data: SheetData[]; sheet1Headers: string[];
  availData?: SheetData[]; availHeaders?: string[];
  mode?: 'all' | 'team' | 'project' | 'project-cards';
  personFilter?: string;
}) {
  // Project State cards (project-cards mode) always show today's data only
  // — no All/Today/Week/Month toggle for that mode.
  const [filter, setFilter] = useState<DateFilter>(mode === 'project-cards' ? 'daily' : 'all');
  const statusCol   = findCol(sheet1Headers, 'task status', 'status');
  const bucketCol   = findCol(sheet1Headers, 'task daily bucket', 'bucket');
  const resourceCol = findCol(sheet1Headers, 'assigned person', 'assigned to', 'resource');
  const scopedData  = personFilter && resourceCol
    ? sheet1Data.filter(r => String(r[resourceCol] ?? '').trim().toLowerCase() === personFilter.trim().toLowerCase())
    : sheet1Data;
  const data = filterByDate(scopedData, sheet1Headers, filter);
  if (!sheet1Data.length) return null;
  const timeEstCol  = findCol(sheet1Headers, 'time estimation', 'time estimate', 'estimation');
  const projectCol  = findCol(sheet1Headers, 'project name', 'project');
  const availNameCol   = availHeaders ? findCol(availHeaders, 'name', 'resource', 'person', 'team') : undefined;
  const availStatusCol = availHeaders ? findCol(availHeaders, 'availability', 'status', 'leave') : undefined;

  const getStatus  = (r: SheetData) => statusCol   ? String(r[statusCol]   ?? '').trim().toLowerCase() : '';
  const getBucket  = (r: SheetData) => bucketCol   ? String(r[bucketCol]   ?? '').trim().toLowerCase() : '';
  const getProject = (r: SheetData) => projectCol  ? String(r[projectCol]  ?? '').trim() : '';
  const getHours   = (r: SheetData) => timeEstCol  ? parseHours(String(r[timeEstCol] ?? '').trim()) : 0;
  const getPerson  = (r: SheetData) => resourceCol ? String(r[resourceCol] ?? '').trim() : '';

  // ── Team Current State ──
  const allNames = [...new Set(sheet1Data.map(getPerson).filter(Boolean))];
  let available = 0, partiallyAvailable = 0, occupied = 0, onLeave = 0;
  allNames.forEach(name => {
    const isLeave = (() => {
      if (!availData || !availNameCol || !availStatusCol) return false;
      const av = availData.find(r => String(r[availNameCol] ?? '').trim().toLowerCase() === name.toLowerCase());
      if (!av) return false;
      const v = String(av[availStatusCol] ?? '').trim().toLowerCase();
      return isOnLeaveText(v);
    })();
    if (isLeave) { onLeave++; return; }
    const todayH = sheet1Data
      .filter(r => getPerson(r) === name && (getBucket(r) === 'today' || getBucket(r) === 'everyday'))
      .reduce((s, r) => s + getHours(r), 0);
    if (todayH === 0) available++;
    else if (todayH <= 4) partiallyAvailable++;
    else occupied++;
  });

  // ── Project State ──
  const closedStatuses = ['task closed', 'n/a', ''];
  const activeProjects = new Set(data.filter(r => !closedStatuses.includes(getStatus(r))).map(getProject).filter(Boolean)).size;
  const internalKeywords = ['cybernext', 'internal', 'cn internal'];
  const totalH  = data.reduce((s, r) => s + getHours(r), 0);
  const clientH = data.filter(r => !internalKeywords.some(k => getProject(r).toLowerCase().includes(k))).reduce((s, r) => s + getHours(r), 0);
  const clientPct = totalH > 0 ? Math.round((clientH / totalH) * 100) : 0;
  const internalPct = 100 - clientPct;
  const everydayCount      = bucketCol  ? data.filter(r => String(r[bucketCol]  ?? '').trim().toLowerCase() === 'everyday').length : 0;
  const todayCount         = bucketCol  ? data.filter(r => String(r[bucketCol]  ?? '').trim().toLowerCase() === 'today').length : 0;
  const inProgressCount      = statusCol ? data.filter(r => getStatus(r) === 'in progress').length : 0;
  const submittedClientCount = statusCol ? data.filter(r => { const s = getStatus(r); return s === 'submitted to client' || s === 'submitted to approval' || s === 'submitted'; }).length : 0;
  const submittedAkashCount  = statusCol ? data.filter(r => getStatus(r) === 'submitted to akash').length : 0;
  const submittedPMCount     = statusCol ? data.filter(r => getStatus(r) === 'submitted to pm').length : 0;
  const onHoldCount          = statusCol ? data.filter(r => getStatus(r) === 'on hold').length : 0;
  const toBeExpectedCount    = bucketCol ? data.filter(r => String(r[bucketCol] ?? '').trim().toLowerCase() === 'to be expected').length : 0;

  const IC = ({ label, value, sub, color, icon, badge }: { label: string; value: string | number; sub?: string; color: string; icon: React.ReactNode; badge?: React.ReactNode }) => (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + '18' }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide truncate leading-tight" style={{ color: 'var(--cn-text-muted)' }}>{label}</p>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <p className="text-base font-bold leading-tight" style={{ color: 'var(--cn-text-primary)' }}>{value}</p>
          {badge}
        </div>
        {sub && <p className="text-[10px] leading-tight truncate" style={{ color: 'var(--cn-text-faint)' }}>{sub}</p>}
      </div>
    </div>
  );

  const TrendBadge = ({ diff }: { diff: number }) => diff === 0 ? null : (
    <span className="text-[10px] font-bold px-1 py-0.5 rounded-full" style={{ background: diff > 0 ? '#22c55e18' : '#ef444418', color: diff > 0 ? '#22c55e' : '#ef4444' }}>
      {diff > 0 ? '↑' : '↓'}{Math.abs(Math.round(diff * 10) / 10)}h
    </span>
  );

  const Section = ({ title, children, showFilter }: { title: string; children: React.ReactNode; showFilter?: boolean }) => (
    <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--cn-border)', background: 'var(--cn-bg-input)' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--cn-text-muted)' }}>{title}</p>
        {showFilter && <DateFilterPills value={filter} onChange={setFilter} />}
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--cn-border)' }}>{children}</div>
    </div>
  );

  const showTeam    = !mode || mode === 'all' || mode === 'team';
  const showProject = !mode || mode === 'all' || mode === 'project';

  // ── Project Cards (horizontal KPI style) ────────────────────────────────────
  if (mode === 'project-cards') {
    const cards = [
      { label: 'Today/Everyday Tasks', value: todayCount + everydayCount,       color: '#FE4A23', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
      { label: 'In Progress',          value: inProgressCount,                  color: '#16a34a', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
      { label: 'On Hold',              value: onHoldCount,                      color: '#7c3aed', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg> },
      { label: 'Submitted To Admin',   value: submittedAkashCount,              color: '#d97706', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.84 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.77 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8 8.09a16 16 0 0 0 6 6l1.06-1.06a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> },
      { label: 'Submitted to PM',      value: submittedPMCount,                 color: '#10b981', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
      { label: 'To Be Expected',       value: toBeExpectedCount,                color: '#d97706', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
    ];
    return (
      <div className="cn-card rounded-xl border overflow-hidden" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--cn-border)', background: 'var(--cn-bg-input)' }}>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--cn-text-muted)' }}>Project State</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-px" style={{ background: 'var(--cn-border)' }}>
          {cards.map(({ label, value, color, icon }) => (
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
    );
  }

  return (
    <div className={showTeam && showProject ? 'flex gap-3' : ''}>
      {/* Team Current State */}
      {showTeam && <div className="flex-1 min-w-0">
      <Section title="Team Current State">
        <IC label="Available" value={available} sub={`of ${allNames.length} members · 0h today`} color="#22c55e"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} />
        <IC label="Partially Available" value={partiallyAvailable} sub="≤4h today" color="#f59e0b"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} />
        <IC label="Occupied" value={occupied} sub=">4h today" color="#ef4444"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>} />
        <IC label="On Leave" value={onLeave} sub="from availability sheet" color="#8b5cf6"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>} />
      </Section>
      </div>}

      {/* Project State */}
      {showProject && <div className="flex-1 min-w-0">
      <Section title="Project State" showFilter>
        <IC label="Active Projects" value={activeProjects} sub="non-closed tasks" color="#3b82f6"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>} />
        <IC label="Everyday" value={everydayCount} sub="recurring daily tasks" color="#06b6d4"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} />
        <IC label="Today's Tasks" value={todayCount} sub="bucket = today" color="#FE4A23"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>} />
        <IC label="Submitted to Client / Approval" value={submittedClientCount} sub="awaiting client review" color="#10b981"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>} />
        <IC label="Submitted to Akash" value={submittedAkashCount} sub="pending akash review" color="#d97706"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.84 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.77 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8 8.09a16 16 0 0 0 6 6l1.06-1.06a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>} />
        <IC label="On Hold" value={onHoldCount} sub="paused tasks" color="#7c3aed"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg>} />
        <IC label="Client vs Internal" value={`${clientPct}% / ${internalPct}%`} sub={`${Math.round(clientH*10)/10}h client · ${Math.round((totalH-clientH)*10)/10}h internal`} color="#8b5cf6"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><line x1="2" y1="12" x2="22" y2="12"/></svg>} />
      </Section>
      </div>}

    </div>
  );
}

// ─── KPI Cards (full-width row, rendered above charts flex in Dashboard) ──────
export function KpiCards({ sheet1Data, sheet1Headers, pmView = false, resourceView = false, resourceName = '', currentUserEmail = '' }: Pick<Props, 'sheet1Data' | 'sheet1Headers' | 'pmView' | 'resourceView' | 'resourceName' | 'currentUserEmail'>) {
  const statusCol  = findCol(sheet1Headers, 'status');
  const bucketCol  = findCol(sheet1Headers, 'task daily bucket', 'bucket');
  const resourceCol = findCol(sheet1Headers, 'assigned person', 'assigned to', 'resource');
  const emailCol   = findCol(sheet1Headers, 'email');
  const pmStatusCol = findCol(sheet1Headers, 'pm status');

  if (!sheet1Data.length) return null;

  if (resourceView && resourceName) {
    const myData = resourceCol
      ? sheet1Data.filter(r => String(r[resourceCol] ?? '').trim().toLowerCase() === resourceName.trim().toLowerCase())
      : sheet1Data;
    const myTotal       = myData.length;
    const myInProgress  = statusCol ? myData.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'in progress').length : 0;
    const myOnHold      = statusCol ? myData.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'on hold').length : 0;
    const myToday       = bucketCol ? myData.filter(r => String(r[bucketCol] ?? '').trim().toLowerCase() === 'today').length : 0;
    const mySubmittedPM = statusCol ? myData.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'submitted to pm').length : 0;
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard label="My Tasks"        value={myTotal}       total={myTotal} color="var(--cn-accent)" icon={<LayoutGrid    className="w-4 h-4" />} adminStyle />
        <StatCard label="In Progress"     value={myInProgress}  total={myTotal} color="#16a34a"          icon={<CheckCircle2  className="w-4 h-4" />} adminStyle />
        <StatCard label="On Hold"         value={myOnHold}      total={myTotal} color="#7c3aed"          icon={<PauseCircle   className="w-4 h-4" />} adminStyle />
        <StatCard label="Today's Tasks"   value={myToday}       total={myTotal} color="#FE4A23"          icon={<CalendarCheck className="w-4 h-4" />} adminStyle />
        <StatCard label="Submitted to PM" value={mySubmittedPM} total={myTotal} color="#10b981"          icon={<UserCheck     className="w-4 h-4" />} adminStyle />
      </div>
    );
  }

  const pmScopedData = (pmView && emailCol && currentUserEmail)
    ? sheet1Data.filter(r => String(r[emailCol] ?? '').trim().toLowerCase() === currentUserEmail.trim().toLowerCase())
    : sheet1Data;
  const pmScopedTotal = pmScopedData.length;
  const totalTasks     = pmScopedData.length;
  const inProgress     = statusCol ? pmScopedData.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'in progress').length : 0;
  const onHold         = statusCol ? pmScopedData.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'on hold').length : 0;
  const submittedAkash = statusCol ? pmScopedData.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'submitted to akash').length : 0;
  const submittedPM    = statusCol ? pmScopedData.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'submitted to pm').length : 0;
  const todayTasks     = bucketCol ? pmScopedData.filter(r => String(r[bucketCol] ?? '').trim().toLowerCase() === 'today').length : 0;

  if (pmView && pmStatusCol) {
    const pmNoAction       = pmStatusCol ? pmScopedData.filter(r => String(r[pmStatusCol] ?? '').trim().toLowerCase() === 'no action taken').length : 0;
    const pmChanges        = pmStatusCol ? pmScopedData.filter(r => String(r[pmStatusCol] ?? '').trim().toLowerCase() === 'changes').length : 0;
    const pmApproved       = pmStatusCol ? pmScopedData.filter(r => String(r[pmStatusCol] ?? '').trim().toLowerCase() === 'approved').length : 0;
    const pmSubmittedClient = pmStatusCol ? pmScopedData.filter(r => String(r[pmStatusCol] ?? '').trim().toLowerCase() === 'submitted to client').length : 0;
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard label="No Action Taken"    value={pmNoAction}         total={pmScopedTotal} color="#f59e0b" icon={<AlertTriangle className="w-4 h-4" />} adminStyle />
        <StatCard label="Changes"             value={pmChanges}          total={pmScopedTotal} color="#7c3aed" icon={<RefreshCw     className="w-4 h-4" />} adminStyle />
        <StatCard label="Approved"            value={pmApproved}         total={pmScopedTotal} color="#16a34a" icon={<ThumbsUp       className="w-4 h-4" />} adminStyle />
        <StatCard label="Submitted to Client" value={pmSubmittedClient}  total={pmScopedTotal} color="#10b981" icon={<BadgeCheck     className="w-4 h-4" />} adminStyle />
        <StatCard label="Today's Tasks"       value={todayTasks}         total={pmScopedTotal} color="#FE4A23" icon={<CalendarCheck className="w-4 h-4" />} adminStyle />
      </div>
    );
  }

  const everydayTasks = bucketCol ? pmScopedData.filter(r => String(r[bucketCol] ?? '').trim().toLowerCase() === 'everyday').length : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
      <StatCard label="Everyday Tasks"     value={everydayTasks}  total={totalTasks} color="var(--cn-accent)" icon={<LayoutGrid    className="w-4 h-4" />} adminStyle />
      <StatCard label="In Progress"        value={inProgress}     total={totalTasks} color="#16a34a"          icon={<CheckCircle2  className="w-4 h-4" />} adminStyle />
      <StatCard label="On Hold"            value={onHold}         total={totalTasks} color="#7c3aed"          icon={<PauseCircle   className="w-4 h-4" />} adminStyle />
      <StatCard label="Submitted to Akash" value={submittedAkash} total={totalTasks} color="#d97706"          icon={<Send          className="w-4 h-4" />} adminStyle />
      <StatCard label="Submitted to PM"    value={submittedPM}    total={totalTasks} color="#10b981"          icon={<UserCheck     className="w-4 h-4" />} adminStyle />
      <StatCard label="Today's Tasks"      value={todayTasks}     total={totalTasks} color="#FE4A23"          icon={<CalendarCheck className="w-4 h-4" />} adminStyle />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SpecificCharts({ sheet1Data, sheet1Headers, pmView = false, resourceView = false, resourceName = '', isAdmin = false, availData = [], availHeaders = [], onStatusChange, pmStatusColName, currentUserName, currentUserEmail, showFilter, hideKpi = false, hidePmStatus = false, hideBreakdownCharts = false }: Props) {
  const [pmStatusFilter, setPmStatusFilter]   = useState<DateFilter>('all');
  const [projectFilter,  setProjectFilter]    = useState<DateFilter>('all');
  const [breakdownFilter, setBreakdownFilter] = useState<DateFilter>('all');
  const priorityCol  = findCol(sheet1Headers, 'priority');
  const teamCol      = findCol(sheet1Headers, 'team required', 'team');
  const taskInfoCol  = findCol(sheet1Headers, 'task information', 'task info', 'information');
  const resourceCol  = findCol(sheet1Headers, 'assigned person', 'assigned to', 'resource');
  const statusCol    = findCol(sheet1Headers, 'task status', 'status');
  const bucketCol    = findCol(sheet1Headers, 'task daily bucket', 'bucket');
  const projectCol   = findCol(sheet1Headers, 'project name', 'project');
  const pmStatusCol  = findCol(sheet1Headers, 'pm status');
  const timeEstCol   = findCol(sheet1Headers, 'time estimation', 'time estimate', 'estimation');
  const taskCol      = findCol(sheet1Headers, 'task name', 'task title', 'task');
  const taskUrlCol   = findCol(sheet1Headers, 'task url', 'task link', 'link', 'url');
  // "Total Hours" on the Marketing Tasks sheet, "Total Time" on Bandwidth
  // Allocation — same HH.MM-notation column ResourceStatusGrid reads.
  const totalHoursCol = sheet1Headers.find(h => h.toLowerCase().includes('total hours') || h.toLowerCase().includes('total time'));
  const timestampCol  = sheet1Headers.find(h => h.toLowerCase().includes('timestamp'));

  if (!sheet1Data.length) return null;

  // ── Resource personal view ────────────────────────────────────────────────
  if (resourceView && resourceName) {
    const myData = resourceCol
      ? sheet1Data.filter(r =>
          String(r[resourceCol] ?? '').trim().toLowerCase() === resourceName.trim().toLowerCase()
        )
      : sheet1Data;

    const myTotal       = myData.length;
    const myInProgress  = statusCol ? myData.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'in progress').length : 0;
    const myOnHold      = statusCol ? myData.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'on hold').length : 0;
    const myToday       = bucketCol ? myData.filter(r => String(r[bucketCol] ?? '').trim().toLowerCase() === 'today').length : 0;
    const mySubmittedPM = statusCol ? myData.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'submitted to pm').length : 0;

    // Top Projects by Hours — grouped by Project, summed off the Total
    // Hours/Total Time column (not Time Estimation) per the user's spec.
    const projectHoursMap = new Map<string, number>();
    if (totalHoursCol && projectCol) {
      myData.forEach(r => {
        const proj = String(r[projectCol] ?? '').trim();
        if (!proj) return;
        const { h, m } = toHM(String(r[totalHoursCol] ?? '').trim());
        const dec = h + m / 60;
        if (dec <= 0) return;
        projectHoursMap.set(proj, (projectHoursMap.get(proj) ?? 0) + dec);
      });
    }
    const topProjects = [...projectHoursMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topProjectMax = topProjects.length ? topProjects[0][1] : 0;

    // Longest-Running Task — single task with the highest Total Hours logged.
    let longestTask: SheetData | null = null;
    let longestHours = 0;
    if (totalHoursCol) {
      myData.forEach(r => {
        const { h, m } = toHM(String(r[totalHoursCol] ?? '').trim());
        const dec = h + m / 60;
        if (dec > longestHours) { longestHours = dec; longestTask = r; }
      });
    }

    // This Month vs Last Month — same "DD/MM/YYYY[ HH:MM:SS]"-tolerant parse
    // filterByDate() already relies on elsewhere in this file, bucketed off
    // the Timestamp column and summed off Total Hours (same source as Top
    // Projects, for consistency).
    const parseRowDate = (raw: string): Date | null => {
      if (!raw) return null;
      let d = new Date(raw);
      if (!isNaN(d.getTime())) return d;
      const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m) { d = new Date(+m[3], +m[2] - 1, +m[1]); if (!isNaN(d.getTime())) return d; }
      return null;
    };
    const monthNow = new Date();
    const thisMonthStart = new Date(monthNow.getFullYear(), monthNow.getMonth(), 1);
    const lastMonthStart = new Date(monthNow.getFullYear(), monthNow.getMonth() - 1, 1);
    let thisMonthHours = 0;
    let lastMonthHours = 0;
    if (totalHoursCol && timestampCol) {
      myData.forEach(r => {
        const d = parseRowDate(String(r[timestampCol] ?? '').trim());
        if (!d) return;
        const { h, m } = toHM(String(r[totalHoursCol] ?? '').trim());
        const dec = h + m / 60;
        if (dec <= 0) return;
        if (d >= thisMonthStart) thisMonthHours += dec;
        else if (d >= lastMonthStart && d < thisMonthStart) lastMonthHours += dec;
      });
    }
    const monthDelta = thisMonthHours - lastMonthHours;
    const monthDeltaPct = lastMonthHours > 0 ? Math.round((monthDelta / lastMonthHours) * 100) : (thisMonthHours > 0 ? 100 : 0);

    // PM Status breakdown — the four states that actually show up on this
    // sheet's PM Status column (lowercased literals: 'changes', 'approved',
    // 'submitted to client', 'ticketclosed').
    const PM_STATUS_CARD_DEFS = [
      { label: 'Changes',              match: 'changes',              color: '#dc2626' },
      { label: 'Approved',             match: 'approved',             color: '#16a34a' },
      { label: 'Submitted To Client',  match: 'submitted to client',  color: '#6d28d9' },
      { label: 'TicketClosed',         match: 'ticketclosed',         color: '#7c3aed' },
    ];
    const pmStatusCounts = PM_STATUS_CARD_DEFS.map(d => ({
      ...d,
      count: pmStatusCol ? myData.filter(r => String(r[pmStatusCol] ?? '').trim().toLowerCase() === d.match).length : 0,
    }));

    // Task Pipeline — every bucket + Submitted, split out individually
    // instead of Project State's combined Today/Everyday tile.
    const bucketOf = (r: SheetData) => bucketCol ? String(r[bucketCol] ?? '').trim().toLowerCase() : '';
    const pipelineToday        = myData.filter(r => bucketOf(r) === 'today').length;
    const pipelineEveryday     = myData.filter(r => bucketOf(r) === 'everyday').length;
    const pipelineTomorrow     = myData.filter(r => { const b = bucketOf(r); return b === 'tomorrow' || b === 'tommorow'; }).length;
    const pipelineDayAfter     = myData.filter(r => { const b = bucketOf(r); return b === 'day after tomorrow' || b === 'dayafter' || b === 'day after'; }).length;
    const pipelineToBeExpected = myData.filter(r => bucketOf(r) === 'to be expected').length;
    const pipelineSubmitted    = statusCol ? myData.filter(r => {
      const s = String(r[statusCol] ?? '').trim().toLowerCase();
      return s === 'submitted to pm' || s === 'submitted to akash' || s === 'submitted to admin' || s === 'submitted to client';
    }).length : 0;

    return (
      <section className="space-y-4">
        {/* ── KPI Row ── */}
        {!hideKpi && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
          <StatCard label="My Tasks"          value={myTotal}       total={myTotal} color="var(--cn-accent)" icon={<LayoutGrid    className="w-4 h-4" />} adminStyle={true} />
          <StatCard label="In Progress"       value={myInProgress}  total={myTotal} color="#16a34a"          icon={<CheckCircle2  className="w-4 h-4" />} adminStyle={true} />
          <StatCard label="On Hold"           value={myOnHold}      total={myTotal} color="#7c3aed"          icon={<PauseCircle   className="w-4 h-4" />} adminStyle={true} />
          <StatCard label="Today's Tasks"     value={myToday}       total={myTotal} color="#FE4A23"          icon={<CalendarCheck className="w-4 h-4" />} adminStyle={true} />
          <StatCard label="Submitted to PM"   value={mySubmittedPM} total={myTotal} color="#10b981"          icon={<UserCheck     className="w-4 h-4" />} adminStyle={true} />
        </div>
        )}

        {/* ── Task Pipeline — every bucket + Submitted, split out individually ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="Today"          value={pipelineToday}        total={myTotal} color="#FE4A23" icon={<CalendarCheck className="w-4 h-4" />} adminStyle={true} />
          <StatCard label="Everyday"       value={pipelineEveryday}     total={myTotal} color="#06b6d4" icon={<RefreshCw     className="w-4 h-4" />} adminStyle={true} />
          <StatCard label="Tomorrow"       value={pipelineTomorrow}     total={myTotal} color="#3b82f6" icon={<CalendarClock className="w-4 h-4" />} adminStyle={true} />
          <StatCard label="Day After"      value={pipelineDayAfter}     total={myTotal} color="#7c3aed" icon={<CalendarClock className="w-4 h-4" />} adminStyle={true} />
          <StatCard label="Submitted"      value={pipelineSubmitted}    total={myTotal} color="#10b981" icon={<Send          className="w-4 h-4" />} adminStyle={true} />
          <StatCard label="To Be Expected" value={pipelineToBeExpected} total={myTotal} color="#d97706" icon={<AlertTriangle className="w-4 h-4" />} adminStyle={true} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ── Top Projects by Hours (Total Hours column) ── */}
          <div className="cn-card rounded-xl border overflow-hidden" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
            <div className="px-4 py-2.5 border-b" style={{ borderColor: 'var(--cn-border)', background: 'var(--cn-bg-input)' }}>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--cn-text-muted)' }}>Top Projects by Hours</p>
            </div>
            {topProjects.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--cn-text-faint)' }}>No Total Hours logged yet</p>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--cn-border-light)' }}>
                {topProjects.map(([proj, hrs], i) => (
                  <div key={proj} className="flex items-center gap-3 px-4 py-2.5" style={{ background: i % 2 === 1 ? 'var(--cn-bg-input)' : 'transparent' }}>
                    <span className="text-xs font-bold w-5 shrink-0" style={{ color: 'var(--cn-text-muted)' }}>#{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--cn-text-primary)' }}>{proj}</p>
                      <div className="h-1 rounded-full overflow-hidden mt-1" style={{ background: 'var(--cn-bg-input)' }}>
                        <div className="h-full rounded-full" style={{ width: `${topProjectMax > 0 ? (hrs / topProjectMax) * 100 : 0}%`, background: '#10b981' }} />
                      </div>
                    </div>
                    <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: 'var(--cn-text-primary)' }}>{Math.round(hrs * 10) / 10}h</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── PM Status breakdown ── */}
          <div className="cn-card rounded-xl border overflow-hidden" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
            <div className="px-4 py-2.5 border-b" style={{ borderColor: 'var(--cn-border)', background: 'var(--cn-bg-input)' }}>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--cn-text-muted)' }}>PM Status</p>
            </div>
            <div className="grid grid-cols-2 gap-px" style={{ background: 'var(--cn-border)' }}>
              {pmStatusCounts.map(d => (
                <div key={d.label} className="flex flex-col gap-1 px-4 py-3" style={{ background: 'var(--cn-bg-card)' }}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-[10px] font-semibold uppercase tracking-wide truncate" style={{ color: 'var(--cn-text-muted)' }}>{d.label}</span>
                  </div>
                  <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--cn-text-primary)' }}>{d.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ── Longest-Running Task (highest Total Hours logged) ── */}
          <div className="cn-card rounded-xl border p-5 flex items-center gap-4" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#10b98118', color: '#10b981' }}>
              <BadgeCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--cn-text-muted)' }}>Longest-Running Task</p>
              {longestTask ? (
                <>
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--cn-text-primary)' }}>
                    {taskCol ? String(longestTask[taskCol] ?? '').trim() || 'Untitled task' : 'Untitled task'}
                  </p>
                  {projectCol && (
                    <p className="text-[11px] truncate" style={{ color: 'var(--cn-text-muted)' }}>{String(longestTask[projectCol] ?? '').trim()}</p>
                  )}
                </>
              ) : (
                <p className="text-sm" style={{ color: 'var(--cn-text-faint)' }}>No Total Hours logged yet</p>
              )}
            </div>
            {longestTask && (
              <span className="text-2xl font-bold tabular-nums shrink-0" style={{ color: '#10b981' }}>{Math.round(longestHours * 10) / 10}h</span>
            )}
          </div>

          {/* ── This Month vs Last Month (Total Hours, bucketed off Timestamp) ── */}
          <div className="cn-card rounded-xl border p-5" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--cn-text-muted)' }}>This Month vs Last Month</p>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>This Month</p>
                <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--cn-text-primary)' }}>{Math.round(thisMonthHours * 10) / 10}h</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>Last Month</p>
                <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--cn-text-muted)' }}>{Math.round(lastMonthHours * 10) / 10}h</p>
              </div>
              {(thisMonthHours > 0 || lastMonthHours > 0) && (
                <div className="flex items-center gap-1 ml-auto shrink-0" style={{ color: monthDelta >= 0 ? '#16a34a' : '#dc2626' }}>
                  {monthDelta >= 0 ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  <span className="text-sm font-bold tabular-nums">{Math.abs(monthDeltaPct)}%</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ── Scope all charts/tables to the logged-in PM's own tasks when viewing as PM ──
  const emailCol = findCol(sheet1Headers, 'email');
  const pmScopedData = (pmView && emailCol && currentUserEmail)
    ? sheet1Data.filter(r => String(r[emailCol] ?? '').trim().toLowerCase() === currentUserEmail.trim().toLowerCase())
    : sheet1Data;
  const pmScopedTotal = pmScopedData.length;

  // ── KPI values ──────────────────────────────────────────────────────────────
  const totalTasks      = pmScopedData.length;
  const inProgress      = statusCol ? pmScopedData.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'in progress').length : 0;
  const onHold          = statusCol ? pmScopedData.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'on hold').length : 0;
  const submittedAkash  = statusCol ? pmScopedData.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'submitted to akash').length : 0;
  const submittedPM     = statusCol ? pmScopedData.filter(r => String(r[statusCol] ?? '').trim().toLowerCase() === 'submitted to pm').length : 0;
  const todayTasks      = bucketCol ? pmScopedData.filter(r => String(r[bucketCol] ?? '').trim().toLowerCase() === 'today').length : 0;
  const tomorrowTasks   = bucketCol ? pmScopedData.filter(r => { const v = String(r[bucketCol] ?? '').trim().toLowerCase(); return v === 'tomorrow' || v === 'tommorow'; }).length : 0;

  // ── PM Status counts ─────────────────────────────────────────────────────────
  // "No Action Taken" only matters once a task has actually been submitted to PM —
  // tasks still in progress/to be started shouldn't count as pending PM action.
  const pmNoAction       = (pmStatusCol && statusCol) ? pmScopedData.filter(r =>
    String(r[pmStatusCol] ?? '').trim().toLowerCase() === 'no action taken'
    && String(r[statusCol] ?? '').trim().toLowerCase() === 'submitted to pm'
  ).length : 0;
  const pmChanges        = pmStatusCol ? pmScopedData.filter(r => String(r[pmStatusCol] ?? '').trim().toLowerCase() === 'changes').length : 0;
  const pmApproved       = pmStatusCol ? pmScopedData.filter(r => String(r[pmStatusCol] ?? '').trim().toLowerCase() === 'approved').length : 0;
  const pmSubmittedClient = pmStatusCol ? pmScopedData.filter(r => String(r[pmStatusCol] ?? '').trim().toLowerCase() === 'submitted to client').length : 0;

  // ── Hours helpers ─────────────────────────────────────────────────────────────
  const getHours = (r: SheetData) => timeEstCol ? parseHours(String(r[timeEstCol] ?? '').trim()) : 0;
  const totalHoursAll = pmScopedData.reduce((s, r) => s + getHours(r), 0);

  // ── Pie/donut data — hours-based ─────────────────────────────────────────────
  const priorityData  = (priorityCol && timeEstCol)  ? sumHoursByCol(pmScopedData, priorityCol,  timeEstCol) : [];
  const teamData      = (teamCol && timeEstCol)      ? sumHoursByCol(pmScopedData, teamCol,      timeEstCol) : [];
  const taskInfoData  = (taskInfoCol && timeEstCol)  ? sumHoursByCol(pmScopedData, taskInfoCol,  timeEstCol) : [];
  const statusData    = (statusCol && timeEstCol)    ? sumHoursByCol(pmScopedData, statusCol,    timeEstCol) : [];
  const pmStatusData  = (pmStatusCol && timeEstCol)  ? sumHoursByCol(pmScopedData, pmStatusCol,  timeEstCol) : [];

  // ── Bar: hours per person ────────────────────────────────────────────────────
  const tasksByPerson = (resourceCol && timeEstCol)
    ? sumHoursByCol(pmScopedData, resourceCol, timeEstCol).map(d => ({ name: d.name, Hours: d.value }))
    : [];

  // ── Bar: hours per project ────────────────────────────────────────────────────
  const tasksByProject = (projectCol && timeEstCol)
    ? sumHoursByCol(pmScopedData, projectCol, timeEstCol).slice(0, 15).map(d => ({ name: d.name, Hours: d.value }))
    : [];

  // ── Stacked bar: hours by status per person ───────────────────────────────────
  const statusPerPerson: Record<string, Record<string, number>> = {};
  const statusSet = new Set<string>();
  if (resourceCol && statusCol && timeEstCol) {
    pmScopedData.forEach(row => {
      const person = String(row[resourceCol] ?? '').trim();
      const status = String(row[statusCol] ?? '').trim();
      if (!person || !status) return;
      statusSet.add(status);
      if (!statusPerPerson[person]) statusPerPerson[person] = {};
      statusPerPerson[person][status] = (statusPerPerson[person][status] ?? 0) + getHours(row);
    });
  }
  const allStatuses = [...statusSet].sort();
  const statusPerPersonData = Object.entries(statusPerPerson)
    .map(([name, counts]) => ({ name, ...Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Math.round(v * 10) / 10])) }))
    .sort((a, b) => {
      const sum = (o: Record<string, unknown>) =>
        Object.values(o).filter(v => typeof v === 'number').reduce((s, v) => s + (v as number), 0);
      return sum(b) - sum(a);
    });

  // ── Radial items — hours-based ────────────────────────────────────────────────
  const inProgressHours  = timeEstCol ? pmScopedData.filter(r => String(r[statusCol!] ?? '').trim().toLowerCase() === 'in progress').reduce((s, r) => s + getHours(r), 0) : 0;
  const onHoldHours      = timeEstCol ? pmScopedData.filter(r => String(r[statusCol!] ?? '').trim().toLowerCase() === 'on hold').reduce((s, r) => s + getHours(r), 0) : 0;
  const completedHours   = timeEstCol ? pmScopedData.filter(r => { const s = String(r[statusCol!] ?? '').trim().toLowerCase(); return s.includes('submitted') || s === 'testing'; }).reduce((s, r) => s + getHours(r), 0) : 0;
  const toBeStartedHours = timeEstCol ? pmScopedData.filter(r => String(r[statusCol!] ?? '').trim().toLowerCase() === 'to be started').reduce((s, r) => s + getHours(r), 0) : 0;
  const radialItems = [
    { label: 'In Progress',   value: Math.round(inProgressHours  * 10) / 10, max: totalHoursAll, color: '#16a34a' },
    { label: 'On Hold',       value: Math.round(onHoldHours      * 10) / 10, max: totalHoursAll, color: '#7c3aed' },
    { label: 'Completed',     value: Math.round(completedHours   * 10) / 10, max: totalHoursAll, color: '#2563eb' },
    { label: 'To Be Started', value: Math.round(toBeStartedHours * 10) / 10, max: totalHoursAll, color: '#f59e0b' },
  ];

  // ── Per-chart filtered datasets ──────────────────────────────────────────────
  const pmStatusFiltered   = filterByDate(pmScopedData, sheet1Headers, pmStatusFilter);
  const projectFiltered    = filterByDate(pmScopedData, sheet1Headers, projectFilter);
  const breakdownFiltered  = filterByDate(pmScopedData, sheet1Headers, breakdownFilter);

  const pmStatusDataFiltered = (pmStatusCol && timeEstCol) ? sumHoursByCol(pmStatusFiltered, pmStatusCol, timeEstCol) : [];
  const tasksByProjectFiltered = (projectCol && timeEstCol)
    ? sumHoursByCol(projectFiltered, projectCol, timeEstCol).slice(0, 15).map(d => ({ name: d.name, Hours: d.value })) : [];
  const statusPerPersonFiltered: Record<string, Record<string, number>> = {};
  const statusSetFiltered = new Set<string>();
  if (resourceCol && statusCol && timeEstCol) {
    breakdownFiltered.forEach(row => {
      const person = String(row[resourceCol] ?? '').trim();
      const status = String(row[statusCol] ?? '').trim();
      if (!person || !status) return;
      statusSetFiltered.add(status);
      if (!statusPerPersonFiltered[person]) statusPerPersonFiltered[person] = {};
      statusPerPersonFiltered[person][status] = (statusPerPersonFiltered[person][status] ?? 0) + getHours(row);
    });
  }
  const allStatusesFiltered = [...statusSetFiltered].sort();
  const statusPerPersonDataFiltered = Object.entries(statusPerPersonFiltered)
    .map(([name, counts]) => ({ name, ...Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Math.round(v * 10) / 10])) }))
    .sort((a, b) => {
      const sum = (o: Record<string, unknown>) => Object.values(o).filter(v => typeof v === 'number').reduce((s, v) => s + (v as number), 0);
      return sum(b) - sum(a);
    });


  return (
    <section className="space-y-4">

      {/* ── Row 1: All KPI Cards in one row (admin only) ─────────────────────── */}
      {!hideKpi && !pmView && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="Total Tasks"         value={totalTasks}     total={totalTasks} color="var(--cn-accent)" icon={<LayoutGrid    className="w-4 h-4" />} adminStyle={true} />
          <StatCard label="In Progress"         value={inProgress}     total={totalTasks} color="#16a34a"          icon={<CheckCircle2  className="w-4 h-4" />} adminStyle={true} />
          <StatCard label="On Hold"             value={onHold}         total={totalTasks} color="#7c3aed"          icon={<PauseCircle   className="w-4 h-4" />} adminStyle={true} />
          <StatCard label="Submitted to Akash"  value={submittedAkash} total={totalTasks} color="#d97706"         icon={<Send          className="w-4 h-4" />} adminStyle={true} />
          <StatCard label="Submitted to PM"     value={submittedPM}    total={totalTasks} color="#10b981"         icon={<UserCheck     className="w-4 h-4" />} adminStyle={true} />
          <StatCard label="Today's Tasks"       value={todayTasks}     total={totalTasks} color="#FE4A23"         icon={<CalendarCheck className="w-4 h-4" />} adminStyle={true} />
        </div>
      )}

      {/* ── PM Status overview (PM only) ─────────────────────────────────────── */}
      {!hideKpi && pmView && pmStatusCol && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
            <StatCard label="No Action Taken"     value={pmNoAction}         total={pmScopedTotal} color="#f59e0b" icon={<AlertTriangle className="w-4 h-4" />} adminStyle={true} />
            <StatCard label="Changes"              value={pmChanges}          total={pmScopedTotal} color="#7c3aed" icon={<RefreshCw     className="w-4 h-4" />} adminStyle={true} />
            <StatCard label="Approved"             value={pmApproved}         total={pmScopedTotal} color="#16a34a" icon={<ThumbsUp       className="w-4 h-4" />} adminStyle={true} />
            <StatCard label="Submitted to Client"  value={pmSubmittedClient}  total={pmScopedTotal} color="#10b981" icon={<BadgeCheck     className="w-4 h-4" />} adminStyle={true} />
            <StatCard label="Today's Tasks"        value={todayTasks}         total={pmScopedTotal} color="#FE4A23" icon={<CalendarCheck className="w-4 h-4" />} adminStyle={true} />
          </div>
        </>
      )}

      {!hideBreakdownCharts && (
        <>
          {/* ── Hours Breakdown per Person ───────────────────────────────────── */}
          <ChartShell title="Hours Breakdown per Person" sub="Stacked view of each team member's hours by task status" filter={breakdownFilter} onFilter={setBreakdownFilter}>
            <StackedBarCard title="" data={statusPerPersonDataFiltered} statuses={allStatusesFiltered} />
          </ChartShell>

          {/* ── Hours per Project ────────────────────────────────────────────── */}
          <ChartShell title="Hours per Project" sub="Estimated hours per client / project (top 15)" filter={projectFilter} onFilter={setProjectFilter}>
            <BarCard title="" data={tasksByProjectFiltered} dataKey="Hours" color="#10b981" />
          </ChartShell>

          {/* ── Hours by PM Status ───────────────────────────────────────────── */}
          {!hidePmStatus && (
            <ChartShell title="Hours by PM Status" sub="Estimated hours by PM approval stage" filter={pmStatusFilter} onFilter={setPmStatusFilter}>
              <DonutCard title="" data={pmStatusDataFiltered} colorMap={PM_STATUS_COLORS_MAP} adminStyle />
            </ChartShell>
          )}
        </>
      )}

    </section>
  );
}

// ─── Standalone Hours by PM Status chart (used alongside InsightCards) ────────
export function PmStatusChart({ sheet1Data, sheet1Headers, pmView = false, resourceView = false, resourceName = '', currentUserEmail = '' }: Pick<Props, 'sheet1Data' | 'sheet1Headers' | 'pmView' | 'resourceView' | 'resourceName' | 'currentUserEmail'>) {
  const [filter, setFilter] = useState<DateFilter>('all');
  const statusCol   = findCol(sheet1Headers, 'task status', 'status');
  const resourceCol = findCol(sheet1Headers, 'assigned person', 'assigned to', 'resource');
  const emailCol    = findCol(sheet1Headers, 'email');
  const pmStatusCol = findCol(sheet1Headers, 'pm status');
  const timeEstCol  = findCol(sheet1Headers, 'time estimation', 'time estimate', 'estimation');

  const pmScopedData = (() => {
    let d = statusCol ? sheet1Data.filter(r => !SKIP_STATUSES.includes(String(r[statusCol] ?? '').trim().toLowerCase())) : sheet1Data;
    if (resourceView && resourceName && resourceCol) d = d.filter(r => String(r[resourceCol] ?? '').trim().toLowerCase() === resourceName.trim().toLowerCase());
    else if (pmView && currentUserEmail && emailCol) d = d.filter(r => String(r[emailCol] ?? '').trim().toLowerCase() === currentUserEmail.trim().toLowerCase());
    return d;
  })();

  const filtered = filterByDate(pmScopedData, sheet1Headers, filter);
  const data = (pmStatusCol && timeEstCol) ? sumHoursByCol(filtered, pmStatusCol, timeEstCol) : [];

  return (
    <div className="cn-card rounded-xl overflow-hidden h-full flex flex-col" style={{ background: 'var(--cn-bg-card)' }}>
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-3 border-b" style={{ borderColor: 'var(--cn-border)' }}>
        <div>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--cn-text-primary)' }}>Hours by PM Status</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>Estimated hours by PM approval stage</p>
        </div>
        <DateFilterPills value={filter} onChange={setFilter} />
      </div>
      <div className="p-4 sm:p-5 flex-1"><DonutCard title="" data={data} colorMap={PM_STATUS_COLORS_MAP} adminStyle /></div>
    </div>
  );
}
