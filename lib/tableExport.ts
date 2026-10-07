// Downloads a table exactly as it's on screen — the rows left after filtering
// and the columns currently shown — as an Excel (.xlsx) file. The writer is
// loaded on demand so it only costs bytes when someone actually downloads.

export interface ExportColumn {
  label: string;
  /** 'status' = coloured text (via colorFor); 'long' = wide, wrapping free text. */
  kind?: 'text' | 'status' | 'long';
}

export interface TableExport {
  /** Used as the sheet name (Excel caps it at 31 characters). */
  title: string;
  columns: ExportColumn[];
  rows: string[][];
  fileName: string;
  /** Hex colour for a status-like cell, or null for the default text colour. */
  colorFor?: (columnIndex: number, value: string) => string | null;
  /** One flag per row (aligned with `rows`): true = fill the row light red. */
  flagged?: boolean[];
}

const HEADER_BG = '#f3f4f6';
const HEADER_TEXT = '#6b7280';
const ZEBRA_BG = '#fafafa';
// Light red fill for rows that need attention (replaces the zebra stripe).
const FLAG_BG = '#fee2e2';

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
    const flagged = !!t.flagged?.[ri];
    const bg = flagged ? FLAG_BG : ri % 2 === 1 ? ZEBRA_BG : undefined;
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
