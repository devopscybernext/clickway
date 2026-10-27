import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData, updateSheetCell, DataError } from '@/lib/dataStore';
import { USER_DETAILS_SHEET_ID, RANGE_USERS, TAB_USERS } from '@/lib/config';
import { isAdminTierRole } from '@/lib/auth';
import { isDirectBrowserNavigation } from '@/lib/blockDirectAccess';

// Admin Portal — lets HM/Admin/Mod view and edit the UserDetails roster.
// Deliberately its own route rather than reusing the generic
// /api/data + /api/update-status pair: those two explicitly forbid ever
// touching UserDetails (credentials live there), so this route exists as
// the one narrow, admin-gated exception — it never reads or writes
// Password Hash, and only ever writes the Role or Display Name column.

// Only these two columns are ever writable through this route.
const EDITABLE_FIELDS = ['Role', 'Display Name'] as const;
type EditableField = typeof EDITABLE_FIELDS[number];

export async function GET(req: NextRequest) {
  if (isDirectBrowserNavigation(req)) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }

  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user || !isAdminTierRole(user.role)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { data, headers } = await fetchSheetData(USER_DETAILS_SHEET_ID, RANGE_USERS);
  const usernameCol = headers.find(h => h.toLowerCase() === 'username');
  const roleCol = headers.find(h => h.toLowerCase() === 'role');
  const displayNameCol = headers.find(h => h.toLowerCase() === 'display name');
  const emailCol = headers.find(h => h.toLowerCase() === 'email');

  // row is the user's write-back handle (__row, the MySQL id) — needed so an
  // edit here lands on exactly the right user.
  const users = data
    .map(r => ({
      row: Number(r.__row),
      username: usernameCol ? String(r[usernameCol] ?? '').trim() : '',
      role: roleCol ? String(r[roleCol] ?? '').trim() : '',
      displayName: displayNameCol ? String(r[displayNameCol] ?? '').trim() : '',
      email: emailCol ? String(r[emailCol] ?? '').trim() : '',
    }))
    .filter(u => u.username);

  return NextResponse.json({ success: true, users });
}

export async function POST(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user || !isAdminTierRole(user.role)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { row, field, value } = await req.json() as { row?: number; field?: string; value?: string };
  if (!row || row < 1 || !field || value === undefined) {
    return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
  }
  if (!EDITABLE_FIELDS.includes(field as EditableField)) {
    return NextResponse.json({ success: false, error: 'Field is not editable' }, { status: 403 });
  }

  const { headers } = await fetchSheetData(USER_DETAILS_SHEET_ID, RANGE_USERS);
  const colIndex = headers.findIndex(h => h.toLowerCase() === field.toLowerCase());
  if (colIndex === -1) {
    return NextResponse.json({ success: false, error: 'Column not found' }, { status: 400 });
  }

  try {
    await updateSheetCell(USER_DETAILS_SHEET_ID, TAB_USERS, Number(row), colIndex, String(value), user.username);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: err instanceof DataError ? err.status : 500 }
    );
  }
}
