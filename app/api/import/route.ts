import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { insertRow } from '@/lib/data/mysql';
import { findDataset } from '@/lib/data/datasets';
import { isAdminTierRole } from '@/lib/auth';
import { DATA_IMPORT, DataImportSummary, MAX_IMPORT_ROWS, MAX_CELL, normHeader, storedTime, storedDate } from '@/lib/dataImport';
import { formatTimestamp, parseDuration } from '@/lib/forms';

export const runtime = 'nodejs';

// Excel upload of tasks for Web and Marketing (Import Data). The browser reads the .xlsx and
// sends its rows here; this route re-checks everything.
//   mode 'preview' - says what an import would do, writes nothing
//   mode 'import'  - adds every usable row of the sheet as a new task
// Admin tier only (Super Admin, HM, Mod).
export async function POST(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user || !isAdminTierRole(user.role)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { team?: string; rows?: unknown; mode?: string };
  const def = body.team === 'web' || body.team === 'marketing' ? DATA_IMPORT[body.team] : undefined;
  const ds = def && findDataset(def.sheetId, def.tab);
  if (!def || !ds) return NextResponse.json({ success: false, error: 'Unknown team' }, { status: 400 });
  if (body.mode !== 'preview' && body.mode !== 'import') return NextResponse.json({ success: false, error: 'Unknown mode' }, { status: 400 });
  if (!Array.isArray(body.rows) || body.rows.length < 2) {
    return NextResponse.json({ success: false, error: 'The sheet has no data rows. Row 1 must be the column names.' }, { status: 400 });
  }
  if (body.rows.length - 1 > MAX_IMPORT_ROWS) {
    return NextResponse.json({ success: false, error: `Upload at most ${MAX_IMPORT_ROWS} rows at a time.` }, { status: 400 });
  }

  // Row 1 = column names, matched ignoring case and spacing
  const cells = (body.rows as unknown[]).map(r => (Array.isArray(r) ? r.map(c => String(c ?? '').trim().slice(0, MAX_CELL)) : []));
  const columnOf = new Map(ds.headers.map(h => [normHeader(h), h]));
  const mapping = cells[0].map(h => (h ? columnOf.get(normHeader(h)) : undefined));
  const ignoredColumns = cells[0].filter((h, i) => h && !mapping[i]);
  if (!def.required.some(h => mapping.includes(h))) {
    return NextResponse.json({ success: false, error: `The sheet needs a "${def.required.join('" or "')}" column in its first row.` }, { status: 400 });
  }

  const skipped: DataImportSummary['skipped'] = [];
  const badTimes: DataImportSummary['badTimes'] = [];
  const badDates: DataImportSummary['badDates'] = [];
  const toAdd: Record<string, string>[] = [];
  cells.slice(1).forEach((r, i) => {
    const line = i + 2; // the row number in Excel
    if (r.every(c => !c)) return; // blank line
    const values: Record<string, string> = {};
    mapping.forEach((h, ci) => {
      if (!h || !r[ci]) return;
      if (def.dateColumns.includes(h)) {
        const d = storedDate(r[ci], def.dateOrder);
        values[h] = d.value;
        if (!d.ok) badDates.push({ row: line, column: h, value: d.value });
        return;
      }
      values[h] = def.timeColumns.includes(h) ? storedTime(r[ci]) : r[ci];
    });
    if (!def.required.some(h => values[h])) { skipped.push({ row: line, reason: `no ${def.required.join(' or ')}` }); return; }
    for (const col of def.timeColumns) {
      if (col !== 'Total Time Est' && values[col] && !parseDuration(values[col])) badTimes.push({ row: line, column: col, value: values[col] });
    }
    toAdd.push(values);
  });
  if (toAdd.length === 0) {
    return NextResponse.json({ success: false, error: 'No usable rows found in the sheet.', skipped }, { status: 400 });
  }

  const summary: DataImportSummary = { newRows: toAdd.length, skipped, ignoredColumns, badTimes, badDates, sampleNew: toAdd.slice(0, 5) };
  if (body.mode === 'preview') return NextResponse.json({ success: true, summary });

  let added = 0;
  try {
    const stamp = () => formatTimestamp(new Date(), def.dateOrder, process.env.FORM_TIMEZONE || 'Asia/Kolkata');
    for (const values of toAdd) {
      await insertRow(def.sheetId, def.tab, { ...values, Timestamp: values['Timestamp'] || stamp() }, null);
      added++;
    }
    return NextResponse.json({ success: true, added, skipped });
  } catch (err: unknown) {
    console.error('[import]', err);
    const saved = added ? ` ${added} of ${toAdd.length} rows were already saved - do not upload those again.` : '';
    return NextResponse.json({ success: false, error: `Could not save the rows.${saved}` }, { status: 500 });
  }
}
