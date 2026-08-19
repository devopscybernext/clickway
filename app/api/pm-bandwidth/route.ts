import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData, fetchSheetTabNames, SheetData } from '@/lib/googleSheets';
import { PM_BANDWIDTH_SHEET_ID, PM_BANDWIDTH_ALL_DATA_SHEET_ID } from '@/lib/config';

export const runtime = 'nodejs';

// Two spreadsheets share this exact layout (one tab per PM, e.g. "Muskan"):
// PM_BANDWIDTH_SHEET_ID holds the current month's rows, PM_BANDWIDTH_ALL_DATA_SHEET_ID
// holds everything before it. Both get fetched and merged here so PM Projects
// sees one continuous dataset. Tabs are discovered dynamically per spreadsheet
// so new PMs don't require a code change — every row is tagged with __pm (the
// tab/PM name) so the client can split into "All Projects" vs "My Projects",
// and __sheetId (which spreadsheet it came from) so cell edits write back to
// the right one instead of always targeting the current-month sheet.
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
        tabData.forEach((row, idx) => data.push({ ...row, __pm: tab, __sheetId: sheetId, __id: `${tag}:${tab}:${idx}`, __row: idx + 2 }));
      });
    }

    return NextResponse.json({ success: true, data, headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
