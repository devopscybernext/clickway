import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, verifySession } from '@/lib/session';
import { recordLoginEvent, parseCoordinates } from '@/lib/data/loginLog';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // Admin Portal > Login Tracker: who logged out (never stops the logout if it fails)
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  // The page sends the browser's coordinates when the person already allowed location
  const body = await req.json().catch(() => null);
  if (user) await recordLoginEvent('logout', user, req.headers, parseCoordinates(body));
  const res = NextResponse.json({ success: true });
  res.cookies.set(COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
