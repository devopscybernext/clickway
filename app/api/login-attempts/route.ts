import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { listFailedDevices, unblockDevice } from '@/lib/data/loginGuard';
import { canManageUsers } from '@/lib/auth';
import { isDirectBrowserNavigation } from '@/lib/blockDirectAccess';

export const runtime = 'nodejs';

// Admin Portal > Login Tracker > Failed attempts (HM and Admin):
//   GET     devices with wrong logins in the last day, and whether each is blocked now
//   DELETE  ?key=…  unblocks one device (forgets its wrong logins)
function admin(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  return user && canManageUsers(user.role) ? user : null;
}

export async function GET(req: NextRequest) {
  if (isDirectBrowserNavigation(req)) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  if (!admin(req)) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ success: true, devices: await listFailedDevices() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[login-attempts]', err);
    return NextResponse.json({ success: false, error: 'Could not load the failed attempts' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!admin(req)) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const key = req.nextUrl.searchParams.get('key') ?? '';
    const done = await unblockDevice(key);
    return NextResponse.json({ success: true, message: done ? 'Device unblocked. It can log in again now.' : 'This device has no failed attempts left.' });
  } catch (err) {
    console.error('[login-attempts]', err);
    return NextResponse.json({ success: false, error: 'Could not unblock the device' }, { status: 500 });
  }
}
