import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData, DataError } from '@/lib/dataStore';
import { createUser, updateUser, deleteUser, UserValues } from '@/lib/data/users';
import { USER_DETAILS_SHEET_ID, RANGE_USERS } from '@/lib/config';
import { ROLE_NAV, AuthUser, Role, canManageUsers } from '@/lib/auth';
import { isDirectBrowserNavigation } from '@/lib/blockDirectAccess';
import { DEPARTMENTS, NO_DEPARTMENT, resolveAssignment, subDepartmentsFor, parseSubDepartments } from '@/lib/roster';

// Admin Portal — HM and Admin add, edit and remove accounts here. Deliberately
// its own route rather than the generic /api/data + /api/update-status pair:
// those refuse to ever touch UserDetails (credentials live there). This is the
// one narrow, admin-gated exception. The password hash is never sent to the
// browser — the list only says whether a password is set — and a password can
// only be set or replaced, never read back.

const ROLES = Object.keys(ROLE_NAV) as Role[];
const USERNAME = /^[A-Za-z0-9._@-]{3,64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

interface AccountRow { row: number; username: string; role: string; displayName: string; email: string; department: string; subDepartment: string; hasPassword: boolean }

async function loadAccounts(): Promise<AccountRow[]> {
  const { data } = await fetchSheetData(USER_DETAILS_SHEET_ID, RANGE_USERS);
  const s = (r: Record<string, unknown>, k: string) => String(r[k] ?? '').trim();
  return data
    .map(r => ({
      row: Number(r.__row),
      username: s(r, 'Username'),
      role: s(r, 'Role'),
      displayName: s(r, 'Display Name'),
      email: s(r, 'Email'),
      department: s(r, 'Department'),
      subDepartment: s(r, 'Sub Department'),
      hasPassword: !!s(r, 'Password Hash'),
    }))
    .filter(u => u.username);
}

function authorize(req: NextRequest): AuthUser | NextResponse {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user || !canManageUsers(user.role)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  return user;
}

const fail = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

type Body = {
  row?: number;
  username?: string; password?: string; role?: string; displayName?: string; email?: string;
  department?: string; subDepartments?: string[];
};

// Checks the fields that are present; returns the stored values for them, or a message.
function checkFields(body: Body, others: AccountRow[]): { values: Partial<UserValues> } | { error: string } {
  const values: Partial<UserValues> = {};
  if (body.username !== undefined) {
    const v = body.username.trim();
    if (!USERNAME.test(v)) return { error: 'Username must be 3-64 letters, numbers or . _ @ -' };
    if (others.some(o => same(o.username, v))) return { error: 'That username is already used' };
    values.username = v;
  }
  if (body.displayName !== undefined) {
    const v = body.displayName.trim();
    if (!v || v.length > 60) return { error: 'Display name is required (60 characters at most)' };
    if (others.some(o => same(o.displayName, v))) return { error: 'Another account already has that display name' };
    values.displayName = v;
  }
  if (body.email !== undefined) {
    const v = body.email.trim();
    if (!EMAIL.test(v) || v.length > 191) return { error: 'Enter a valid email address' };
    if (others.some(o => same(o.email, v))) return { error: 'That email is already used by another account' };
    values.email = v;
  }
  if (body.password !== undefined) {
    if (body.password.length < MIN_PASSWORD || body.password.length > 128) return { error: `Password must be ${MIN_PASSWORD}-128 characters` };
  }
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role as Role)) return { error: 'Choose a valid role' };
    values.role = body.role;
  }
  if (body.department !== undefined) {
    const v = body.department.trim() || NO_DEPARTMENT;
    if (v !== NO_DEPARTMENT && !(DEPARTMENTS as readonly string[]).includes(v)) return { error: 'Choose Web, Marketing, PM or None as the department' };
    values.department = v;
  }
  if (body.subDepartments !== undefined) {
    if (!Array.isArray(body.subDepartments)) return { error: 'Sub departments must be a list' };
    values.subDepartment = parseSubDepartments(body.subDepartments.join(',')).join(', ');
  }
  return { values };
}

export async function GET(req: NextRequest) {
  if (isDirectBrowserNavigation(req)) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  const user = authorize(req);
  if (user instanceof NextResponse) return user;

  const accounts = await loadAccounts();
  const users = accounts.map(a => {
    // blank (older) accounts show the department they have in practice
    const place = resolveAssignment(a.displayName, a.role, a.department, a.subDepartment);
    return {
      row: a.row, username: a.username, role: a.role, displayName: a.displayName, email: a.email,
      department: place.department || NO_DEPARTMENT, subDepartments: place.subDepartments, hasPassword: a.hasPassword,
    };
  });
  return NextResponse.json({ success: true, users });
}

// Add an account
export async function POST(req: NextRequest) {
  const user = authorize(req);
  if (user instanceof NextResponse) return user;

  const body = await req.json().catch(() => ({})) as Body;
  for (const k of ['username', 'displayName', 'email', 'password', 'role'] as const) {
    if (typeof body[k] !== 'string' || !body[k]!.trim()) return fail(`${k === 'displayName' ? 'Display name' : k[0].toUpperCase() + k.slice(1)} is required`);
  }
  const accounts = await loadAccounts();
  const checked = checkFields(body, accounts);
  if ('error' in checked) return fail(checked.error, checked.error.includes('already') ? 409 : 400);
  const v = checked.values;
  const department = v.department ?? NO_DEPARTMENT;
  const subs = subDepartmentsFor(department === NO_DEPARTMENT ? '' : department as 'Web', parseSubDepartments(v.subDepartment ?? ''));

  try {
    const id = await createUser({
      username: v.username!, passwordHash: await bcrypt.hash(body.password!, 10), role: v.role!, displayName: v.displayName!,
      email: v.email!, department, subDepartment: subs.join(', '),
    }, user.username);
    return NextResponse.json({ success: true, row: id });
  } catch (err: unknown) {
    return fail(err instanceof Error ? err.message : 'Unknown error', err instanceof DataError ? err.status : 500);
  }
}

// Edit any fields of one account
export async function PATCH(req: NextRequest) {
  const user = authorize(req);
  if (user instanceof NextResponse) return user;

  const body = await req.json().catch(() => ({})) as Body;
  const row = Number(body.row);
  if (!row || row < 1) return fail('Missing account');
  const accounts = await loadAccounts();
  const target = accounts.find(a => a.row === row);
  if (!target) return fail('Account not found', 404);

  const checked = checkFields(body, accounts.filter(a => a.row !== row));
  if ('error' in checked) return fail(checked.error, checked.error.includes('already') ? 409 : 400);
  const changes: Partial<UserValues> = { ...checked.values };
  if (body.password !== undefined) changes.passwordHash = await bcrypt.hash(body.password, 10);

  // The portal must always have someone who can open it
  if (changes.role !== undefined && canManageUsers(target.role as Role) && !canManageUsers(changes.role as Role)
      && !accounts.some(a => a.row !== row && canManageUsers(a.role as Role))) {
    return fail('There must be at least one HM or Admin account left');
  }
  // Department and sub departments are stored together: whichever one wasn't sent keeps
  // its current value (a blank, older account counts as what it has in practice), and only
  // sub departments that belong to the department survive.
  if (changes.department !== undefined || changes.subDepartment !== undefined) {
    const was = resolveAssignment(target.displayName, target.role, target.department, target.subDepartment);
    const dept = changes.department !== undefined ? (changes.department === NO_DEPARTMENT ? '' : changes.department as 'Web') : was.department;
    const subs = changes.subDepartment !== undefined ? parseSubDepartments(changes.subDepartment) : was.subDepartments;
    changes.department = dept || NO_DEPARTMENT;
    changes.subDepartment = subDepartmentsFor(dept, subs).join(', ');
  }

  try {
    await updateUser(row, changes, user.username);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return fail(err instanceof Error ? err.message : 'Unknown error', err instanceof DataError ? err.status : 500);
  }
}

// Remove an account
export async function DELETE(req: NextRequest) {
  const user = authorize(req);
  if (user instanceof NextResponse) return user;

  const body = await req.json().catch(() => ({})) as Body;
  const row = Number(body.row);
  if (!row || row < 1) return fail('Missing account');
  const accounts = await loadAccounts();
  const target = accounts.find(a => a.row === row);
  if (!target) return fail('Account not found', 404);
  if (same(target.username, user.username)) return fail('You cannot remove your own account');
  if (canManageUsers(target.role as Role) && !accounts.some(a => a.row !== row && canManageUsers(a.role as Role))) {
    return fail('There must be at least one HM or Admin account left');
  }
  try {
    await deleteUser(row, user.username);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return fail(err instanceof Error ? err.message : 'Unknown error', err instanceof DataError ? err.status : 500);
  }
}
