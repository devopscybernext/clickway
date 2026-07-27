import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData } from '@/lib/googleSheets';
import { SHEET_IDS, RANGE_USERS } from '@/lib/config';
import { isDirectBrowserNavigation } from '@/lib/blockDirectAccess';

// Returns the PM roster (username/displayName/email only — never the password
// hash) for admins to scope PM-specific views against. Requires a valid
// session; never exposes UserDetails rows through the generic /api/data proxy.
export async function GET(req: NextRequest) {
  if (isDirectBrowserNavigation(req)) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }

  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await fetchSheetData(SHEET_IDS['1'], RANGE_USERS);
  const pmUsers = data
    .filter(r => String(r['Role'] ?? '').trim() === 'pm' && r['Email'] && String(r['Username'] ?? '').trim() !== 'pmteam')
    .map(r => ({
      username: String(r['Username'] ?? '').trim(),
      role: 'pm' as const,
      displayName: String(r['Display Name'] ?? '').trim(),
      email: String(r['Email'] ?? '').trim(),
    }));

  return NextResponse.json({ success: true, pmUsers });
}
