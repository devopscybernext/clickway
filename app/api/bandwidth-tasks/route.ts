import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData, fetchSheetTabNames, SheetData } from '@/lib/googleSheets';
import { SHEET_IDS, TAB_BANDWIDTH, TAB_AVAILABILITY, TAB_QA_TESTING, TAB_LEADERBOARD } from '@/lib/config';

export const runtime = 'nodejs';

// Bandwidth Allocation stays a rolling ~2-month window of active tasks —
// every couple of months the older rows get moved to a new "Task - <range>"
// tab in the same spreadsheet so the live sheet doesn't grow unbounded.
// Every non-task tab is excluded by name; everything else (Bandwidth
// Allocation plus any number of archive tabs) is fetched and merged, so a
// newly created archive tab is picked up automatically with no code change.
const NON_TASK_TABS = new Set([TAB_AVAILABILITY, TAB_QA_TESTING, TAB_LEADERBOARD]);

export async function GET(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const allTabs = await fetchSheetTabNames(SHEET_IDS['1']);
    const taskTabs = allTabs.filter(t => !NON_TASK_TABS.has(t));
    // Always fetch the current tab even if tab discovery somehow misses it
    if (!taskTabs.includes(TAB_BANDWIDTH)) taskTabs.push(TAB_BANDWIDTH);

    const results = await Promise.all(
      taskTabs.map(tab => fetchSheetData(SHEET_IDS['1'], `'${tab}'!A1:Z2000`))
    );

    let headers: string[] = [];
    const data: SheetData[] = [];
    taskTabs.forEach((tab, i) => {
      const { data: tabData, headers: tabHeaders } = results[i];
      if (tabHeaders.length > headers.length) headers = tabHeaders;
      const tsCol = tabHeaders.find(h => h.toLowerCase().includes('timestamp'));
      tabData.forEach((row, idx) => {
        if (tsCol && String(row[tsCol] ?? '').trim() === '') return; // skip blank rows
        data.push({ ...row, __sheet: tab, __id: `${tab}::${idx + 2}`, __row: idx + 2 });
      });
    });

    return NextResponse.json({ success: true, data, headers, tabs: taskTabs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
