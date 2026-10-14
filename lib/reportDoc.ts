// A small, report-agnostic document model. The Deadline Tracker, Workload
// Balance and Estimation Accuracy reports each build one of these from the task
// rows; reportDocPdf.ts and reportDocExcel.ts then draw it. Keeping the numbers
// and the drawing apart means the PDF and the Excel file always agree.

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export const TONE: Record<Tone, { fill: string; text: string }> = {
  good: { fill: '#dcfce7', text: '#166534' },
  warn: { fill: '#fef3c7', text: '#92400e' },
  bad: { fill: '#fee2e2', text: '#991b1b' },
  neutral: { fill: '#f3f4f6', text: '#4b5563' },
};

export interface DocCell {
  text: string;
  /** Makes the cell a link; the cell shows `text` (e.g. "Open") */
  url?: string;
  tone?: Tone;
  bold?: boolean;
  /** A small meter under the text: pct 0-150, with a tick at 100 */
  bar?: { pct: number; tone: Tone };
}
export type Cell = string | DocCell;

export interface DocTable {
  title?: string;
  head: string[];
  rows: Cell[][];
  foot?: Cell[];
  /** Column widths in mm for the PDF; leave an entry undefined to size it automatically */
  widths?: (number | undefined)[];
}

export interface DocSection {
  /** Usually the resource's name */
  title: string;
  verdict?: { label: string; tone: Tone };
  /** Short facts shown under the title, joined with "|" */
  facts: string[];
  notes?: string[];
  tables: DocTable[];
}

export interface ReportDoc {
  /** Small orange label, e.g. "DEADLINE TRACKER  |  MARKETING" */
  eyebrow: string;
  title: string;
  rangeLabel: string;
  stats: { label: string; value: string }[];
  /** One row per section, in the same order; the PDF adds a clickable PAGE column */
  summary: DocTable;
  /** Legend / how-to-read lines under the summary */
  legend?: string[];
  /** Extra tables on the overview (e.g. rebalancing ideas) */
  extras?: DocTable[];
  sections: DocSection[];
  /** File name without the extension */
  fileName: string;
}

export const cellText = (c: Cell): string => (typeof c === 'string' ? c : c.text);
export const asCell = (c: Cell): DocCell => (typeof c === 'string' ? { text: c } : c);
