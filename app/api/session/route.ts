import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';

export async function GET(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  return NextResponse.json({ user });
}
