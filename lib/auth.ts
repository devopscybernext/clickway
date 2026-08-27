export type SheetId = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '14';

// New role taxonomy (2026 rollout) — kept alongside legacy role slugs so
// accounts that haven't been migrated in the UserDetails sheet keep working
// exactly as before.
export type Role =
  | 'HM' | 'Admin' | 'Mod'
  | 'PMWebAdmin' | 'PMMarketingAdmin'
  | 'WebAdmin' | 'MarketingAdmin'
  | 'WebTeam' | 'MarketingTeam'
  // legacy — still read from the sheet for accounts not yet migrated
  | 'pm' | 'resource' | 'akash' | 'admin' | 'high' | 'mod';

export type Team = 'web' | 'marketing';

export interface AuthUser {
  username: string;
  role: Role;
  displayName: string;
  email?: string;
}

// ─── Mod user toggle ──────────────────────────────────────────────────────────
// Admin can ask Claude to set this to true (enable) or false (disable).
// When false the mod user credentials are rejected at login.
export const MOD_ENABLED = false;

// Credentials live in the "UserDetails" sheet tab (Username, Password Hash,
// Role, Display Name, Email), checked server-side in /api/login — never
// shipped to the browser. See lib/session.ts and app/api/login/route.ts.
//
// Login identifier: HM/Admin/Mod (admin-tier) log in with Username; every
// other role logs in with Email. See isAdminTierRole() below — the login
// route uses it to decide which column to match against per row.

// ─── Role tiers ───────────────────────────────────────────────────────────────
// Behavioural tiers used throughout the app instead of scattering
// role === '...' checks everywhere:
//   admin      — full, unrestricted, company-wide (HM, Admin, Mod + legacy)
//   pm         — company-wide visibility/edit rights, PM Project Bandwidth,
//                but no Tasks Assigned unless PMWebAdmin/PMMarketingAdmin
//   teamAdmin  — admin-level rights within their own team only
//   individual — own-row view only (like the old "resource" role)
const ADMIN_TIER_ROLES: Role[] = ['HM', 'Admin', 'Mod', 'admin', 'high', 'mod', 'akash'];
const PM_TIER_ROLES: Role[] = ['pm', 'PMWebAdmin', 'PMMarketingAdmin'];
const TEAM_ADMIN_TIER_ROLES: Role[] = ['WebAdmin', 'MarketingAdmin'];
const INDIVIDUAL_TIER_ROLES: Role[] = ['resource', 'WebTeam', 'MarketingTeam'];

export function isAdminTierRole(role: Role): boolean {
  return ADMIN_TIER_ROLES.includes(role);
}
export function isPmTierRole(role: Role): boolean {
  return PM_TIER_ROLES.includes(role);
}
export function isTeamAdminTierRole(role: Role): boolean {
  return TEAM_ADMIN_TIER_ROLES.includes(role);
}
export function isIndividualTierRole(role: Role): boolean {
  return INDIVIDUAL_TIER_ROLES.includes(role);
}

// ─── Team locking ───────────────────────────────────────────────────────────
// Roles whose entire dashboard is pinned to one team — the Web/Marketing
// sub-tab switcher on every split page is hidden and forced to this value.
const ROLE_TEAM_LOCK: Partial<Record<Role, Team>> = {
  WebAdmin: 'web', WebTeam: 'web',
  MarketingAdmin: 'marketing', MarketingTeam: 'marketing',
};

export function getLockedTeam(role: Role): Team | undefined {
  return ROLE_TEAM_LOCK[role];
}

// Individual Analysis ('10') and the legacy standalone Team Bandwidth ('12')
// stay removed from every role's nav — component code is left in place
// (unreachable) rather than deleted, to keep this change low-risk.
//
// ─── Grouped, collapsible sidebar nav ───────────────────────────────────────
// The sidebar is sorted by department, each rendered as a collapsible
// dropdown: Web (Team Bandwidth/Tasks Assigned/Tasks Overview/Leaderboard/
// Add Task), Marketing (same minus Leaderboard — no Marketing scoring system
// yet), PM Projects (Current Month/Previous Months/My Projects), then
// standalone Leave Status, then Tools (Clock Room/Holiday Calendar/AI
// Tools). A NavLeaf is an actual clickable page; `team` scopes its data and
// `subTab` additionally selects one of a page's own in-page sub-tabs (PM
// Projects, Tools) — both replace what used to be in-page toggle/tab UI
// (see Dashboard.tsx). A NavParent is just a dropdown grouping — Leave
// Status is the one page with no parent, rendered as a flat top-level leaf.
// Array order IS sidebar order, both for top-level items and each
// dropdown's children.
export interface NavLeaf {
  id: SheetId;
  team?: Team;
  subTab?: string;
  label?: string; // overrides SHEET_LABELS — needed once one sheet id backs several leaves (PM Projects, Tools)
}
export interface NavParent {
  label: string;
  children: NavLeaf[];
}
export type NavItem = NavLeaf | NavParent;
export function isNavParent(item: NavItem): item is NavParent {
  return 'children' in item;
}

// Sheet '3' used to be the single shared "Dashboard" page with an in-page
// Web/Marketing toggle; it's now reached only via a team-scoped "Team
// Bandwidth" leaf per department.
const WEB_FULL: NavLeaf[] = [
  { id: '3', team: 'web', label: 'Team Bandwidth' },
  { id: '1', team: 'web', label: 'Tasks Assigned' },
  { id: '9', team: 'web', label: 'Tasks Overview' },
  { id: '7', label: 'Leaderboard' },
  { id: '6', team: 'web', label: 'Add Task' },
];
const WEB_NO_TASKS_ASSIGNED: NavLeaf[] = [
  { id: '3', team: 'web', label: 'Team Bandwidth' },
  { id: '9', team: 'web', label: 'Tasks Overview' },
  { id: '7', label: 'Leaderboard' },
  { id: '6', team: 'web', label: 'Add Task' },
];
const WEB_INDIVIDUAL: NavLeaf[] = [
  { id: '3', team: 'web', label: 'Team Bandwidth' },
  { id: '9', team: 'web', label: 'Tasks Overview' },
  { id: '7', label: 'Leaderboard' },
];
const WEB_TASKS_OVERVIEW_ONLY: NavLeaf[] = [{ id: '9', team: 'web', label: 'Tasks Overview' }];
const MARKETING_FULL: NavLeaf[] = [
  { id: '3', team: 'marketing', label: 'Team Bandwidth' },
  { id: '1', team: 'marketing', label: 'Tasks Assigned' },
  { id: '9', team: 'marketing', label: 'Tasks Overview' },
  { id: '6', team: 'marketing', label: 'Add Task' },
];
const MARKETING_NO_TASKS_ASSIGNED: NavLeaf[] = [
  { id: '3', team: 'marketing', label: 'Team Bandwidth' },
  { id: '9', team: 'marketing', label: 'Tasks Overview' },
  { id: '6', team: 'marketing', label: 'Add Task' },
];
const MARKETING_INDIVIDUAL: NavLeaf[] = [
  { id: '3', team: 'marketing', label: 'Team Bandwidth' },
  { id: '9', team: 'marketing', label: 'Tasks Overview' },
];
const MARKETING_TASKS_OVERVIEW_ONLY: NavLeaf[] = [{ id: '9', team: 'marketing', label: 'Tasks Overview' }];

// Admin/HM/Mod don't have their own projects — no "My Projects" view for them.
const PM_PROJECTS_ADMIN: NavLeaf[] = [
  { id: '11', subTab: 'current', label: 'Current Month' },
  { id: '11', subTab: 'archive', label: 'Previous Months' },
];
const PM_PROJECTS_FULL: NavLeaf[] = [
  ...PM_PROJECTS_ADMIN,
  { id: '11', subTab: 'mine', label: 'My Projects' },
];
const TOOLS_CHILDREN: NavLeaf[] = [
  { id: '14', subTab: 'clock', label: 'Clock Room' },
  { id: '14', subTab: 'holiday', label: 'Holiday Calendar' },
  { id: '14', subTab: 'ai', label: 'AI Tools' },
];
const LEAVE_STATUS: NavLeaf = { id: '2' };

// HM / Admin / Mod — full access, both teams in full
const ADMIN_NAV: NavItem[] = [
  { label: 'Web', children: WEB_FULL },
  { label: 'Marketing', children: MARKETING_FULL },
  { label: 'PM Projects', children: PM_PROJECTS_ADMIN },
  LEAVE_STATUS,
  { label: 'Tools', children: TOOLS_CHILDREN },
];
// PMWebAdmin / PMMarketingAdmin — full access everywhere except Tasks
// Assigned, which stays pinned to their own team (see old
// TASKS_ASSIGNED_TEAM_LOCK behavior this replaces).
const PM_WEB_ADMIN_NAV: NavItem[] = [
  { label: 'Web', children: WEB_FULL },
  { label: 'Marketing', children: MARKETING_NO_TASKS_ASSIGNED },
  { label: 'PM Projects', children: PM_PROJECTS_FULL },
  LEAVE_STATUS,
  { label: 'Tools', children: TOOLS_CHILDREN },
];
const PM_MARKETING_ADMIN_NAV: NavItem[] = [
  { label: 'Web', children: WEB_NO_TASKS_ASSIGNED },
  { label: 'Marketing', children: MARKETING_FULL },
  { label: 'PM Projects', children: PM_PROJECTS_FULL },
  LEAVE_STATUS,
  { label: 'Tools', children: TOOLS_CHILDREN },
];
// legacy "pm" — like ADMIN_NAV but no Tasks Assigned at all, plus "My Projects"
const PM_LEGACY_NAV: NavItem[] = [
  { label: 'Web', children: WEB_NO_TASKS_ASSIGNED },
  { label: 'Marketing', children: MARKETING_NO_TASKS_ASSIGNED },
  { label: 'PM Projects', children: PM_PROJECTS_FULL },
  LEAVE_STATUS,
  { label: 'Tools', children: TOOLS_CHILDREN },
];
// WebAdmin — no Leave Status, no PM Projects; otherwise Web-only, except
// Tasks Overview also carries a lone cross-team peek at Marketing's (a
// pre-existing exception — every other page stays strictly Web-only).
const WEB_ADMIN_NAV: NavItem[] = [
  { label: 'Web', children: WEB_FULL },
  { label: 'Marketing', children: MARKETING_TASKS_OVERVIEW_ONLY },
  { label: 'Tools', children: TOOLS_CHILDREN },
];
// WebTeam / legacy "resource" — individual contributor, own team
const WEB_TEAM_NAV: NavItem[] = [
  { label: 'Web', children: WEB_INDIVIDUAL },
  { label: 'Tools', children: TOOLS_CHILDREN },
];
// MarketingAdmin — no Leave Status, no PM Projects; otherwise
// Marketing-only, except Tasks Overview also peeks at Web's (mirrors the
// WebAdmin exception above).
const MARKETING_ADMIN_NAV: NavItem[] = [
  { label: 'Marketing', children: MARKETING_FULL },
  { label: 'Web', children: WEB_TASKS_OVERVIEW_ONLY },
  { label: 'Tools', children: TOOLS_CHILDREN },
];
// MarketingTeam — individual contributor, own team
const MARKETING_TEAM_NAV: NavItem[] = [
  { label: 'Marketing', children: MARKETING_INDIVIDUAL },
  { label: 'Tools', children: TOOLS_CHILDREN },
];

export const ROLE_NAV: Record<Role, NavItem[]> = {
  HM:    ADMIN_NAV,
  Admin: ADMIN_NAV,
  Mod:   ADMIN_NAV,
  PMWebAdmin:       PM_WEB_ADMIN_NAV,
  PMMarketingAdmin: PM_MARKETING_ADMIN_NAV,
  WebAdmin:       WEB_ADMIN_NAV,
  MarketingAdmin: MARKETING_ADMIN_NAV,
  WebTeam:       WEB_TEAM_NAV,
  MarketingTeam: MARKETING_TEAM_NAV,
  // legacy — unmigrated accounts behave exactly like their new-taxonomy
  // equivalent (akash/admin/high/mod ≈ HM/Admin/Mod, resource ≈ WebTeam)
  pm:       PM_LEGACY_NAV,
  resource: WEB_TEAM_NAV,
  akash:    ADMIN_NAV,
  admin:    ADMIN_NAV,
  high:     ADMIN_NAV,
  mod:      ADMIN_NAV,
};

export const SHEET_LABELS: Record<SheetId, string> = {
  '1': 'Tasks Assigned',
  '2': 'Leave Status',
  '3': 'Team Bandwidth',
  '4': 'Team',
  '5': 'Daily Bucket',
  '6': 'Add Task',
  '7': 'Leaderboard',
  '8': 'QA Testing',
  '9': 'Tasks Overview',
  '10': 'Individual Analysis',
  '11': 'PM Projects',
  '12': 'Team Bandwidth',
  '14': 'Tools',
};

export function getSheetLabel(id: SheetId, role: Role): string {
  return SHEET_LABELS[id];
}

// QA Testing ('8') lives as a nested tab inside Vinay's Tasks Overview instead
// of its own sidebar entry — admin still gets the standalone tab via ROLE_NAV.
export function getNavItems(user: AuthUser): NavItem[] {
  return ROLE_NAV[user.role];
}

// The first actual page a role lands on — a role's first NavItem may be a
// dropdown, so this drills into its first child rather than returning the
// dropdown itself.
export function getFirstNavLeaf(user: AuthUser): NavLeaf {
  const item = ROLE_NAV[user.role][0];
  return isNavParent(item) ? item.children[0] : item;
}

// Flat, deduplicated list of sheet ids a role can reach — used where only
// "can this role see this page at all" matters, not the grouped/team nav
// shape (e.g. the legacy Header.tsx).
export function getAllowedSheets(user: AuthUser): SheetId[] {
  const seen = new Set<SheetId>();
  const ids: SheetId[] = [];
  const add = (id: SheetId) => { if (!seen.has(id)) { seen.add(id); ids.push(id); } };
  for (const item of ROLE_NAV[user.role]) {
    if (isNavParent(item)) item.children.forEach(c => add(c.id));
    else add(item.id);
  }
  return ids;
}
