import * as sheets from './data/sheets';
import * as db from './data/mysql';

// Where the dashboard's data lives. Every route reads and writes through the
// functions below, which keep their Google-Sheets-era names and arguments
// (spreadsheet id + tab/range); DATA_SOURCE picks the backend:
//   DATA_SOURCE=sheets (default) — Google Sheets, as before
//   DATA_SOURCE=mysql            — the MySQL tables in lib/data/datasets.ts
// See docs/mysql-migration.md.

export type { SheetData, SheetResult } from './data/rows';
export { DataError } from './data/rows';

export type DataSourceName = 'sheets' | 'mysql';

export function dataSource(): DataSourceName {
  return process.env.DATA_SOURCE?.trim().toLowerCase() === 'mysql' ? 'mysql' : 'sheets';
}

export function fetchSheetData(
  sheetId: string,
  range: string = 'Sheet1!A1:Z10000',
  opts: { renameDuplicateHeaders?: boolean } = {}
) {
  return dataSource() === 'mysql' ? db.fetchSheetData(sheetId, range, opts) : sheets.fetchSheetData(sheetId, range, opts);
}

export function fetchSheetTabNames(sheetId: string): Promise<string[]> {
  return dataSource() === 'mysql' ? db.fetchSheetTabNames(sheetId) : sheets.fetchSheetTabNames(sheetId);
}

// MySQL reads aren't cached, so only the Sheets source has anything to drop.
export function invalidateSheetCache(sheetId: string): void {
  if (dataSource() === 'sheets') sheets.invalidateSheetCache(sheetId);
}

// Writes one cell. row is the __row handle a fetchSheetData() row carries;
// colIndex indexes the headers that same call returned. actor is recorded in
// MySQL's change_log. Returns a short description of the cell written.
export function updateSheetCell(
  sheetId: string, tab: string, row: number, colIndex: number, value: string, actor: string
): Promise<string> {
  return dataSource() === 'mysql'
    ? db.updateCell(sheetId, tab, row, colIndex, value, actor)
    : sheets.updateCell(sheetId, tab, row, colIndex, value);
}
