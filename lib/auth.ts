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

// Tasks Assigned locks PMWebAdmin/PMMarketingAdmin to their own team too,
// even though those roles see both teams everywhere else.
const TASKS_ASSIGNED_TEAM_LOCK: Partial<Record<Role, Team>> = {
  ...ROLE_TEAM_LOCK,
  PMWebAdmin: 'web',
  PMMarketingAdmin: 'marketing',
};

export function getLockedTeam(role: Role): Team | undefined {
  return ROLE_TEAM_LOCK[role];
}
export function getTasksAssignedLockedTeam(role: Role): Team | undefined {
  return TASKS_ASSIGNED_TEAM_LOCK[role];
}

// Individual Analysis ('10') removed from every role's nav — component code
// is left in place (unreachable) rather than deleted, to keep this change low-risk.
const FULL_ACCESS: SheetId[]     = ['3', '6', '1', '9', '11', '12', '7', '14'];
const NO_PM_BANDWIDTH: SheetId[] = ['3', '6', '1', '9', '12', '7', '14'];
const TEAM_MEMBER: SheetId[]     = ['3', '9', '7', '14'];

export const ROLE_SHEETS: Record<Role, SheetId[]> = {
  HM:    FULL_ACCESS,
  Admin: FULL_ACCESS,
  Mod:   FULL_ACCESS,
  PMWebAdmin:       FULL_ACCESS,
  PMMarketingAdmin: FULL_ACCESS,
  WebAdmin:       NO_PM_BANDWIDTH,
  MarketingAdmin: NO_PM_BANDWIDTH,
  WebTeam:       TEAM_MEMBER,
  MarketingTeam: TEAM_MEMBER,
  // legacy
  pm:       ['3', '6', '9', '11', '12', '7', '14'],
  resource: TEAM_MEMBER,
  akash:    FULL_ACCESS,
  admin:    FULL_ACCESS,
  high:     FULL_ACCESS,
  mod:      FULL_ACCESS,
};

export const SHEET_LABELS: Record<SheetId, string> = {
  '1': 'Tasks Assigned',
  '2': 'Resource Availability',
  '3': 'Dashboard',
  '4': 'Team',
  '5': 'Daily Bucket',
  '6': 'Add Task',
  '7': 'Leaderboard',
  '8': 'QA Testing',
  '9': 'Tasks Overview',
  '10': 'Individual Analysis',
  '11': 'PM Project Bandwidth',
  '12': 'Team Bandwidth',
  '14': 'Tools',
};

export function getSheetLabel(id: SheetId, role: Role): string {
  return SHEET_LABELS[id];
}

// QA Testing ('8') lives as a nested tab inside Vinay's Tasks Overview instead
// of its own sidebar entry — admin still gets the standalone tab via ROLE_SHEETS.
export function getAllowedSheets(user: AuthUser): SheetId[] {
  return ROLE_SHEETS[user.role];
}
