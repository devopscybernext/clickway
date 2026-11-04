import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { listFor, markRead } from '@/lib/data/notifications';
import { isDirectBrowserNavigation } from '@/lib/blockDirectAccess';

export const runtime = 'nodejs';

// The bell. A person only ever reads and marks their own notifications (the last three days).
//   GET                                    — { items, unread }
//   POST { ids: number[] } or { all: true } — mark as read
export async function GET(req: NextRequest) {
  if (isDirectBrowserNavigation(req)) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const { items, unread } = await listFor(user.username);
    return NextResponse.json({ success: true, items, unread }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[notifications]', err);
    return NextResponse.json({ success: false, error: 'Could not load notifications' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { ids?: unknown; all?: boolean };
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 200) : [];
  if (!body.all && ids.length === 0) return NextResponse.json({ success: false, error: 'Nothing to mark' }, { status: 400 });
  try {
    await markRead(user.username, body.all ? 'all' : ids);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[notifications]', err);
    return NextResponse.json({ success: false, error: 'Could not update notifications' }, { status: 500 });
  }
}
