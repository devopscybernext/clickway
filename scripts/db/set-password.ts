// Sets a dashboard user's password in MySQL, or creates the user.
//   npm run db:set-password -- <username>
//   npm run db:set-password -- <username> --create --role WebTeam --name "Full Name" --email name@cybernext.io
// The password is asked for twice and never shown or passed on the command line.
// (With DATA_SOURCE=sheets, users still live in the UserDetails spreadsheet.)
import './env';
import readline from 'readline';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import { closePool, getPool } from '../../lib/data/mysql';
import { USER_DETAILS_SHEET_ID, TAB_USERS } from '../../lib/config';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

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
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
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
  const username = process.argv[2];
  if (!username || username.startsWith('--')) {
    console.error('Usage: npm run db:set-password -- <username> [--create --role <Role> --name "<Display Name>" --email <email>]');
    process.exitCode = 1;
    return;
  }
  const create = process.argv.includes('--create');
  const pool = getPool();
  const [found] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT id FROM users WHERE LOWER(TRIM(username)) = LOWER(?)', [username.trim()]
  );
  if (create && found.length) throw new Error(`User "${username}" already exists — leave out --create to change the password.`);
  if (!create && !found.length) throw new Error(`No user "${username}" — add --create --role … --name … --email … to create one.`);
  const role = arg('role'), name = arg('name'), email = arg('email');
  if (create && (!role || !name)) throw new Error('--create needs --role and --name (and --email for non-admin roles, who log in by email).');

  const password = await askHidden('New password: ');
  if (password.length < 8) throw new Error('Use at least 8 characters.');
  if (await askHidden('Repeat password: ') !== password) throw new Error('The passwords did not match.');
  const hash = await bcrypt.hash(password, 10);

  if (create) {
    await pool.query(
      'INSERT INTO users (sheet_id, sheet_tab, username, password_hash, role, display_name, email) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [USER_DETAILS_SHEET_ID, TAB_USERS, username.trim(), hash, role, name, email ?? '']
    );
    console.log(`Created ${username} (${role}).`);
  } else {
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, found[0].id]);
    await pool.query(
      'INSERT INTO change_log (changed_by, table_name, row_id, column_name, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)',
      ['db:set-password', 'users', found[0].id, 'Password Hash', '(hidden)', '(changed)']
    );
    console.log(`Password updated for ${username}.`);
  }
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(closePool);
