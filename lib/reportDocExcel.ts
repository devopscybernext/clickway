// Draws a ReportDoc as an Excel workbook: a "Summary" sheet (headline figures,
// the per-resource table, any extra tables) plus one sheet per resource, with
// the same green / amber / red cells as the PDF and clickable task links.

import { TONE, asCell, type Cell, type DocTable, type ReportDoc } from './reportDoc';

const HEADER = { fontWeight: 'bold' as const, backgroundColor: '#f3f4f6', textColor: '#6b7280', wrap: true, alignVertical: 'center' as const };
const FOOT_BG = '#fff1ec';

// Sheet names: max 31 chars, none of \ / ? * : [ ], and unique within the file.
function sheetNames(titles: string[]): string[] {
  const used = new Set<string>(['summary']);
  return titles.map(p => {
    const base = (p.replace(/[\\/?*:[\]]/g, '').trim() || 'Resource').slice(0, 28);
    let name = base, n = 2;
    while (used.has(name.toLowerCase())) name = `${base} (${n++})`;
    used.add(name.toLowerCase());
    return name;
  });
}

type Out = Record<string, unknown>;

function toCell(c: Cell, extra: Out = {}): Out {
  const cell = asCell(c);
  const out: Out = { alignVertical: 'top', wrap: true, ...extra };
  if (cell.url) {
    return cell.url.length <= 240
      ? { ...out, type: 'Formula', value: `=HYPERLINK("${cell.url.replace(/"/g, '""')}","${cell.text.replace(/"/g, '""') || 'Open'}")`, textColor: '#2563eb', textDecoration: { underline: true } }
      : { ...out, value: cell.url, textColor: '#2563eb' };
  }
  out.value = cell.text === '' ? null : cell.text;
  if (cell.tone) { out.backgroundColor = TONE[cell.tone].fill; out.textColor = TONE[cell.tone].text; out.fontWeight = 'bold'; }
  if (cell.bold) out.fontWeight = 'bold';
  return out;
}

// Rows for one table: optional title, header, body, optional foot
function tableRows(t: DocTable): Out[][] {
  const rows: Out[][] = [];
  if (t.title) rows.push([{ value: t.title, fontWeight: 'bold', fontSize: 11 }]);
  rows.push(t.head.map(value => ({ value, ...HEADER })));
  t.rows.forEach(r => rows.push(r.map(c => toCell(c))));
  if (t.foot) rows.push(t.foot.map(c => toCell(c, { fontWeight: 'bold', backgroundColor: FOOT_BG })));
  return rows;
}

// Column widths from the longest text in each column across the sheet's tables
function widthsFor(tables: DocTable[]): { width: number }[] {
  const n = Math.max(...tables.map(t => t.head.length), 1);
  const w = new Array<number>(n).fill(8);
  tables.forEach(t => {
    t.head.forEach((h, i) => { w[i] = Math.max(w[i], Math.min(h.length + 2, 30)); });
    [...t.rows, ...(t.foot ? [t.foot] : [])].forEach(r => r.forEach((c, i) => {
      const cell = asCell(c);
      w[i] = Math.max(w[i], Math.min((cell.url ? 6 : cell.text.length) + 2, 46));
    }));
  });
  return w.map(width => ({ width }));
}

export async function downloadReportDocExcel(model: ReportDoc): Promise<void> {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const names = sheetNames(model.sections.map(s => s.title));
  const gray = { textColor: '#6b7280' };

  const statLine = model.stats.map(s => `${s.label}: ${s.value}`).join('   |   ');
  const summaryTables = [model.summary, ...(model.extras ?? [])];
  const summaryData: Out[][] = [
    [{ value: model.title, fontWeight: 'bold', fontSize: 14 }],
    [{ value: model.rangeLabel, ...gray }],
    [{ value: statLine, fontWeight: 'bold' }],
    [],
    ...tableRows(model.summary),
  ];
  (model.legend ?? []).forEach((l, i) => { if (i === 0) summaryData.push([]); summaryData.push([{ value: l, ...gray }]); });
  (model.extras ?? []).forEach(t => { summaryData.push([]); summaryData.push(...tableRows(t)); });

  const sheets = [
    { sheet: 'Summary', data: summaryData, columns: widthsFor(summaryTables), stickyRowsCount: 0 },
    ...model.sections.map((sec, i) => {
      const data: Out[][] = [[{ value: sec.title, fontWeight: 'bold', fontSize: 14 }]];
      if (sec.verdict) {
        const tn = TONE[sec.verdict.tone];
        data.push([{ value: sec.verdict.label, backgroundColor: tn.fill, textColor: tn.text, fontWeight: 'bold' }]);
      }
      const facts = sec.facts.filter(Boolean).join('   |   ');
      if (facts) data.push([{ value: facts, ...gray }]);
      (sec.notes ?? []).forEach(n => data.push([{ value: n, ...gray }]));
      data.push([]);
      sec.tables.forEach((t, ti) => { if (ti > 0) data.push([]); data.push(...tableRows(t)); });
      return { sheet: names[i], data, columns: widthsFor(sec.tables), stickyRowsCount: 0 };
    }),
  ];

  await writeExcelFile(sheets as never).toFile(`${model.fileName}.xlsx`);
}
