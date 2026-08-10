'use client';

import { useMemo, useState } from 'react';
import { SheetData } from '@/lib/googleSheets';
import { Trophy, RefreshCw } from 'lucide-react';
import { memberColor } from '@/lib/memberColors';
import { AuthUser, isAdminTierRole } from '@/lib/auth';
import { parseHours } from './SpecificCharts';

interface Props {
  bandwidthData: SheetData[];
  bandwidthHeaders: string[];
  leaderboardData: SheetData[];
  user?: AuthUser;
  onRefreshLb?: () => void;
  lbLoading?: boolean;
}

export type LBFilter = 'alltime' | 'monthly';

export interface PersonStats {
  name: string;
  autoPoints: number;
  manualPoints: number;
  manualPositive: number;
  manualNegative: number;
  totalPoints: number;
  // counts
  taskClosedCount: number;
  pmApprovedCount: number;
  qaTestingCount: number;
  totalTasks: number;
  // hours
  taskClosedHours: number;
  pmApprovedHours: number;
  qaTestingHours: number;
  // points per category
  ptTaskClosed: number;
  ptPMApproved: number;
  ptQATesting: number;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function parseAnyDate(val: unknown): Date | null {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;
  const num = Number(s);
  if (!isNaN(num) && num > 40000) return new Date((num - 25569) * 86400 * 1000);
  const parts = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (parts) {
    const [, a, b, y] = parts;
    const d1 = new Date(+y, +b - 1, +a);
    const d2 = new Date(+y, +a - 1, +b);
    if (!isNaN(d1.getTime())) return d1;
    if (!isNaN(d2.getTime())) return d2;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}


function getMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

// ─── Score calculator ─────────────────────────────────────────────────────────
export function calcLeaderboard(
  bandwidthData: SheetData[],
  bandwidthHeaders: string[],
  leaderboardData: SheetData[],
  filter: LBFilter,
  skipStartCutoff = false
): PersonStats[] {
  const statusCol   = bandwidthHeaders.find(h => h.toLowerCase().includes('task status'));
  const pmStatusCol = bandwidthHeaders.find(h => h.toLowerCase().includes('pm status'));
  const personCol   = bandwidthHeaders.find(h => h.toLowerCase().includes('assigned person'));
  const tsCol       = bandwidthHeaders.find(h => h.toLowerCase().includes('timestamp'));
  const timeEstCol  = bandwidthHeaders.find(h => h.toLowerCase().includes('total time'))
    ?? bandwidthHeaders.find(h => h.toLowerCase().includes('time estimation') || h.toLowerCase().includes('time estimate') || h.toLowerCase().includes('estimation'));
  if (!personCol) return [];

  const cutoff    = filter === 'monthly' ? getMonthStart() : null;
  const lbStart   = new Date(2026, 5, 1); // June 1, 2026 — leaderboard data starts here

  const filteredBw = tsCol
    ? bandwidthData.filter(r => {
        const d = parseAnyDate(r[tsCol]);
        if (!d) return false;
        if (!skipStartCutoff && filter !== 'alltime' && d < lbStart) return false;
        return cutoff ? d >= cutoff : true;
      })
    : bandwidthData;

  const filteredManual = cutoff
    ? leaderboardData.filter(r => { const d = parseAnyDate(r['Timestamp']); return d && d >= cutoff; })
    : leaderboardData;

  // Temporarily excluded — separate scoring strategy being planned
  const EXCLUDED: string[] = [];

  const persons = [...new Set(bandwidthData.map(r => String(r[personCol] ?? '').trim()).filter(Boolean))]
    .filter(name => !EXCLUDED.includes(name.toLowerCase()));

  return persons.map(name => {
    const myTasks = filteredBw.filter(r => String(r[personCol] ?? '').trim().toLowerCase() === name.toLowerCase());
    let autoPoints = 0;
    let taskClosedCount = 0, pmApprovedCount = 0;
    let taskClosedHours = 0, pmApprovedHours = 0, qaTestingHours = 0;
    let qaTestingCount = 0;
    let ptTaskClosed = 0, ptPMApproved = 0, ptQATesting = 0;

    myTasks.forEach(task => {
      const status   = statusCol   ? String(task[statusCol]   ?? '').trim().toLowerCase() : '';
      const pmStatus = pmStatusCol ? String(task[pmStatusCol] ?? '').trim().toLowerCase() : '';
      const taskName = String(task['Task Name'] ?? '').trim().toLowerCase();
      let hours      = timeEstCol  ? parseHours(String(task[timeEstCol] ?? '')) : 0;

      // Check if task is QA/Testing — only applies to Vinay
      // Deduct 70%, keep 30% of hours. Points = actualHours × 2 (base rate only, no TC/PA rates)
      const isTestingTask = name.toLowerCase() === 'vinay' && /qa|test|testing/i.test(taskName);
      if (isTestingTask) {
        const isCompleted = pmStatus === 'approved' || pmStatus === 'submitted to client' || pmStatus === 'ticketclosed' || status === 'task closed';
        if (isCompleted) {
          const actualHours = hours * 0.3; // deduct 70%, keep 30%
          const pts = Math.round(actualHours * 2);
          autoPoints += pts; ptQATesting += pts;
          qaTestingHours += actualHours;
          qaTestingCount++;
        }
        return; // skip Task Closed / PM Approved logic entirely
      }

      // PM Approved / Submitted to Client: 2 pts per 30-min slab (hours × 2 × 2)
      // Only count once the task is also closed — avoids inflating points for in-progress tasks
      if ((pmStatus === 'approved' || pmStatus === 'submitted to client' || pmStatus === 'ticketclosed') && status === 'task closed') {
        const pts = Math.round(hours * 2 * 2);
        autoPoints += pts; ptPMApproved += pts;
        pmApprovedHours += hours; pmApprovedCount++;
      }

      // Task Closed: additional 3 pts per 30-min slab on top of PM Approved (hours × 2 × 3)
      if (status === 'task closed') {
        const pts = Math.round(hours * 2 * 3);
        autoPoints += pts; ptTaskClosed += pts;
        taskClosedHours += hours; taskClosedCount++;
      }
    });

    const myManual     = filteredManual.filter(r => String(r['Select Resource'] ?? '').trim().toLowerCase() === name.toLowerCase());
    const manualPoints = myManual.reduce((s, r) => {
      // Parse P/M value from any column: P40 = +40, M40 = -40, plain number = positive
      const parsePM = (val: unknown): number => {
        const raw = String(val ?? '').trim();
        if (!raw) return 0;
        if (/^P(\d+(\.\d+)?)$/i.test(raw)) return parseFloat(raw.slice(1));
        if (/^M(\d+(\.\d+)?)$/i.test(raw)) return -parseFloat(raw.slice(1));
        const n = parseFloat(raw.replace('%', ''));
        return isNaN(n) ? 0 : n;
      };

      const cols = [
        'Positive Feedback [Client gave positive feedback]',
        'Positive Feedback [Zero revisions needed on delivery]',
        'Positive Feedback [Delivered before the deadline]',
        'Positive Feedback [Helped team member/knowledge sharing]',
        'Positive Feedback [Took an urgent task outside the scope]',
        'Positive Feedback [Other Feedback]',
        'Negative Feedback [The client complained about the quality]',
        'Negative Feedback [Multiple revisions (poor quality)]',
        'Negative Feedback [Missed the deadline without communication]',
        'Negative Feedback [Task reassigned due to errors]',
        'Negative Feedback [Other Feedback]',
        'Keka Objectives Points',
        'Other Feedback ( Positive or Negative )',
      ];

      const pts = cols.reduce((t, col) => t + parsePM(r[col]), 0);
      return s + pts;
    }, 0);

    const manualPositive = myManual.reduce((s, r) => {
      const parsePM = (val: unknown): number => {
        const raw = String(val ?? '').trim();
        if (!raw) return 0;
        if (/^P(\d+(\.\d+)?)$/i.test(raw)) return parseFloat(raw.slice(1));
        if (/^M(\d+(\.\d+)?)$/i.test(raw)) return 0;
        const n = parseFloat(raw.replace('%', ''));
        return isNaN(n) || n < 0 ? 0 : n;
      };
      const cols = [
        'Positive Feedback [Client gave positive feedback]',
        'Positive Feedback [Zero revisions needed on delivery]',
        'Positive Feedback [Delivered before the deadline]',
        'Positive Feedback [Helped team member/knowledge sharing]',
        'Positive Feedback [Took an urgent task outside the scope]',
        'Positive Feedback [Other Feedback]',
        'Keka Objectives Points',
        'Other Feedback ( Positive or Negative )',
      ];
      return s + cols.reduce((t, col) => t + parsePM(r[col]), 0);
    }, 0);

    const manualNegative = myManual.reduce((s, r) => {
      const parsePM = (val: unknown): number => {
        const raw = String(val ?? '').trim();
        if (!raw) return 0;
        if (/^M(\d+(\.\d+)?)$/i.test(raw)) return -parseFloat(raw.slice(1));
        const n = parseFloat(raw.replace('%', ''));
        return isNaN(n) || n > 0 ? 0 : n;
      };
      const cols = [
        'Negative Feedback [The client complained about the quality]',
        'Negative Feedback [Multiple revisions (poor quality)]',
        'Negative Feedback [Missed the deadline without communication]',
        'Negative Feedback [Task reassigned due to errors]',
        'Negative Feedback [Other Feedback]',
        'Other Feedback ( Positive or Negative )',
      ];
      return s + cols.reduce((t, col) => t + parsePM(r[col]), 0);
    }, 0);

    return {
      name, autoPoints, manualPoints, totalPoints: autoPoints + manualPoints,
      manualPositive, manualNegative,
      taskClosedCount, pmApprovedCount, qaTestingCount, totalTasks: myTasks.length,
      taskClosedHours, pmApprovedHours, qaTestingHours,
      ptTaskClosed, ptPMApproved, ptQATesting,
    };
  }).sort((a, b) => b.totalPoints - a.totalPoints);
}

// ─── Compact point formatter  (10,055 → 10k, 8,355 → 8.4k) ─────────────────
function fmtPts(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return (k % 1 === 0 ? `${k}` : `${k.toFixed(1)}`) + 'k';
  }
  return String(n);
}

// ─── Medal config ────────────────────────────────────────────────────────────
const MEDALS: Record<number, { color: string; bg: string; shadow: string; label: string }> = {
  1: { color: '#f59e0b', bg: 'linear-gradient(135deg,#fef3c7,#fbbf24)', shadow: 'rgba(245,158,11,0.4)', label: '🥇' },
  2: { color: '#94a3b8', bg: 'linear-gradient(135deg,#f1f5f9,#cbd5e1)', shadow: 'rgba(148,163,184,0.4)', label: '🥈' },
  3: { color: '#b45309', bg: 'linear-gradient(135deg,#fef3c7,#d97706)', shadow: 'rgba(180,83,9,0.4)',   label: '🥉' },
};

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const color     = memberColor(name);
  const photoName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  const border    = 3;

  return imgError ? (
    <div className="rounded-full flex items-center justify-center font-extrabold text-white shadow-lg shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38, background: color }}>
      {name.charAt(0).toUpperCase()}
    </div>
  ) : (
    <div className="rounded-full shrink-0 shadow-md" style={{ padding: border, background: color, width: size + border * 2, height: size + border * 2 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/team/${photoName}.png`} alt={name} onError={() => setImgError(true)}
        className="rounded-full object-cover w-full h-full" />
    </div>
  );
}

// ─── Medal badge ──────────────────────────────────────────────────────────────
const MEDAL_EMOJI: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
const MEDAL_TEXT_COLOR: Record<number, string> = {
  1: '#92400e',   // dark amber on gold bg
  2: '#374151',   // dark gray on silver bg
  3: '#fff',      // white on bronze bg
};

function MedalBadge({ rank, size = 32 }: { rank: number; size?: number }) {
  if (rank <= 3) {
    const m = MEDALS[rank as 1|2|3];
    return (
      <div className="rounded-full flex items-center justify-center font-extrabold shadow-md shrink-0"
        style={{ width: size, height: size, background: m.bg, color: MEDAL_TEXT_COLOR[rank],
          fontSize: size * 0.36, border: `2px solid ${m.color}`, boxShadow: `0 2px 8px ${m.shadow}` }}>
        {rank}
      </div>
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center font-bold shrink-0"
      style={{ width: size, height: size, background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)', fontSize: size * 0.34 }}>
      {rank}
    </div>
  );
}

// ─── SVG Medal Icon (ribbon + circle with star border) ───────────────────────
const MEDAL_SVG_COLORS: Record<number, {
  ribbon: string; ribbonDark: string;
  outer: string; inner: string; shine: string; text: string;
}> = {
  1: { ribbon: '#ef4444', ribbonDark: '#991b1b', outer: '#D4A017', inner: '#FFD700', shine: '#FFF9C4', text: '#7C4700' },
  2: { ribbon: '#3b82f6', ribbonDark: '#1e40af', outer: '#6B7280', inner: '#D1D5DB', shine: '#F9FAFB', text: '#374151' },
  3: { ribbon: '#16a34a', ribbonDark: '#14532d', outer: '#92400E', inner: '#CD7F32', shine: '#FDE68A', text: '#431407' },
};

function MedalIcon({ rank, size = 52 }: { rank: number; size?: number }) {
  if (rank > 3) return null;
  const c  = MEDAL_SVG_COLORS[rank as 1|2|3];
  const vw = 56;
  const vh = 72;
  const cx = 28, cy = 50, r = 20;
  // 8-point star polygon
  const star = Array.from({ length: 8 }, (_, i) => {
    const a  = (i * 45 - 90) * Math.PI / 180;
    const rr = i % 2 === 0 ? r + 3 : r - 2;
    return `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`;
  }).join(' ');
  return (
    <svg width={size} height={size * (vh / vw)} viewBox={`0 0 ${vw} ${vh}`} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Left ribbon strip */}
      <rect x="21" y="0" width="7" height="26" rx="3"
        fill={c.ribbon} transform="rotate(-14 21 0)" />
      <rect x="22" y="0" width="3" height="26" rx="2"
        fill={c.ribbonDark} opacity="0.5" transform="rotate(-14 21 0)" />
      {/* Right ribbon strip */}
      <rect x="28" y="0" width="7" height="26" rx="3"
        fill={c.ribbon} transform="rotate(14 35 0)" />
      <rect x="32" y="0" width="3" height="26" rx="2"
        fill={c.ribbonDark} opacity="0.5" transform="rotate(14 35 0)" />
      {/* Star border */}
      <polygon points={star} fill={c.outer} />
      {/* Medal outer ring */}
      <circle cx={cx} cy={cy} r={r} fill={c.outer} />
      {/* Medal inner face */}
      <circle cx={cx} cy={cy} r={r - 3} fill={c.inner} />
      {/* Shine highlight */}
      <ellipse cx={cx - 5} cy={cy - 6} rx={6} ry={4} fill={c.shine} opacity="0.7" />
      {/* Rank number */}
      <text x={cx} y={cy + 6} textAnchor="middle"
        fontSize="14" fontWeight="900" fill={c.text}
        fontFamily="system-ui, -apple-system, sans-serif">
        {rank}
      </text>
    </svg>
  );
}

// Medal emoji chip (kept for inline list row use)
function MedalChip({ rank }: { rank: number }) {
  if (rank > 3) return null;
  return <MedalIcon rank={rank} size={38} />;
}

// ─── Podium styles indexed by RANK (1/2/3) — solid metallic colours ───────────
const PODIUM_BY_RANK: Record<number, { height: number; color: string; label: string; glow: string; textColor: string }> = {
  1: { height: 200, color: '#FFC200', label: '1st', glow: 'rgba(255,194,0,0.45)',   textColor: '#7C4700' },
  2: { height: 155, color: '#C0C0C0', label: '2nd', glow: 'rgba(160,160,160,0.35)', textColor: '#374151' },
  3: { height: 120, color: '#CD7F32', label: '3rd', glow: 'rgba(205,127,50,0.40)',  textColor: '#431407' },
};

// ─── Top performer hero (clean, no breakdown) ────────────────────────────────
function PodiumTop({ rankings, onSelect, dimmed }: {
  rankings: PersonStats[]; onSelect: (n: string) => void; dimmed: boolean;
}) {
  const first = rankings[0];
  if (!first) return null;
  const color = memberColor(first.name);

  return (
    <button
      onClick={() => onSelect(first.name)}
      className="relative w-full rounded-2xl overflow-hidden border flex items-center gap-5 px-8 py-5 cursor-pointer transition-all"
      style={{
        background:   `linear-gradient(135deg, ${color}14 0%, transparent 60%)`,
        borderColor:  dimmed ? 'rgba(254,74,35,0.25)' : '#FE4A23',
        borderWidth:  2,
      }}
    >
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 50% 80% at 10% 50%, ${color}12 0%, transparent 65%)` }} />

      {/* Crown + Avatar */}
      <div className="relative shrink-0 flex flex-col items-center gap-1">
        <span className="text-2xl select-none leading-none">👑</span>
        <Avatar name={first.name} size={80} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 mb-1">
          <MedalIcon rank={1} size={28} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>Top Performer</span>
        </div>
        <p className="font-extrabold text-2xl leading-tight" style={{ color: 'var(--cn-text-primary)' }}>{first.name}</p>
        <div className="mt-2 h-1.5 rounded-full overflow-hidden w-40" style={{ background: 'var(--cn-bg-input)' }}>
          <div className="h-full rounded-full" style={{ width: '100%', background: color }} />
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--cn-text-muted)' }}>100% of top score</p>
      </div>

      {/* Points */}
      <div className="shrink-0 text-right">
        <p className="font-extrabold text-5xl tabular-nums leading-none" style={{ color }}>
          {fmtPts(first.totalPoints)}
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--cn-text-muted)' }}>points</p>
      </div>
    </button>
  );
}

// ─── Ranked row ───────────────────────────────────────────────────────────────
function RankRow({ stats, rank, maxPts, selected, onSelect }: {
  stats: PersonStats; rank: number; maxPts: number; selected: boolean; onSelect: () => void;
}) {
  const pct   = maxPts > 0 ? Math.min((stats.totalPoints / maxPts) * 100, 100) : 0;
  const color = memberColor(stats.name);

  return (
    <button onClick={onSelect}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left cursor-pointer"
      style={{
        background:   selected ? 'rgba(254,74,35,0.08)' : 'var(--cn-bg-input)',
        border:       selected ? '2px solid #FE4A23'    : '2px solid transparent',
        boxShadow:    selected ? '0 0 0 1px rgba(254,74,35,0.2)' : 'none',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = 'var(--cn-bg-hover)'; }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = 'var(--cn-bg-input)'; }}
    >
      {/* Plain rank number — no medals */}
      <span className="w-7 text-center text-xs font-bold shrink-0 tabular-nums"
        style={{ color: 'var(--cn-text-muted)' }}>#{rank}</span>
      <Avatar name={stats.name} size={36} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate" style={{ color: selected ? color : 'var(--cn-text-primary)' }}>{stats.name}</p>
        <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--cn-border)' }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
      <div className="text-right shrink-0">
        <span className="font-extrabold tabular-nums text-sm" style={{ color: 'var(--cn-text-primary)' }}>{fmtPts(stats.totalPoints)}</span>
        <span className="text-xs ml-1" style={{ color: 'var(--cn-text-muted)' }}>pts</span>
      </div>
    </button>
  );
}

// ─── Detail panel (right side) ────────────────────────────────────────────────
function DetailPanel({ stats, rank, maxPts, isAdmin }: { stats: PersonStats; rank: number; maxPts: number; isAdmin?: boolean }) {
  const color   = memberColor(stats.name);
  const medal   = rank <= 3 ? MEDALS[rank as 1|2|3] : null;
  const pct     = maxPts > 0 ? Math.round((stats.totalPoints / maxPts) * 100) : 0;
  const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`) + ' pts';

  const statRows = [
    { label: 'Task Closed',                       pts: stats.ptTaskClosed,  color: '#065f46', show: true },
    { label: 'PM Status', pts: stats.ptPMApproved,  color: '#f59e0b', show: true },
    { label: 'QA Testing', pts: stats.ptQATesting, color: '#9333ea', show: stats.ptQATesting > 0 },
    { label: 'Rewards',   pts: stats.manualPositive, color: '#16a34a', show: stats.manualPositive > 0 },
    { label: 'Penalties', pts: stats.manualNegative, color: '#ef4444', show: stats.manualNegative < 0 },
  ].filter(r => r.show);

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
      {/* Compact header: name + rank + points + progress */}
      <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--cn-border)' }}>
        <p className="font-extrabold text-base" style={{ color: 'var(--cn-text-primary)' }}>{stats.name}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>Rank #{rank}</p>
        <p className="font-extrabold text-3xl tabular-nums mt-2 leading-none" style={{ color }}>
          {fmtPts(stats.totalPoints)}
          <span className="text-sm font-normal ml-1" style={{ color: 'var(--cn-text-muted)' }}>pts</span>
        </p>
        <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--cn-bg-input)' }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, transition: 'width 0.8s ease' }} />
        </div>
        <p className="text-[10px] mt-1" style={{ color: 'var(--cn-text-muted)' }}>{pct}% of top score</p>
      </div>

      {/* Stats breakdown with points */}
      <div className="p-4 space-y-1.5">
        <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--cn-text-muted)' }}>Breakdown</p>
        {statRows.map(row => (
          <div key={row.label} className="flex items-center justify-between gap-2 py-0.5">
            <span className="text-xs flex-1 min-w-0" style={{ color: 'var(--cn-text-secondary)' }}>{row.label}</span>
            <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-full shrink-0"
              style={{ background: `${row.color}18`, color: row.color }}>
              {fmt(row.pts)}
            </span>
          </div>
        ))}
        {/* Total auto pts */}
        <div className="flex items-center justify-between gap-2 pt-2 mt-1 border-t" style={{ borderColor: 'var(--cn-border)' }}>
          <span className="text-xs font-bold" style={{ color: 'var(--cn-text-primary)' }}>Total</span>
          <span className="text-sm font-extrabold tabular-nums" style={{ color: medal ? medal.color : color }}>{fmtPts(stats.totalPoints)} pts</span>
        </div>
      </div>


    </div>
  );
}

// ─── Mini stat line (for Previous Winners cards) ─────────────────────────────
function StatLine({ label, value, pts, color }: { label: string; value: number | null; pts: string; color: string }) {
  return (
    <div className="flex items-center justify-between gap-1 text-[11px]">
      <span style={{ color: 'var(--cn-text-muted)' }}>
        {label}{value !== null ? ` (${value})` : ''}
      </span>
      <span className="font-bold px-1.5 py-px rounded-full" style={{ background: `${color}18`, color }}>{pts}</span>
    </div>
  );
}

// ─── Previous Month Winners ───────────────────────────────────────────────────
function PreviousWinners({ bandwidthData, bandwidthHeaders, leaderboardData }: Props) {
  const tsCol      = bandwidthHeaders.find(h => h.toLowerCase().includes('timestamp'));
  const statusCol  = bandwidthHeaders.find(h => h.toLowerCase().includes('task status'));
  const pmCol      = bandwidthHeaders.find(h => h.toLowerCase().includes('pm status'));
  const personCol  = bandwidthHeaders.find(h => h.toLowerCase().includes('assigned person'));

  if (!tsCol || !personCol) return null;

  const now = new Date();
  // Build last 4 complete months
  const months = Array.from({ length: 4 }, (_, i) => {
    const d    = new Date(now.getFullYear(), now.getMonth() - (i + 1), 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return {
      label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      start: d,
      end:   next,
    };
  });

  const monthResults = months.map(m => {
    const bwSlice = bandwidthData.filter(r => {
      const d = parseAnyDate(r[tsCol]); return d && d >= m.start && d < m.end;
    });
    const lbSlice = leaderboardData.filter(r => {
      const d = parseAnyDate(r['Timestamp']); return d && d >= m.start && d < m.end;
    });
    const rankings = calcLeaderboard(bwSlice, bandwidthHeaders, lbSlice, 'alltime', true);
    return { label: m.label, top3: rankings.slice(0, 3) };
  }).filter(m => m.top3.length > 0 && m.top3[0].totalPoints > 0); // hide months with no real data

  if (!monthResults.length) return null;

  return (
    <div className="cn-card border rounded-2xl overflow-hidden"
      style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: 'var(--cn-border)' }}>
        <span className="text-xl">📅</span>
        <div>
          <h3 className="font-bold text-sm" style={{ color: 'var(--cn-text-primary)' }}>Top Performer So Far</h3>
          <p className="text-xs" style={{ color: 'var(--cn-text-muted)' }}>Best performer each month since June 2026</p>
        </div>
      </div>

      {/* Cards grid */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {monthResults.map(m => {
          const p = m.top3[0];
          if (!p) return null;
          const c = memberColor(p.name);
          return (
            <div key={m.label} className="rounded-xl border p-4 flex flex-col gap-3"
              style={{ background: `linear-gradient(135deg, ${c}0a 0%, transparent 60%)`, borderColor: `${c}30` }}>
              {/* Month label */}
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--cn-text-muted)' }}>{m.label}</p>

              {/* Winner identity */}
              <div className="flex items-center gap-3">
                <Avatar name={p.name} size={44} />
                <div>
                  <p className="font-extrabold text-sm" style={{ color: 'var(--cn-text-primary)' }}>{p.name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <MedalIcon rank={1} size={18} />
                    <span className="text-[10px] font-semibold" style={{ color: '#E59400' }}>Top Performer</span>
                  </div>
                </div>
              </div>

              {/* Points — big */}
              <p className="font-extrabold text-2xl tabular-nums leading-none" style={{ color: c }}>
                {fmtPts(p.totalPoints)}
                <span className="text-xs font-normal ml-1" style={{ color: 'var(--cn-text-muted)' }}>pts</span>
              </p>

              {/* Mini stats */}
              <div className="space-y-1 pt-1 border-t" style={{ borderColor: 'var(--cn-border)' }}>
                <StatLine label="Task Closed"                       value={p.taskClosedCount}   pts={fmtPts(p.ptTaskClosed)}  color="#065f46" />
                <StatLine label="PM Status" value={p.pmApprovedCount}   pts={fmtPts(p.ptPMApproved)}  color="#f59e0b" />
                {p.ptQATesting > 0 && <StatLine label="QA Testing" value={null} pts={fmtPts(p.ptQATesting)} color="#9333ea" />}
                {p.manualPositive > 0 && <StatLine label="Rewards"   value={null} pts={`+${p.manualPositive}`} color="#16a34a" />}
                {p.manualNegative < 0 && <StatLine label="Penalties" value={null} pts={`${p.manualNegative}`}  color="#ef4444" />}
              </div>

              {/* Progress bar */}
              <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--cn-bg-input)' }}>
                <div className="h-full rounded-full" style={{ width: '100%', background: c }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Dashboard mini widget (exported) ─────────────────────────────────────────
export function LeaderboardWidget({
  bandwidthData, bandwidthHeaders, leaderboardData, onNavigate,
}: Props & { onNavigate?: () => void }) {
  const [wFilter, setWFilter] = useState<LBFilter>('monthly');

  const rankings = useMemo(
    () => calcLeaderboard(bandwidthData, bandwidthHeaders, leaderboardData, wFilter),
    [bandwidthData, bandwidthHeaders, leaderboardData, wFilter]
  );
  if (!rankings.length) return null;

  const first  = rankings[0];
  const rest: typeof rankings = []; // show only 1st place, no others
  const maxPts = first.totalPoints || 1;
  const color1 = memberColor(first.name);

  return (
    <div className="cn-card border rounded-2xl overflow-hidden flex flex-col"
      style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b shrink-0"
        style={{ borderColor: 'var(--cn-border)' }}>
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4" style={{ color: '#f59e0b' }} />
          <span className="font-bold text-sm" style={{ color: 'var(--cn-text-primary)' }}>Leaderboard</span>
        </div>
        {onNavigate && (
          <button onClick={onNavigate} className="text-xs font-semibold cursor-pointer"
            style={{ color: 'var(--cn-accent)' }}>Full view →</button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-3 pt-3 pb-1 shrink-0">
        {(['monthly', 'alltime'] as LBFilter[]).map(f => (
          <button key={f} onClick={() => setWFilter(f)}
            className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer"
            style={{
              background: wFilter === f ? 'var(--cn-accent)' : 'var(--cn-bg-input)',
              color:      wFilter === f ? '#fff' : 'var(--cn-text-muted)',
            }}>
            {f === 'alltime' ? 'All Time' : 'This Month'}
          </button>
        ))}
      </div>

      {/* 1st place — full-width stacked column */}
      <div className="relative mx-3 mt-3 mb-1 rounded-2xl overflow-hidden border-2 flex flex-col items-center gap-2 px-4 py-5 text-center"
        style={{ background: `linear-gradient(160deg, ${color1}14 0%, transparent 60%)`, borderColor: '#FE4A23' }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${color1}18 0%, transparent 70%)` }} />

        {/* Crown */}
        <span className="text-2xl select-none leading-none">👑</span>

        {/* Avatar */}
        <Avatar name={first.name} size={72} />

        {/* Name */}
        <p className="font-extrabold text-lg leading-tight" style={{ color: 'var(--cn-text-primary)' }}>{first.name}</p>

        {/* Medal + label */}
        <div className="flex items-center justify-center gap-1.5">
          <MedalIcon rank={1} size={24} />
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>Top Performer</span>
        </div>

        {/* Points */}
        <p className="font-extrabold text-4xl tabular-nums leading-none mt-1" style={{ color: color1 }}>
          {fmtPts(first.totalPoints)}
        </p>
        <p className="text-xs" style={{ color: 'var(--cn-text-muted)' }}>points</p>

        {/* Progress bar */}
        <div className="w-full h-1.5 rounded-full overflow-hidden mt-1" style={{ background: 'var(--cn-bg-input)' }}>
          <div className="h-full rounded-full" style={{ width: '100%', background: color1 }} />
        </div>
        <p className="text-[10px]" style={{ color: 'var(--cn-text-muted)' }}>100% of top score</p>
      </div>

      {/* Ranked list — 2nd onwards */}
      <div className="overflow-y-auto px-3 py-2 space-y-1" style={{ maxHeight: 300 }}>
        {rest.map((p, i) => {
          const color = memberColor(p.name);
          const rank  = i + 2;
          const medal = rank <= 3 ? MEDALS[rank as 2|3] : null;
          return (
            <div key={p.name}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
              style={{ background: 'var(--cn-bg-input)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--cn-bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--cn-bg-input)')}>
              {/* Rank badge */}
              {medal ? (
                <div className="w-5 h-5 rounded-full flex items-center justify-center font-bold shrink-0"
                  style={{ fontSize: 9, background: medal.bg, color: MEDAL_TEXT_COLOR[rank], border: `1.5px solid ${medal.color}` }}>
                  {rank}
                </div>
              ) : (
                <span className="text-[10px] font-bold w-5 text-center shrink-0"
                  style={{ color: 'var(--cn-text-muted)' }}>#{rank}</span>
              )}
              <Avatar name={p.name} size={28} />
              <span className="flex-1 text-xs font-semibold truncate" style={{ color: 'var(--cn-text-primary)' }}>{p.name}</span>
              <div className="w-12 h-1.5 rounded-full overflow-hidden shrink-0" style={{ background: 'var(--cn-border)' }}>
                <div className="h-full rounded-full" style={{ width: `${(p.totalPoints / maxPts) * 100}%`, background: color }} />
              </div>
              <span className="text-xs font-bold tabular-nums shrink-0 w-10 text-right"
                style={{ color: 'var(--cn-text-secondary)' }}>{fmtPts(p.totalPoints)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Admin Detail Table ───────────────────────────────────────────────────────
function AdminDetailTable({ stats, rank }: { stats: PersonStats; rank: number }) {
  const color = memberColor(stats.name);

  const cellStyle = (c: string, bold?: boolean): React.CSSProperties => ({
    padding: '10px 14px',
    fontSize: 12,
    color: c,
    fontWeight: bold ? 700 : 500,
    borderBottom: '1px solid var(--cn-border)',
    borderRight: '1px solid var(--cn-border)',
  });

  const rows = [
    { label: 'Hours',           value: `${stats.taskClosedHours}h (${stats.taskClosedCount} Tasks)`, color: 'var(--cn-text-primary)' },
    { label: 'Task Closed',     value: `${stats.ptTaskClosed} pts`,  color: '#065f46' },
    { label: 'PM Status', value: `${stats.ptPMApproved} pts`,  color: '#f59e0b' },
    { label: 'Total (Combined)',value: `${stats.totalPoints} pts`,    color: 'var(--cn-accent)', bold: true },
  ];

  return (
    <div className="cn-card rounded-2xl border overflow-hidden mt-5"
      style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
      <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--cn-border)' }}>
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--cn-accent)' }}>Admin View</span>
        <span className="text-xs font-semibold" style={{ color: 'var(--cn-text-primary)' }}>— {stats.name} Detail</span>
      </div>
      <div className="overflow-x-auto">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--cn-bg-input)' }}>
              <th style={{ ...cellStyle('var(--cn-text-muted)'), textAlign: 'left', fontWeight: 700, fontSize: 11 }}>Pointers</th>
              <th style={{ ...cellStyle(color), textAlign: 'center', fontWeight: 700 }}>
                {stats.name}
                <div style={{ fontSize: 10, color: 'var(--cn-text-muted)', fontWeight: 500 }}>Rank #{rank}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.label}>
                <td style={{ ...cellStyle('var(--cn-text-muted)'), textAlign: 'left', fontWeight: 600, fontSize: 11 }}>{row.label}</td>
                <td style={{ ...cellStyle(row.color, row.bold), textAlign: 'center' }}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Leaderboard page ────────────────────────────────────────────────────
// ─── Generate list of months from June 2026 to current month ─────────────────
function getAvailableMonths(): { label: string; year: number; month: number }[] {
  const months = [];
  const start = new Date(2026, 3, 1); // April 2026 — earliest month with data
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  let cur = new Date(start);
  while (cur <= end) {
    months.push({
      label: cur.toLocaleString('default', { month: 'long', year: 'numeric' }),
      year: cur.getFullYear(),
      month: cur.getMonth(),
    });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return months.reverse(); // latest first
}

export default function Leaderboard({ bandwidthData, bandwidthHeaders, leaderboardData, user, onRefreshLb, lbLoading }: Props) {
  const [filter, setFilter]     = useState<LBFilter>('monthly');
  const [selected, setSelected] = useState<string>('');
  const [showInfo, setShowInfo] = useState(false);
  const now = new Date();
  const [tableMonth, setTableMonth] = useState<string>(`${now.getFullYear()}-${now.getMonth()}`);
  const availableMonths = useMemo(() => getAvailableMonths(), []);

  const rankings = useMemo(
    () => calcLeaderboard(bandwidthData, bandwidthHeaders, leaderboardData, filter),
    [bandwidthData, bandwidthHeaders, leaderboardData, filter]
  );

  // Table rankings filtered by selected month or all time
  const tableRankings = useMemo(() => {
    if (tableMonth === 'alltime') {
      return calcLeaderboard(bandwidthData, bandwidthHeaders, leaderboardData, 'alltime', true);
    }
    const [y, m] = tableMonth.split('-').map(Number);
    const parseD = (val: unknown): Date | null => {
      if (!val) return null;
      const s = String(val).trim();
      const num = Number(s);
      if (!isNaN(num) && num > 40000) return new Date((num - 25569) * 86400 * 1000);
      const parts = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (parts) { const [,a,b,yr] = parts; const d1 = new Date(+yr,+b-1,+a); const d2 = new Date(+yr,+a-1,+b); return !isNaN(d1.getTime()) ? d1 : d2; }
      const d = new Date(s); return isNaN(d.getTime()) ? null : d;
    };
    const tsCol = bandwidthHeaders.find(h => h.toLowerCase().includes('timestamp'));
    const bwFiltered = bandwidthData.filter(r => {
      const d = tsCol ? parseD(r[tsCol]) : null;
      return d ? d.getFullYear() === y && d.getMonth() === m : false;
    });
    const lbFiltered = leaderboardData.filter(r => {
      const d = parseD(r['Timestamp']);
      return d ? d.getFullYear() === y && d.getMonth() === m : false;
    });
    // Use 'alltime' so calcLeaderboard doesn't apply its own date cutoff — we already pre-filtered
    return calcLeaderboard(bwFiltered, bandwidthHeaders, lbFiltered, 'alltime', true);
  }, [bandwidthData, bandwidthHeaders, leaderboardData, tableMonth]);

  // Default selection = 1st place
  const defaultSelected = rankings[0]?.name ?? '';
  const activeSelected  = selected || defaultSelected;
  const selectedStats   = rankings.find(r => r.name === activeSelected) ?? rankings[0];
  const selectedRank    = rankings.findIndex(r => r.name === activeSelected) + 1;
  const maxPts          = rankings[0]?.totalPoints || 1;

  const FILTER_LABELS: Record<LBFilter, string> = { monthly: 'This Month', alltime: 'All Time' };

  if (!bandwidthData.length) return (
    <div className="flex items-center justify-center h-64 text-sm" style={{ color: 'var(--cn-text-muted)' }}>Loading leaderboard…</div>
  );

  return (
    <section className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md"
            style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}>
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold" style={{ color: 'var(--cn-text-primary)' }}>Team Leaderboard</h2>
            <p className="text-xs" style={{ color: 'var(--cn-text-muted)' }}>Rankings based on task delivery &amp; quality</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--cn-bg-input)' }}>
            {(['monthly', 'alltime'] as LBFilter[]).map(f => (
              <button key={f} onClick={() => { setFilter(f); setSelected(''); }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                style={{ background: filter === f ? 'var(--cn-accent)' : 'transparent', color: filter === f ? '#fff' : 'var(--cn-text-muted)' }}>
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>

          {/* ? Info button */}
          <div className="relative">
            <button
              onClick={() => setShowInfo(v => !v)}
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold cursor-pointer transition-all select-none"
              style={{
                background: showInfo ? 'var(--cn-accent)' : 'var(--cn-bg-input)',
                color: showInfo ? '#fff' : 'var(--cn-text-muted)',
                border: '1px solid var(--cn-border)',
                fontSize: 15,
                lineHeight: 1,
                paddingBottom: 1,
              }}
            >
              ?
            </button>

            {/* Point structure popover */}
            {showInfo && (
              <div
                className="absolute right-0 top-10 z-50 rounded-2xl border shadow-xl overflow-hidden"
                style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)', width: 300 }}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--cn-border)' }}>
                  <span className="font-bold text-sm flex items-center gap-1.5" style={{ color: 'var(--cn-text-primary)' }}>
                    <Trophy className="w-4 h-4" style={{ color: '#f59e0b' }} /> Point Structure
                  </span>
                  <button onClick={() => setShowInfo(false)} className="text-xs cursor-pointer" style={{ color: 'var(--cn-text-muted)' }}>✕</button>
                </div>
                <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                  {[
                    { l: 'PM Status', v: '2 – 200 pts', c: '#f59e0b' },
                    { l: 'Task Closed (additional)',           v: '3 – 300 pts', c: '#065f46' },
                  ].map(item => (
                    <div key={item.l} className="flex items-center justify-between gap-3 text-xs">
                      <span style={{ color: 'var(--cn-text-secondary)' }}>{item.l}</span>
                      <span className="font-bold px-2 py-0.5 rounded-full text-white shrink-0"
                        style={{ background: item.c, fontSize: 10 }}>{item.v}</span>
                    </div>
                  ))}

                  {/* Divider */}
                  <div style={{ borderTop: '1px solid var(--cn-border)' }} />

                  {/* Special Points breakdown */}
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--cn-text-muted)' }}>Special Points</p>
                  {[
                    { l: 'Rewards (positive feedback, early delivery…)', v: '+ pts', c: '#16a34a' },
                    { l: 'Penalties (complaints, missed deadlines…)',     v: '− pts', c: '#ef4444' },
                    { l: 'Keka Objectives Completed',                     v: '% pts', c: '#FE4A23' },
                  ].map(item => (
                    <div key={item.l} className="flex items-center justify-between gap-3 text-xs">
                      <span style={{ color: 'var(--cn-text-secondary)' }}>{item.l}</span>
                      <span className="font-bold px-2 py-0.5 rounded-full text-white shrink-0"
                        style={{ background: item.c, fontSize: 10 }}>{item.v}</span>
                    </div>
                  ))}

                  {/* Divider */}
                  <div style={{ borderTop: '1px solid var(--cn-border)' }} />

                  {/* More Info link */}
                  <a
                    href="https://app.notion.com/p/Resource-Guide-Leaderboard-37724034d5f0808ca024cf1e5d4e2d38?source=copy_link"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between text-xs font-semibold cursor-pointer"
                    style={{ color: 'var(--cn-accent)' }}
                  >
                    <span>More Info</span>
                    <span>Click Here →</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Split layout */}
      {rankings.length === 0 ? (
        <div className="flex items-center justify-center h-48 rounded-2xl border text-sm"
          style={{ borderColor: 'var(--cn-border)', color: 'var(--cn-text-muted)', background: 'var(--cn-bg-card)' }}>
          No data for this period
        </div>
      ) : (
        <div className="space-y-5">

          {/* Top performer — clean hero, full width */}
          <PodiumTop rankings={rankings} onSelect={setSelected} dimmed={activeSelected !== rankings[0]?.name} />

          {/* Below: 3fr ranked list | 2fr detail panel */}
          <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-5 items-start min-w-0">

            {/* Ranked list starting from #2 */}
            <div className="space-y-1.5 min-w-0 overflow-hidden">
              {rankings.slice(1).map((p, i) => (
                <RankRow key={p.name} stats={p} rank={i + 2} maxPts={maxPts}
                  selected={activeSelected === p.name}
                  onSelect={() => setSelected(p.name)} />
              ))}
            </div>

            {/* Detail panel — sticky on right */}
            <div className="lg:sticky lg:self-start min-w-0 overflow-hidden" style={{ top: 24 }}>
              {selectedStats && (
                <DetailPanel stats={selectedStats} rank={selectedRank} maxPts={maxPts} isAdmin={!!user && isAdminTierRole(user.role)} />
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── Previous Month Winners ── */}
      <PreviousWinners
        bandwidthData={bandwidthData}
        bandwidthHeaders={bandwidthHeaders}
        leaderboardData={leaderboardData}
      />

      {/* ── Admin Full Resources Table ── */}
      {!!user && isAdminTierRole(user.role) && rankings.length > 0 && (
        <div className="cn-card rounded-2xl border overflow-hidden"
          style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
          <div className="px-5 py-4 border-b flex items-center justify-between gap-4" style={{ borderColor: 'var(--cn-border)' }}>
            <span className="text-sm font-bold" style={{ color: 'var(--cn-text-primary)' }}>Leaderboard Data</span>
            <div className="flex items-center gap-3">
              {/* Month filter */}
              <select
                value={tableMonth}
                onChange={e => setTableMonth(e.target.value)}
                className="cursor-pointer rounded-lg border text-sm font-medium transition-colors"
                style={{ background: 'var(--cn-bg-input)', borderColor: 'var(--cn-border)', color: 'var(--cn-text-primary)', paddingLeft: '10px', paddingRight: '32px', paddingTop: '4px', paddingBottom: '4px', width: 'auto', appearance: 'auto', outline: 'none' }}
              >
                <option value="alltime">All Time</option>
                {availableMonths.map(m => (
                  <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{m.label}</option>
                ))}
              </select>
              {onRefreshLb && (
                <button
                  onClick={onRefreshLb}
                  disabled={lbLoading}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-60 cursor-pointer"
                  style={{ color: 'var(--cn-accent)', borderColor: 'var(--cn-accent)', background: 'transparent' }}
                  title="Refresh leaderboard data"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${lbLoading ? 'animate-spin' : ''}`} />
                  <span>{lbLoading ? 'Refreshing…' : 'Refresh Data'}</span>
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--cn-bg-input)' }}>
                  {['Rank', 'Name', 'Hours (Tasks)', 'Task Closed', 'PM Status', 'QA Testing', 'Rewards', 'Penalties', 'Total'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textAlign: h === 'Rank' || h === 'Name' ? 'left' : 'center', color: 'var(--cn-text-muted)', borderBottom: '1px solid var(--cn-border)', borderRight: '1px solid var(--cn-border)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRankings.map((p, i) => {
                  const color = memberColor(p.name);
                  const isEven = i % 2 === 0;
                  const td = (val: string, c: string, bold?: boolean) => (
                    <td style={{ padding: '9px 14px', fontSize: 12, color: c, fontWeight: bold ? 700 : 500, textAlign: 'center', borderBottom: '1px solid var(--cn-border)', borderRight: '1px solid var(--cn-border)', background: isEven ? 'var(--cn-bg-row-even)' : 'var(--cn-bg-row-odd)' }}>
                      {val}
                    </td>
                  );
                  return (
                    <tr key={p.name}>
                      <td style={{ padding: '9px 14px', fontSize: 12, fontWeight: 600, color: 'var(--cn-text-muted)', borderBottom: '1px solid var(--cn-border)', borderRight: '1px solid var(--cn-border)', background: isEven ? 'var(--cn-bg-row-even)' : 'var(--cn-bg-row-odd)' }}>
                        #{i + 1}
                      </td>
                      <td style={{ padding: '9px 14px', fontSize: 12, fontWeight: 700, color, borderBottom: '1px solid var(--cn-border)', borderRight: '1px solid var(--cn-border)', background: isEven ? 'var(--cn-bg-row-even)' : 'var(--cn-bg-row-odd)' }}>
                        {p.name}
                      </td>
                      {td(`${+(p.taskClosedHours + p.qaTestingHours).toFixed(1)}h (${p.taskClosedCount + p.qaTestingCount})`, 'var(--cn-text-primary)')}
                      {td(`${p.ptTaskClosed} pts`, '#065f46')}
                      {td(`${p.ptPMApproved} pts`, '#f59e0b')}
                      {td(p.qaTestingHours > 0 ? `${p.qaTestingHours.toFixed(1)}h / ${p.ptQATesting} pts` : '—', '#9333ea')}
                      {td(p.manualPositive > 0 ? `+${p.manualPositive} pts` : '—', '#16a34a')}
                      {td(p.manualNegative < 0 ? `${p.manualNegative} pts` : '—', '#ef4444')}
                      {td(`${p.totalPoints} pts`, color, true)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
