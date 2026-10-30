import * as db from './data/mysql';

// The dashboard's data store: MySQL. Every route reads and writes through
// these functions. They keep the (dataset key, tab/range) arguments the app
// was built around — the ids in lib/config.ts name each dataset, and
// lib/data/datasets.ts maps every (id, tab) to its table.
// See docs/mysql-migration.md.

export type { SheetData, SheetResult } from './data/rows';
export { DataError } from './data/rows';

export function fetchSheetData(
  sheetId: string,
  range: string,
  opts: { renameDuplicateHeaders?: boolean } = {}
) {
  return db.fetchSheetData(sheetId, range, opts);
}

export function fetchSheetTabNames(sheetId: string): Promise<string[]> {
  return db.fetchSheetTabNames(sheetId);
}

// Copies a row as a new row (overrides replaces some cells) / removes a row. row is the
// __row handle. Both are recorded in change_log.
export function duplicateSheetRow(
  sheetId: string, tab: string, row: number, overrides: Record<string, string>, actor: string
): Promise<number> {
  return db.duplicateRow(sheetId, tab, row, overrides, actor);
}
export function deleteSheetRow(sheetId: string, tab: string, row: number, actor: string): Promise<void> {
  return db.deleteRow(sheetId, tab, row, actor);
}

// Writes one cell. row is the __row handle (the row's MySQL id) a
// fetchSheetData() row carries; colIndex indexes the headers that same call
// returned. actor is recorded in change_log. Returns a short description of
// the cell written.
export function updateSheetCell(
  sheetId: string, tab: string, row: number, colIndex: number, value: string, actor: string
): Promise<string> {
  return db.updateCell(sheetId, tab, row, colIndex, value, actor);
}
