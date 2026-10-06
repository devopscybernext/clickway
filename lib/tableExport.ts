// Downloads a table exactly as it's on screen — the rows left after filtering
// and the columns currently shown — as an Excel (.xlsx) or PDF file. Both
// libraries are loaded on demand so they only cost bytes when used.

import { clean } from './projectReportPdf';

export interface ExportColumn {
  label: string;
  /** 'status' = coloured text (via colorFor); 'long' = wide, wrapping free text. */
  kind?: 'text' | 'status' | 'long';
}

export interface TableExport {
  title: string;
  /** One line describing the active filters, e.g. "Status: Completed · PM: Moon". */
  subtitle?: string;
  columns: ExportColumn[];
  rows: string[][];
  fileName: string;
  /** Hex colour for a status-like cell, or null for the default text colour. */
  colorFor?: (columnIndex: number, value: string) => string | null;
}

const HEADER_BG = '#f3f4f6';
const HEADER_TEXT = '#6b7280';
const ZEBRA_BG = '#fafafa';

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [55, 65, 81];
}

// ── Excel ───────────────────────────────────────────────────────────────
export async function downloadTableXlsx(t: TableExport): Promise<void> {
  const { default: writeExcelFile } = await import('write-excel-file/browser');

  const header = [
    { value: '#', fontWeight: 'bold' as const, backgroundColor: HEADER_BG, textColor: HEADER_TEXT, alignVertical: 'center' as const },
    ...t.columns.map(c => ({
      value: c.label.toUpperCase(),
      fontWeight: 'bold' as const,
      backgroundColor: HEADER_BG,
      textColor: HEADER_TEXT,
      wrap: true,
      alignVertical: 'center' as const,
    })),
  ];

  const body = t.rows.map((row, ri) => {
    const bg = ri % 2 === 1 ? ZEBRA_BG : undefined;
    return [
      { value: ri + 1, textColor: '#9ca3af', alignVertical: 'top' as const, backgroundColor: bg },
      ...row.map((v, ci) => {
        const color = t.columns[ci].kind === 'status' && t.colorFor ? t.colorFor(ci, v) : null;
        if (!v) return { value: null, backgroundColor: bg };
        return {
          value: v,
          wrap: true,
          alignVertical: 'top' as const,
          backgroundColor: bg,
          ...(color ? { textColor: color, fontWeight: 'bold' as const } : {}),
        };
      }),
    ];
  });

  // Column widths from the content, capped so a long note can't make a column huge.
  const widths = [{ width: 5 }, ...t.columns.map((c, ci) => {
    const longest = t.rows.reduce((m, r) => Math.max(m, Math.min((r[ci] ?? '').length, 60)), 0);
    const base = c.kind === 'long' ? Math.max(longest, 30) : longest;
    return { width: Math.min(Math.max(c.label.length + 2, base + 2, 8), 60) };
  })];

  await writeExcelFile(
    [header, ...body] as never,
    { sheet: t.title.slice(0, 31), columns: widths, stickyRowsCount: 1 } as never,
  ).toFile(t.fileName);
}

// ── PDF ─────────────────────────────────────────────────────────────────
export async function downloadTablePdf(t: TableExport): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 10;

  // Title block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(17, 24, 39);
  doc.text(clean(t.title), margin, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(107, 114, 128);
  const countLine = `${t.rows.length} record${t.rows.length === 1 ? '' : 's'}`;
  let y = 19.5;
  doc.text(countLine, margin, y);
  if (t.subtitle) {
    const lines = doc.splitTextToSize(clean(`Filters: ${t.subtitle}`), pageW - margin * 2) as string[];
    lines.slice(0, 3).forEach(line => { y += 4.2; doc.text(line, margin, y); });
  }

  // # and the project-name column repeat when a wide table spills onto
  // further pages sideways, so every row stays identifiable.
  const nameIdx = t.columns.findIndex(c => /project name/i.test(c.label));
  const repeatCols = nameIdx >= 0 ? [0, nameIdx + 1] : [0];
  const columnStyles: Record<number, Record<string, unknown>> = { 0: { cellWidth: 9, textColor: [156, 163, 175] } };
  t.columns.forEach((c, i) => { if (c.kind === 'long') columnStyles[i + 1] = { cellWidth: 70 }; });

  autoTable(doc, {
    startY: y + 4,
    head: [['#', ...t.columns.map(c => clean(c.label).toUpperCase())]],
    body: t.rows.map((r, i) => [String(i + 1), ...r.map(v => clean(v) || '-')]),
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.8, overflow: 'linebreak', valign: 'top', textColor: [55, 65, 81], lineColor: [229, 231, 235], lineWidth: { bottom: 0.15 } as never },
    headStyles: { fillColor: hexToRgb(HEADER_BG), textColor: hexToRgb(HEADER_TEXT), fontStyle: 'bold', fontSize: 6.5 },
    alternateRowStyles: { fillColor: hexToRgb(ZEBRA_BG) },
    columnStyles: columnStyles as never,
    horizontalPageBreak: true,
    horizontalPageBreakRepeat: repeatCols,
    margin: { left: margin, right: margin, top: 12, bottom: 12 },
    didParseCell: data => {
      if (data.section !== 'body' || data.column.index === 0) return;
      const ci = data.column.index - 1;
      if (t.columns[ci]?.kind === 'status' && t.colorFor) {
        const color = t.colorFor(ci, t.rows[data.row.index]?.[ci] ?? '');
        if (color) { data.cell.styles.textColor = hexToRgb(color); data.cell.styles.fontStyle = 'bold'; }
      }
    },
  });

  // Footer with page numbers
  const total = doc.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text(`Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`, margin, pageH - 5);
    doc.text(`Page ${i} of ${total}`, pageW - margin, pageH - 5, { align: 'right' });
  }

  doc.save(t.fileName);
}
