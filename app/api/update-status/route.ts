import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { updateSheetCell, DataError } from '@/lib/dataStore';
import { isWritableTab } from '@/lib/sheetAccess';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { spreadsheetId, sheetName, row, colIndex, value } = await req.json() as {
      spreadsheetId: string;
      sheetName: string; // tab name — required so the write target is always explicit
      row: number;       // the row's __row handle (sheet row number, or MySQL id)
      colIndex: number;  // 0-based column index
      value: string;
    };

    if (!spreadsheetId || !sheetName || !row || colIndex === undefined || value === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Only the spreadsheets/tabs the dashboard edits — credentials (the
    // UserDetails spreadsheet, the Sheet2 password tabs) are never writable here.
    if (!isWritableTab(spreadsheetId, sheetName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const range = await updateSheetCell(spreadsheetId, sheetName, Number(row), Number(colIndex), String(value), user.username);
    return NextResponse.json({ success: true, range });
  } catch (err: unknown) {
    console.error('[update-status]', err);
    const status = err instanceof DataError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status }
    );
  }
}
