import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData, fetchSheetTabNames, SheetData } from '@/lib/googleSheets';
import { PM_BANDWIDTH_SHEET_ID, PM_BANDWIDTH_ALL_DATA_SHEET_ID, USER_DETAILS_SHEET_ID, RANGE_USERS } from '@/lib/config';

export const runtime = 'nodejs';

// Two spreadsheets share this exact layout — PM_BANDWIDTH_SHEET_ID holds the
// current month's rows, PM_BANDWIDTH_ALL_DATA_SHEET_ID holds everything
// before it. Both get fetched and merged here so PM Projects sees one
// continuous dataset. Each spreadsheet used to hold one tab per PM (the tab
// name doubled as the PM's identity); both are now a single merged tab
// ("CurrentMonth" / "All Data PM") with every PM's rows sorted together, so
// __pm is instead resolved from each row's own "Email Address" column
// against the UserDetails roster. __sheetTab keeps the row's actual tab name
// (for write-back — see Dashboard.tsx's handlePmBandwidthChange) now that
// it's no longer the same value as __pm, and __sheetId says which
// spreadsheet a row came from so edits land back in the right one.
const SOURCES = [
  { sheetId: PM_BANDWIDTH_SHEET_ID, tag: 'current' },
  { sheetId: PM_BANDWIDTH_ALL_DATA_SHEET_ID, tag: 'archive' },
];

export async function GET(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: userRows } = await fetchSheetData(USER_DETAILS_SHEET_ID, RANGE_USERS);
    const emailToName = new Map<string, string>();
    userRows.forEach(r => {
      const email = String(r['Email'] ?? '').trim().toLowerCase();
      const name = String(r['Display Name'] ?? '').trim();
      if (email && name) emailToName.set(email, name);
    });

    let headers: string[] = [];
    const data: SheetData[] = [];

    for (const { sheetId, tag } of SOURCES) {
      const tabs = await fetchSheetTabNames(sheetId);
      const results = await Promise.all(
        tabs.map(tab => fetchSheetData(sheetId, `'${tab}'!A1:Z10000`))
      );
      tabs.forEach((tab, i) => {
        const { data: tabData, headers: tabHeaders } = results[i];
        if (tabHeaders.length > headers.length) headers = tabHeaders;
        const emailCol = tabHeaders.find(h => h.toLowerCase().includes('email'));
        tabData.forEach((row, idx) => {
          const email = emailCol ? String(row[emailCol] ?? '').trim().toLowerCase() : '';
          const pm = emailToName.get(email) ?? (email || '');
          data.push({ ...row, __pm: pm, __sheetTab: tab, __sheetId: sheetId, __id: `${tag}:${tab}:${idx}`, __row: idx + 2 });
        });
      });
    }

    return NextResponse.json({ success: true, data, headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
