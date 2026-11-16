import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData, updateSheetCell, deleteSheetRow, DataError } from '@/lib/dataStore';
import { findDataset } from '@/lib/data/datasets';
import { canEditInHouseEntries } from '@/lib/auth';
import { EDIT_KINDS, EditKind, normalizeLink } from '@/lib/inhouseEdit';
import { MAX_CELL } from '@/lib/inhouseImport';

export const runtime = 'nodejs';

// Edit or delete one entry of Cybernext InHouse (Websites, Case Studies, Brand Kit, Documentations) or of the Tools lists
// (AI Tools, Holiday Calendar). Body: { kind, row, values } — row is the entry's __row handle, values the fields
// to set by column name. Only the cells that really changed are written (each one is logged in change_log).
// With action 'delete' the entry is removed for good (what it held is kept in change_log); no values are needed.
// Super Admin and HM only.
export async function POST(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (!canEditInHouseEntries(user.role)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { kind?: string; action?: string; row?: number; values?: Record<string, unknown> };
  const def = body.kind && body.kind in EDIT_KINDS ? EDIT_KINDS[body.kind as EditKind] : undefined;
  const ds = def && findDataset(def.sheetId, def.tab);
  const row = Number(body.row);
  const deleting = body.action === 'delete';
  if (!def || !ds || !Number.isInteger(row) || row < 1 || (!deleting && (!body.values || typeof body.values !== 'object'))) {
    return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
  }
  if (deleting) {
    try {
      await deleteSheetRow(def.sheetId, def.tab, row, user.username);
      return NextResponse.json({ success: true });
    } catch (err: unknown) {
      console.error('[inhouse-delete]', err);
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
        { status: err instanceof DataError ? err.status : 500 }
      );
    }
  }
  const values = body.values as Record<string, unknown>;

  // ── check every field ──
  const clean: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const f of def.fields) {
    if (!(f.header in values)) continue;
    let v = String(values[f.header] ?? '').trim();
    if (v.length > MAX_CELL) { errors[f.header] = `At most ${MAX_CELL} characters`; continue; }
    if (f.required && !v) { errors[f.header] = 'Required'; continue; }
    if (f.kind === 'url') {
      const link = normalizeLink(v);
      if (link === null) { errors[f.header] = 'Enter a web address (http:// or https://)'; continue; }
      v = link;
    }
    clean[f.header] = v;
  }
  if (Object.keys(errors).length > 0) return NextResponse.json({ success: false, error: 'Check the highlighted fields', errors }, { status: 422 });

  try {
    const { data } = await fetchSheetData(def.sheetId, `'${def.tab}'!A1:Z10000`);
    const current = data.find(r => Number(r.__row) === row);
    if (!current) return NextResponse.json({ success: false, error: 'This entry no longer exists. Refresh the page.' }, { status: 404 });
    let changed = 0;
    for (const [header, value] of Object.entries(clean)) {
      if (String(current[header] ?? '').trim() === value) continue;
      await updateSheetCell(def.sheetId, def.tab, row, ds.headers.indexOf(header), value, user.username);
      changed++;
    }
    return NextResponse.json({ success: true, changed });
  } catch (err: unknown) {
    console.error('[inhouse-edit]', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: err instanceof DataError ? err.status : 500 }
    );
  }
}
