// How many hours a person can take. One place, used by every workload bar, bandwidth figure and Project State card.
//   Web and SMM        8 hours a day
//   PPC and SEO        160 hours a month (a monthly retainer)
//   Project Managers   300 hours a month
export const DAILY_HOURS = 8;
export const RETAINER_HOURS = 160;
export const PM_MONTHLY_HOURS = 300;

// Half of a day, for a half-day leave
export const HALF_DAY_HOURS = DAILY_HOURS / 2;

// The bands of the workload percentage. The screens show the percentage in the band's colour; the name is only used
// inside the code (and as a tooltip), never as text on a card.
//   above 100%   Overload              dark green
//   75% to 100%  Occupied              green
//   50% to 74%   Partially Occupied    orange
//   25% to 49%   Partially Available   yellow
//   0% to 24%    Available             red
// `pct` is the whole-number percentage that is printed, so what you read and the colour always agree.
export interface WorkloadBand { label: 'Overload' | 'Occupied' | 'Partially Occupied' | 'Partially Available' | 'Available'; color: string }
export function workloadBandForPct(pct: number): WorkloadBand {
  if (pct > 100) return { label: 'Overload', color: '#166534' };
  if (pct >= 75) return { label: 'Occupied', color: '#22c55e' };
  if (pct >= 50) return { label: 'Partially Occupied', color: '#f97316' };
  if (pct >= 25) return { label: 'Partially Available', color: '#eab308' };
  return { label: 'Available', color: '#dc2626' };
}
