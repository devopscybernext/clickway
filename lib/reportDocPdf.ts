// Draws a ReportDoc as a landscape A4 PDF: an overview page (headline figures,
// one row per resource with a clickable page number, any extra tables), then
// one section per resource. jsPDF and the table plugin load on demand.

import { clean } from './projectReportPdf';
import { TONE, asCell, cellText, type Cell, type DocTable, type ReportDoc, type Tone } from './reportDoc';

const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 12;
const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const RULE: [number, number, number] = [229, 231, 235];
const ORANGE: [number, number, number] = [254, 74, 35];
const LINK: [number, number, number] = [37, 99, 235];

const rgb = (hex: string): [number, number, number] => {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [107, 114, 128];
};
const barColor = (t: Tone) => (t === 'bad' ? '#ef4444' : t === 'warn' ? '#f59e0b' : t === 'good' ? '#22c55e' : '#9ca3af');

interface Geo { row: number; page: number; x: number; y: number; w: number; h: number; url?: string }

export async function downloadReportDocPdf(model: ReportDoc): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  type Doc = typeof doc;

  const strip = () => { doc.setFillColor(...ORANGE); doc.rect(0, 0, PAGE_W, 4, 'F'); };
  const lastY = (fallback: number) => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? fallback;

  const eyebrow = (d: Doc, y: number) => {
    d.setFont('helvetica', 'bold'); d.setFontSize(8); d.setTextColor(...ORANGE);
    d.text(clean(model.eyebrow), MARGIN, y);
    d.setFont('helvetica', 'normal'); d.setTextColor(...MUTED);
    d.text(clean(model.rangeLabel), PAGE_W - MARGIN, y, { align: 'right' });
  };

  // One table. Returns the cells that need page links (resource names) and URL links.
  const drawTable = (d: Doc, t: DocTable, startY: number, opts: { size?: number; page?: boolean; first?: number; continued?: string } = {}) => {
    const size = opts.size ?? 7.6;
    const barCols = new Set<number>();
    t.rows.forEach(r => r.forEach((c, i) => { if (asCell(c).bar) barCols.add(i); }));
    const hasBar = barCols.size > 0;
    const urls: Geo[] = [];
    const first: Geo[] = [];
    const cols = t.head.length + (opts.page ? 1 : 0);
    const columnStyles: Record<number, { cellWidth?: number; fontStyle?: string }> = {};
    // When every column has a width, stretch them to fill the page (leaving 14mm for the PAGE column)
    const given = t.widths ?? [];
    const full = given.length === t.head.length && given.every(Boolean);
    const room = PAGE_W - MARGIN * 2 - (opts.page ? 14 : 0);
    const k = full ? room / given.reduce<number>((s, w) => s + (w ?? 0), 0) : 1;
    given.forEach((w, i) => { if (w) columnStyles[i] = { cellWidth: w * k }; });
    if (opts.page) columnStyles[cols - 1] = { cellWidth: 14 };

    const body = t.rows.map(r => {
      const cells = r.map(c => clean(cellText(c)));
      return opts.page ? [...cells, ''] : cells;
    });
    // autotable redraws a row that lands on a page break with index -1. Find which
    // row it is again from its text: rows are drawn in order, so take the first
    // unclaimed row with the same text.
    const sep = '';
    const byText = new Map<string, number[]>();
    body.forEach((cells, i) => { const k = cells.join(sep); (byText.get(k) ?? byText.set(k, []).get(k)!).push(i); });
    const claimed = new Set<number>();
    const resolved = new WeakMap<object, number>();
    const rowOf = (row: { index: number; raw: unknown }): number => {
      const known = resolved.get(row);
      if (known !== undefined) return known;
      let idx = row.index;
      if (idx < 0) {
        const raw = row.raw as Record<number, unknown>;
        const key = body[0].map((_, i) => String(raw[i] ?? '')).join(sep);
        idx = (byText.get(key) ?? []).find(i => !claimed.has(i)) ?? -1;
      }
      if (idx >= 0) claimed.add(idx);
      resolved.set(row, idx);
      return idx;
    };
    const foot = t.foot ? [[...t.foot.map(c => clean(cellText(c))), ...(opts.page ? [''] : [])]] : undefined;

    autoTable(d, {
      startY,
      head: [[...t.head, ...(opts.page ? ['PAGE'] : [])]],
      body,
      foot,
      showFoot: 'lastPage',
      theme: 'plain',
      styles: {
        font: 'helvetica', fontSize: size, textColor: INK, lineColor: RULE, lineWidth: { bottom: 0.15 } as never,
        valign: 'top', overflow: 'linebreak',
        cellPadding: hasBar ? { top: 2.4, bottom: 4.6, left: 2.2, right: 2.2 } : 2,
      },
      headStyles: { fillColor: rgb('#f3f4f6'), textColor: MUTED, fontStyle: 'bold', fontSize: 6.8 },
      footStyles: { fillColor: rgb('#fff1ec'), textColor: INK, fontStyle: 'bold', fontSize: size + 0.2 },
      columnStyles: columnStyles as never,
      margin: { left: MARGIN, right: MARGIN, top: 18, bottom: 16 },
      didDrawPage: data => {
        strip();
        if (opts.continued && opts.first !== undefined && d.getNumberOfPages() > opts.first && data.pageNumber > 1) {
          d.setFont('helvetica', 'bold'); d.setFontSize(8); d.setTextColor(...MUTED);
          d.text(clean(`${opts.continued} (continued)`), MARGIN, 12);
        }
      },
      didParseCell: c => {
        if (c.section === 'head') return;
        const rows = c.section === 'foot' ? null : t.rows[c.row.index];
        const src: Cell | undefined = c.section === 'foot' ? t.foot?.[c.column.index] : rows?.[c.column.index];
        if (src === undefined) return;
        const cell = asCell(src);
        if (cell.tone) {
          c.cell.styles.fillColor = rgb(TONE[cell.tone].fill);
          c.cell.styles.textColor = rgb(TONE[cell.tone].text);
          c.cell.styles.fontStyle = 'bold';
        }
        if (cell.bold) c.cell.styles.fontStyle = 'bold';
        if (cell.url) { c.cell.styles.textColor = LINK; c.cell.styles.fontStyle = 'bold'; }
      },
      didDrawCell: c => {
        if (c.section !== 'body') return;
        const ri = rowOf(c.row);
        if (ri < 0) return;
        const geo = { row: ri, page: c.doc.getNumberOfPages(), x: c.cell.x, y: c.cell.y, w: c.cell.width, h: c.cell.height };
        if (c.column.index === 0) first.push(geo);
        if (opts.page && c.column.index === cols - 1) pageCells.push(geo);
        const src = t.rows[ri]?.[c.column.index];
        if (src === undefined) return;
        const cell = asCell(src);
        if (cell.url) urls.push({ ...geo, url: cell.url });
        if (cell.bar && barCols.has(c.column.index)) {
          const bx = c.cell.x + 2.2, bw = c.cell.width - 4.4, by = c.cell.y + c.cell.height - 3.4;
          c.doc.setFillColor(...rgb('#e5e7eb'));
          c.doc.roundedRect(bx, by, bw, 1.8, 0.9, 0.9, 'F');
          c.doc.setFillColor(...rgb(barColor(cell.bar.tone)));
          c.doc.roundedRect(bx, by, Math.max(1.8, (bw * Math.min(Math.max(cell.bar.pct, 0), 150)) / 150), 1.8, 0.9, 0.9, 'F');
          c.doc.setDrawColor(...INK); c.doc.setLineWidth(0.25);
          c.doc.line(bx + (bw * 100) / 150, by - 0.7, bx + (bw * 100) / 150, by + 2.5);
        }
      },
    });
    // external links go on after the table, so every page they sit on exists
    urls.forEach(u => { d.setPage(u.page); d.link(u.x, u.y, u.w, u.h, { url: u.url! }); });
    d.setPage(d.getNumberOfPages());
    return first;
  };

  const pageCells: Geo[] = [];

  // ── Overview ─────────────────────────────────────────────────────────────
  strip();
  let y = 15;
  eyebrow(doc, y);
  y += 9;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...INK);
  doc.text(clean(model.title), MARGIN, y);
  y += 6.5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...MUTED);
  doc.text(`${model.sections.length} ${model.unit ?? 'resource'}${model.sections.length === 1 ? '' : 's'}`, MARGIN, y);
  y += 8;

  const stripH = 21;
  doc.setDrawColor(...RULE); doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, stripH, 2.5, 2.5, 'S');
  const colW = (PAGE_W - MARGIN * 2) / Math.max(model.stats.length, 1);
  model.stats.forEach((st, i) => {
    const x = MARGIN + i * colW;
    if (i > 0) doc.line(x, y + 3, x, y + stripH - 3);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(clean(st.label.toUpperCase()), x + 6, y + 7.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...INK);
    doc.text(clean(st.value), x + 6, y + 16);
  });
  y += stripH + 8;

  const nameCells = drawTable(doc, model.summary, y, { size: 9, page: true });

  let ly = lastY(y) + 7;
  const ensure = (need: number) => { if (ly > PAGE_H - need) { doc.addPage(); strip(); ly = 18; } };
  (model.legend ?? []).forEach(line => {
    ensure(22);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(clean(line), PAGE_W - MARGIN * 2) as string[];
    doc.text(lines, MARGIN, ly);
    ly += 4.2 * lines.length + 0.8;
  });

  (model.extras ?? []).forEach(t => {
    ly += 4;
    ensure(46);
    if (t.title) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...INK);
      doc.text(clean(t.title), MARGIN, ly);
      ly += 3;
    }
    drawTable(doc, t, ly, { size: 8 });
    ly = lastY(ly) + 6;
  });

  // ── One section per resource ─────────────────────────────────────────────
  const startPage: number[] = [];
  model.sections.forEach((sec, idx) => {
    doc.addPage();
    startPage[idx] = doc.getNumberOfPages();
    strip();
    let sy = 15;
    eyebrow(doc, sy);
    sy += 9;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...INK);
    doc.text(clean(sec.title), MARGIN, sy);
    if (sec.verdict) {
      doc.setFontSize(8.5);
      const label = clean(sec.verdict.label);
      const vw = doc.getTextWidth(label) + 8;
      doc.setFillColor(...rgb(TONE[sec.verdict.tone].fill));
      doc.roundedRect(PAGE_W - MARGIN - vw, sy - 5.6, vw, 7, 3.5, 3.5, 'F');
      doc.setTextColor(...rgb(TONE[sec.verdict.tone].text));
      doc.text(label, PAGE_W - MARGIN - vw / 2, sy - 0.9, { align: 'center' });
    }
    sy += 6.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...MUTED);
    doc.text(clean(sec.facts.filter(Boolean).join('   |   ')), MARGIN, sy);
    (sec.notes ?? []).forEach(n => {
      sy += 4.6;
      doc.setFontSize(8.2);
      const lines = doc.splitTextToSize(clean(n), PAGE_W - MARGIN * 2) as string[];
      doc.text(lines, MARGIN, sy);
      sy += 3.8 * (lines.length - 1);
    });
    sy += 5;
    sec.tables.forEach((t, ti) => {
      if (ti > 0) {
        sy = lastY(sy) + 9;
        if (sy > PAGE_H - 50) { doc.addPage(); strip(); sy = 18; }
      }
      if (t.title) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...INK);
        doc.text(clean(t.title), MARGIN, sy);
        sy += 3;
      }
      drawTable(doc, t, sy, { continued: sec.title, first: startPage[idx] });
    });
  });

  // ── Page links on the overview, then footers ─────────────────────────────
  pageCells.forEach(g => {
    const target = startPage[g.row];
    if (!target) return;
    doc.setPage(g.page);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...LINK);
    doc.text(`p.${target}`, g.x + 2.2, g.y + 5.2);
  });
  [...nameCells, ...pageCells].forEach(g => {
    const target = startPage[g.row];
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
  doc.save(`${model.fileName}.pdf`);
}
