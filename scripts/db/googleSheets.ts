// Read-only Google Sheets access for the one-time import and its check
// (db:import, db:verify). The dashboard itself never talks to Google — this
// file is only used by those two scripts, and only needs GOOGLE_CLIENT_EMAIL
// and GOOGLE_PRIVATE_KEY while they run.
import { google } from 'googleapis';
import { SheetResult, normalizeHeaders, toRow } from '../../lib/data/rows';

function sheetsClient() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  if (!privateKey || !clientEmail) {
    throw new Error('GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY are needed in .env.local to read Google Sheets');
  }
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

// Raw cell text exactly as the Sheets UI shows it (formatted values), header
// row first — what the import stores in MySQL.
export async function fetchRawValues(sheetId: string, range: string): Promise<string[][]> {
  const res = await sheetsClient().spreadsheets.values.get({ spreadsheetId: sheetId, range });
  return (res.data.values ?? []) as string[][];
}

// Rows converted exactly as the dashboard's data layer converts MySQL rows,
// so db:verify can compare the two side by side.
export async function fetchSheetData(
  sheetId: string,
  range: string,
  opts: { renameDuplicateHeaders?: boolean } = {}
): Promise<SheetResult> {
  const rows = await fetchRawValues(sheetId, range);
  if (rows.length === 0) return { data: [], headers: [] };
  const headers = normalizeHeaders(rows[0], opts.renameDuplicateHeaders);
  return { data: rows.slice(1).map((row, idx) => toRow(headers, row, idx + 2)), headers };
}

export async function fetchSheetTabNames(sheetId: string): Promise<string[]> {
  const res = await sheetsClient().spreadsheets.get({ spreadsheetId: sheetId, fields: 'sheets.properties.title' });
  return (res.data.sheets ?? [])
    .map(s => s.properties?.title)
    .filter((t): t is string => !!t);
}
