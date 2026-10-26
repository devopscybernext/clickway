export interface SheetData {
  [key: string]: string | number;
}

export interface SheetResult {
  data: SheetData[];
  headers: string[];
}

// Thrown for requests the data layer refuses (unknown dataset, bad column,
// missing row) — routes turn `status` into the HTTP response code.
export class DataError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// renameDuplicateHeaders: rows are plain objects keyed by header text, so two
// columns with the same header would silently overwrite each other (the later,
// often blank, one wins). With this flag a repeat becomes "Month (2)" — column
// positions and the headers array length stay untouched, nothing is dropped.
export function normalizeHeaders(raw: unknown[], renameDuplicates = false): string[] {
  let headers = raw.map((h, i) => String(h ?? '').trim() || `Column ${i + 1}`);
  if (renameDuplicates) {
    const seen = new Map<string, number>();
    headers = headers.map(h => {
      const n = (seen.get(h) ?? 0) + 1;
      seen.set(h, n);
      return n === 1 ? h : `${h} (${n})`;
    });
  }
  return headers;
}

// Same cell conversion for both data sources: numeric-looking text (commas
// allowed) becomes a number, everything else stays text. __row is the row's
// write-back handle — the sheet row number for Google Sheets, the primary key
// for MySQL — so callers pass it straight back to updateSheetCell().
export function toRow(headers: string[], cells: unknown[], rowHandle: number): SheetData {
  const obj: SheetData = {};
  headers.forEach((header, i) => {
    const val = cells[i] ?? '';
    const num = Number(String(val).replace(/,/g, ''));
    obj[header] = val !== '' && !isNaN(num) ? num : (val as string);
  });
  obj.__row = rowHandle;
  return obj;
}
