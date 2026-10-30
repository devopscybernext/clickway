import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData, updateSheetCell, DataError } from '@/lib/dataStore';
import { HELP_SHEET_ID, TAB_HELP } from '@/lib/config';
import { canManageHelp } from '@/lib/auth';
import { HELP_STATUSES, HelpRequest } from '@/lib/help';
import { isDirectBrowserNavigation } from '@/lib/blockDirectAccess';

export const runtime = 'nodejs';

// The Help tab's table. New requests are written by /api/forms ('help'); this route
// reads them back and lets the Super Admin set a status. A person only ever gets
// their own requests; the Super Admin gets all of them. The generic /api/data proxy
// can't read this dataset (lib/sheetAccess.ts), so this is the only way in.
const RANGE = `'${TAB_HELP}'!A1:Z10000`;

export async function GET(req: NextRequest) {
  if (isDirectBrowserNavigation(req)) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const canManage = canManageHelp(user.role);
  const { data } = await fetchSheetData(HELP_SHEET_ID, RANGE);
  const s = (r: Record<string, unknown>, k: string) => String(r[k] ?? '').trim();
  const me = user.username.trim().toLowerCase();
  const requests: HelpRequest[] = data
    .filter(r => canManage || s(r, 'Username').toLowerCase() === me)
    .map(r => ({
      id: Number(r.__row),
      when: s(r, 'Timestamp'),
      name: s(r, 'Name'),
      username: s(r, 'Username'),
      role: s(r, 'Role'),
      type: s(r, 'Type'),
      subject: s(r, 'Subject'),
      area: s(r, 'Area'),
      details: s(r, 'Details'),
      status: s(r, 'Status') || 'New',
    }))
    .sort((a, b) => b.id - a.id);

  return NextResponse.json({ success: true, canManage, requests });
}

// Super Admin: change a request's status
export async function PATCH(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user || !canManageHelp(user.role)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id, status } = await req.json().catch(() => ({})) as { id?: number; status?: string };
  if (!id || id < 1 || !status || !(HELP_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ success: false, error: 'Choose a valid status' }, { status: 400 });
  }

  try {
    const { headers } = await fetchSheetData(HELP_SHEET_ID, RANGE);
    const colIndex = headers.indexOf('Status');
    if (colIndex === -1) return NextResponse.json({ success: false, error: 'Column not found' }, { status: 400 });
    await updateSheetCell(HELP_SHEET_ID, TAB_HELP, Number(id), colIndex, status, user.username);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: err instanceof DataError ? err.status : 500 }
    );
  }
}
