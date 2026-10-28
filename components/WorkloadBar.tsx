'use client';

// The workload meter that replaced the "Available / Partially Occupied /
// Occupied / Overload" labels: a small bar filled 0-100% with the percentage
// beside it. The percentage is the real figure (it can pass 100 when someone is
// over capacity); the bar itself stops at full. "On Leave" is not a workload, so
// it keeps a small pill instead of a bar.
// Colour by how full the day is — free bandwidth is red (someone can take work),
// a full day is green:
//   0-30% red   31-40% red-orange   41-50% orange   51-60% amber
//   61-70% yellow   71-80% lime   81-90% light green   91%+ green
export function workloadColor(pct: number): string {
  if (pct <= 30) return '#dc2626';
  if (pct <= 40) return '#ea580c';
  if (pct <= 50) return '#f97316';
  if (pct <= 60) return '#f59e0b';
  if (pct <= 70) return '#eab308';
  if (pct <= 80) return '#84cc16';
  if (pct <= 90) return '#4ade80';
  return '#16a34a';
}

export interface WorkloadStatusLike {
  label: string;
  /** colour of the bar — from workloadColor() */
  bg: string;
  /** hours assigned / capacity, in whole percent */
  pct?: number;
}

// `fill` stretches the bar across its row (used under a name in narrow cards).
export default function WorkloadBar({ status, width = 88, fill = false }: { status: WorkloadStatusLike; width?: number; fill?: boolean }) {
  if (status.label === 'On Leave') {
    return (
      <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: status.bg + '22', color: status.bg }}>
        On Leave
      </span>
    );
  }
  const pct = Math.max(0, status.pct ?? 0);
  return (
    <span className={fill ? 'flex w-full items-center gap-2' : 'shrink-0 inline-flex items-center gap-1.5'} title={`${pct}% of capacity`}>
      <span className={fill ? 'h-1.5 flex-1 rounded-full overflow-hidden' : 'h-1.5 rounded-full overflow-hidden'} style={{ width: fill ? undefined : width, background: 'var(--cn-bg-input)', boxShadow: 'inset 0 0 0 1px var(--cn-border)' }}>
        <span className="block h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: status.bg, transition: 'width 0.6s ease' }} />
      </span>
      <span className="text-[10px] font-bold tabular-nums w-8 text-right" style={{ color: status.bg }}>{pct}%</span>
    </span>
  );
}
