import bcrypt from 'bcryptjs';
import { USER_DETAILS_SHEET_ID, TAB_USERS } from '../lib/config';
import { PASSWORD, USERS, assertLocal, query } from './helpers';

// Creates the temporary test users in the LOCAL database.
export default async function globalSetup() {
  assertLocal();
  await query("DELETE FROM users WHERE username LIKE 'e2e\\_%'");
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const u of Object.values(USERS)) {
    await query(
      'INSERT INTO users (sheet_id, sheet_tab, username, password_hash, role, display_name, email) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [USER_DETAILS_SHEET_ID, TAB_USERS, u.username, hash, u.role, u.displayName, u.email]
    );
  }
}
