import { google } from 'googleapis';
import { SheetData, SheetResult, normalizeHeaders, toRow } from './rows';

interface CacheEntry {
  data: SheetData[];
  timestamp: number;
  headers: string[];
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000; // 60 seconds

function getAuth() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  if (!privateKey || !clientEmail) {
    throw new Error('Server misconfigured — missing Google service account credentials');
  }
  return new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function sheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

// Raw cell text exactly as the Sheets UI shows it (formatted values), header
// row first. Used by the MySQL import so stored text matches what the
// dashboard displays today.
export async function fetchRawValues(sheetId: string, range: string): Promise<string[][]> {
  const res = await sheetsClient().spreadsheets.values.get({ spreadsheetId: sheetId, range });
  return (res.data.values ?? []) as string[][];
}

export async function fetchSheetData(
  sheetId: string,
  range: string,
  opts: { renameDuplicateHeaders?: boolean } = {}
): Promise<SheetResult> {
  const cacheKey = `${sheetId}:${range}${opts.renameDuplicateHeaders ? ':dedupe' : ''}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { data: cached.data, headers: cached.headers };
  }

  const rows = await fetchRawValues(sheetId, range);
  if (rows.length === 0) {
    return { data: [], headers: [] };
  }

  const headers = normalizeHeaders(rows[0], opts.renameDuplicateHeaders);
  // Every range this app reads starts at row 1, so data row i is sheet row i + 2.
  const data = rows.slice(1).map((row, idx) => toRow(headers, row, idx + 2));

  cache.set(cacheKey, { data, headers, timestamp: Date.now() });
  return { data, headers };
}

// Drops every cached read for a spreadsheet so the next fetch goes straight
// to the Sheets API instead of serving up-to-60s-stale data. Call this after
// any write (e.g. /api/update-status) so a page refresh right after an edit
// reflects it immediately rather than showing the pre-edit value until the
// cache entry naturally expires.
export function invalidateSheetCache(sheetId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${sheetId}:`)) cache.delete(key);
  }
}

interface TabListCacheEntry {
  tabs: string[];
  timestamp: number;
}
const tabListCache = new Map<string, TabListCacheEntry>();

// Lists tab (sheet) names within a spreadsheet — used where each tab holds a
// different slice of data (e.g. one tab per PM) and the set of tabs grows
// over time without code changes.
export async function fetchSheetTabNames(sheetId: string): Promise<string[]> {
  const cached = tabListCache.get(sheetId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.tabs;
  }

  const res = await sheetsClient().spreadsheets.get({ spreadsheetId: sheetId, fields: 'sheets.properties.title' });
  const tabs = (res.data.sheets ?? [])
    .map(s => s.properties?.title)
    .filter((t): t is string => !!t);

  tabListCache.set(sheetId, { tabs, timestamp: Date.now() });
  return tabs;
}

// Convert 0-based column index to A1 letter(s): 0→A, 25→Z, 26→AA …
function colToLetter(idx: number): string {
  let letter = '';
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

// row is the sheet row number (the __row handle from fetchSheetData).
export async function updateCell(sheetId: string, tab: string, row: number, colIndex: number, value: string): Promise<string> {
  const range = `'${tab}'!${colToLetter(colIndex)}${row}`;
  await sheetsClient().spreadsheets.values.update({
    spreadsheetId: sheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  });
  // A page refresh right after this write should show the new value, not
  // whatever was cached from before the edit.
  invalidateSheetCache(sheetId);
  return range;
}
