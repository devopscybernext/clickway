// Copies every dashboard tab from Google Sheets into MySQL.
//   npm run db:import -- --yes
//
// Each table is emptied and refilled, so this is for loading the data before
// cutover (and re-running while testing). Run after cutover it would wipe
// edits made in the dashboard since — hence the --yes guard.
import './env';
import { closePool, ensureSchema, getPool } from '../../lib/data/mysql';
import { fetchRawValues, fetchSheetTabNames } from './googleSheets';
import { DATASETS, Dataset, IGNORED_TABS, columnName, findDataset } from '../../lib/data/datasets';
import { normalizeHeaders } from '../../lib/data/rows';

interface TabPlan { ds: Dataset; sheetId: string; tab: string; }

const quoteTab = (tab: string) => `'${tab.replace(/'/g, "''")}'`;
const q = (id: string) => '`' + id.replace(/`/g, '``') + '`';

async function plan(): Promise<TabPlan[]> {
  const sheetIds = [...new Set(DATASETS.flatMap(d => d.sources.map(s => s.sheetId)))];
  const out: TabPlan[] = [];
  for (const sheetId of sheetIds) {
    for (const tab of await fetchSheetTabNames(sheetId)) {
      if (IGNORED_TABS.has(tab)) { console.log(`  skip   ${tab} (not migrated)`); continue; }
      const ds = findDataset(sheetId, tab);
      if (!ds) { console.log(`  skip   ${tab} (no dataset registered)`); continue; }
      out.push({ ds, sheetId, tab });
    }
  }
  return out;
}

// Sheet cells → the dataset's column order, matched by header text (not
// position), so a reordered sheet still lands in the right columns. A sheet
// column the dataset doesn't know is only allowed if it is completely empty.
async function readTab({ ds, sheetId, tab }: TabPlan): Promise<string[][]> {
  const values = await fetchRawValues(sheetId, `${quoteTab(tab)}!A1:AZ`);
  if (values.length === 0) return [];
  const sheetHeaders = normalizeHeaders(values[0]);
  const body = values.slice(1).filter(r => r.some(c => String(c ?? '').trim() !== ''));

  const known = new Set(ds.headers);
  sheetHeaders.forEach((h, i) => {
    if (known.has(h)) return;
    const used = body.filter(r => String(r[i] ?? '').trim() !== '').length;
    if (used > 0) throw new Error(`${tab}: column "${h}" has ${used} values but no MySQL column — add it to lib/data/datasets.ts`);
    console.log(`  note   ${tab}: ignoring empty column "${h}"`);
  });
  const index = ds.headers.map(h => sheetHeaders.indexOf(h));
  ds.headers.forEach((h, i) => { if (index[i] === -1) console.log(`  note   ${tab}: no "${h}" column in the sheet — stored empty`); });

  return body.map(r => index.map(i => (i === -1 ? '' : String(r[i] ?? ''))));
}

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('This empties every dashboard table in MySQL and reloads it from Google Sheets.');
    console.error('Run again with --yes to continue:  npm run db:import -- --yes');
    process.exitCode = 1;
    return;
  }
  console.log(`Target database: ${process.env.MYSQL_DATABASE} on ${process.env.MYSQL_HOST || '127.0.0.1'}`);
  await ensureSchema();

  console.log('Reading tab list from Google Sheets…');
  const tabs = await plan();

  // Read everything first, so a problem in any sheet stops the import before
  // a single table has been emptied.
  const loaded: { plan: TabPlan; rows: string[][] }[] = [];
  for (const p of tabs) loaded.push({ plan: p, rows: await readTab(p) });

  const pool = getPool();
  for (const ds of DATASETS) {
    const parts = loaded.filter(l => l.plan.ds === ds);
    const conn = await pool.getConnection();
    try {
      await conn.query(`TRUNCATE TABLE ${q(ds.table)}`);
      await conn.beginTransaction();
      const columns = ['sheet_id', 'sheet_tab', ...ds.headers.map(columnName)];
      for (const { plan: p, rows } of parts) {
        for (let i = 0; i < rows.length; i += 200) {
          const batch = rows.slice(i, i + 200);
          const placeholders = batch.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
          await conn.query(
            `INSERT INTO ${q(ds.table)} (${columns.map(q).join(', ')}) VALUES ${placeholders}`,
            batch.flatMap(r => [p.sheetId, p.tab, ...r])
          );
        }
        console.log(`  ok     ${ds.table.padEnd(24)} ← ${p.tab} (${rows.length} rows)`);
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
  const total = loaded.reduce((n, l) => n + l.rows.length, 0);
  console.log(`Imported ${total} rows from ${loaded.length} tabs into ${DATASETS.length} tables.`);
  console.log('Next: npm run db:verify');
}

main()
  .catch(err => { console.error(`Import failed: ${err instanceof Error ? err.message : err}`); process.exitCode = 1; })
  .finally(closePool);
