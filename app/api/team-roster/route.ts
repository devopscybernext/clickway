import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { loadRoster } from '@/lib/rosterServer';
import { isDirectBrowserNavigation } from '@/lib/blockDirectAccess';

// Who is on the Web and Marketing teams (and in which sub department), taken from
// the accounts the Admin Portal manages — what the forms' resource lists and the
// Team Bandwidth cards are built from. Names and departments only: no emails,
// usernames or password hashes. Any logged-in user may read it.
export async function GET(req: NextRequest) {
  if (isDirectBrowserNavigation(req)) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ success: true, members: await loadRoster() });
}
