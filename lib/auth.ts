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
// ─── Grouped sidebar nav ────────────────────────────────────────────────────
// The sidebar is sorted by department: Web's own Team Bandwidth/Tasks
// Assigned/Tasks Overview/Add Task/Leaderboard, then Marketing's own copies
// (no Leaderboard yet — no Marketing scoring system), then a PM section,
// then standalone Leave Status/Tools. `team` on an entry both scopes its
// data and removes the in-page Web/Marketing toggle those pages used to
// have (see Dashboard.tsx); `group` marks the first entry of a new section
// so the sidebar knows where to draw a header. Array order IS sidebar order.
export type NavGroupLabel = 'Web' | 'Marketing' | 'PM';
export interface NavEntry {
  id: SheetId;
  team?: Team;
  group?: NavGroupLabel;
}

// Sheet '3' used to be the single shared "Dashboard" page with an in-page
// Web/Marketing toggle; it's now reached only via a team-scoped "Team
// Bandwidth" nav entry per department (see SHEET_LABELS below).
const WEB_FULL: NavEntry[] = [
  { id: '3', team: 'web', group: 'Web' },
  { id: '1', team: 'web' },
  { id: '9', team: 'web' },
  { id: '6', team: 'web' },
  { id: '7' },
];
const WEB_NO_TASKS_ASSIGNED: NavEntry[] = [
  { id: '3', team: 'web', group: 'Web' },
  { id: '9', team: 'web' },
  { id: '6', team: 'web' },
  { id: '7' },
];
const WEB_INDIVIDUAL: NavEntry[] = [
  { id: '3', team: 'web', group: 'Web' },
  { id: '9', team: 'web' },
  { id: '7' },
];
const MARKETING_FULL: NavEntry[] = [
  { id: '3', team: 'marketing', group: 'Marketing' },
  { id: '1', team: 'marketing' },
  { id: '9', team: 'marketing' },
  { id: '6', team: 'marketing' },
];
const MARKETING_NO_TASKS_ASSIGNED: NavEntry[] = [
  { id: '3', team: 'marketing', group: 'Marketing' },
  { id: '9', team: 'marketing' },
  { id: '6', team: 'marketing' },
];
const MARKETING_INDIVIDUAL: NavEntry[] = [
  { id: '3', team: 'marketing', group: 'Marketing' },
  { id: '9', team: 'marketing' },
];
const PM_GROUP: NavEntry[] = [{ id: '11', group: 'PM' }];
const LEAVE_STATUS: NavEntry = { id: '2' };
const TOOLS: NavEntry = { id: '14' };

// HM / Admin / Mod — full access, both teams in full
const ADMIN_NAV: NavEntry[] = [...WEB_FULL, ...MARKETING_FULL, ...PM_GROUP, LEAVE_STATUS, TOOLS];
// PMWebAdmin / PMMarketingAdmin — full access everywhere except Tasks
// Assigned, which stays pinned to their own team (see old
// TASKS_ASSIGNED_TEAM_LOCK behavior this replaces).
const PM_WEB_ADMIN_NAV: NavEntry[] = [...WEB_FULL, ...MARKETING_NO_TASKS_ASSIGNED, ...PM_GROUP, LEAVE_STATUS, TOOLS];
const PM_MARKETING_ADMIN_NAV: NavEntry[] = [...WEB_NO_TASKS_ASSIGNED, ...MARKETING_FULL, ...PM_GROUP, LEAVE_STATUS, TOOLS];
// legacy "pm" — like ADMIN_NAV but no Tasks Assigned at all
const PM_LEGACY_NAV: NavEntry[] = [...WEB_NO_TASKS_ASSIGNED, ...MARKETING_NO_TASKS_ASSIGNED, ...PM_GROUP, LEAVE_STATUS, TOOLS];
// WebAdmin — no Leave Status, no PM Projects; otherwise Web-only, except
// Tasks Overview also carries a lone cross-team peek at Marketing's (a
// pre-existing exception — every other page stays strictly Web-only).
const WEB_ADMIN_NAV: NavEntry[] = [...WEB_FULL, { id: '9', team: 'marketing', group: 'Marketing' }, TOOLS];
// WebTeam / legacy "resource" — individual contributor, own team
const WEB_TEAM_NAV: NavEntry[] = [...WEB_INDIVIDUAL, TOOLS];
// MarketingAdmin — no Leave Status, no PM Projects; otherwise
// Marketing-only, except Tasks Overview also peeks at Web's (mirrors the
// WebAdmin exception above).
const MARKETING_ADMIN_NAV: NavEntry[] = [...MARKETING_FULL, { id: '9', team: 'web', group: 'Web' }, TOOLS];
// MarketingTeam — individual contributor, own team
const MARKETING_TEAM_NAV: NavEntry[] = [...MARKETING_INDIVIDUAL, TOOLS];

export const ROLE_NAV: Record<Role, NavEntry[]> = {
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
export function getNavEntries(user: AuthUser): NavEntry[] {
  return ROLE_NAV[user.role];
}

// Flat, deduplicated list of sheet ids a role can reach — used where only
// "can this role see this page at all" matters, not the grouped/team nav
// shape (e.g. Dashboard's initial selectedSheet, the legacy Header.tsx).
export function getAllowedSheets(user: AuthUser): SheetId[] {
  const seen = new Set<SheetId>();
  const ids: SheetId[] = [];
  for (const entry of ROLE_NAV[user.role]) {
    if (!seen.has(entry.id)) { seen.add(entry.id); ids.push(entry.id); }
  }
  return ids;
}
