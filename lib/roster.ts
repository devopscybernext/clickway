import { WEB_TEAM, MARKETING_ASSIGNED_PERSONS } from './config';

// Who is on which team. The Admin Portal stores each account's Department
// (Web / Marketing / PM) and Sub Department(s); this file turns those accounts
// into the rosters the forms, the Team Bandwidth cards and the filters use,
// so a user created in the Admin Portal shows up in their own team's forms and
// cards without touching the code.
//
// Accounts created before the Admin Portal had these fields have them blank.
// Rather than needing a data migration, a blank department is worked out from
// the team lists that used to be hard-coded (lib/config.ts and the sub-department
// lists below), so existing people keep exactly the place they had.

export const DEPARTMENTS = ['Web', 'Marketing', 'PM'] as const;
export type Department = (typeof DEPARTMENTS)[number];

export type SubDeptKey = 'uiux' | 'frontend' | 'backend' | 'seo' | 'ppc' | 'smm';

export const SUB_DEPARTMENTS: Record<'Web' | 'Marketing', { key: SubDeptKey; label: string }[]> = {
  Web: [
    { key: 'uiux', label: 'UIUX' },
    { key: 'frontend', label: 'Front End' },
    { key: 'backend', label: 'Back End' },
  ],
  Marketing: [
    { key: 'seo', label: 'SEO' },
    { key: 'ppc', label: 'PPC' },
    { key: 'smm', label: 'SMM' },
  ],
};

export const subDeptLabel = (key: string): string =>
  [...SUB_DEPARTMENTS.Web, ...SUB_DEPARTMENTS.Marketing].find(s => s.key === key)?.label ?? key;

// "None" is stored when someone is deliberately in no department (HM, Admin ...),
// so it isn't mistaken for a blank, pre-Admin-Portal account.
export const NO_DEPARTMENT = 'None';

// Where the people who existed before the Admin Portal sat. Akshay is in both
// SEO and PPC and Shubham in both Front End and Back End (they do work for both).
const LEGACY_SUB_DEPARTMENTS: Record<string, SubDeptKey[]> = {
  akash: ['uiux'], robin: ['uiux'],
  lovepreet: ['frontend'], shubham: ['frontend', 'backend'],
  pawan: ['backend'], dhruv: ['backend'],
  bhavya: ['seo'], kshitij: ['seo'], akshay: ['seo', 'ppc'],
  atul: ['ppc'], shiwangi: ['ppc'], anjali: ['ppc'], dheeraj: ['ppc'], anurag: ['ppc'], vansh: ['ppc'],
  payal: ['smm'], akanksha: ['smm'], manas: ['smm'],
};

const norm = (s: string) => s.trim().toLowerCase();
const PM_ROLES = ['pm', 'PMWebAdmin', 'PMMarketingAdmin'];

export interface RosterMember {
  name: string;
  department: Department | '';
  subDepartments: SubDeptKey[];
}

const isDepartment = (v: string): v is Department => (DEPARTMENTS as readonly string[]).includes(v);
const isSubDept = (v: string): v is SubDeptKey => [...SUB_DEPARTMENTS.Web, ...SUB_DEPARTMENTS.Marketing].some(s => s.key === v);

export function parseSubDepartments(stored: string): SubDeptKey[] {
  return stored.split(',').map(s => norm(s)).filter(isSubDept);
}

// A sub-department only means something under its own department.
export function subDepartmentsFor(department: Department | '', subs: SubDeptKey[]): SubDeptKey[] {
  if (department !== 'Web' && department !== 'Marketing') return [];
  const allowed = SUB_DEPARTMENTS[department].map(s => s.key);
  return subs.filter(s => allowed.includes(s));
}

// The department / sub-departments an account really has: what the Admin Portal
// stored, or — for a blank (older) account — what the old team lists say.
export function resolveAssignment(name: string, role: string, storedDepartment: string, storedSub: string): Pick<RosterMember, 'department' | 'subDepartments'> {
  const stored = storedDepartment.trim();
  if (stored) {
    const department: Department | '' = isDepartment(stored) ? stored : '';
    return { department, subDepartments: subDepartmentsFor(department, parseSubDepartments(storedSub)) };
  }
  const n = norm(name);
  let department: Department | '' = '';
  if (WEB_TEAM.some(w => norm(w) === n)) department = 'Web';
  else if (MARKETING_ASSIGNED_PERSONS.some(m => norm(m) === n)) department = 'Marketing';
  else if (PM_ROLES.includes(role)) department = 'PM';
  const subs = parseSubDepartments(storedSub);
  return { department, subDepartments: subDepartmentsFor(department, subs.length ? subs : LEGACY_SUB_DEPARTMENTS[n] ?? []) };
}

export interface RosterUserRow { name: string; role: string; department: string; subDepartment: string }

export function buildRoster(users: RosterUserRow[]): RosterMember[] {
  return users
    .filter(u => u.name.trim())
    .map(u => ({ name: u.name.trim(), ...resolveAssignment(u.name, u.role, u.department, u.subDepartment) }));
}

// ── Roster names, as the forms and cards ask for them ────────────────────────

export interface RosterNames { web: string[]; marketing: string[]; all: string[] }

export function rosterNamesFrom(members: RosterMember[] | null): RosterNames {
  const web = members ? members.filter(m => m.department === 'Web').map(m => m.name) : WEB_TEAM;
  const marketing = members ? members.filter(m => m.department === 'Marketing').map(m => m.name) : MARKETING_ASSIGNED_PERSONS;
  return { web, marketing, all: [...web, ...marketing] };
}

// ── The client's copy ─────────────────────────────────────────────────────
// Dashboard fetches /api/team-roster once and calls setRoster(); until then
// (and for anyone the fetch fails for) the old hard-coded lists answer, so the
// screens behave exactly as before. Components read it at render time — the
// Dashboard re-renders when it changes.

let current: RosterMember[] | null = null;
export function setRoster(members: RosterMember[] | null) { current = members; }
export const currentRosterNames = (): RosterNames => rosterNamesFrom(current);
export const webTeam = (): string[] => currentRosterNames().web;
export const marketingTeam = (): string[] => currentRosterNames().marketing;

export function inSubDepartment(name: string, key: SubDeptKey): boolean {
  const n = norm(name);
  if (current) return current.some(m => norm(m.name) === n && m.subDepartments.includes(key));
  return (LEGACY_SUB_DEPARTMENTS[n] ?? []).includes(key);
}

// Which team a name belongs to, if any
export function teamOf(name: string): 'web' | 'marketing' | null {
  const n = norm(name);
  if (webTeam().some(w => norm(w) === n)) return 'web';
  if (marketingTeam().some(m => norm(m) === n)) return 'marketing';
  return null;
}
