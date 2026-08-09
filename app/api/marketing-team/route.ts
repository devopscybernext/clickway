import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData } from '@/lib/googleSheets';
import { MARKETING_TEAM_SHEET_ID, TAB_MARKETING_TASKS } from '@/lib/config';

export const runtime = 'nodejs';

// Single "Marketing Tasks" tab covering all sub-teams — distinguished by the
// Department column (SEO/PPC/SMM/...) rather than separate tabs.
export async function GET(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: rows, headers } = await fetchSheetData(MARKETING_TEAM_SHEET_ID, `'${TAB_MARKETING_TASKS}'!A1:Z10000`);
    const data = rows.map((row, idx) => ({ ...row, __row: idx + 2 }));

    return NextResponse.json({ success: true, data, headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
