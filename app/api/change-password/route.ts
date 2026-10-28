import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData, DataError } from '@/lib/dataStore';
import { updateUser } from '@/lib/data/users';
import { USER_DETAILS_SHEET_ID, RANGE_USERS } from '@/lib/config';

export const runtime = 'nodejs';

// Lets any logged-in user change their own password: the current one must be
// right, so a borrowed session can't quietly lock the owner out. Wrong guesses
// are counted per account and paused after a few, so the current password can't
// be guessed through this route either.
const MIN_PASSWORD = 8;
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; since: number }>();

export async function POST(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { currentPassword, newPassword } = await req.json().catch(() => ({})) as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ success: false, error: 'Enter your current and your new password' }, { status: 400 });
  }
  if (newPassword.length < MIN_PASSWORD || newPassword.length > 128) {
    return NextResponse.json({ success: false, error: `The new password must be ${MIN_PASSWORD}-128 characters` }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ success: false, error: 'The new password must be different from the current one' }, { status: 400 });
  }

  const key = user.username.toLowerCase();
  const seen = failures.get(key);
  if (seen && Date.now() - seen.since < WINDOW_MS && seen.count >= MAX_FAILURES) {
    return NextResponse.json({ success: false, error: 'Too many wrong attempts. Try again in a few minutes.' }, { status: 429 });
  }

  const { data } = await fetchSheetData(USER_DETAILS_SHEET_ID, RANGE_USERS);
  const row = data.find(r => String(r['Username'] ?? '').trim().toLowerCase() === key);
  const hash = row ? String(row['Password Hash'] ?? '') : '';
  if (!row || !hash || !(await bcrypt.compare(currentPassword, hash))) {
    const fresh = seen && Date.now() - seen.since < WINDOW_MS ? seen : { count: 0, since: Date.now() };
    failures.set(key, { count: fresh.count + 1, since: fresh.since });
    return NextResponse.json({ success: false, error: 'Your current password is not correct' }, { status: 403 });
  }

  try {
    await updateUser(Number(row.__row), { passwordHash: await bcrypt.hash(newPassword, 10) }, user.username);
    failures.delete(key);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Could not change the password' },
      { status: err instanceof DataError ? err.status : 500 }
    );
  }
}
