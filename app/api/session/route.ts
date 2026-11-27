import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { locationRequired } from '@/lib/data/loginLog';

export async function GET(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  // locationRequired: the dashboard only opens while the browser shares the location
  return NextResponse.json({ user, locationRequired: locationRequired() });
}
