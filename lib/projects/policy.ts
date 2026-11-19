import type mysql from 'mysql2/promise';
import { USER_DETAILS_SHEET_ID, TAB_USERS } from '../config';
import { resolveAssignment } from '../roster';
import {
  canCreateProjects, hasFullProjectAccess, isWebTeamRole, WEB_TEAM_DEFAULT_ACCESS, type ProjectAccess,
} from './rules';

// Who may use Projects, set in Admin Portal → Projects (table doc_project_access).
//
// Each person's access is worked out field by field, most specific first:
//   1. their own setting (user row), if one is set,
//   2. otherwise their department's setting (department row), if one is set,
//   3. otherwise the built-in default for their role (lib/projects/rules.ts).
// "No access" always wins: someone without access can't create, isn't added to new projects and has
// no Google access to restricted documents. Full access always includes creating. Super Admin
// (role Admin) always has full access and can't be changed, so nobody can lock everyone out.

export const PROJECT_DEPARTMENTS = ['Web', 'Marketing', 'PM', 'None'] as const;
export type ProjectDepartment = (typeof PROJECT_DEPARTMENTS)[number];
export type AutoAdd = 'none' | ProjectAccess;

// null = not set here (use the next level)
export interface Rule { access: boolean | null; create: boolean | null; full: boolean | null; autoAdd: AutoAdd | null }
export interface Policy { access: boolean; create: boolean; full: boolean; autoAdd: ProjectAccess | null; locked: boolean }

export const EMPTY_RULE: Rule = { access: null, create: null, full: null, autoAdd: null };
const SUPER_ADMIN_ROLES = ['Admin', 'admin'];

export function isSuperAdminRole(role: string): boolean {
  return SUPER_ADMIN_ROLES.includes(role);
}

export function roleDefaults(role: string): { access: boolean; create: boolean; full: boolean; autoAdd: AutoAdd } {
  return {
    access: true,
    create: canCreateProjects(role),
    full: hasFullProjectAccess(role),
    autoAdd: isWebTeamRole(role) ? WEB_TEAM_DEFAULT_ACCESS : 'none',
  };
}

export function resolvePolicy(role: string, department?: Rule, user?: Rule): Policy {
  if (isSuperAdminRole(role)) return { access: true, create: true, full: true, autoAdd: null, locked: true };
  const d = roleDefaults(role);
  const pick = <K extends keyof Rule>(k: K) => (user?.[k] ?? department?.[k] ?? d[k]) as NonNullable<Rule[K]>;
  const access = pick('access');
  const full = access && pick('full');
  const create = access && (full || pick('create'));
  const auto = pick('autoAdd');
  return { access, create, full, autoAdd: access && !full && auto !== 'none' ? auto : null, locked: false };
}

export function departmentOf(name: string, role: string, department: string, sub: string): ProjectDepartment {
  const d = resolveAssignment(name, role, department ?? '', sub ?? '').department;
  return (d || 'None') as ProjectDepartment;
}

type Db = Pick<mysql.Pool, 'query'>;
type Row = mysql.RowDataPacket;

const bool = (v: unknown): boolean | null => (v === null || v === undefined ? null : Number(v) === 1);

function toRule(r: Row): Rule {
  return { access: bool(r.can_access), create: bool(r.can_create), full: bool(r.full_access), autoAdd: (r.auto_add ?? null) as AutoAdd | null };
}

export async function loadRules(db: Db): Promise<{ departments: Map<string, Rule>; users: Map<number, Rule> }> {
  const [rows] = await db.query<Row[]>('SELECT scope, scope_key, can_access, can_create, full_access, auto_add FROM doc_project_access');
  const departments = new Map<string, Rule>();
  const users = new Map<number, Rule>();
  for (const r of rows) {
    if (r.scope === 'department') departments.set(String(r.scope_key), toRule(r));
    else users.set(Number(r.scope_key), toRule(r));
  }
  return { departments, users };
}

export interface Person {
  id: number; username: string; name: string; email: string; role: string; department: ProjectDepartment;
  policy: Policy; own: Rule;
}

// Everyone with an account, with what they may do in Projects.
export async function loadPeople(db: Db): Promise<Person[]> {
  const [users] = await db.query<Row[]>(
    'SELECT id, username, display_name, email, role, department, sub_department FROM users WHERE sheet_id = ? AND sheet_tab = ? ORDER BY display_name, username',
    [USER_DETAILS_SHEET_ID, TAB_USERS]
  );
  const rules = await loadRules(db);
  return users.map(u => {
    const role = String(u.role ?? '').trim();
    const name = String(u.display_name || u.username || '');
    const department = departmentOf(name, role, String(u.department ?? ''), String(u.sub_department ?? ''));
    const own = rules.users.get(Number(u.id)) ?? EMPTY_RULE;
    return {
      id: Number(u.id), username: String(u.username ?? ''), name, email: String(u.email ?? '').trim().toLowerCase(), role, department,
      policy: resolvePolicy(role, rules.departments.get(department), own), own,
    };
  });
}

// One person's policy (used on every Projects request).
export async function policyFor(db: Db, user: { id: number; role: string; name: string; department: string; sub: string }): Promise<Policy> {
  if (isSuperAdminRole(user.role)) return resolvePolicy(user.role);
  const department = departmentOf(user.name, user.role, user.department, user.sub);
  const [rows] = await db.query<Row[]>(
    "SELECT scope, scope_key, can_access, can_create, full_access, auto_add FROM doc_project_access WHERE (scope = 'department' AND scope_key = ?) OR (scope = 'user' AND scope_key = ?)",
    [department, String(user.id)]
  );
  const dept = rows.find(r => r.scope === 'department');
  const own = rows.find(r => r.scope === 'user');
  return resolvePolicy(user.role, dept ? toRule(dept) : undefined, own ? toRule(own) : undefined);
}
