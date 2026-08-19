import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData, fetchSheetTabNames, SheetData } from '@/lib/googleSheets';
import { MARKETING_TEAM_SHEET_ID } from '@/lib/config';

export const runtime = 'nodejs';

// "Current Month Tasks" plus an "All Marketing Tasks" archive tab for prior
// months — every sub-team lives in both, distinguished by the Department
// column (SEO/PPC/SMM/...) rather than separate tabs. Tabs are discovered
// dynamically (mirroring /api/bandwidth-tasks) so a future archive split
// needs no code change; every row is tagged with __sheet so edits route
// back to whichever tab it actually came from.
export async function GET(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tabs = await fetchSheetTabNames(MARKETING_TEAM_SHEET_ID);
    const results = await Promise.all(
      tabs.map(tab => fetchSheetData(MARKETING_TEAM_SHEET_ID, `'${tab}'!A1:Z10000`))
    );

    let headers: string[] = [];
    const data: SheetData[] = [];
    tabs.forEach((tab, i) => {
      const { data: tabData, headers: tabHeaders } = results[i];
      if (tabHeaders.length > headers.length) headers = tabHeaders;
      const tsCol = tabHeaders.find(h => h.toLowerCase().includes('timestamp'));
      tabData.forEach((row, idx) => {
        if (tsCol && String(row[tsCol] ?? '').trim() === '') return; // skip blank rows
        data.push({ ...row, __sheet: tab, __id: `${tab}::${idx + 2}`, __row: idx + 2 });
      });
    });

    return NextResponse.json({ success: true, data, headers, tabs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
