import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData, updateSheetCell, DataError } from '@/lib/dataStore';
import { insertRow } from '@/lib/data/mysql';
import { findDataset } from '@/lib/data/datasets';
import { canManageInHouseData } from '@/lib/auth';
import { INHOUSE_IMPORT, InHouseImportTab, ImportSummary, MAX_IMPORT_ROWS, MAX_CELL, normHeader } from '@/lib/inhouseImport';

export const runtime = 'nodejs';

// Excel upload for Cybernext InHouse (Websites, Case Studies, Brand Kit, Documentations).
// The browser reads the .xlsx and sends its rows here; this route re-checks everything.
//   mode 'preview' — says what an import would do, writes nothing
//   mode 'import'  — adds the rows that are new (matched on the tab's key column, ignoring
//                    case) and, if asked, fills in changed cells of rows that already exist.
// Blank cells in the sheet never wipe what a row already has. Super Admin only.
export async function POST(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user || !canManageInHouseData(user.role)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as {
    tab?: string; rows?: unknown; mode?: string; updateExisting?: boolean;
  };
  const def = body.tab && body.tab in INHOUSE_IMPORT ? INHOUSE_IMPORT[body.tab as InHouseImportTab] : undefined;
  const ds = def && findDataset(def.sheetId, def.tab);
  if (!def || !ds) return NextResponse.json({ success: false, error: 'Unknown tab' }, { status: 400 });
  if (body.mode !== 'preview' && body.mode !== 'import') return NextResponse.json({ success: false, error: 'Unknown mode' }, { status: 400 });
  if (!Array.isArray(body.rows) || body.rows.length < 2) {
    return NextResponse.json({ success: false, error: 'The sheet has no data rows. Row 1 must be the column names.' }, { status: 400 });
  }
  if (body.rows.length - 1 > MAX_IMPORT_ROWS) {
    return NextResponse.json({ success: false, error: `Upload at most ${MAX_IMPORT_ROWS} rows at a time.` }, { status: 400 });
  }

  // ── Read the sheet: row 1 = column names, matched ignoring case and spacing ──
  const cells = (body.rows as unknown[]).map(r => (Array.isArray(r) ? r.map(c => String(c ?? '').trim().slice(0, MAX_CELL)) : []));
  const columnOf = new Map(ds.headers.map(h => [normHeader(h), h]));
  const mapping = cells[0].map(h => (h ? columnOf.get(normHeader(h)) : undefined));
  const ignoredColumns = cells[0].filter((h, i) => h && !mapping[i]);
  if (!mapping.includes(def.key)) {
    return NextResponse.json({ success: false, error: `The sheet needs a "${def.key}" column in its first row.` }, { status: 400 });
  }

  const skipped: ImportSummary['skipped'] = [];
  const seen = new Set<string>();
  const incoming: { line: number; key: string; values: Record<string, string> }[] = [];
  cells.slice(1).forEach((r, i) => {
    const line = i + 2; // the row number in Excel
    if (r.every(c => !c)) return; // blank line
    const values: Record<string, string> = {};
    mapping.forEach((h, ci) => { if (h && r[ci]) values[h] = r[ci]; });
    const key = values[def.key];
    if (!key) { skipped.push({ row: line, reason: `no ${def.key}` }); return; }
    const k = key.toLowerCase();
    if (seen.has(k)) { skipped.push({ row: line, reason: `"${key}" appears more than once in the sheet` }); return; }
    seen.add(k);
    incoming.push({ line, key: k, values });
  });
  if (incoming.length === 0) {
    return NextResponse.json({ success: false, error: 'No usable rows found in the sheet.', skipped }, { status: 400 });
  }

  try {
    // ── Compare with what the table already holds ──
    const { data, headers } = await fetchSheetData(def.sheetId, `'${def.tab}'!A1:Z10000`);
    const existing = new Map<string, Record<string, unknown>>();
    for (const r of data) {
      const k = String(r[def.key] ?? '').trim().toLowerCase();
      if (k && !existing.has(k)) existing.set(k, r);
    }

    const summary: ImportSummary = { newRows: 0, existingRows: 0, changedExisting: 0, unchanged: 0, skipped, ignoredColumns, sampleNew: [], sampleChanged: [] };
    const toAdd: Record<string, string>[] = [];
    const toUpdate: { row: number; changes: { column: string; to: string; from: string }[] }[] = [];
    for (const inc of incoming) {
      const have = existing.get(inc.key);
      if (!have) { toAdd.push(inc.values); summary.newRows++; if (summary.sampleNew.length < 5) summary.sampleNew.push(inc.values); continue; }
      summary.existingRows++;
      const changes = Object.entries(inc.values)
        .map(([column, to]) => ({ column, to, from: String(have[column] ?? '').trim() }))
        .filter(c => c.to !== c.from);
      if (changes.length === 0) { summary.unchanged++; continue; }
      summary.changedExisting++;
      toUpdate.push({ row: Number(have.__row), changes });
      if (summary.sampleChanged.length < 5) summary.sampleChanged.push({ key: String(have[def.key]), changes: changes.map(c => ({ column: c.column, from: c.from, to: c.to })) });
    }

    if (body.mode === 'preview') {
      return NextResponse.json({ success: true, summary });
    }

    // ── Import ──
    let added = 0;
    for (const values of toAdd) {
      await insertRow(def.sheetId, def.tab, values, null);
      added++;
    }
    let updatedRows = 0;
    if (body.updateExisting) {
      for (const u of toUpdate) {
        for (const c of u.changes) {
          await updateSheetCell(def.sheetId, def.tab, u.row, headers.indexOf(c.column), c.to, user.username);
        }
        updatedRows++;
      }
    }
    return NextResponse.json({ success: true, added, updated: updatedRows, unchanged: summary.unchanged, skipped });
  } catch (err: unknown) {
    console.error('[inhouse-import]', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: err instanceof DataError ? err.status : 500 }
    );
  }
}
