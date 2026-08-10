import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { TAB_USERS, USER_DETAILS_SHEET_ID } from '@/lib/config';
import { invalidateSheetCache } from '@/lib/googleSheets';

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

export async function POST(req: NextRequest) {
  try {
    const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { spreadsheetId, sheetName, row, colIndex, value } = await req.json() as {
      spreadsheetId: string;
      sheetName?: string; // optional tab name; defaults to the spreadsheet's first sheet
      row: number;       // 1-based row number in the sheet (including header)
      colIndex: number;  // 0-based column index
      value: string;
    };

    if (!spreadsheetId || !row || colIndex === undefined || value === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Credentials live only behind /api/login — never writable through this
    // route. Scoped to the actual credentials spreadsheet (not just the tab
    // name) since other spreadsheets — e.g. the Leave sheet — happen to
    // reuse "UserDetails" as a tab name for unrelated data.
    if (spreadsheetId === USER_DETAILS_SHEET_ID && sheetName && sheetName.trim().toLowerCase() === TAB_USERS.toLowerCase()) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;

    if (!privateKey || !clientEmail) {
      return NextResponse.json({ error: 'Server misconfigured — missing credentials' }, { status: 500 });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: clientEmail, private_key: privateKey },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const cell = `${colToLetter(colIndex)}${row}`;
    const range = sheetName ? `'${sheetName}'!${cell}` : cell;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [[value]] },
    });

    // A page refresh right after this write should show the new value, not
    // whatever was cached from before the edit.
    invalidateSheetCache(spreadsheetId);

    return NextResponse.json({ success: true, range });
  } catch (err: unknown) {
    console.error('[update-status]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
