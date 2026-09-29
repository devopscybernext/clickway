import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData, invalidateSheetCache } from '@/lib/googleSheets';
import { USER_DETAILS_SHEET_ID, RANGE_USERS, TAB_USERS } from '@/lib/config';
import { isAdminTierRole } from '@/lib/auth';
import { isDirectBrowserNavigation } from '@/lib/blockDirectAccess';

// Admin Portal — lets HM/Admin/Mod view and edit the UserDetails roster.
// Deliberately its own route rather than reusing the generic
// /api/data + /api/update-status pair: those two explicitly forbid ever
// touching UserDetails (credentials live there), so this route exists as
// the one narrow, admin-gated exception — it never reads or writes
// Password Hash, and only ever writes the Role or Display Name column.

// Only these two columns are ever writable through this route.
const EDITABLE_FIELDS = ['Role', 'Display Name'] as const;
type EditableField = typeof EDITABLE_FIELDS[number];

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

export async function GET(req: NextRequest) {
  if (isDirectBrowserNavigation(req)) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }

  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user || !isAdminTierRole(user.role)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { data, headers } = await fetchSheetData(USER_DETAILS_SHEET_ID, RANGE_USERS);
  const usernameCol = headers.find(h => h.toLowerCase() === 'username');
  const roleCol = headers.find(h => h.toLowerCase() === 'role');
  const displayNameCol = headers.find(h => h.toLowerCase() === 'display name');
  const emailCol = headers.find(h => h.toLowerCase() === 'email');

  // Row number mirrors every other sheet-backed list in this app (idx + 2:
  // 1 for the header row, 1 to convert 0-based to 1-based) — needed so an
  // edit here can be written back to the exact right row.
  const users = data
    .map((r, idx) => ({
      row: idx + 2,
      username: usernameCol ? String(r[usernameCol] ?? '').trim() : '',
      role: roleCol ? String(r[roleCol] ?? '').trim() : '',
      displayName: displayNameCol ? String(r[displayNameCol] ?? '').trim() : '',
      email: emailCol ? String(r[emailCol] ?? '').trim() : '',
    }))
    .filter(u => u.username);

  return NextResponse.json({ success: true, users });
}

export async function POST(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user || !isAdminTierRole(user.role)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { row, field, value } = await req.json() as { row?: number; field?: string; value?: string };
  if (!row || row < 2 || !field || value === undefined) {
    return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
  }
  if (!EDITABLE_FIELDS.includes(field as EditableField)) {
    return NextResponse.json({ success: false, error: 'Field is not editable' }, { status: 403 });
  }

  const { headers } = await fetchSheetData(USER_DETAILS_SHEET_ID, RANGE_USERS);
  const colIndex = headers.findIndex(h => h.toLowerCase() === field.toLowerCase());
  if (colIndex === -1) {
    return NextResponse.json({ success: false, error: 'Column not found' }, { status: 400 });
  }

  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  if (!privateKey || !clientEmail) {
    return NextResponse.json({ success: false, error: 'Server misconfigured — missing credentials' }, { status: 500 });
  }

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: USER_DETAILS_SHEET_ID,
      range: `'${TAB_USERS}'!${colToLetter(colIndex)}${row}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[value]] },
    });
    invalidateSheetCache(USER_DETAILS_SHEET_ID);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
