// Productivity Meter Excel — a "Summary" sheet (one row per resource) plus one
// sheet per resource listing that person's tasks, with the estimate-vs-time
// flag filled green / red / grey and the task link clickable.

import { timeToMinutes, formatTotalTime } from './copyTotals';
import { FLAG_STYLE, TEAM_LABELS, fmtDuration, type PersonSummary, type ReportTeam } from './productivity';

const HEADER = { fontWeight: 'bold' as const, backgroundColor: '#f3f4f6', textColor: '#6b7280', wrap: true, alignVertical: 'center' as const };
const TOTAL_BG = '#fff1ec';

const timeText = (raw: string) => (/^\s*\d/.test(raw) ? formatTotalTime(timeToMinutes(raw)) : raw.trim());

// Sheet names: max 31 chars, none of \ / ? * : [ ], and unique within the file.
function sheetNames(people: string[]): string[] {
  const used = new Set<string>(['summary']);
  return people.map(p => {
    const base = (p.replace(/[\\/?*:[\]]/g, '').trim() || 'Resource').slice(0, 28);
    let name = base, n = 2;
    while (used.has(name.toLowerCase())) name = `${base} (${n++})`;
    used.add(name.toLowerCase());
    return name;
  });
}

export async function downloadProductivityExcel(opts: {
  summaries: PersonSummary[];
  rangeLabel: string;
  fileName: string;
  team?: ReportTeam;
}): Promise<void> {
  const { summaries, rangeLabel, fileName, team = 'web' } = opts;
  const labels = TEAM_LABELS[team];
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const names = sheetNames(summaries.map(s => s.person));

  // ── Summary sheet ────────────────────────────────────────────────────────
  const totalTasks = summaries.reduce((s, p) => s + p.taskCount, 0);
  const estAll = summaries.reduce((s, p) => s + p.estMin, 0);
  const takenAll = summaries.reduce((s, p) => s + p.totalMin, 0);
  const cmpAll = summaries.reduce((s, p) => s + p.comparable, 0);
  const withinAll = summaries.reduce((s, p) => s + p.withinEstimate, 0);
  const overAll = summaries.reduce((s, p) => s + p.overEstimate, 0);

  const summaryHead = ['RESOURCE', 'TASKS', 'TIME ESTIMATED', 'TIME TAKEN', 'WITHIN ESTIMATE', 'OVER ESTIMATE', 'EFFICIENCY', 'VERDICT']
    .map(value => ({ value, ...HEADER }));
  const summaryBody = summaries.map(p => {
    const v = FLAG_STYLE[p.verdict.kind];
    return [
      { value: p.person, fontWeight: 'bold' as const },
      { value: p.taskCount },
      { value: fmtDuration(p.estMin) },
      { value: fmtDuration(p.totalMin) },
      { value: p.comparable ? `${p.withinEstimate} of ${p.comparable}` : '-' },
      { value: p.comparable ? p.overEstimate : '-' },
      { value: p.efficiencyPct === null ? '-' : `${p.efficiencyPct}%` },
      { value: p.verdict.label, backgroundColor: v.fill, textColor: v.text, fontWeight: 'bold' as const },
    ];
  });
  const summaryTotal = [
    { value: 'Total', fontWeight: 'bold' as const, backgroundColor: TOTAL_BG },
    { value: totalTasks, fontWeight: 'bold' as const, backgroundColor: TOTAL_BG },
    { value: fmtDuration(estAll), fontWeight: 'bold' as const, backgroundColor: TOTAL_BG },
    { value: fmtDuration(takenAll), fontWeight: 'bold' as const, backgroundColor: TOTAL_BG },
    { value: cmpAll ? `${withinAll} of ${cmpAll}` : '-', fontWeight: 'bold' as const, backgroundColor: TOTAL_BG },
    { value: cmpAll ? overAll : '-', fontWeight: 'bold' as const, backgroundColor: TOTAL_BG },
    { value: '', backgroundColor: TOTAL_BG },
    { value: '', backgroundColor: TOTAL_BG },
  ];
  const summarySheet = {
    sheet: 'Summary',
    data: [
      [{ value: team === 'web' ? 'Productivity Meter' : `Productivity Meter - ${labels.team}`, fontWeight: 'bold' as const, fontSize: 14 }],
      [{ value: rangeLabel, textColor: '#6b7280' }],
      [{ value: 'Efficiency = time estimated / time taken, over tasks that have both. 100% = on plan; above = faster than estimated.', textColor: '#6b7280' }],
      [],
      summaryHead,
      ...summaryBody,
      summaryTotal,
    ],
    columns: [{ width: 22 }, { width: 8 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 16 }, { width: 12 }, { width: 24 }],
    stickyRowsCount: 5,
  };

  // ── One sheet per resource ───────────────────────────────────────────────
  const personSheets = summaries.map((p, i) => {
    const head = ['#', 'PROJECT NAME', 'TASK NAME', 'TASK URL', labels.est.toUpperCase(), labels.total.toUpperCase(), 'DEADLINE', 'TASK STATUS', 'PM STATUS', 'FLAG', 'MESSAGE']
      .map(value => ({ value, ...HEADER }));
    const body = p.tasks.map((t, ti) => {
      const st = FLAG_STYLE[t.flag.kind];
      const link = t.url
        ? (t.url.length <= 240
            ? { type: 'Formula' as const, value: `=HYPERLINK("${t.url.replace(/"/g, '""')}","Open")`, textColor: '#2563eb', textDecoration: { underline: true } }
            : { value: t.url, textColor: '#2563eb' })
        : { value: null };
      return [
        { value: ti + 1, textColor: '#9ca3af', alignVertical: 'top' as const },
        { value: t.project || null, wrap: true, alignVertical: 'top' as const },
        { value: t.task || null, wrap: true, alignVertical: 'top' as const },
        { ...link, alignVertical: 'top' as const },
        { value: timeText(t.estRaw) || null, alignVertical: 'top' as const },
        { value: timeText(t.totalRaw) || null, alignVertical: 'top' as const },
        { value: t.deadline || null, alignVertical: 'top' as const },
        { value: t.taskStatus || null, alignVertical: 'top' as const },
        { value: t.pmStatus || null, alignVertical: 'top' as const },
        { value: st.label, backgroundColor: st.fill, textColor: st.text, fontWeight: 'bold' as const, alignVertical: 'top' as const },
        { value: t.flag.message, backgroundColor: st.fill, textColor: st.text, wrap: true, alignVertical: 'top' as const },
      ];
    });
    const sumEst = p.tasks.reduce((s, t) => s + t.estMin, 0);
    const sumTaken = p.tasks.reduce((s, t) => s + t.totalMin, 0);
    const bold = { fontWeight: 'bold' as const, backgroundColor: TOTAL_BG };
    const total = [
      { value: '', ...bold }, { value: '', ...bold }, { value: 'Total', ...bold }, { value: '', ...bold },
      { value: formatTotalTime(sumEst), ...bold }, { value: formatTotalTime(sumTaken), ...bold },
      { value: '', ...bold }, { value: '', ...bold }, { value: '', ...bold },
      { value: p.comparable ? `${p.withinEstimate} within / ${p.overEstimate} over` : '', ...bold }, { value: '', ...bold },
    ];
    return {
      sheet: names[i],
      data: [head, ...body, total],
      columns: [{ width: 5 }, { width: 24 }, { width: 40 }, { width: 10 }, { width: 16 }, { width: 14 }, { width: 13 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 38 }],
      stickyRowsCount: 1,
    };
  });

  await writeExcelFile([summarySheet, ...personSheets] as never).toFile(fileName);
}
