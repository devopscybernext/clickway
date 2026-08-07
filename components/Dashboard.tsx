'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SheetData } from '@/lib/googleSheets';
import { SHEET_IDS, TOOLS_SHEET_ID, PM_BANDWIDTH_SHEET_ID, MARKETING_TEAM_SHEET_ID, TAB_MARKETING_TASKS, MARKETING_STATUS_OPTIONS, MARKETING_TODAY_BUCKET_SET_OPTIONS, MARKETING_ASSIGNED_PERSONS, WEB_TEAM, TAB_BANDWIDTH, RANGE_AVAILABILITY, TAB_AVAILABILITY, RANGE_LEADERBOARD, RANGE_NEWS, RANGE_HOLIDAY, RANGE_AI_TOOLS, RANGE_QA_TESTING, TAB_QA_TESTING } from '@/lib/config';

import { AuthUser, SheetId, Team, getAllowedSheets, isAdminTierRole, isPmTierRole, isTeamAdminTierRole, isIndividualTierRole, getLockedTeam, getTasksAssignedLockedTeam } from '@/lib/auth';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import SpecificCharts, { ResourceOverview, PmStatusOverview, KpiCards, ResourceStatusGrid, InsightCards, PmStatusChart } from './SpecificCharts';
import FilteredDataTable from './FilteredDataTable';
import SearchFilter from './SearchFilter';
import EmployeeGallery from './EmployeeGallery';
import ClockRoom from './ClockRoom';
import HolidayCalendar from './HolidayCalendar';
import AITools from './AITools';
import Leaderboard, { calcLeaderboard, PersonStats } from './Leaderboard';
import PMProjectBandwidth from './PMProjectBandwidth';
import { AlertCircle, Sparkles, ChevronUp, ChevronDown, AlertTriangle, CheckCircle2 } from 'lucide-react';

const REFRESH_INTERVAL    = 300_000;       // 5 min — core data (tasks, availability)
const LB_REFRESH_INTERVAL = 12 * 60 * 60_000; // 12 hrs — leaderboard (scores change slowly)
const NEWS_REFRESH_INTERVAL = 30 * 60_000;    // 30 min — news ticker

async function fetchSheet(
  sheetId: string,
  range: string,
  headerRow = 1
): Promise<{ data: SheetData[]; headers: string[] }> {
  const url = `/api/data?sheetId=${encodeURIComponent(sheetId)}&range=${encodeURIComponent(range)}`;
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  const headers: string[] = json.headers ?? [];
  const data: SheetData[] = (json.data ?? []).map((row: SheetData, idx: number) => ({
    ...row,
    __row: idx + headerRow + 1,
  }));
  return { data, headers };
}

// Bandwidth Allocation + every archive tab ("Task - <range>"), merged and
// tagged with __sheet/__id server-side — see /api/bandwidth-tasks. Fetched
// as one call instead of fetchSheet(RANGE_BANDWIDTH) so new archive tabs
// show up automatically with no code change.
async function fetchBandwidthTasks(): Promise<{ data: SheetData[]; headers: string[] }> {
  const res = await fetch('/api/bandwidth-tasks', { cache: 'no-store' });
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  return { data: json.data ?? [], headers: json.headers ?? [] };
}

// Parses the sheet's "DD/MM/YYYY HH:mm:ss" Timestamp column. Needed to sort
// Tasks Assigned correctly now that Bandwidth Allocation is merged with
// archive tabs — __row alone is only unique within a single tab, so a raw
// __row sort would interleave old and current rows arbitrarily.
function parseRowTimestamp(row: SheetData, headers: string[]): number {
  const tsCol = headers.find(h => h.toLowerCase().includes('timestamp'));
  if (!tsCol) return 0;
  const raw = String(row[tsCol] ?? '').trim();
  if (!raw) return 0;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, d, mo, y, h, mi, s] = m;
    const dt = new Date(+y, +mo - 1, +d, +(h ?? 0), +(mi ?? 0), +(s ?? 0));
    if (!isNaN(dt.getTime())) return dt.getTime();
  }
  const dt = new Date(raw);
  return isNaN(dt.getTime()) ? 0 : dt.getTime();
}

// ─── AI News Ticker ─────────────────────────────────────────────────────────
const NEWS_ROTATE_INTERVAL = 6000; // 6 s per headline

function NewsTicker({ data }: { data: SheetData[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const cols = Object.keys(data[0] ?? {});
  const dateCol    = cols.find(h => h.toLowerCase().includes('date'));
  const companyCol = cols.find(h => h.toLowerCase().includes('company'));
  const titleCol   = cols.find(h => h.toLowerCase().includes('title'));
  const descCol    = cols.find(h => h.toLowerCase().includes('description'));

  // Robust date parser — handles ISO and DD/MM/YYYY
  const parseDate = (raw: string): Date | null => {
    if (!raw) return null;
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) { const dd = new Date(+m[3], +m[2] - 1, +m[1]); if (!isNaN(dd.getTime())) return dd; }
    return null;
  };

  const items = data
    .map(r => ({
      title: titleCol ? String(r[titleCol] ?? '').trim() : '',
      company: companyCol ? String(r[companyCol] ?? '').trim() : '',
      description: descCol ? String(r[descCol] ?? '').trim() : '',
      date: dateCol ? String(r[dateCol] ?? '').trim() : '',
      raw: dateCol ? parseDate(String(r[dateCol] ?? '')) : null,
    }))
    .filter(it => it.title)
    .sort((a, b) => (b.raw && a.raw) ? b.raw.getTime() - a.raw.getTime() : 0);

  useEffect(() => {
    if (items.length < 2 || paused) return;
    const id = setInterval(() => setIndex(i => (i + 1) % items.length), NEWS_ROTATE_INTERVAL);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, paused]);

  if (items.length === 0) return null;
  const current = items[index % items.length];

  return (
    <div
      className="cn-card rounded-lg px-5 py-3 border flex items-center gap-3"
      style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--cn-accent)' + '18', color: 'var(--cn-accent)' }}>
        <Sparkles className="w-4 h-4" />
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest shrink-0" style={{ color: 'var(--cn-accent)' }}>AI News</span>
      <div key={index} className="flex-1 min-w-0 overflow-hidden" style={{ animation: 'newsFadeIn 0.4s ease' }}>
        <div className="flex items-center gap-2 min-w-0">
          {current.company && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-secondary)' }}>
              {current.company}
            </span>
          )}
          <p className="text-sm font-medium truncate" style={{ color: 'var(--cn-text-primary)' }}>
            {current.title}
          </p>
        </div>
        {current.description && (
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--cn-text-muted)' }} title={current.description}>
            {current.description}
          </p>
        )}
      </div>
      {current.date && (
        <span className="text-xs shrink-0" style={{ color: 'var(--cn-text-muted)' }}>{current.date}</span>
      )}
      {items.length > 1 && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setIndex(i => (i - 1 + items.length) % items.length)}
            className="w-5 h-5 rounded flex items-center justify-center cursor-pointer"
            style={{ color: 'var(--cn-text-muted)' }}
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIndex(i => (i + 1) % items.length)}
            className="w-5 h-5 rounded flex items-center justify-center cursor-pointer"
            style={{ color: 'var(--cn-text-muted)' }}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Today's Focus banner (admin only, for now) ─────────────────────────────
function TodaysFocusBanner({ data, headers, onNavigate, personFilter, emailFilter, reviewLabel = 'waiting on PM review' }: {
  data: SheetData[]; headers: string[]; onNavigate: () => void; personFilter?: string; emailFilter?: string; reviewLabel?: string;
}) {
  const statusCol    = headers.find(h => h.toLowerCase().includes('task status') || h.toLowerCase() === 'status');
  const pmStatusCol  = headers.find(h => h.toLowerCase().includes('pm status'));
  const bucketCol    = headers.find(h => h.toLowerCase().includes('task daily bucket') || h.toLowerCase().includes('daily bucket'));
  const personCol    = headers.find(h => h.toLowerCase().includes('assigned person'));
  const emailCol     = headers.find(h => h.toLowerCase().includes('email'));

  const scopedData = emailFilter && emailCol
    ? data.filter(r => String(r[emailCol] ?? '').trim().toLowerCase() === emailFilter.trim().toLowerCase())
    : personFilter && personCol
    ? data.filter(r => String(r[personCol] ?? '').trim().toLowerCase() === personFilter.trim().toLowerCase())
    : data;

  const pendingPmReview = (statusCol && pmStatusCol)
    ? scopedData.filter(r =>
        String(r[statusCol] ?? '').trim().toLowerCase() === 'submitted to pm'
        && String(r[pmStatusCol] ?? '').trim().toLowerCase() === 'no action taken'
      ).length
    : 0;

  const todayNotStarted = (statusCol && bucketCol)
    ? scopedData.filter(r =>
        String(r[bucketCol] ?? '').trim().toLowerCase() === 'today'
        && String(r[statusCol] ?? '').trim().toLowerCase() === 'to be started'
      ).length
    : 0;

  if (pendingPmReview === 0 && todayNotStarted === 0) {
    return (
      <div
        className="cn-card rounded-lg px-5 py-3 border flex items-center gap-3"
        style={{ background: 'rgba(22,163,74,0.08)', borderColor: 'rgba(22,163,74,0.25)' }}
      >
        <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#16a34a' }} />
        <p className="text-sm font-medium" style={{ color: 'var(--cn-text-primary)' }}>
          All clear — nothing urgent needs your attention right now.
        </p>
      </div>
    );
  }

  return (
    <div
      className="cn-card rounded-lg px-5 py-3 border flex items-center justify-between gap-4 flex-wrap"
      style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.3)' }}
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: '#f59e0b' }} />
        <p className="text-sm font-medium" style={{ color: 'var(--cn-text-primary)' }}>
          <span className="font-bold">Today&apos;s Focus:</span>{' '}
          {pendingPmReview > 0 && (
            <>{pendingPmReview} task{pendingPmReview === 1 ? '' : 's'} {reviewLabel}</>
          )}
          {pendingPmReview > 0 && todayNotStarted > 0 && ', '}
          {todayNotStarted > 0 && (
            <>{todayNotStarted} of today&apos;s task{todayNotStarted === 1 ? '' : 's'} not started yet</>
          )}
        </p>
      </div>
      <button
        onClick={onNavigate}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 cursor-pointer transition-colors"
        style={{ background: '#f59e0b', color: '#fff' }}
      >
        Review Now
      </button>
    </div>
  );
}

interface DashboardProps {
  user: AuthUser;
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const allowedSheets = getAllowedSheets(user);
  const [selectedSheet, setSelectedSheet] = useState<SheetId>(allowedSheets[0]);

  // Role tiers (see lib/auth.ts) — used instead of scattering user.role === '...'
  // checks everywhere. isAdmin/isPmTier/isTeamAdmin/isIndividual are mutually exclusive.
  const isAdmin      = isAdminTierRole(user.role);
  const isPmTier      = isPmTierRole(user.role);
  const isTeamAdmin   = isTeamAdminTierRole(user.role);
  const isIndividual  = isIndividualTierRole(user.role);
  // Roles pinned to one team everywhere (WebAdmin/WebTeam/MarketingAdmin/MarketingTeam)
  const lockedTeam: Team | undefined = getLockedTeam(user.role);
  // Tasks Assigned additionally pins PMWebAdmin/PMMarketingAdmin to their own team
  const lockedTasksAssignedTeam: Team | undefined = getTasksAssignedLockedTeam(user.role);
  // Tasks Overview & Team Bandwidth: only individual-tier roles (WebTeam/
  // MarketingTeam) stay pinned to one team — WebAdmin/MarketingAdmin (and
  // everyone above them) get both tabs here even though they're locked
  // everywhere else.
  const lockedTasksOverviewTeam: Team | undefined = isIndividual ? lockedTeam : undefined;
  const lockedTeamBandwidthTeam: Team | undefined = isIndividual ? lockedTeam : undefined;

  const [bandwidthData, setBandwidthData] = useState<SheetData[]>([]);
  const [bandwidthHeaders, setBandwidthHeaders] = useState<string[]>([]);
  const [availData, setAvailData] = useState<SheetData[]>([]);
  const [availHeaders, setAvailHeaders] = useState<string[]>([]);
  const [lbData, setLbData] = useState<SheetData[]>([]);
  const [newsData, setNewsData] = useState<SheetData[]>([]);
  const [holidayData, setHolidayData] = useState<SheetData[]>([]);
  const [aiToolsData, setAiToolsData] = useState<SheetData[]>([]);
  const [qaData, setQaData] = useState<SheetData[]>([]);
  const [qaHeaders, setQaHeaders] = useState<string[]>([]);
  const [pmUsers, setPmUsers] = useState<AuthUser[]>([]);
  const [pmBandwidthData, setPmBandwidthData] = useState<SheetData[]>([]);
  const [pmBandwidthHeaders, setPmBandwidthHeaders] = useState<string[]>([]);
  const [marketingTeamData, setMarketingTeamData] = useState<SheetData[]>([]);
  const [marketingTeamHeaders, setMarketingTeamHeaders] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [lbLoading, setLbLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [tableKey, setTableKey] = useState(0);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [analysisSubTab, setAnalysisSubTab] = useState<'resources' | 'pm'>('resources');
  const [toolsSubTab, setToolsSubTab] = useState<'clock' | 'holiday' | 'ai'>('clock');
  const [pmBandwidthSubTab, setPmBandwidthSubTab] = useState<'all' | 'mine'>('all');
  const [teamBandwidthSubTab, setTeamBandwidthSubTab] = useState<Team>(lockedTeamBandwidthTeam ?? 'web');
  const [tasksOverviewTeam, setTasksOverviewTeam] = useState<Team>(lockedTasksOverviewTeam ?? 'web');
  const [tasksAssignedTeam, setTasksAssignedTeam] = useState<Team>(lockedTasksAssignedTeam ?? 'web');
  const [addTaskTeam, setAddTaskTeam] = useState<Team>(lockedTeam ?? 'web');
  const [analyticsTeam, setAnalyticsTeam] = useState<Team>(lockedTeam ?? 'web');
  const [analysisDateFilter, setAnalysisDateFilter] = useState<'all' | 'daily' | 'weekly' | 'monthly'>('all');
  const iframeLoadCount = useRef(0);

  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const lbIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);


  // Members who have left the organisation — exclude from all dashboard views
  const EXCLUDED_MEMBERS = ['manpreet', 'vinay'];
  const resourceCol = bandwidthHeaders.find(h => h.toLowerCase().includes('assigned person') || h.toLowerCase().includes('assigned to'));
  const activeBandwidthData = resourceCol
    ? bandwidthData.filter(r => !EXCLUDED_MEMBERS.includes(String(r[resourceCol] ?? '').trim().toLowerCase()))
    : bandwidthData;

  const currentData    = selectedSheet === '1' ? activeBandwidthData : availData;
  const currentHeaders = selectedSheet === '1' ? bandwidthHeaders : availHeaders;

  const isNewestFirst = !isIndividual;
  const sortedData = isNewestFirst
    ? [...currentData].sort((a, b) => Number(b['__row']) - Number(a['__row']))
    : currentData;

  const searchFiltered = searchTerm.trim()
    ? sortedData.filter(row =>
        Object.values(row).some(v =>
          String(v).toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    : sortedData;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Core data — 3 calls (all users need this)
      const [bw, av] = await Promise.all([
        fetchBandwidthTasks(),
        fetchSheet(SHEET_IDS['1'], RANGE_AVAILABILITY, 2),
      ]);
      // Blank/formatting-only rows and per-tab tagging are already handled
      // server-side by /api/bandwidth-tasks
      setBandwidthData(bw.data);
      setBandwidthHeaders(bw.headers);
      setAvailData(av.data);
      setAvailHeaders(av.headers);
      setLastUpdated(new Date().toISOString());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  // Core data: every 90 seconds
  useEffect(() => {
    fetchAll();
    intervalRef.current = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchAll]);

  // Leaderboard data: once on load only — admin can manually refresh via button
  const fetchLb = useCallback(async () => {
    setLbLoading(true);
    try {
      const lb = await fetchSheet(SHEET_IDS['1'], RANGE_LEADERBOARD);
      setLbData(lb.data);
    } catch { /* non-critical — silently ignore */ }
    finally { setLbLoading(false); }
  }, []);

  useEffect(() => {
    fetchLb();
  }, [fetchLb]);

  // News ticker data: once on load, then every 30 minutes
  const fetchNews = useCallback(async () => {
    try {
      const news = await fetchSheet(TOOLS_SHEET_ID, RANGE_NEWS);
      setNewsData(news.data);
    } catch { /* non-critical — silently ignore */ }
  }, []);

  useEffect(() => {
    fetchNews();
    const id = setInterval(fetchNews, NEWS_REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchNews]);

  // Holiday calendar data: once on load, then every 30 minutes
  const fetchHolidays = useCallback(async () => {
    try {
      const holidays = await fetchSheet(TOOLS_SHEET_ID, RANGE_HOLIDAY);
      setHolidayData(holidays.data);
    } catch { /* non-critical — silently ignore */ }
  }, []);

  useEffect(() => {
    fetchHolidays();
    const id = setInterval(fetchHolidays, NEWS_REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchHolidays]);

  // AI Tools directory data: once on load, then every 30 minutes
  const fetchAiTools = useCallback(async () => {
    try {
      const tools = await fetchSheet(TOOLS_SHEET_ID, RANGE_AI_TOOLS);
      setAiToolsData(tools.data);
    } catch { /* non-critical — silently ignore */ }
  }, []);

  useEffect(() => {
    fetchAiTools();
    const id = setInterval(fetchAiTools, NEWS_REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchAiTools]);

  // PM roster for Individual Analysis (admin only) — fetched server-side via
  // /api/pm-users so the password hash never reaches the browser
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/pm-users')
      .then(res => res.json())
      .then(json => { if (json.success) setPmUsers(json.pmUsers); })
      .catch(() => {});
  }, [isAdmin]);

  // PM Project Bandwidth — one tab per PM in a separate spreadsheet, merged
  // server-side via /api/pm-bandwidth (each row tagged with its PM's tab name)
  const canSeePmBandwidth = isAdmin || isPmTier;
  useEffect(() => {
    if (!canSeePmBandwidth) return;
    const fetchPmBandwidth = () => {
      fetch('/api/pm-bandwidth')
        .then(res => res.json())
        .then(json => { if (json.success) { setPmBandwidthData(json.data); setPmBandwidthHeaders(json.headers); } })
        .catch(() => {});
    };
    fetchPmBandwidth();
    const id = setInterval(fetchPmBandwidth, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [canSeePmBandwidth]);

  // Marketing Team — SEO/PPC/SMM tabs in their own spreadsheet, merged
  // server-side via /api/marketing-team (each row tagged with its sub-team)
  const canSeeMarketingTeam = isAdmin || isPmTier || lockedTeam === 'marketing' || user.role === 'resource';
  useEffect(() => {
    if (!canSeeMarketingTeam) return;
    const fetchMarketingTeam = () => {
      fetch('/api/marketing-team')
        .then(res => res.json())
        .then(json => { if (json.success) { setMarketingTeamData(json.data); setMarketingTeamHeaders(json.headers); } })
        .catch(() => {});
    };
    fetchMarketingTeam();
    const id = setInterval(fetchMarketingTeam, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [canSeeMarketingTeam]);

  // QA Testing data (Vinay's dedicated tab) — once on load, then every 160s.
  // Vinay, admin, and PM can see this tab (admin/PM read-only), so only fetch for them.
  const isVinay = user.role === 'resource' && user.username === 'vinay';
  const canSeeQaTesting = isAdmin || isPmTier || isVinay;
  const fetchQa = useCallback(async () => {
    try {
      const qa = await fetchSheet(SHEET_IDS['1'], RANGE_QA_TESTING);
      setQaData(qa.data);
      setQaHeaders(qa.headers);
    } catch { /* non-critical — silently ignore */ }
  }, []);

  useEffect(() => {
    if (!canSeeQaTesting) return;
    fetchQa();
    const id = setInterval(fetchQa, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [canSeeQaTesting, fetchQa]);

  const handleQaChange = async (row: SheetData, colName: string, newValue: string) => {
    const rowNum = Number(row['__row']);
    const colIndex = qaHeaders.indexOf(colName);
    if (!rowNum || colIndex === -1) return;
    await fetch('/api/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spreadsheetId: SHEET_IDS['1'], sheetName: TAB_QA_TESTING, row: rowNum, colIndex, value: newValue }),
    });
    setQaData(prev => prev.map(r => r['__row'] === rowNum ? { ...r, [colName]: newValue } : r));
  };

  const handleAvailUpdate = async (row: SheetData, colName: string, newValue: string) => {
    const rowNum = Number(row['__row']);
    const colIndex = availHeaders.indexOf(colName);
    if (!rowNum || colIndex === -1) return;
    await fetch('/api/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spreadsheetId: SHEET_IDS['1'], sheetName: TAB_AVAILABILITY, row: rowNum, colIndex, value: newValue }),
    });
    setAvailData(prev => prev.map(r => r['__row'] === rowNum ? { ...r, [colName]: newValue } : r));
  };

  const handleBandwidthStatusChange = async (row: SheetData, colName: string, newValue: string) => {
    const rowNum = Number(row['__row']);
    // Bandwidth Allocation + archive tabs share __row numbering per-tab, so
    // both the write target and the local-state match must go through the
    // row's own tab (__sheet/__id), not just __row.
    const sheetName = String(row['__sheet'] ?? TAB_BANDWIDTH);
    const colIndex = bandwidthHeaders.indexOf(colName);
    if (!rowNum || colIndex === -1) return;
    await fetch('/api/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spreadsheetId: SHEET_IDS['1'], sheetName, row: rowNum, colIndex, value: newValue }),
    });
    setBandwidthData(prev => prev.map(r => r['__id'] === row['__id'] ? { ...r, [colName]: newValue } : r));
  };

  const handlePmBandwidthChange = async (row: SheetData, colName: string, newValue: string) => {
    const rowNum = Number(row['__row']);
    const pmTab = String(row['__pm'] ?? '');
    const colIndex = pmBandwidthHeaders.indexOf(colName);
    if (!rowNum || !pmTab || colIndex === -1) return;
    await fetch('/api/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spreadsheetId: PM_BANDWIDTH_SHEET_ID, sheetName: pmTab, row: rowNum, colIndex, value: newValue }),
    });
    setPmBandwidthData(prev => prev.map(r => r['__id'] === row['__id'] ? { ...r, [colName]: newValue } : r));
  };

  const handleMarketingTeamChange = async (row: SheetData, colName: string, newValue: string) => {
    const rowNum = Number(row['__row']);
    const colIndex = marketingTeamHeaders.indexOf(colName);
    if (!rowNum || colIndex === -1) return;
    await fetch('/api/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spreadsheetId: MARKETING_TEAM_SHEET_ID, sheetName: TAB_MARKETING_TASKS, row: rowNum, colIndex, value: newValue }),
    });
    setMarketingTeamData(prev => prev.map(r => r['__row'] === rowNum ? { ...r, [colName]: newValue } : r));
  };

  const handleSheetChange = (sheet: SheetId) => {
    setSelectedSheet(sheet);
    setSearchTerm('');
    // tableKey intentionally NOT incremented here so filters persist across tab switches
    if (sheet === '6') { iframeLoadCount.current = 0; setFormSubmitted(false); }
  };

  const isSheet1           = selectedSheet === '1';
  const isAnalytics        = selectedSheet === '3';
  const isAddTask          = selectedSheet === '6';
  const isLeaderboard      = selectedSheet === '7';
  const isResourceOverview = selectedSheet === '9';
  const isIndividualAnalysis = selectedSheet === '10';
  const isPmBandwidth       = selectedSheet === '11';
  const isTeamBandwidth     = selectedSheet === '12';
  const isTools             = selectedSheet === '14';

  // ── Team roster filtering (Web/Marketing split for Team Bandwidth & Tasks Overview) ──
  const filterByRoster = (rows: SheetData[], rowHeaders: string[], roster: string[]) => {
    const col = rowHeaders.find(h => h.toLowerCase().includes('assigned person') || h.toLowerCase().includes('assigned to') || h.toLowerCase() === 'name');
    if (!col || roster.length === 0) return [];
    const rosterLower = roster.map(r => r.toLowerCase());
    return rows.filter(r => rosterLower.includes(String(r[col] ?? '').trim().toLowerCase()));
  };
  const webBandwidthData = filterByRoster(activeBandwidthData, bandwidthHeaders, WEB_TEAM);
  const webAvailData     = filterByRoster(availData, availHeaders, WEB_TEAM);

  // Marketing — real data from the Marketing Team spreadsheet's single
  // "Marketing Tasks" tab (Department column distinguishes SEO/PPC/SMM).
  // No separate availability sheet exists for Marketing.
  const marketingAvailData: SheetData[] = [];

  // Dashboard analytics (sheet 3) — same Web/Marketing split as the other pages,
  // reusing the same generic (header-driven) components either way.
  const analyticsData         = analyticsTeam === 'web' ? activeBandwidthData : marketingTeamData;
  const analyticsHeaders      = analyticsTeam === 'web' ? bandwidthHeaders : marketingTeamHeaders;
  const analyticsAvailData    = analyticsTeam === 'web' ? availData : marketingAvailData;
  const analyticsAvailHeaders = analyticsTeam === 'web' ? availHeaders : [];
  const analyticsOnStatusChange = analyticsTeam === 'web' ? handleBandwidthStatusChange : handleMarketingTeamChange;

  // Tasks Assigned — same sort/search pipeline as searchFiltered, scoped to the selected team
  const tasksAssignedTeamData = tasksAssignedTeam === 'web' ? webBandwidthData : marketingTeamData;
  const tasksAssignedHeadersForSort = tasksAssignedTeam === 'web' ? bandwidthHeaders : marketingTeamHeaders;
  const tasksAssignedSorted = isNewestFirst
    ? [...tasksAssignedTeamData].sort((a, b) => {
        const diff = parseRowTimestamp(b, tasksAssignedHeadersForSort) - parseRowTimestamp(a, tasksAssignedHeadersForSort);
        return diff !== 0 ? diff : Number(b['__row']) - Number(a['__row']);
      })
    : tasksAssignedTeamData;
  const tasksAssignedSearchFiltered = searchTerm.trim()
    ? tasksAssignedSorted.filter(row => Object.values(row).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase())))
    : tasksAssignedSorted;

  // ── Date filter for analytics ─────────────────────────────────────────────
  const filterBandwidthByDate = (
    data: SheetData[],
    headers: string[],
    filter: 'all' | 'daily' | 'weekly' | 'monthly'
  ): SheetData[] => {
    if (filter === 'all') return data;

    const bucketCol   = headers.find(h => h.toLowerCase().includes('task daily bucket') || h.toLowerCase().includes('bucket'));
    const deadlineCol = headers.find(h => h.toLowerCase().includes('deadline'));
    const tsCol       = headers.find(h => h.toLowerCase().includes('timestamp'));

    // Robust date parser — handles M/D/YYYY and DD/MM/YYYY
    const parseDate = (raw: string): Date | null => {
      if (!raw) return null;
      let d = new Date(raw);
      if (!isNaN(d.getTime())) return d;
      // Try DD/MM/YYYY [HH:MM:SS]
      const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m) { d = new Date(+m[3], +m[2] - 1, +m[1]); if (!isNaN(d.getTime())) return d; }
      return null;
    };

    const now = new Date();
    const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sow = new Date(sod); sow.setDate(sod.getDate() - sod.getDay());
    const som = new Date(now.getFullYear(), now.getMonth(), 1);

    return data.filter(row => {
      // Today → match Task Daily Bucket = "today"
      if (filter === 'daily') {
        const bucket = String(row[bucketCol ?? ''] ?? '').trim().toLowerCase();
        return bucket === 'today';
      }
      // Weekly / Monthly → use Deadline first, fallback to Timestamp
      const dateRaw = String(row[deadlineCol ?? ''] ?? row[tsCol ?? ''] ?? '').trim();
      const d = parseDate(dateRaw);
      if (!d) return false;
      const since = filter === 'weekly' ? sow : som;
      return d >= since && d < new Date(now.getFullYear(), now.getMonth() + (filter === 'monthly' ? 1 : 0), filter === 'weekly' ? sod.getDate() + (7 - sod.getDay()) : 1);
    });
  };

  const analysisFilteredBandwidthData = filterBandwidthByDate(activeBandwidthData, bandwidthHeaders, analysisDateFilter);

  // ── iframe submission detection ───────────────────────────────────────────
  const handleIframeLoad = () => {
    iframeLoadCount.current += 1;
    if (iframeLoadCount.current >= 2) {
      setFormSubmitted(true);
      setTimeout(() => setFormSubmitted(false), 6000);
    }
  };

  // Apply admin theme for all users
  useEffect(() => {
    const saved = (localStorage.getItem('cn-theme') as 'dark' | 'light') || 'light';
    const base = saved === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', `admin-${base}`);
  }, []);

  return (
    <div className="flex min-h-screen" style={{ color: 'var(--cn-text-primary)' }}>
      {/* Fixed gradient backdrop */}
      <div className="cn-bg" />

      {/* Sidebar */}
      <Sidebar
        selectedSheet={selectedSheet}
        allowedSheets={allowedSheets}
        user={user}
        onSheetChange={handleSheetChange}
        onLogout={onLogout}
        isAdmin={isAdmin}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          lastUpdated={lastUpdated}
          loading={loading}
          selectedSheet={selectedSheet}
          onRefresh={fetchAll}
          user={user}
          onLogout={onLogout}
          isAdmin={isAdmin}
        />

        <main className="flex-1 px-4 sm:px-6 xl:px-8 pt-6 pb-8 space-y-5">
          {error && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-md px-4 py-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Analytics */}
          {isAnalytics && (() => {
            return (
            <div className="space-y-4">
              {/* ── Greeting — full width ── */}
              <div
                className="cn-card rounded-lg px-6 py-3 border flex items-center justify-between gap-4"
                style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}
              >
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--cn-text-primary)' }}>
                    {(() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; })()}, {user.displayName}!
                  </h2>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>
                    {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    {' · '}{isIndividual ? "Here's your personal task overview for today." : "Here's your team overview for today."}
                  </p>
                </div>
              </div>

              {/* ── Web / Marketing tab (hidden for roles pinned to one team) ── */}
              {!lockedTeam && (
                <div className="cn-card rounded-lg border transition-colors" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
                  <div className="flex items-center gap-3 px-4 sm:px-6 pt-3 pb-0 flex-wrap">
                    {([
                      { key: 'web', label: 'Web' },
                      { key: 'marketing', label: 'Marketing' },
                    ] as const).map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setAnalyticsTeam(tab.key)}
                        className="px-4 py-2 text-sm font-semibold border-b-2 transition-all cursor-pointer"
                        style={{
                          borderColor: analyticsTeam === tab.key ? 'var(--cn-accent)' : 'transparent',
                          color: analyticsTeam === tab.key ? 'var(--cn-accent)' : 'var(--cn-text-muted)',
                          background: 'transparent',
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Project State cards — admin + PM + Team Admin ── */}
              {(isAdmin || isPmTier || isTeamAdmin) && (
                <InsightCards mode="project-cards"
                  sheet1Data={analyticsData}
                  sheet1Headers={analyticsHeaders}
                  availData={analyticsAvailData}
                  availHeaders={analyticsAvailHeaders}
                />
              )}

              {/* ── Project State cards — individual contributor (own data only) ── */}
              {isIndividual && (
                <InsightCards mode="project-cards"
                  sheet1Data={analyticsData}
                  sheet1Headers={analyticsHeaders}
                  personFilter={user.displayName}
                />
              )}

              {/* ── Today's Team Workload grid — admin + PM + Team Admin ── */}
              {(isAdmin || isPmTier || isTeamAdmin) && (
                <ResourceStatusGrid
                  key={`team-workload-${analyticsTeam}`}
                  sheet1Data={analyticsData}
                  sheet1Headers={analyticsHeaders}
                  availData={analyticsAvailData}
                  availHeaders={analyticsAvailHeaders}
                  onStatusChange={analyticsOnStatusChange}
                  pmStatusColName={analyticsHeaders.find(h => h.toLowerCase().includes('pm status'))}
                  canEditPmStatus={isAdmin || isPmTier || isTeamAdmin}
                  isAdmin={isAdmin}
                  currentUserEmail={user.email}
                  autoOpenFirst
                />
              )}

              {/* ── Charts ── */}
              <div className="flex flex-col gap-4">
                  {loading && analyticsTeam === 'web' && !analyticsData.length ? (
                    <div className="animate-pulse space-y-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-64 rounded-lg" style={{ background: 'var(--cn-bg-input)' }} />
                      ))}
                    </div>
                  ) : !analyticsData.length ? (
                    <div
                      className="cn-card border rounded-lg flex flex-col items-center justify-center gap-3 py-20"
                      style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}
                    >
                      <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                      </svg>
                      <p className="text-sm font-medium" style={{ color: 'var(--cn-text-muted)' }}>No chart data available</p>
                      <p className="text-xs" style={{ color: 'var(--cn-text-faint)' }}>Data may still be loading — it refreshes every 5 minutes</p>
                      <button onClick={fetchAll} className="mt-1 px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
                        style={{ background: 'var(--cn-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                        Refresh Now
                      </button>
                    </div>
                  ) : (
                    <SpecificCharts
                      key={analyticsTeam}
                      sheet1Data={analyticsData}
                      sheet1Headers={analyticsHeaders}
                      pmView={isPmTier}
                      resourceView={isIndividual}
                      resourceName={user.displayName}
                      isAdmin={isAdmin || isTeamAdmin}
                      availData={analyticsAvailData}
                      availHeaders={analyticsAvailHeaders}
                      onStatusChange={analyticsOnStatusChange}
                      pmStatusColName={analyticsHeaders.find(h => h.toLowerCase().includes('pm status'))}
                      currentUserName={user.displayName}
                      currentUserEmail={user.email}
                      showFilter={isPmTier || isAdmin || isTeamAdmin}
                      hideKpi
                      hideBreakdownCharts
                    />
                  )}
              </div>
            </div>
            );
          })()}

          {/* ── Bandwidth Allocation — always mounted to preserve filter state ── */}
          <section
            className={`cn-card rounded-lg p-3 sm:p-6 space-y-4 sm:space-y-5 border transition-colors${isSheet1 ? '' : ' hidden'}`}
            style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}
          >
            <div>
              <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>Tasks Assigned</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>Active task assignments across all team members and projects</p>
            </div>
            {!lockedTasksAssignedTeam && (
              <div className="flex items-center gap-3 flex-wrap -mt-1">
                {([
                  { key: 'web', label: 'Web' },
                  { key: 'marketing', label: 'Marketing' },
                ] as const).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setTasksAssignedTeam(tab.key)}
                    className="px-4 py-2 text-sm font-semibold border-b-2 transition-all cursor-pointer"
                    style={{
                      borderColor: tasksAssignedTeam === tab.key ? 'var(--cn-accent)' : 'transparent',
                      color: tasksAssignedTeam === tab.key ? 'var(--cn-accent)' : 'var(--cn-text-muted)',
                      background: 'transparent',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
            <SearchFilter
              searchTerm={searchTerm}
              totalCount={tasksAssignedTeamData.length}
              filteredCount={tasksAssignedSearchFiltered.length}
              onChange={setSearchTerm}
            />
            {loading && !bandwidthData.length ? (
              <div className="animate-pulse space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-10 rounded" style={{ background: 'var(--cn-bg-input)' }} />
                ))}
              </div>
            ) : tasksAssignedTeam === 'marketing' && marketingTeamData.length === 0 ? (
              <div className="text-center py-16 text-sm" style={{ color: 'var(--cn-text-muted)' }}>
                No Marketing tasks yet.
              </div>
            ) : (
              <FilteredDataTable
                key={tasksAssignedTeam}
                data={tasksAssignedSearchFiltered}
                headers={tasksAssignedTeam === 'web' ? bandwidthHeaders : marketingTeamHeaders}
                sheetNum="1"
                onStatusChange={tasksAssignedTeam === 'web' ? handleBandwidthStatusChange : handleMarketingTeamChange}
                statusOptions={tasksAssignedTeam === 'marketing' ? MARKETING_STATUS_OPTIONS : undefined}
                todayBucketSetOptions={tasksAssignedTeam === 'marketing' ? MARKETING_TODAY_BUCKET_SET_OPTIONS : undefined}
                assignedPersonOptions={tasksAssignedTeam === 'marketing' ? MARKETING_ASSIGNED_PERSONS : undefined}
                readOnlyStatus
                readOnlyPmStatus={isIndividual}
                defaultPersonFilter={isIndividual ? user.displayName : undefined}
                editPersonBucket={isAdmin}
                hiddenCols={(tasksAssignedTeam === 'web' ? bandwidthHeaders : marketingTeamHeaders).filter(h => h.toLowerCase().includes('time logged'))}
                showCopy={isAdmin}
                rowCopy={isAdmin}
              />
            )}
          </section>


          {/* ── Team (admin gets Resources/Project Managers sub-tabs; others see gallery directly) ── */}

          {/* ── Individual Analysis (admin only) ─────────────────────────────────── */}
          {isIndividualAnalysis && (isAdmin || isPmTier) && (
            <section
              className="cn-card rounded-lg border transition-colors"
              style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}
            >
              <div className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 sm:pt-5 pb-0 flex-wrap">
                <div className="flex items-center gap-3">
                  {(isAdmin ? (['resources', 'pm'] as const) : (['resources'] as const)).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setAnalysisSubTab(tab)}
                      className="px-4 py-2 text-sm font-semibold border-b-2 transition-all cursor-pointer"
                      style={{
                        borderColor: analysisSubTab === tab ? 'var(--cn-accent)' : 'transparent',
                        color: analysisSubTab === tab ? 'var(--cn-accent)' : 'var(--cn-text-muted)',
                        background: 'transparent',
                      }}
                    >
                      {tab === 'resources' ? 'Resources' : 'Project Managers'}
                    </button>
                  ))}
                </div>
                {/* Sort by date pills */}
                <div className="flex items-center gap-1.5 shrink-0 pb-2 sm:pb-0">
                  {(['all', 'daily', 'weekly', 'monthly'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setAnalysisDateFilter(f)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer"
                      style={{
                        background: analysisDateFilter === f ? 'var(--cn-accent)' : 'var(--cn-bg-input)',
                        color: analysisDateFilter === f ? '#fff' : 'var(--cn-text-muted)',
                        border: `1px solid ${analysisDateFilter === f ? 'var(--cn-accent)' : 'var(--cn-border)'}`,
                      }}
                    >
                      {f === 'all' ? 'All Time' : f === 'daily' ? 'Today' : f === 'weekly' ? 'This Week' : 'This Month'}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--cn-border)' }} />

              <div className="p-3 sm:p-6">
                {analysisSubTab === 'resources' ? (
                  <EmployeeGallery
                    data={availData}
                    headers={availHeaders}
                    onUpdate={handleAvailUpdate}
                    isAdmin={isAdmin}
                    adminView
                    layout="list"
                    memberStats={
                      analysisDateFilter === 'all'
                        ? calcLeaderboard(activeBandwidthData, bandwidthHeaders, lbData, 'alltime')
                        : calcLeaderboard(analysisFilteredBandwidthData, bandwidthHeaders, lbData, 'alltime', true)
                    }
                    bandwidthData={analysisFilteredBandwidthData}
                    bandwidthHeaders={bandwidthHeaders}
                    excludedMembers={isAdmin ? [] : ['Manpreet', 'Vinay']}
                  />
                ) : (
                  <PmStatusOverview
                    data={analysisFilteredBandwidthData}
                    headers={bandwidthHeaders}
                    pmUsers={pmUsers}
                    layout="list"
                  />
                )}
              </div>
            </section>
          )}

          {/* ── Tools: Clock Room / Holiday Calendar / AI Tools ── */}
          {(
            <section
              className="cn-card rounded-lg border transition-colors"
              style={{ display: isTools ? 'block' : 'none', background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}
            >
              <div className="flex items-center gap-3 px-4 sm:px-6 pt-4 sm:pt-5 pb-0 flex-wrap">
                {([
                  { key: 'clock', label: 'Clock Room' },
                  { key: 'holiday', label: 'Holiday Calendar' },
                  { key: 'ai', label: 'AI Tools' },
                ] as const).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setToolsSubTab(tab.key)}
                    className="px-4 py-2 text-sm font-semibold border-b-2 transition-all cursor-pointer"
                    style={{
                      borderColor: toolsSubTab === tab.key ? 'var(--cn-accent)' : 'transparent',
                      color: toolsSubTab === tab.key ? 'var(--cn-accent)' : 'var(--cn-text-muted)',
                      background: 'transparent',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div style={{ borderTop: '1px solid var(--cn-border)' }} />
              <div className="p-3 sm:p-6 space-y-4">
                <div style={{ display: toolsSubTab === 'clock' ? 'block' : 'none' }}><ClockRoom /></div>
                {toolsSubTab === 'holiday' && (
                  <HolidayCalendar data={holidayData} headers={Object.keys(holidayData[0] ?? {})} />
                )}
                {toolsSubTab === 'ai' && (
                  <>
                    <NewsTicker data={newsData} />
                    <AITools data={aiToolsData} headers={Object.keys(aiToolsData[0] ?? {})} />
                  </>
                )}
              </div>
            </section>
          )}

          {/* ── PM Project Bandwidth: All Projects / My Projects ── */}
          {isPmBandwidth && (
            <section
              className="cn-card rounded-lg border transition-colors"
              style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}
            >
              <div className="flex items-center gap-3 px-4 sm:px-6 pt-4 sm:pt-5 pb-0 flex-wrap">
                {([
                  { key: 'all', label: 'All Projects' },
                  { key: 'mine', label: 'My Projects' },
                ] as const).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setPmBandwidthSubTab(tab.key)}
                    className="px-4 py-2 text-sm font-semibold border-b-2 transition-all cursor-pointer"
                    style={{
                      borderColor: pmBandwidthSubTab === tab.key ? 'var(--cn-accent)' : 'transparent',
                      color: pmBandwidthSubTab === tab.key ? 'var(--cn-accent)' : 'var(--cn-text-muted)',
                      background: 'transparent',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div style={{ borderTop: '1px solid var(--cn-border)' }} />
              <div className="p-3 sm:p-6">
                <PMProjectBandwidth
                  data={
                    pmBandwidthSubTab === 'mine'
                      ? pmBandwidthData.filter(r => String(r['__pm'] ?? '').trim().toLowerCase() === user.displayName.trim().toLowerCase())
                      : pmBandwidthData
                  }
                  headers={pmBandwidthHeaders}
                  canEdit={pmBandwidthSubTab === 'mine'}
                  onCellChange={pmBandwidthSubTab === 'mine' ? handlePmBandwidthChange : undefined}
                  allData={pmBandwidthData}
                />
              </div>
            </section>
          )}

          {/* ── Team Bandwidth: Web / Marketing team workload ── */}
          {isTeamBandwidth && (
            <section
              className="cn-card rounded-lg border transition-colors"
              style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}
            >
              {!lockedTeamBandwidthTeam && (
                <div className="flex items-center gap-3 px-4 sm:px-6 pt-4 sm:pt-5 pb-0 flex-wrap">
                  {([
                    { key: 'web', label: 'Web' },
                    { key: 'marketing', label: 'Marketing' },
                  ] as const).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setTeamBandwidthSubTab(tab.key)}
                      className="px-4 py-2 text-sm font-semibold border-b-2 transition-all cursor-pointer"
                      style={{
                        borderColor: teamBandwidthSubTab === tab.key ? 'var(--cn-accent)' : 'transparent',
                        color: teamBandwidthSubTab === tab.key ? 'var(--cn-accent)' : 'var(--cn-text-muted)',
                        background: 'transparent',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ borderTop: '1px solid var(--cn-border)' }} />
              <div className="p-3 sm:p-6">
                {teamBandwidthSubTab === 'web' ? (
                  <ResourceStatusGrid
                    key="team-bandwidth-web"
                    sheet1Data={webBandwidthData}
                    sheet1Headers={bandwidthHeaders}
                    availData={webAvailData}
                    availHeaders={availHeaders}
                    onStatusChange={handleBandwidthStatusChange}
                    pmStatusColName={bandwidthHeaders.find(h => h.toLowerCase().includes('pm status'))}
                    canEditPmStatus={isAdmin || isPmTier || isTeamAdmin}
                    isAdmin={isAdmin}
                    currentUserEmail={user.email}
                    autoOpenFirst
                  />
                ) : marketingTeamData.length === 0 ? (
                  <div className="text-center py-16 text-sm" style={{ color: 'var(--cn-text-muted)' }}>
                    No Marketing tasks yet.
                  </div>
                ) : (
                  <ResourceStatusGrid
                    key="team-bandwidth-marketing"
                    sheet1Data={marketingTeamData}
                    sheet1Headers={marketingTeamHeaders}
                    availData={marketingAvailData}
                    onStatusChange={handleMarketingTeamChange}
                    pmStatusColName={marketingTeamHeaders.find(h => h.toLowerCase().includes('pm status'))}
                    canEditPmStatus={isAdmin || isPmTier || isTeamAdmin}
                    isAdmin={isAdmin}
                    currentUserEmail={user.email}
                    autoOpenFirst
                  />
                )}
              </div>
            </section>
          )}

          {/* ── Tasks Overview (Web / Marketing) ──────────────────────────────────── */}
          {isResourceOverview && (
            <section className="cn-card rounded-lg border transition-colors" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
              {!lockedTasksOverviewTeam && (
                <div className="flex items-center gap-3 px-4 sm:px-6 pt-4 sm:pt-5 pb-0 flex-wrap">
                  {([
                    { key: 'web', label: 'Web' },
                    { key: 'marketing', label: 'Marketing' },
                  ] as const).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setTasksOverviewTeam(tab.key)}
                      className="px-4 py-2 text-sm font-semibold border-b-2 transition-all cursor-pointer"
                      style={{
                        borderColor: tasksOverviewTeam === tab.key ? 'var(--cn-accent)' : 'transparent',
                        color: tasksOverviewTeam === tab.key ? 'var(--cn-accent)' : 'var(--cn-text-muted)',
                        background: 'transparent',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ borderTop: '1px solid var(--cn-border)' }} />
              <div className="p-3 sm:p-6">
                {tasksOverviewTeam === 'web' ? (
                  <ResourceOverview
                    data={webBandwidthData}
                    headers={bandwidthHeaders}
                    availData={webAvailData}
                    availHeaders={availHeaders}
                    onStatusChange={handleBandwidthStatusChange}
                    pmStatusColName={bandwidthHeaders.find(h => h.toLowerCase().includes('pm status'))}
                    currentUserName={user.displayName}
                    currentUserEmail={user.email}
                    showFilter={isPmTier || isAdmin || isTeamAdmin}
                    canEditPmStatus={!isIndividual}
                    canEditStatus={isIndividual}
                    canCopy={isIndividual}
                    defaultFilter="me"
                    restrictPmStatusToOwn={isPmTier}
                    vinayQaMode={isVinay}
                    showQaTab={isAdmin || isPmTier}
                    qaData={qaData}
                    qaHeaders={qaHeaders}
                    onQaCellChange={handleQaChange}
                  />
                ) : marketingTeamData.length === 0 ? (
                  <div className="text-center py-16 text-sm" style={{ color: 'var(--cn-text-muted)' }}>
                    No Marketing tasks yet.
                  </div>
                ) : (
                  <ResourceOverview
                    key="tasks-overview-marketing"
                    data={marketingTeamData}
                    headers={marketingTeamHeaders}
                    availData={marketingAvailData}
                    onStatusChange={handleMarketingTeamChange}
                    pmStatusColName={marketingTeamHeaders.find(h => h.toLowerCase().includes('pm status'))}
                    currentUserName={user.displayName}
                    currentUserEmail={user.email}
                    showFilter={isPmTier || isAdmin || isTeamAdmin}
                    canEditPmStatus={!isIndividual}
                    canEditStatus={isIndividual}
                    canCopy={isIndividual}
                    defaultFilter="me"
                    restrictPmStatusToOwn={isPmTier}
                  />
                )}
              </div>
            </section>
          )}

          {/* ── Add Task (Google Form) ──────────────────────────────────────────── */}
          {isAddTask && (
            <section
              className="cn-card rounded-lg p-3 sm:p-6 border transition-colors space-y-4"
              style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}
            >
              {!lockedTeam && (
                <div className="flex items-center gap-3 flex-wrap">
                  {([
                    { key: 'web', label: 'Web' },
                    { key: 'marketing', label: 'Marketing' },
                  ] as const).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setAddTaskTeam(tab.key)}
                      className="px-4 py-2 text-sm font-semibold border-b-2 transition-all cursor-pointer"
                      style={{
                        borderColor: addTaskTeam === tab.key ? 'var(--cn-accent)' : 'transparent',
                        color: addTaskTeam === tab.key ? 'var(--cn-accent)' : 'var(--cn-text-muted)',
                        background: 'transparent',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
              {(() => {
              const addTaskFormUrl = addTaskTeam === 'web'
                ? 'https://docs.google.com/forms/d/e/1FAIpQLSfBDYMZ6trWVeDVRhqz2AGUpcAfzlItvHTQLhUu8Ooly9h7YA'
                : 'https://docs.google.com/forms/d/e/1FAIpQLSdja_uZyhdM9hBSyjQjQ_ZB0ahKzF3JwRdXIAEofxM9RTnFeA';
              return (
              <>
              {/* ── Success banner ── */}
              {formSubmitted && (
                <div className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium animate-pulse"
                  style={{ background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.3)', color: '#16a34a' }}>
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  🎉 Task submitted successfully! Your response has been recorded. The team will review and assign it shortly.
                </div>
              )}
              <div className="flex gap-6 items-start">
                {/* ── Left: Info (40%) ── */}
                <div className="space-y-5" style={{ flex: '0 0 50%' }}>

                  {/* Header */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--cn-accent)' }}>Task Submission</p>
                    <h2 className="font-bold text-base" style={{ color: 'var(--cn-text-primary)' }}>Instructions &amp; Guidelines</h2>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--cn-text-muted)' }}>Follow the steps below to ensure smooth task allocation and team coordination.</p>
                  </div>

                  <div className="h-px" style={{ background: 'var(--cn-border)' }} />

                  {/* Daily Workflow */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--cn-text-muted)' }}>Daily Workflow</p>
                    {[
                      { step: '01', time: 'Before 9:45 AM', desc: 'Complete this form each morning with all tasks for the day.' },
                      { step: '02', time: '9:45 – 10:00 AM', desc: 'Standup meeting to review and discuss submitted tasks.' },
                      { step: '03', time: 'By 10:00 AM', desc: 'Tasks assigned to team. Urgent requests handled on priority.' },
                    ].map(({ step, time, desc }) => (
                      <div key={step} className="flex gap-2.5 items-start">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5" style={{ background: 'rgba(254,74,35,0.10)', color: 'var(--cn-accent)' }}>{step}</div>
                        <div>
                          <p className="text-xs font-semibold leading-tight" style={{ color: 'var(--cn-text-primary)' }}>{time}</p>
                          <p className="text-[11px] leading-snug mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="h-px" style={{ background: 'var(--cn-border)' }} />

                  {/* Priority Levels */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--cn-text-muted)' }}>Priority Levels</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Urgent', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', deadline: "Today" },
                        { label: 'High',   color: '#f97316', bg: 'rgba(249,115,22,0.08)', deadline: '1–2 Days' },
                        { label: 'Medium', color: '#eab308', bg: 'rgba(234,179,8,0.08)',  deadline: '2–3 Days' },
                        { label: 'Low',    color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  deadline: '3+ Days' },
                      ].map(({ label, color, bg, deadline }) => (
                        <div key={label} className="flex items-center justify-between rounded px-2.5 py-1.5" style={{ background: bg }}>
                          <span className="text-[11px] font-semibold" style={{ color }}>{label}</span>
                          <span className="text-[10px]" style={{ color: 'var(--cn-text-muted)' }}>{deadline}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="h-px" style={{ background: 'var(--cn-border)' }} />

                  {/* Dashboard Info */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--cn-text-muted)' }}>About This Dashboard</p>
                    <ul className="space-y-1.5">
                      {[
                        { label: 'Task Board', desc: 'Live view of all active task assignments.' },
                        { label: 'Resource Availability', desc: 'Workload & availability of each member.' },
                        { label: 'Dashboard', desc: 'Analytics & progress overview for management.' },
                        { label: 'Team', desc: 'Member profiles with daily task summaries and bucket.' },
                      ].map(({ label, desc }) => (
                        <li key={label} className="flex gap-1.5 text-[11px]" style={{ color: 'var(--cn-text-muted)' }}>
                          <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--cn-accent)' }} />
                          <span><span className="font-medium" style={{ color: 'var(--cn-text-primary)' }}>{label}:</span> {desc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="h-px" style={{ background: 'var(--cn-border)' }} />

                  {/* Fallback Access */}
                  <div className="rounded-lg px-3 py-3 space-y-2" style={{ background: 'rgba(254,74,35,0.06)', border: '1px solid rgba(254,74,35,0.15)' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--cn-text-muted)' }}>Having Trouble?</p>
                    <p className="text-[11px] leading-snug" style={{ color: 'var(--cn-text-muted)' }}>If entries aren't visible or the form isn't loading, use the direct links below.</p>
                    <div className="flex flex-col gap-1">
                        <a
                          href={`${addTaskFormUrl}/viewform`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-[11px] font-medium transition-opacity hover:opacity-70"
                          style={{ color: 'var(--cn-accent)' }}
                        >
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          Open Google Form Directly
                        </a>
                    </div>
                  </div>

                </div>

                {/* ── Right: iframe (60%) ── */}
                <div style={{ flex: '0 0 50%' }}>
                  <iframe
                    key={addTaskTeam}
                    src={`${addTaskFormUrl}/viewform?embedded=true`}
                    width="100%"
                    style={{ height: '80vh', minHeight: 600, border: 'none', borderRadius: 8 }}
                    frameBorder={0}
                    marginHeight={0}
                    marginWidth={0}
                    onLoad={handleIframeLoad}
                  >
                    Loading…
                  </iframe>
                </div>
              </div>
              </>
              );
              })()}
            </section>
          )}

          {/* ── Leaderboard — Web only for now; Marketing has no points/scoring
               system yet, so a Marketing tab would just show an all-zero board ── */}
          {isLeaderboard && (
            <section
              className="cn-card rounded-lg p-4 sm:p-8 border transition-colors"
              style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}
            >
              <Leaderboard
                bandwidthData={activeBandwidthData}
                bandwidthHeaders={bandwidthHeaders}
                leaderboardData={lbData}
                user={user}
                onRefreshLb={fetchLb}
                lbLoading={lbLoading}
              />
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
