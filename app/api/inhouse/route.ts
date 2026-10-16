import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData, fetchSheetTabNames } from '@/lib/googleSheets';
import { INHOUSE_SHEET_ID } from '@/lib/config';

export const runtime = 'nodejs';

// Cybernext InHouse: the Websites and Case Studies lists, each from its own
// tab of the portfolio spreadsheet. Read-only; any logged-in user may read it.
export async function GET(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tabs = await fetchSheetTabNames(INHOUSE_SHEET_ID);
    const find = (word: string) => tabs.find(t => t.toLowerCase().includes(word));
    const websitesTab = find('website');
    const caseStudiesTab = find('portfolio');

    const load = async (tab: string | undefined) => {
      if (!tab) return { headers: [] as string[], data: [] };
      const { data, headers } = await fetchSheetData(INHOUSE_SHEET_ID, `'${tab}'!A1:Z10000`);
      const nameCol = headers.find(h => h.trim().toLowerCase() === 'website name') ?? headers[0];
      // blank rows (the sheet has ~1000 grid rows) carry no card
      return { headers, data: data.filter(r => nameCol && String(r[nameCol] ?? '').trim() !== '') };
    };

    const [websites, caseStudies] = await Promise.all([load(websitesTab), load(caseStudiesTab)]);
    return NextResponse.json({ success: true, websites, caseStudies });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
