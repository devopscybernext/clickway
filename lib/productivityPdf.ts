// Productivity Meter PDF — landscape A4: an overview page (headline figures +
// one row per resource with a meter bar), then a page (or more) per resource
// listing that person's tasks with the estimate-vs-time flag. jsPDF and the
// table plugin are loaded on demand so they only cost bytes when used.

import { clean } from './projectReportPdf';
import { timeToMinutes, formatTotalTime } from './copyTotals';
import { FLAG_STYLE, fmtDuration, type PersonSummary, type ProductivityTask } from './productivity';

const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 12;
const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const RULE: [number, number, number] = [229, 231, 235];
const ORANGE: [number, number, number] = [254, 74, 35];

const rgb = (hex: string): [number, number, number] => {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [107, 114, 128];
};

// A time as the sheet shows it ("01.30 Hours"); text such as "As Per Task" as-is.
const timeText = (raw: string) => (/^\s*\d/.test(raw) ? formatTotalTime(timeToMinutes(raw)) : raw.trim() || '-');

interface CellGeo { index: number; page: number; x: number; y: number; w: number; h: number }

export async function downloadProductivityPdf(opts: {
  summaries: PersonSummary[];
  rangeLabel: string;
  fileName: string;
}): Promise<void> {
  const { summaries, rangeLabel, fileName } = opts;
  const { jsPDF } = await import('jspdf');
  const { autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  type Doc = typeof doc;

  const strip = () => { doc.setFillColor(...ORANGE); doc.rect(0, 0, PAGE_W, 4, 'F'); };
  const pageNo = () => doc.getNumberOfPages();

  // ── Overview ─────────────────────────────────────────────────────────────
  strip();
  let y = 15;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...ORANGE);
  doc.text('PRODUCTIVITY METER', MARGIN, y);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
  doc.text(clean(rangeLabel), PAGE_W - MARGIN, y, { align: 'right' });
  y += 9;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...INK);
  doc.text('Productivity Meter', MARGIN, y);

  const totalTasks = summaries.reduce((s, p) => s + p.taskCount, 0);
  const estAll = summaries.reduce((s, p) => s + p.estMin, 0);
  const takenAll = summaries.reduce((s, p) => s + p.totalMin, 0);
  const cmpAll = summaries.reduce((s, p) => s + p.comparable, 0);
  const withinAll = summaries.reduce((s, p) => s + p.withinEstimate, 0);
  y += 6.5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...MUTED);
  doc.text(`${summaries.length} resource${summaries.length === 1 ? '' : 's'}  |  ${totalTasks} task${totalTasks === 1 ? '' : 's'}`, MARGIN, y);
  y += 8;

  // Headline strip
  const stats = [
    { label: 'Tasks', value: String(totalTasks) },
    { label: 'Time estimated', value: fmtDuration(estAll) },
    { label: 'Time taken', value: fmtDuration(takenAll) },
    { label: 'Within estimate', value: cmpAll ? `${withinAll} of ${cmpAll}  (${Math.round((withinAll / cmpAll) * 100)}%)` : '-' },
  ];
  const stripH = 21;
  doc.setDrawColor(...RULE); doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, stripH, 2.5, 2.5, 'S');
  const colW = (PAGE_W - MARGIN * 2) / stats.length;
  stats.forEach((st, i) => {
    const x = MARGIN + i * colW;
    if (i > 0) doc.line(x, y + 3, x, y + stripH - 3);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(st.label.toUpperCase(), x + 6, y + 7.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...INK);
    doc.text(clean(st.value), x + 6, y + 16);
  });
  y += stripH + 8;

  // Per-resource summary table (names and page numbers become links later)
  const nameLinks: CellGeo[] = [];
  const pageLinks: CellGeo[] = [];
  const COL_EFF = 6;
  const COL_PAGE = 8;
  autoTable(doc, {
    startY: y,
    head: [['RESOURCE', 'TASKS', 'ESTIMATED', 'TIME TAKEN', 'WITHIN ESTIMATE', 'OVER ESTIMATE', 'EFFICIENCY', 'VERDICT', 'PAGE']],
    body: summaries.map(p => [
      clean(p.person),
      String(p.taskCount),
      fmtDuration(p.estMin),
      fmtDuration(p.totalMin),
      p.comparable ? `${p.withinEstimate} of ${p.comparable}` : '-',
      p.comparable ? String(p.overEstimate) : '-',
      p.efficiencyPct === null ? '-' : `${p.efficiencyPct}%`,
      p.verdict.label,
      '',
    ]),
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 2.6, bottom: 4.6, left: 2.5, right: 2.5 }, textColor: INK, lineColor: RULE, lineWidth: { bottom: 0.2 } as never, valign: 'top' },
    headStyles: { fillColor: rgb('#f3f4f6'), textColor: MUTED, fontStyle: 'bold', fontSize: 7, cellPadding: 2.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 44 }, [COL_EFF]: { cellWidth: 36 }, 7: { cellWidth: 44 }, [COL_PAGE]: { cellWidth: 14 } } as never,
    margin: { left: MARGIN, right: MARGIN, top: 16, bottom: 18 },
    didDrawPage: () => strip(),
    didParseCell: d => {
      if (d.section !== 'body') return;
      const p = summaries[d.row.index];
      if (d.column.index === 7) { d.cell.styles.textColor = rgb(FLAG_STYLE[p.verdict.kind].text); d.cell.styles.fontStyle = 'bold'; }
    },
    didDrawCell: d => {
      if (d.section !== 'body') return;
      const geo = { index: d.row.index, page: d.doc.getNumberOfPages(), x: d.cell.x, y: d.cell.y, w: d.cell.width, h: d.cell.height };
      if (d.column.index === 0) nameLinks.push(geo);
      if (d.column.index === COL_PAGE) pageLinks.push(geo);
      // The meter: a bar from 0 to 150% with a tick at 100% (on plan)
      if (d.column.index === COL_EFF) {
        const pct = summaries[d.row.index].efficiencyPct;
        const bx = d.cell.x + 2.5, bw = d.cell.width - 5, by = d.cell.y + d.cell.height - 3.4;
        d.doc.setFillColor(...rgb('#e5e7eb'));
        d.doc.roundedRect(bx, by, bw, 1.8, 0.9, 0.9, 'F');
        if (pct !== null) {
          const kind = summaries[d.row.index].verdict.kind;
          d.doc.setFillColor(...rgb(kind === 'over' ? '#ef4444' : '#22c55e'));
          d.doc.roundedRect(bx, by, Math.max(1.8, (bw * Math.min(pct, 150)) / 150), 1.8, 0.9, 0.9, 'F');
          d.doc.setDrawColor(...INK); d.doc.setLineWidth(0.25);
          d.doc.line(bx + (bw * 100) / 150, by - 0.7, bx + (bw * 100) / 150, by + 2.5);
        }
      }
    },
  });

  const afterTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  let ly = afterTable + 7;
  if (ly > PAGE_H - 22) { doc.addPage(); strip(); ly = 18; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text('Efficiency = time estimated / time taken, over tasks that have both. 100% = exactly on plan; above 100% = finished faster than estimated.', MARGIN, ly);
  ly += 4.6;
  doc.setFillColor(...rgb(FLAG_STYLE.under.fill)); doc.roundedRect(MARGIN, ly - 3, 4, 3.4, 0.8, 0.8, 'F');
  doc.text('Green = within the estimate', MARGIN + 6, ly);
  doc.setFillColor(...rgb(FLAG_STYLE.over.fill)); doc.roundedRect(MARGIN + 52, ly - 3, 4, 3.4, 0.8, 0.8, 'F');
  doc.text('Red = over the estimate', MARGIN + 58, ly);
  doc.setFillColor(...rgb(FLAG_STYLE.none.fill)); doc.roundedRect(MARGIN + 100, ly - 3, 4, 3.4, 0.8, 0.8, 'F');
  doc.text('Grey = no estimate or no time logged', MARGIN + 106, ly);

  // ── One section per resource ─────────────────────────────────────────────
  const startPage: number[] = [];
  summaries.forEach((p, idx) => {
    doc.addPage();
    startPage[idx] = pageNo();
    drawResource(doc as Doc, p, startPage[idx]);
  });

  function drawResource(d: Doc, p: PersonSummary, firstPage: number) {
    strip();
    let ry = 15;
    d.setFont('helvetica', 'bold'); d.setFontSize(8); d.setTextColor(...ORANGE);
    d.text('PRODUCTIVITY METER', MARGIN, ry);
    d.setFont('helvetica', 'normal'); d.setTextColor(...MUTED);
    d.text(clean(rangeLabel), PAGE_W - MARGIN, ry, { align: 'right' });
    ry += 9;
    d.setFont('helvetica', 'bold'); d.setFontSize(20); d.setTextColor(...INK);
    d.text(clean(p.person), MARGIN, ry);

    // verdict pill, right-aligned on the title row
    d.setFontSize(8.5);
    const vLabel = clean(p.verdict.label);
    const vw = d.getTextWidth(vLabel) + 8;
    d.setFillColor(...rgb(FLAG_STYLE[p.verdict.kind].fill));
    d.roundedRect(PAGE_W - MARGIN - vw, ry - 5.6, vw, 7, 3.5, 3.5, 'F');
    d.setTextColor(...rgb(FLAG_STYLE[p.verdict.kind].text));
    d.text(vLabel, PAGE_W - MARGIN - vw / 2, ry - 0.9, { align: 'center' });

    ry += 6.5;
    d.setFont('helvetica', 'normal'); d.setFontSize(9.5); d.setTextColor(...MUTED);
    const bits = [
      `${p.taskCount} task${p.taskCount === 1 ? '' : 's'}`,
      `Estimated ${fmtDuration(p.estMin)}`,
      `Taken ${fmtDuration(p.totalMin)}`,
      p.comparable ? `Within estimate ${p.withinEstimate} of ${p.comparable}` : 'No comparable tasks',
      p.efficiencyPct === null ? '' : `Efficiency ${p.efficiencyPct}%`,
    ].filter(Boolean);
    d.text(clean(bits.join('   |   ')), MARGIN, ry);

    const urlCells: CellGeo[] = [];
    const sumEst = p.tasks.reduce((s, t) => s + t.estMin, 0);
    const sumTaken = p.tasks.reduce((s, t) => s + t.totalMin, 0);
    autoTable(d, {
      startY: ry + 5,
      head: [['#', 'PROJECT NAME', 'TASK NAME', 'LINK', 'TOTAL TIME EST', 'TOTAL TIME', 'DEADLINE', 'TASK STATUS', 'PM STATUS', 'FLAG']],
      body: p.tasks.map((t: ProductivityTask, i: number) => [
        String(i + 1), clean(t.project || '-'), clean(t.task || '-'), t.url ? 'Open' : '-',
        timeText(t.estRaw), timeText(t.totalRaw), clean(t.deadline || '-'), clean(t.taskStatus || '-'), clean(t.pmStatus || '-'),
        clean(t.flag.message),
      ]),
      foot: [['', '', 'TOTAL', '', formatTotalTime(sumEst), formatTotalTime(sumTaken), '', '', '', p.comparable ? `${p.withinEstimate} within | ${p.overEstimate} over` : '']],
      showFoot: 'lastPage',
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 7.6, cellPadding: 2, textColor: INK, lineColor: RULE, lineWidth: { bottom: 0.15 } as never, valign: 'top', overflow: 'linebreak' },
      headStyles: { fillColor: rgb('#f3f4f6'), textColor: MUTED, fontStyle: 'bold', fontSize: 6.8 },
      footStyles: { fillColor: rgb('#fff1ec'), textColor: INK, fontStyle: 'bold', fontSize: 7.8 },
      columnStyles: { 0: { cellWidth: 8, textColor: MUTED }, 1: { cellWidth: 34 }, 2: { cellWidth: 58 }, 3: { cellWidth: 13 }, 4: { cellWidth: 23 }, 5: { cellWidth: 22 }, 6: { cellWidth: 21 }, 7: { cellWidth: 25 }, 8: { cellWidth: 25 }, 9: { cellWidth: 44 } } as never,
      margin: { left: MARGIN, right: MARGIN, top: 18, bottom: 16 },
      didDrawPage: data => {
        strip();
        // later pages of a long table repeat whose it is
        if (d.getNumberOfPages() > firstPage && data.pageNumber > 1) {
          d.setFont('helvetica', 'bold'); d.setFontSize(8); d.setTextColor(...MUTED);
          d.text(clean(`${p.person} (continued)`), MARGIN, 12);
        }
      },
      didParseCell: c => {
        if (c.section !== 'body') return;
        const t = p.tasks[c.row.index];
        if (c.column.index === 9) {
          const st = FLAG_STYLE[t.flag.kind];
          c.cell.styles.fillColor = rgb(st.fill);
          c.cell.styles.textColor = rgb(st.text);
          c.cell.styles.fontStyle = 'bold';
        }
        if (c.column.index === 3 && t.url) { c.cell.styles.textColor = rgb('#2563eb'); c.cell.styles.fontStyle = 'bold'; }
      },
      didDrawCell: c => {
        if (c.section === 'body' && c.column.index === 3) {
          const t = p.tasks[c.row.index];
          if (t.url) urlCells.push({ index: c.row.index, page: c.doc.getNumberOfPages(), x: c.cell.x, y: c.cell.y, w: c.cell.width, h: c.cell.height });
        }
      },
    });
    // external links go on after the table so every page they sit on exists
    urlCells.forEach(u => { d.setPage(u.page); d.link(u.x, u.y, u.w, u.h, { url: p.tasks[u.index].url }); });
    d.setPage(d.getNumberOfPages());
  }

  // ── Overview links + page numbers, then footers ──────────────────────────
  pageLinks.forEach(g => {
    const target = startPage[g.index];
    if (!target) return;
    doc.setPage(g.page);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...rgb('#2563eb'));
    doc.text(`p.${target}`, g.x + 2.5, g.y + 5.2);
  });
  [...nameLinks, ...pageLinks].forEach(g => {
    const target = startPage[g.index];
    if (!target) return;
    doc.setPage(g.page);
    doc.link(g.x, g.y, g.w, g.h, { pageNumber: target });
  });

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(`Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`, MARGIN, PAGE_H - 6);
    doc.text(`Page ${i} of ${total}`, PAGE_W - MARGIN, PAGE_H - 6, { align: 'right' });
  }
  doc.save(fileName);
}
