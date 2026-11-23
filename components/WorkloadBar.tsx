'use client';

import { workloadBandForPct } from '@/lib/capacity';

// The workload meter that replaced the "Available / Partially Occupied /
// Occupied / Overload" labels: a small bar filled 0-100% with the percentage
// beside it. The percentage is the real figure (it can pass 100 when someone is
// over capacity); the bar itself stops at full. "On Leave" is not a workload, so
// it keeps a small pill instead of a bar.
// The colour is the band of the percentage (see lib/capacity.ts): above 100% dark green, 75-100% green,
// 50-74% orange, 25-49% yellow, 0-24% red. Free bandwidth is red (someone can take work), a full day is green.
export function workloadColor(pct: number): string {
  return workloadBandForPct(pct).color;
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
