import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { listLoginLog } from '@/lib/data/loginLog';
import { canManageUsers } from '@/lib/auth';
import { isDirectBrowserNavigation } from '@/lib/blockDirectAccess';

export const runtime = 'nodejs';

// Admin Portal > Login Tracker (HM and Admin): every sign-in and sign-out of the last 90 days.
export async function GET(req: NextRequest) {
  if (isDirectBrowserNavigation(req)) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user || !canManageUsers(user.role)) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ success: true, rows: await listLoginLog() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[login-log]', err);
    return NextResponse.json({ success: false, error: 'Could not load the login history' }, { status: 500 });
  }
}
