// Checks that MySQL serves exactly what Google Sheets serves: for every tab,
// the same tab list, headers, row count and cell values (as the dashboard's
// data layer returns them). Prints where a difference is, never the values.
//   npm run db:verify
import './env';
import * as sheets from '../../lib/data/sheets';
import * as db from '../../lib/data/mysql';
import { DATASETS, IGNORED_TABS, findDataset } from '../../lib/data/datasets';
import { SheetResult } from '../../lib/data/rows';

const quoteTab = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

// The import skips fully blank rows and unnamed, empty "Column N" columns, so
// the Sheets side is compared without them too.
function withoutBlanks(r: SheetResult): SheetResult {
  const data = r.data.filter(row => r.headers.some(h => String(row[h] ?? '').trim() !== ''));
  const headers = r.headers.filter(h => !/^Column \d+$/.test(h) || data.some(row => String(row[h] ?? '') !== ''));
  return { headers, data };
}

function compare(a: SheetResult, b: SheetResult): string[] {
  const problems: string[] = [];
  if (a.headers.join('\u0001') !== b.headers.join('\u0001')) {
    problems.push(`headers differ (sheets ${a.headers.length}, mysql ${b.headers.length})`);
    return problems;
  }
  if (a.data.length !== b.data.length) problems.push(`row count differs (sheets ${a.data.length}, mysql ${b.data.length})`);
  const n = Math.min(a.data.length, b.data.length);
  for (let i = 0; i < n && problems.length < 6; i++) {
    for (const h of a.headers) {
      if (a.data[i][h] !== b.data[i][h]) { problems.push(`row ${i + 1}, column "${h}" differs`); break; }
    }
  }
  return problems;
}

async function main() {
  const sheetIds = [...new Set(DATASETS.flatMap(d => d.sources.map(s => s.sheetId)))];
  let failures = 0;
  for (const sheetId of sheetIds) {
    const sheetTabs = (await sheets.fetchSheetTabNames(sheetId)).filter(t => !IGNORED_TABS.has(t) && findDataset(sheetId, t));
    const dbTabs = await db.fetchSheetTabNames(sheetId);
    if (sheetTabs.join('\u0001') !== dbTabs.join('\u0001')) {
      failures++;
      console.log(`FAIL  tab list for ${sheetId}: sheets [${sheetTabs.join(', ')}] vs mysql [${dbTabs.join(', ')}]`);
    }
    for (const tab of sheetTabs) {
      const range = `${quoteTab(tab)}!A1:AZ10000`;
      const opts = { renameDuplicateHeaders: true };
      const a = withoutBlanks(await sheets.fetchSheetData(sheetId, range, opts));
      const b = await db.fetchSheetData(sheetId, range, opts);
      const problems = compare(a, b);
      if (problems.length) {
        failures++;
        console.log(`FAIL  ${tab}: ${problems.join('; ')}`);
      } else {
        console.log(`PASS  ${tab.padEnd(24)} ${String(a.data.length).padStart(5)} rows, ${a.headers.length} columns`);
      }
    }
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll tabs match.');
  process.exitCode = failures ? 1 : 0;
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(db.closePool);
