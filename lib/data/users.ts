import mysql from 'mysql2/promise';
import { getPool } from './mysql';
import { columnName } from './datasets';
import { DataError } from './rows';
import { USER_DETAILS_SHEET_ID, TAB_USERS } from '../config';

// Account writes for the Admin Portal (app/api/admin-users). The generic cell
// writer logs old and new values to change_log, which would put password hashes
// in it — so accounts get their own writers: same table, same log, but a
// password is only ever logged as "(changed)".

export interface UserValues {
  username: string;
  passwordHash: string;
  role: string;
  displayName: string;
  email: string;
  department: string;
  subDepartment: string;
}

const COLUMNS: Record<keyof UserValues, string> = {
  username: 'Username', passwordHash: 'Password Hash', role: 'Role', displayName: 'Display Name',
  email: 'Email', department: 'Department', subDepartment: 'Sub Department',
};
const col = (k: keyof UserValues) => '`' + columnName(COLUMNS[k]) + '`';
const SECRET: (keyof UserValues)[] = ['passwordHash'];

async function log(conn: mysql.PoolConnection, actor: string, id: number, column: string, oldValue: string | null, newValue: string | null) {
  await conn.query(
    'INSERT INTO change_log (changed_by, table_name, row_id, column_name, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)',
    [actor, 'users', id, column, oldValue, newValue]
  );
}

export async function createUser(values: UserValues, actor: string): Promise<number> {
  const keys = Object.keys(COLUMNS) as (keyof UserValues)[];
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.query<mysql.ResultSetHeader>(
      `INSERT INTO \`users\` (\`sheet_id\`, \`sheet_tab\`, ${keys.map(col).join(', ')}) VALUES (?, ?, ${keys.map(() => '?').join(', ')})`,
      [USER_DETAILS_SHEET_ID, TAB_USERS, ...keys.map(k => values[k])]
    );
    await log(conn, actor, res.insertId, 'Account created', null, `${values.username} (${values.role})`);
    await conn.commit();
    return res.insertId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Changes some of one account's fields. Throws DataError 404 if it isn't a user row.
export async function updateUser(id: number, changes: Partial<UserValues>, actor: string): Promise<void> {
  const keys = (Object.keys(changes) as (keyof UserValues)[]).filter(k => k in COLUMNS && changes[k] !== undefined);
  if (!keys.length) return;
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [found] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT ${keys.map(col).join(', ')} FROM \`users\` WHERE id = ? AND sheet_id = ? AND sheet_tab = ? FOR UPDATE`,
      [id, USER_DETAILS_SHEET_ID, TAB_USERS]
    );
    if (found.length === 0) throw new DataError('Account not found', 404);
    await conn.query(
      `UPDATE \`users\` SET ${keys.map(k => `${col(k)} = ?`).join(', ')} WHERE id = ?`,
      [...keys.map(k => changes[k]), id]
    );
    for (const k of keys) {
      const secret = SECRET.includes(k);
      await log(conn, actor, id, COLUMNS[k], secret ? null : (found[0][columnName(COLUMNS[k])] ?? null), secret ? '(changed)' : String(changes[k]));
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function deleteUser(id: number, actor: string): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [found] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT `username`, `role` FROM `users` WHERE id = ? AND sheet_id = ? AND sheet_tab = ? FOR UPDATE',
      [id, USER_DETAILS_SHEET_ID, TAB_USERS]
    );
    if (found.length === 0) throw new DataError('Account not found', 404);
    await conn.query('DELETE FROM `users` WHERE id = ?', [id]);
    await log(conn, actor, id, 'Account removed', `${found[0].username} (${found[0].role})`, null);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
