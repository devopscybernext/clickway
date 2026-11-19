// Read-only check of why a login fails. Changes nothing.
//   npx tsx scripts/db/check-login.ts <email or username>
// Asks for the password (hidden), then shows every account that the login would consider, which
// one it actually picks, and whether the password matches each stored hash.
import './env';
import readline from 'readline';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import { closePool, getPool } from '../../lib/data/mysql';
import { USER_DETAILS_SHEET_ID, TAB_USERS } from '../../lib/config';
import { isAdminTierRole, MOD_ENABLED, type Role } from '../../lib/auth';

function askHidden(prompt: string): Promise<string> {
  return new Promise(resolve => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    if (!stdin.isTTY) {
      const rl = readline.createInterface({ input: stdin });
      rl.once('line', line => { rl.close(); resolve(line); });
      return;
    }
    let buf = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk: string) => {
      for (const c of chunk) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(buf);
          return;
        }
        if (c === '\u0003') { process.stdout.write('\n'); process.exit(130); }
        buf = c === '\u007f' || c === '\b' ? buf.slice(0, -1) : buf + c;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const identifier = process.argv[2];
  if (!identifier) {
    console.error('Usage: npx tsx scripts/db/check-login.ts <email or username>');
    process.exitCode = 1;
    return;
  }
  const input = identifier.trim().toLowerCase();
  const password = await askHidden('Password to test: ');

  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `SELECT id, username, role, email, password_hash FROM users
      WHERE sheet_id = ? AND sheet_tab = ? AND (LOWER(TRIM(username)) = ? OR LOWER(TRIM(email)) = ?)
      ORDER BY id`,
    [USER_DETAILS_SHEET_ID, TAB_USERS, input, input]
  );
  if (!rows.length) {
    console.log(`\nNo account has "${identifier}" as its username or email.`);
    return;
  }

  // The same rule as app/api/login: admin-tier roles match on Username, everyone else on Email;
  // the first matching row (lowest id) is the one checked.
  const loginPicks = (r: mysql.RowDataPacket) => {
    const role = String(r.role ?? '').trim() as Role;
    return isAdminTierRole(role)
      ? String(r.username ?? '').trim().toLowerCase() === input
      : !!r.email && String(r.email).trim().toLowerCase() === input;
  };
  const [allUsers] = await getPool().query<mysql.RowDataPacket[]>(
    'SELECT id, username, role, email FROM users WHERE sheet_id = ? AND sheet_tab = ? ORDER BY id',
    [USER_DETAILS_SHEET_ID, TAB_USERS]
  );
  const picked = allUsers.find(loginPicks);

  console.log(`\nAccounts with "${identifier}" as username or email:\n`);
  for (const r of rows) {
    const role = String(r.role ?? '').trim();
    const hash = String(r.password_hash ?? '');
    const matches = hash ? await bcrypt.compare(password, hash) : false;
    const [log] = await getPool().query<mysql.RowDataPacket[]>(
      "SELECT changed_by, changed_at FROM change_log WHERE table_name = 'users' AND row_id = ? AND column_name = 'Password Hash' ORDER BY id DESC LIMIT 1",
      [r.id]
    ).catch(() => [[]] as unknown as [mysql.RowDataPacket[]]);
    console.log(`  id ${r.id}  username "${r.username}"  email "${r.email ?? ''}"  role "${role}"`);
    console.log(`    logs in with: ${isAdminTierRole(role as Role) ? 'USERNAME' : 'EMAIL'}${role.toLowerCase() === 'mod' && !MOD_ENABLED ? '  (Mod logins are switched off)' : ''}`);
    console.log(`    stored hash: ${hash ? `${hash.length} characters, starts "${hash.slice(0, 4)}"` : 'NONE'}   password matches: ${matches ? 'YES' : 'no'}`);
    if (log[0]) console.log(`    password last changed by ${log[0].changed_by}${log[0].changed_at ? ` at ${log[0].changed_at}` : ''}`);
    console.log('');
  }
  if (!picked) {
    console.log(`The login finds NO account for "${identifier}": ${rows.some(r => !isAdminTierRole(String(r.role).trim() as Role)) ? 'this person logs in with their email, not their username.' : 'admin accounts log in with their username, not their email.'}`);
  } else {
    console.log(`The login checks account id ${picked.id} ("${picked.username}").${rows.length > 1 || allUsers.filter(loginPicks).length > 1 ? ' More than one account matches, so only this first one is checked.' : ''}`);
  }
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(closePool);
