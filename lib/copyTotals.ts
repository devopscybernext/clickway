// Shared by every "Copy table" button — adds a bottom "Total Time" row that
// sums each column holding time (Time Estimation, Time Logged On AC, Est.
// Hours, Total Hours, AC Hours, ...). Self-contained on purpose: the copy
// code lives in several components that import each other, so this avoids a
// circular import.

// Reads the app's time notations into minutes:
//   "03.45 Hours" / "03.45" — HH.MM, where MM is literal minutes (never a decimal)
//   "2 hours" / "2h", "30 min"   — legacy free text
//   "2" / "1.5"                  — legacy plain decimal hours
// Anything unreadable counts as 0.
export function timeToMinutes(val: unknown): number {
  const text = String(val ?? '').trim();
  if (!text) return 0;
  const strict = text.match(/^(\d{1,3})\.(\d{2})/);
  if (strict) {
    const h = parseInt(strict[1], 10);
    const m = parseInt(strict[2], 10);
    if (m <= 59) return h * 60 + m;      // minutes above 59 → it was a decimal, fall through
  }
  const lower = text.toLowerCase();
  const hourMatch = lower.match(/^([\d.]+)\s*h/);
  if (hourMatch) return Math.round((parseFloat(hourMatch[1]) || 0) * 60);
  const minMatch = lower.match(/^([\d.]+)\s*m/);
  if (minMatch) return Math.round(parseFloat(minMatch[1]) || 0);
  const num = parseFloat(lower);
  return isNaN(num) ? 0 : Math.round(num * 60);
}

// Same "HH.MM Hours" notation the time fields are edited and shown in.
export function formatTotalTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}.${String(m).padStart(2, '0')} Hours`;
}

// A column holds time when its header says time or hours — but not Timestamp.
export function isTimeColumn(label: string): boolean {
  const l = label.trim().toLowerCase();
  if (l.includes('timestamp')) return false;
  return /\b(time|hours?)\b/.test(l);
}

// One cell per column: the label in the first non-time column, the summed
// time in each time column, blank elsewhere. Returns null when the table has
// no time column, so nothing extra is added.
export function totalTimeRow(labels: string[], rows: unknown[][]): string[] | null {
  const timeIdx = labels.map((l, i) => (isTimeColumn(l) ? i : -1)).filter(i => i >= 0);
  if (!timeIdx.length) return null;
  const labelIdx = labels.findIndex((_, i) => !timeIdx.includes(i));
  return labels.map((_, i) => {
    if (timeIdx.includes(i)) return formatTotalTime(rows.reduce<number>((sum, r) => sum + timeToMinutes(r[i]), 0));
    return i === labelIdx ? 'Total Time' : '';
  });
}

// <tr> for the HTML copy — bold, tinted, with an orange rule above it.
export function totalRowHtml(total: string[] | null): string {
  if (!total) return '';
  const cell = 'border:1px solid #ddd;border-top:2px solid #FE4A23;padding:6px 12px;font-weight:bold;';
  return `
    <tr style="background-color:#fff1ec;">
      <td style="${cell}"></td>
      ${total.map(v => `<td style="${cell}">${v}</td>`).join('')}
    </tr>`;
}

// Tab-separated line for the plain-text copy (leading cell is the # column).
export function totalRowText(total: string[]): string {
  return ['', ...total].join('\t');
}
