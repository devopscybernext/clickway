import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { saveBrowserLocation } from '@/lib/data/loginLog';

export const runtime = 'nodejs';

// After logging in, the dashboard asks the browser for the person's location; when they allow it, the
// coordinates come here and are saved on their latest login (Admin Portal > Login Tracker).
export async function POST(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({})) as { latitude?: unknown; longitude?: unknown; accuracy?: unknown };
    const lat = Number(body.latitude), lng = Number(body.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return NextResponse.json({ success: false, error: 'Invalid location' }, { status: 400 });
    }
    const acc = Number(body.accuracy);
    const saved = await saveBrowserLocation(user.username, Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6,
      Number.isFinite(acc) && acc >= 0 ? Math.min(Math.round(acc), 4_000_000) : null);
    return NextResponse.json({ success: true, saved });
  } catch (err) {
    console.error('[login-log] browser location', err);
    return NextResponse.json({ success: false, error: 'Could not save the location' }, { status: 500 });
  }
}
