import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { fetchSheetData } from '@/lib/googleSheets';
import { USER_DETAILS_SHEET_ID, RANGE_USERS } from '@/lib/config';
import { signSession, COOKIE_NAME } from '@/lib/session';
import { MOD_ENABLED, Role, AuthUser } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json() as { username?: string; password?: string };
    if (!username || !password) {
      return NextResponse.json({ success: false, error: 'Username and password are required' }, { status: 400 });
    }

    const { data } = await fetchSheetData(USER_DETAILS_SHEET_ID, RANGE_USERS);
    const row = data.find(
      r => String(r['Username'] ?? '').trim().toLowerCase() === username.trim().toLowerCase()
    );

    const invalidResponse = () =>
      NextResponse.json({ success: false, error: 'Invalid username or password.' }, { status: 401 });

    if (!row) return invalidResponse();

    const hash = String(row['Password Hash'] ?? '');
    if (!hash) return invalidResponse();

    const ok = await bcrypt.compare(password, hash);
    if (!ok) return invalidResponse();

    const role = String(row['Role'] ?? '').trim() as Role;
    if (role === 'mod' && !MOD_ENABLED) return invalidResponse();

    const user: AuthUser = {
      username: String(row['Username']).trim(),
      role,
      displayName: String(row['Display Name'] ?? row['Username']).trim(),
      email: row['Email'] ? String(row['Email']).trim() : undefined,
    };

    const { token, maxAge } = signSession(user);
    const res = NextResponse.json({ success: true, user });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge,
    });
    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
