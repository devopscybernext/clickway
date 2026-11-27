import type mysql from 'mysql2/promise';
import { USER_DETAILS_SHEET_ID, TAB_USERS } from '../config';
import { canCreateProjects, hasFullProjectAccess } from './rules';

// What each account may do in Projects, from its role (lib/projects/rules.ts). Everyone can use
// Projects; the role decides who can create projects and who has full access. (The per-department and
// per-person settings that used to live in Admin Portal → Projects were removed; their old table,
// doc_project_access, is no longer read.)

export interface Policy { access: boolean; create: boolean; full: boolean }

export function resolvePolicy(role: string): Policy {
  const full = hasFullProjectAccess(role);
  return { access: true, create: full || canCreateProjects(role), full };
}

type Db = Pick<mysql.Pool, 'query'>;
type Row = mysql.RowDataPacket;

export interface Person { id: number; username: string; name: string; email: string; role: string; policy: Policy }

// Everyone with an account, with what they may do in Projects.
export async function loadPeople(db: Db): Promise<Person[]> {
  const [users] = await db.query<Row[]>(
    'SELECT id, username, display_name, email, role FROM users WHERE sheet_id = ? AND sheet_tab = ? ORDER BY display_name, username',
    [USER_DETAILS_SHEET_ID, TAB_USERS]
  );
  return users.map(u => {
    const role = String(u.role ?? '').trim();
    return {
      id: Number(u.id), username: String(u.username ?? ''), name: String(u.display_name || u.username || ''),
      email: String(u.email ?? '').trim().toLowerCase(), role, policy: resolvePolicy(role),
    };
  });
}

// One person's policy (used on every Projects request).
export async function policyFor(_db: Db, user: { role: string }): Promise<Policy> {
  return resolvePolicy(user.role);
}
