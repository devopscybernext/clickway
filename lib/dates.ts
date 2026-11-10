// Reading the dates the sheets hold. Web writes "DD/MM/YYYY[ HH:MM:SS]", Marketing "M/D/YYYY[ H:MM:SS]"; an Excel
// import can leave "YYYY-MM-DD[ HH:MM[:SS]]". Used by the Tasks Assigned table and the dashboards.

export type DateOrder = 'dmy' | 'mdy';

// Epoch ms, or NaN when it is not a date. Also reads a slash date written the other way round than `order` when
// it cannot be read that way (e.g. 10/26/2026 in the day-first Web table: 26 is not a month).
export function parseTimestamp(v: string, order: DateOrder = 'dmy'): number {
  const s = v.trim();
  const valid = (mo: number, d: number) => mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
  const time = (h?: string, mi?: string, sec?: string) => [Number(h ?? 0), Number(mi ?? 0), Number(sec ?? 0)] as const;
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const mo = Number(iso[2]), d = Number(iso[3]);
    return valid(mo, d) ? new Date(Number(iso[1]), mo - 1, d, ...time(iso[4], iso[5], iso[6])).getTime() : NaN;
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return NaN;
  let [d, mo] = order === 'dmy' ? [Number(m[1]), Number(m[2])] : [Number(m[2]), Number(m[1])];
  if (!valid(mo, d)) [d, mo] = [mo, d];
  if (!valid(mo, d)) return NaN;
  return new Date(Number(m[3]), mo - 1, d, ...time(m[4], m[5], m[6])).getTime();
}

export const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const startOfMonth = (ms: number, monthsBack = 0) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth() - monthsBack, 1).getTime(); };
// The Monday of the week a date falls in
export const startOfWeek = (ms: number) => { const d = new Date(startOfDay(ms)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
export const DAY_MS = 86_400_000;
