import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData, fetchSheetTabNames } from '@/lib/dataStore';
import { INHOUSE_SHEET_ID } from '@/lib/config';
import { canSeeInHouseFull } from '@/lib/auth';

export const runtime = 'nodejs';

// Cybernext InHouse: Websites, Case Studies, Brand Kit and Documentations, each
// from its own tab of the portfolio spreadsheet. Read-only. Everyone logged in gets
// Brand Kit; Websites, Case Studies and Documentations are only sent to HM and Admin
// (see canSeeInHouseFull) — for anyone else they are left out of the response.
export async function GET(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const full = canSeeInHouseFull(user.role);

  try {
    const tabs = await fetchSheetTabNames(INHOUSE_SHEET_ID);
    const find = (word: string) => tabs.find(t => t.toLowerCase().includes(word));
    const websitesTab = find('website');
    const caseStudiesTab = find('portfolio');
    const brandKitTab = find('brand');
    const documentationsTab = find('documentation');

    const load = async (tab: string | undefined) => {
      if (!tab) return { headers: [] as string[], data: [] };
      const { data, headers } = await fetchSheetData(INHOUSE_SHEET_ID, `'${tab}'!A1:Z10000`);
      const nameCol = headers.find(h => h.trim().toLowerCase() === 'website name') ?? headers[0];
      // blank rows (the sheet has ~1000 grid rows) carry no card
      return { headers, data: data.filter(r => nameCol && String(r[nameCol] ?? '').trim() !== '') };
    };

    const brandKit = await load(brandKitTab);
    if (!full) return NextResponse.json({ success: true, brandKit });
    const [websites, caseStudies, documentations] = await Promise.all([load(websitesTab), load(caseStudiesTab), load(documentationsTab)]);
    return NextResponse.json({ success: true, websites, caseStudies, brandKit, documentations });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
