import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData, duplicateSheetRow, deleteSheetRow, deleteSheetRows, DataError } from '@/lib/dataStore';
import { findDataset } from '@/lib/data/datasets';
import { isAdminTierRole, isPmTierRole, canDeletePmProjects, Role } from '@/lib/auth';
import { formatTimestamp, DateOrder } from '@/lib/forms';

export const runtime = 'nodejs';

// Duplicate or delete a whole row of Tasks Assigned (Web / Marketing) or of PM Projects.
// Who may, per table:
//   Web tasks        — Admin / HM / Mod, PMWebAdmin, WebAdmin
//   Marketing tasks  — Admin / HM / Mod, PMMarketingAdmin, MarketingAdmin
//   PM projects      — duplicate: Admin / HM / Mod (any row) or a PM on their own rows (matched on
//                      the row's Email Address, so they can't touch another PM's projects);
//                      delete: HM and Admin only
// A duplicate is the same row again at the end of the table with a fresh Timestamp.
function mayChangeRows(role: Role, table: string): boolean {
  if (isAdminTierRole(role)) return table === 'web_tasks' || table === 'marketing_tasks' || table === 'pm_projects';
  if (table === 'web_tasks') return role === 'PMWebAdmin' || role === 'WebAdmin';
  if (table === 'marketing_tasks') return role === 'PMMarketingAdmin' || role === 'MarketingAdmin';
  if (table === 'pm_projects') return isPmTierRole(role);
  return false;
}
const MAX_DELETE_ROWS = 500;
const ORDER: Record<string, DateOrder> = { web_tasks: 'dmy', marketing_tasks: 'mdy', pm_projects: 'mdy' };

export async function POST(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { action, spreadsheetId, sheetName, row, rows } = await req.json().catch(() => ({})) as {
    action?: string; spreadsheetId?: string; sheetName?: string; row?: number; rows?: unknown;
  };
  // delete also takes `rows` (several at once, up to MAX_DELETE_ROWS) instead of one `row`
  const many = action === 'delete' && Array.isArray(rows)
    ? [...new Set(rows.map(Number).filter(n => Number.isInteger(n) && n >= 1))]
    : null;
  if ((action !== 'duplicate' && action !== 'delete') || !spreadsheetId || !sheetName || (many ? many.length === 0 : (!row || row < 1))) {
    return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
  }
  if (many && many.length > MAX_DELETE_ROWS) {
    return NextResponse.json({ success: false, error: `Delete at most ${MAX_DELETE_ROWS} rows at a time` }, { status: 400 });
  }
  const ds = findDataset(spreadsheetId, sheetName);
  if (!ds || !mayChangeRows(user.role, ds.table) || (ds.table === 'pm_projects' && action === 'delete' && !canDeletePmProjects(user.role))) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    // A PM may only change their own projects
    if (ds.table === 'pm_projects' && !isAdminTierRole(user.role)) {
      const { data } = await fetchSheetData(spreadsheetId, `'${sheetName}'!A1:Z10000`);
      for (const id of many ?? [Number(row)]) {
        const target = data.find(r => Number(r.__row) === id);
        const owner = String(target?.['Email Address'] ?? '').trim().toLowerCase();
        if (!target || !user.email || owner !== user.email.trim().toLowerCase()) {
          return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }
      }
    }

    if (many) {
      const deleted = await deleteSheetRows(spreadsheetId, sheetName, many, user.username);
      return NextResponse.json({ success: true, deleted });
    }
    if (action === 'delete') {
      await deleteSheetRow(spreadsheetId, sheetName, Number(row), user.username);
      return NextResponse.json({ success: true });
    }
    const overrides: Record<string, string> = {};
    if (ds.headers.includes('Timestamp')) {
      overrides['Timestamp'] = formatTimestamp(new Date(), ORDER[ds.table] ?? 'mdy', process.env.FORM_TIMEZONE || 'Asia/Kolkata');
    }
    const id = await duplicateSheetRow(spreadsheetId, sheetName, Number(row), overrides, user.username);
    return NextResponse.json({ success: true, id });
  } catch (err: unknown) {
    console.error('[rows]', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: err instanceof DataError ? err.status : 500 }
    );
  }
}
