import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData } from '@/lib/googleSheets';
import { USER_DETAILS_SHEET_ID, RANGE_USERS } from '@/lib/config';
import { isDirectBrowserNavigation } from '@/lib/blockDirectAccess';
import { Role, isPmTierRole } from '@/lib/auth';

// Returns the PM roster (username/displayName/email only — never the password
// hash) for admins to scope PM-specific views against. Requires a valid
// session; never exposes UserDetails rows through the generic /api/data proxy.
// Covers every PM-tier role (isPmTierRole — legacy "pm" plus
// PMWebAdmin/PMMarketingAdmin), not just the legacy "pm" string, so a
// migrated PM account (e.g. Muskan as PMMarketingAdmin) still shows up.
export async function GET(req: NextRequest) {
  if (isDirectBrowserNavigation(req)) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }

  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await fetchSheetData(USER_DETAILS_SHEET_ID, RANGE_USERS);
  const pmUsers = data
    .filter(r => isPmTierRole(String(r['Role'] ?? '').trim() as Role) && r['Email'] && String(r['Username'] ?? '').trim() !== 'pmteam')
    .map(r => ({
      username: String(r['Username'] ?? '').trim(),
      role: String(r['Role'] ?? '').trim() as Role,
      displayName: String(r['Display Name'] ?? '').trim(),
      email: String(r['Email'] ?? '').trim(),
    }));

  return NextResponse.json({ success: true, pmUsers });
}
