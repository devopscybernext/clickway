import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { listLog, clearAll } from '@/lib/data/notifications';
import { canViewNotificationLog, canClearNotifications } from '@/lib/auth';
import { isDirectBrowserNavigation } from '@/lib/blockDirectAccess';

export const runtime = 'nodejs';

// Admin Portal > Notifications: every notification of the last thirty days, in one table.
//   GET     — HM and Admin
//   DELETE  — Admin only: clears every bell and the log at once
export async function GET(req: NextRequest) {
  if (isDirectBrowserNavigation(req)) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user || !canViewNotificationLog(user.role)) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ success: true, rows: await listLog(), canClear: canClearNotifications(user.role) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[notification-log]', err);
    return NextResponse.json({ success: false, error: 'Could not load the notifications' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user || !canClearNotifications(user.role)) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    await clearAll();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[notification-log]', err);
    return NextResponse.json({ success: false, error: 'Could not clear the notifications' }, { status: 500 });
  }
}
