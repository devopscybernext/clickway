import { google } from 'googleapis';

export interface SheetData {
  [key: string]: string | number;
}

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

export async function fetchSheetData(
  sheetId: string,
  range: string = 'Sheet1!A1:Z10000'
): Promise<{ data: SheetData[]; headers: string[] }> {
  const cacheKey = `${sheetId}:${range}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { data: cached.data, headers: cached.headers };
  }

  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
  const rows = (res.data.values ?? []) as string[][];

  if (rows.length === 0) {
    return { data: [], headers: [] };
  }

  const headers = rows[0].map((h, i) => (h ?? '').trim() || `Column ${i + 1}`);
  const data: SheetData[] = rows.slice(1).map((row) => {
    const obj: SheetData = {};
    headers.forEach((header, i) => {
      const val = row[i] ?? '';
      const num = Number(String(val).replace(/,/g, ''));
      obj[header] = val !== '' && !isNaN(num) ? num : val;
    });
    return obj;
  });

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

  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const res = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: 'sheets.properties.title' });
  const tabs = (res.data.sheets ?? [])
    .map(s => s.properties?.title)
    .filter((t): t is string => !!t);

  tabListCache.set(sheetId, { tabs, timestamp: Date.now() });
  return tabs;
}
