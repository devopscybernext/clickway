import mysql from 'mysql2/promise';
import { DATASETS, Dataset, columnName, findDataset, fixedTabs, wildcardDatasets, tabFromRange } from './datasets';
import { DataError, SheetResult, normalizeHeaders, toRow } from './rows';

// One pool per server process — kept on globalThis so dev-mode hot reloads
// don't open a new pool on every edit.
const globalForPool = globalThis as unknown as { __clickwayMysqlPool?: mysql.Pool };

export function getPool(): mysql.Pool {
  if (!globalForPool.__clickwayMysqlPool) {
    const { MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE } = process.env;
    if (!MYSQL_USER || !MYSQL_DATABASE) {
      throw new Error('Server misconfigured — MYSQL_USER / MYSQL_DATABASE are not set');
    }
    globalForPool.__clickwayMysqlPool = mysql.createPool({
      host: MYSQL_HOST || '127.0.0.1',
      port: Number(MYSQL_PORT || 3306),
      user: MYSQL_USER,
      password: MYSQL_PASSWORD ?? '',
      database: MYSQL_DATABASE,
      charset: 'utf8mb4',
      connectionLimit: 5,
    });
  }
  return globalForPool.__clickwayMysqlPool;
}

export async function closePool(): Promise<void> {
  await globalForPool.__clickwayMysqlPool?.end();
  globalForPool.__clickwayMysqlPool = undefined;
}

const q = (identifier: string) => '`' + identifier.replace(/`/g, '``') + '`';
const cols = (ds: Dataset) => ds.headers.map(h => q(columnName(h)));

function datasetFor(sheetId: string, tab: string): Dataset {
  const ds = findDataset(sheetId, tab);
  if (!ds) throw new DataError(`Unknown dataset: ${tab}`, 404);
  return ds;
}

// Rows of one "tab", in the order they were added — the same order the
// spreadsheet rows had at import time. Cells are stored as the text Sheets
// displayed, so toRow() turns them into exactly what the Sheets source returns.
export async function fetchSheetData(
  sheetId: string,
  range: string,
  opts: { renameDuplicateHeaders?: boolean } = {}
): Promise<SheetResult> {
  const tab = tabFromRange(range);
  const ds = datasetFor(sheetId, tab);
  const headers = normalizeHeaders(ds.headers, opts.renameDuplicateHeaders);
  const [rows] = await getPool().query<mysql.RowDataPacket[][]>({
    sql: `SELECT id, ${cols(ds).join(', ')} FROM ${q(ds.table)} WHERE sheet_id = ? AND sheet_tab = ? ORDER BY id`,
    rowsAsArray: true,
  }, [sheetId, tab]);
  const data = rows.map(r => toRow(headers, r.slice(1), Number(r[0])));
  return { data, headers };
}

// Tabs of a spreadsheet: those found in the data for '*' datasets (current
// month + archive tabs, in the order they first appeared), then the fixed ones.
export async function fetchSheetTabNames(sheetId: string): Promise<string[]> {
  const fixed = fixedTabs(sheetId);
  const tabs: string[] = [];
  for (const ds of wildcardDatasets(sheetId)) {
    const [rows] = await getPool().query<mysql.RowDataPacket[][]>({
      sql: `SELECT sheet_tab FROM ${q(ds.table)} WHERE sheet_id = ? GROUP BY sheet_tab ORDER BY MIN(id)`,
      rowsAsArray: true,
    }, [sheetId]);
    rows.forEach(r => {
      const t = String(r[0]);
      if (!fixed.includes(t) && !tabs.includes(t)) tabs.push(t);
    });
  }
  return [...tabs, ...fixed];
}

// row is the MySQL id (the __row handle from fetchSheetData). The sheet id and
// tab must match the row too, so a stale or forged handle can't edit a row
// from another dataset. Every change is recorded in change_log.
export async function updateCell(
  sheetId: string, tab: string, row: number, colIndex: number, value: string, actor: string
): Promise<string> {
  const ds = datasetFor(sheetId, tab);
  const header = ds.headers[colIndex];
  if (!header) throw new DataError('Column not found', 400);
  const col = columnName(header);

  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [found] = await conn.query<mysql.RowDataPacket[][]>({
      sql: `SELECT ${q(col)} FROM ${q(ds.table)} WHERE id = ? AND sheet_id = ? AND sheet_tab = ? FOR UPDATE`,
      rowsAsArray: true,
    }, [row, sheetId, tab]);
    if (found.length === 0) throw new DataError('Row not found', 404);
    await conn.query(`UPDATE ${q(ds.table)} SET ${q(col)} = ? WHERE id = ?`, [value, row]);
    await conn.query(
      'INSERT INTO change_log (changed_by, table_name, row_id, column_name, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)',
      [actor, ds.table, row, header, found[0][0] ?? null, value]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return `${ds.table}#${row} ${header}`;
}

// Appends one row (a form submission). sourceRef — the Google Forms response
// id — is unique, so a resent response is reported as a duplicate instead of
// being stored twice.
export async function insertRow(
  sheetId: string, tab: string, values: Record<string, string>, sourceRef: string | null
): Promise<{ id: number | null; duplicate: boolean }> {
  const ds = datasetFor(sheetId, tab);
  const columns = ['sheet_id', 'sheet_tab', 'source_ref', ...ds.headers.map(columnName)];
  const params = [sheetId, tab, sourceRef, ...ds.headers.map(h => values[h] ?? '')];
  try {
    const [res] = await getPool().query<mysql.ResultSetHeader>(
      `INSERT INTO ${q(ds.table)} (${columns.map(q).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      params
    );
    return { id: res.insertId, duplicate: false };
  } catch (err) {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') return { id: null, duplicate: true };
    throw err;
  }
}

// Copies one row as a new row at the end of the same dataset, sheet and tab. overrides
// replaces some of the copied cells (a duplicate gets a fresh Timestamp). Logged in change_log.
export async function duplicateRow(
  sheetId: string, tab: string, row: number, overrides: Record<string, string>, actor: string
): Promise<number> {
  const ds = datasetFor(sheetId, tab);
  const picks = ds.headers.map(h => (h in overrides ? '?' : q(columnName(h))));
  const params = [...ds.headers.filter(h => h in overrides).map(h => overrides[h]), row, sheetId, tab];
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.query<mysql.ResultSetHeader>(
      `INSERT INTO ${q(ds.table)} (sheet_id, sheet_tab, source_ref, ${cols(ds).join(', ')})
       SELECT sheet_id, sheet_tab, NULL, ${picks.join(', ')} FROM ${q(ds.table)} WHERE id = ? AND sheet_id = ? AND sheet_tab = ?`,
      params
    );
    if (res.affectedRows === 0) throw new DataError('Row not found', 404);
    await conn.query(
      'INSERT INTO change_log (changed_by, table_name, row_id, column_name, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)',
      [actor, ds.table, res.insertId, 'Row duplicated', `#${row}`, null]
    );
    await conn.commit();
    return res.insertId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Removes one row. What it held is kept in change_log (as JSON), so a deletion can be
// traced and, if need be, put back by hand.
export async function deleteRow(sheetId: string, tab: string, row: number, actor: string): Promise<void> {
  const ds = datasetFor(sheetId, tab);
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [found] = await conn.query<mysql.RowDataPacket[][]>({
      sql: `SELECT ${cols(ds).join(', ')} FROM ${q(ds.table)} WHERE id = ? AND sheet_id = ? AND sheet_tab = ? FOR UPDATE`,
      rowsAsArray: true,
    }, [row, sheetId, tab]);
    if (found.length === 0) throw new DataError('Row not found', 404);
    const content = Object.fromEntries(ds.headers.map((h, i) => [h, found[0][i] ?? '']));
    await conn.query(`DELETE FROM ${q(ds.table)} WHERE id = ?`, [row]);
    await conn.query(
      'INSERT INTO change_log (changed_by, table_name, row_id, column_name, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)',
      [actor, ds.table, row, 'Row deleted', JSON.stringify(content), null]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─── Schema ─────────────────────────────────────────────────────────────────
// Tables are generated from lib/data/datasets.ts, so the registry is the one
// place a column is added. Every data column is TEXT holding the cell exactly
// as Google Sheets displayed it (mixed date formats, "12.50 hrs", …) — that
// keeps every screen behaving as before.

export function createTableSql(ds: Dataset): string {
  const dataCols = ds.headers.map(h => `  ${q(columnName(h))} TEXT NULL`).join(',\n');
  return `CREATE TABLE IF NOT EXISTS ${q(ds.table)} (
  \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  \`sheet_id\` VARCHAR(64) NOT NULL,
  \`sheet_tab\` VARCHAR(100) NOT NULL,
  \`source_ref\` VARCHAR(191) NULL,
${dataCols},
  \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`idx_sheet\` (\`sheet_id\`, \`sheet_tab\`),
  UNIQUE KEY \`uniq_source_ref\` (\`source_ref\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
}

export const CHANGE_LOG_SQL = `CREATE TABLE IF NOT EXISTS \`change_log\` (
  \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  \`changed_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`changed_by\` VARCHAR(191) NOT NULL,
  \`table_name\` VARCHAR(64) NOT NULL,
  \`row_id\` INT UNSIGNED NOT NULL,
  \`column_name\` VARCHAR(191) NOT NULL,
  \`old_value\` TEXT NULL,
  \`new_value\` TEXT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`idx_row\` (\`table_name\`, \`row_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

// Creates missing tables and adds any registry column a table lacks. Never
// drops or renames anything. Returns a line per change made.
export async function ensureSchema(): Promise<string[]> {
  const pool = getPool();
  const log: string[] = [];
  await pool.query(CHANGE_LOG_SQL);
  for (const ds of DATASETS) {
    await pool.query(createTableSql(ds));
    const [existing] = await pool.query<mysql.RowDataPacket[][]>({
      sql: 'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
      rowsAsArray: true,
    }, [ds.table]);
    const have = new Set(existing.map(r => String(r[0])));
    for (const h of ds.headers) {
      const c = columnName(h);
      if (!have.has(c)) {
        await pool.query(`ALTER TABLE ${q(ds.table)} ADD COLUMN ${q(c)} TEXT NULL`);
        log.push(`${ds.table}: added column ${c}`);
      }
    }
  }
  return log;
}
