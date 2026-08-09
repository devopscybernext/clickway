import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData, fetchSheetTabNames, SheetData } from '@/lib/googleSheets';
import { PM_BANDWIDTH_SHEET_ID } from '@/lib/config';

export const runtime = 'nodejs';

// Each tab in the PM Bandwidth spreadsheet is one PM's data (e.g. "Muskan").
// Tabs are discovered dynamically so new PMs don't require a code change —
// every row is tagged with __pm (the tab/PM name) so the client can split
// into "All Projects" vs "My Projects".
export async function GET(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tabs = await fetchSheetTabNames(PM_BANDWIDTH_SHEET_ID);
    const results = await Promise.all(
      tabs.map(tab => fetchSheetData(PM_BANDWIDTH_SHEET_ID, `'${tab}'!A1:Z10000`))
    );

    let headers: string[] = [];
    const data: SheetData[] = [];
    tabs.forEach((tab, i) => {
      const { data: tabData, headers: tabHeaders } = results[i];
      if (tabHeaders.length > headers.length) headers = tabHeaders;
      tabData.forEach((row, idx) => data.push({ ...row, __pm: tab, __id: `${tab}:${idx}`, __row: idx + 2 }));
    });

    return NextResponse.json({ success: true, data, headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
