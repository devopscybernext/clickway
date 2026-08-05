import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData, SheetData } from '@/lib/googleSheets';
import { MARKETING_TEAM_SHEET_ID } from '@/lib/config';

export const runtime = 'nodejs';

// Fixed tabs (unlike PM Bandwidth's dynamic discovery — Marketing's three
// sub-teams are already wired up in the UI). Each row is tagged with __sub
// (lowercase sub-team key) so the client can split by SEO/PPC/SMM.
const SUB_TEAMS = [
  { key: 'seo', tab: 'SEO' },
  { key: 'ppc', tab: 'PPC' },
  { key: 'smm', tab: 'SMM' },
] as const;

export async function GET(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await Promise.all(
      SUB_TEAMS.map(({ tab }) => fetchSheetData(MARKETING_TEAM_SHEET_ID, `'${tab}'!A1:Z1000`))
    );

    let headers: string[] = [];
    const data: SheetData[] = [];
    SUB_TEAMS.forEach(({ key, tab }, i) => {
      const { data: tabData, headers: tabHeaders } = results[i];
      if (tabHeaders.length > headers.length) headers = tabHeaders;
      tabData.forEach((row, idx) => data.push({ ...row, __sub: key, __tab: tab, __id: `${key}:${idx}`, __row: idx + 2 }));
    });

    return NextResponse.json({ success: true, data, headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
