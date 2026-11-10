export type SheetId = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '14' | '15' | '16' | '17' | '18' | '19' | '20';

// New role taxonomy (2026 rollout) — kept alongside legacy role slugs so
// accounts that haven't been migrated in the UserDetails sheet keep working
// exactly as before.
export type Role =
  | 'HM' | 'Admin' | 'Mod'
  | 'PMWebAdmin' | 'PMMarketingAdmin'
  | 'WebAdmin' | 'MarketingAdmin'
  | 'WebTeam' | 'MarketingTeam'
  // legacy — still read from the sheet for accounts not yet migrated
  | 'pm' | 'resource' | 'akash' | 'admin' | 'high' | 'mod'
  // 'smm' behaves exactly like MarketingTeam — an alias for entering
  // Social Media Marketing hires under a role name that reads clearly in
  // the UserDetails sheet, same idea as 'resource' aliasing WebTeam.
  | 'smm';

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
const INDIVIDUAL_TIER_ROLES: Role[] = ['resource', 'WebTeam', 'MarketingTeam', 'smm'];

export function isAdminTierRole(role: Role): boolean {
  return ADMIN_TIER_ROLES.includes(role);
}
// Cybernext InHouse: the tab is open to everyone, but only High Management (HM) and
// Super Admin (Admin) — plus the legacy slugs that map to them — get Websites, Case
// Studies, Documentations and NextBot. Everyone else (Mod, PMs, team admins, team
// members) sees just Brand Kit. The menu, the page and /api/inhouse all use this one check.
const INHOUSE_FULL_ROLES: Role[] = ['HM', 'Admin', 'admin', 'high', 'akash'];
export function canSeeInHouseFull(role: Role): boolean {
  return INHOUSE_FULL_ROLES.includes(role);
}
// Admin Portal (add / edit / remove accounts): HM and Admin only, the same two
// roles as the full InHouse. The page, the profile menu and /api/admin-users all
// use this one check.
export function canManageUsers(role: Role): boolean {
  return INHOUSE_FULL_ROLES.includes(role);
}
// Help tab: the Super Admin (role Admin, and the legacy "admin") sees every request
// and sets its status. Everyone else only sees their own. The menu, the page and
// /api/help all use this one check.
const HELP_ADMIN_ROLES: Role[] = ['Admin', 'admin'];
export function canManageHelp(role: Role): boolean {
  return HELP_ADMIN_ROLES.includes(role);
}
// PM Projects: only HM and Admin can delete a project row (Current Month and Previous Months).
// The table's delete icon and /api/rows use this one check.
export function canDeletePmProjects(role: Role): boolean {
  return INHOUSE_FULL_ROLES.includes(role);
}
// Cybernext InHouse: only the Super Admin can upload Excel sheets into Websites, Case Studies,
// Brand Kit and Documentations (the buttons and /api/inhouse/import use this one check).
export function canManageInHouseData(role: Role): boolean {
  return HELP_ADMIN_ROLES.includes(role);
}
// Notifications tab in the Admin Portal: HM and Admin see the log and download it as Excel; only
// the Super Admin (role Admin) can clear every notification at once. /api/notifications/log uses these.
export function canViewNotificationLog(role: Role): boolean {
  return INHOUSE_FULL_ROLES.includes(role);
}
export function canClearNotifications(role: Role): boolean {
  return HELP_ADMIN_ROLES.includes(role);
}
// Tasks Assigned (Web and Marketing): while editing, the Super Admin (Admin) and HM can change every column of a task, not only
// the usual ones (and their legacy aliases). The page passes it to the table as editAllColumns.
export function canEditEveryColumn(role: Role): boolean {
  return INHOUSE_FULL_ROLES.includes(role);
}
export function isPmTierRole(role: Role): boolean {
  return PM_TIER_ROLES.includes(role);
}
// A new-task notification takes these roles to Tasks Assigned (where they assign it), everyone else to
// Tasks Overview. WebAdmin / PMWebAdmin for Web, MarketingAdmin / PMMarketingAdmin for Marketing.
export function opensTasksAssignedForNewTask(role: Role): boolean {
  return role === 'WebAdmin' || role === 'MarketingAdmin' || role === 'PMWebAdmin' || role === 'PMMarketingAdmin';
}
// Leaderboard "Add Feedback" (manual points): Admin / HM / Mod (and their legacy
// aliases), the project managers (pm, PMWebAdmin, PMMarketingAdmin) and the Web
// Admin. Not for the Marketing Admin or the team members. The button, the popup
// and /api/forms all use this one check.
export function canAddLeaderboardFeedback(role: Role): boolean {
  return isAdminTierRole(role) || isPmTierRole(role) || role === 'WebAdmin';
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
  MarketingAdmin: 'marketing', MarketingTeam: 'marketing', smm: 'marketing',
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
// dropdown: Web (Dashboard/Tasks Assigned/Tasks Overview/Leaderboard/
// Add Task), Marketing (same minus Leaderboard — no Marketing scoring system
// yet), PM Projects (Current Month/Previous Months/My Projects), then
// standalone Leave Status, then Cybernext InHouse (with Clock Room/Holiday Calendar/AI
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
// Dashboard (id 20) is the first page of each team's menu: a summary of how the team's work is going
const WEB_DASHBOARD: NavLeaf = { id: '20', team: 'web', label: 'Dashboard' };
const WEB_FULL: NavLeaf[] = [
  WEB_DASHBOARD,
  { id: '1', team: 'web', label: 'Tasks Assigned' },
  { id: '9', team: 'web', label: 'Tasks Overview' },
  { id: '7', label: 'Leaderboard' },
  { id: '6', team: 'web', label: 'Add Task' },
];
const WEB_NO_TASKS_ASSIGNED: NavLeaf[] = [
  WEB_DASHBOARD,
  { id: '9', team: 'web', label: 'Tasks Overview' },
  { id: '7', label: 'Leaderboard' },
  { id: '6', team: 'web', label: 'Add Task' },
];
const WEB_INDIVIDUAL: NavLeaf[] = [
  WEB_DASHBOARD,
  { id: '9', team: 'web', label: 'Tasks Overview' },
  { id: '7', label: 'Leaderboard' },
];
const WEB_TASKS_OVERVIEW_ONLY: NavLeaf[] = [{ id: '9', team: 'web', label: 'Tasks Overview' }];
const MARKETING_DASHBOARD: NavLeaf = { id: '20', team: 'marketing', label: 'Dashboard' };
const MARKETING_FULL: NavLeaf[] = [
  MARKETING_DASHBOARD,
  { id: '1', team: 'marketing', label: 'Tasks Assigned' },
  { id: '9', team: 'marketing', label: 'Tasks Overview' },
  { id: '6', team: 'marketing', label: 'Add Task' },
];
const MARKETING_NO_TASKS_ASSIGNED: NavLeaf[] = [
  MARKETING_DASHBOARD,
  { id: '9', team: 'marketing', label: 'Tasks Overview' },
  { id: '6', team: 'marketing', label: 'Add Task' },
];
const MARKETING_INDIVIDUAL: NavLeaf[] = [
  MARKETING_DASHBOARD,
  { id: '9', team: 'marketing', label: 'Tasks Overview' },
];
const MARKETING_TASKS_OVERVIEW_ONLY: NavLeaf[] = [{ id: '9', team: 'marketing', label: 'Tasks Overview' }];

// Admin/HM/Mod don't have their own projects — no "My Projects" view for them.
const PM_PROJECTS_ADMIN: NavLeaf[] = [
  { id: '11', subTab: 'current', label: 'Current Month' },
  { id: '11', subTab: 'archive', label: 'Previous Months' },
  { id: '11', subTab: 'closed', label: 'Closed Project' },
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
// The three tools (Clock Room, Holiday Calendar, AI Tools) live inside Cybernext InHouse, for every
// role. They are page '14', which the Tools page (components/ClockRoom etc.) renders.
// Cybernext's own portfolio: websites we built / manage, and our case studies.
// Read-only. Everyone gets Brand Kit; the rest is HM / Admin only (see
// canSeeInHouseFull, which the API and the page also use).
// NextBot ("coming soon" for now) is always the last sub-tab.
const INHOUSE_BRAND_KIT: NavLeaf = { id: '17', subTab: 'brand-kit', label: 'Brand Kit' };
const INHOUSE_NEXTBOT: NavLeaf = { id: '17', subTab: 'nextbot', label: 'NextBot' };
const INHOUSE_FULL_CHILDREN: NavLeaf[] = [
  { id: '17', subTab: 'websites', label: 'Websites' },
  { id: '17', subTab: 'case-studies', label: 'Case Studies' },
  INHOUSE_BRAND_KIT,
  { id: '17', subTab: 'documentations', label: 'Documentations' },
  ...TOOLS_CHILDREN,
  INHOUSE_NEXTBOT,
];
const INHOUSE_LIMITED: NavItem = { label: 'Cybernext InHouse', children: [INHOUSE_BRAND_KIT, ...TOOLS_CHILDREN] };
const LEAVE_STATUS: NavLeaf = { id: '2' };
// User Details (Username/Role/Display Name/Email) editor — HM/Admin/Mod
// (and their legacy aliases) only, never PM-tier/team-admin/individual
// roles, since it can change anyone's access level. It has no sidebar entry any
// more: admins open it from the Admin Portal item in the profile menu (TopBar).

// Report and Import Data (Excel upload of tasks): the admin tier only - Super Admin, HM and Mod (and their
// legacy aliases). The page and /api/import use the same isAdminTierRole check.
const WEB_ADMIN_FULL: NavLeaf[] = [...WEB_FULL, { id: '16', team: 'web', label: 'Report' }, { id: '19', team: 'web', label: 'Import Data' }];
const MARKETING_ADMIN_FULL: NavLeaf[] = [...MARKETING_FULL, { id: '16', team: 'marketing', label: 'Report' }, { id: '19', team: 'marketing', label: 'Import Data' }];

// HM / Admin / Mod — full access, both teams in full
const ADMIN_NAV: NavItem[] = [
  { label: 'Web', children: WEB_ADMIN_FULL },
  { label: 'Marketing', children: MARKETING_ADMIN_FULL },
  { label: 'PM Projects', children: PM_PROJECTS_ADMIN },
  LEAVE_STATUS,
  { label: 'Cybernext InHouse', children: INHOUSE_FULL_CHILDREN },
];
// Mod — everything HM / Admin have, except InHouse is just Brand Kit
const MOD_NAV: NavItem[] = ADMIN_NAV.map(item => (isNavParent(item) && item.label === 'Cybernext InHouse' ? INHOUSE_LIMITED : item));
// PMWebAdmin / PMMarketingAdmin — full access everywhere except Tasks
// Assigned, which stays pinned to their own team (see old
// TASKS_ASSIGNED_TEAM_LOCK behavior this replaces).
const PM_WEB_ADMIN_NAV: NavItem[] = [
  { label: 'Web', children: WEB_FULL },
  { label: 'Marketing', children: MARKETING_NO_TASKS_ASSIGNED },
  { label: 'PM Projects', children: PM_PROJECTS_FULL },
  LEAVE_STATUS,
  INHOUSE_LIMITED,
];
const PM_MARKETING_ADMIN_NAV: NavItem[] = [
  { label: 'Web', children: WEB_NO_TASKS_ASSIGNED },
  { label: 'Marketing', children: MARKETING_FULL },
  { label: 'PM Projects', children: PM_PROJECTS_FULL },
  LEAVE_STATUS,
  INHOUSE_LIMITED,
];
// legacy "pm" — like ADMIN_NAV but no Tasks Assigned at all, plus "My Projects"
const PM_LEGACY_NAV: NavItem[] = [
  { label: 'Web', children: WEB_NO_TASKS_ASSIGNED },
  { label: 'Marketing', children: MARKETING_NO_TASKS_ASSIGNED },
  { label: 'PM Projects', children: PM_PROJECTS_FULL },
  LEAVE_STATUS,
  INHOUSE_LIMITED,
];
// WebAdmin — no Leave Status, no PM Projects; otherwise Web-only, except
// Tasks Overview also carries a lone cross-team peek at Marketing's (a
// pre-existing exception — every other page stays strictly Web-only).
const WEB_ADMIN_NAV: NavItem[] = [
  { label: 'Web', children: WEB_FULL },
  { label: 'Marketing', children: MARKETING_TASKS_OVERVIEW_ONLY },
  INHOUSE_LIMITED,
];
// WebTeam / legacy "resource" — individual contributor, own team
const WEB_TEAM_NAV: NavItem[] = [
  { label: 'Web', children: WEB_INDIVIDUAL },
  INHOUSE_LIMITED,
];
// MarketingAdmin — no Leave Status, no PM Projects; otherwise
// Marketing-only, except Tasks Overview also peeks at Web's (mirrors the
// WebAdmin exception above).
const MARKETING_ADMIN_NAV: NavItem[] = [
  { label: 'Marketing', children: MARKETING_FULL },
  { label: 'Web', children: WEB_TASKS_OVERVIEW_ONLY },
  INHOUSE_LIMITED,
];
// MarketingTeam — individual contributor, own team
const MARKETING_TEAM_NAV: NavItem[] = [
  { label: 'Marketing', children: MARKETING_INDIVIDUAL },
  INHOUSE_LIMITED,
];

// Help is in everyone's menu, last: Apply (the form) and the table of queries —
// "My Queries" for most people, "All Queries" for the Super Admin.
const HELP_NAV: NavItem = {
  label: 'Help',
  children: [{ id: '18', subTab: 'apply', label: 'Apply' }, { id: '18', subTab: 'queries', label: 'My Queries' }],
};
const HELP_NAV_ADMIN: NavItem = {
  label: 'Help',
  children: [{ id: '18', subTab: 'apply', label: 'Apply' }, { id: '18', subTab: 'queries', label: 'All Queries' }],
};
const withHelp = (nav: Record<Role, NavItem[]>): Record<Role, NavItem[]> =>
  Object.fromEntries((Object.keys(nav) as Role[]).map(role => [role, [...nav[role], canManageHelp(role) ? HELP_NAV_ADMIN : HELP_NAV]])) as Record<Role, NavItem[]>;

export const ROLE_NAV: Record<Role, NavItem[]> = withHelp({
  HM:    ADMIN_NAV,
  Admin: ADMIN_NAV,
  Mod:   MOD_NAV,
  PMWebAdmin:       PM_WEB_ADMIN_NAV,
  PMMarketingAdmin: PM_MARKETING_ADMIN_NAV,
  WebAdmin:       WEB_ADMIN_NAV,
  MarketingAdmin: MARKETING_ADMIN_NAV,
  WebTeam:       WEB_TEAM_NAV,
  MarketingTeam: MARKETING_TEAM_NAV,
  // legacy — unmigrated accounts behave exactly like their new-taxonomy
  // equivalent (akash/admin/high/mod ≈ HM/Admin/Mod, resource ≈ WebTeam,
  // smm ≈ MarketingTeam)
  pm:       PM_LEGACY_NAV,
  resource: WEB_TEAM_NAV,
  smm:      MARKETING_TEAM_NAV,
  akash:    ADMIN_NAV,
  admin:    ADMIN_NAV,
  high:     ADMIN_NAV,
  mod:      MOD_NAV,
});

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
  '14': 'Cybernext InHouse',
  '15': 'Admin Portal',
  '16': 'Report',
  '17': 'Cybernext InHouse',
  '18': 'Help',
  '19': 'Import Data',
  '20': 'Dashboard',
};

export function getSheetLabel(id: SheetId, role: Role): string {
  return SHEET_LABELS[id];
}

// QA Testing ('8') lives as a nested tab inside Vinay's Tasks Overview instead
// of its own sidebar entry — admin still gets the standalone tab via ROLE_NAV.
// The sidebar's top-level order, the same for every role (a role simply lacks the
// items it can't open). The page a role lands on after login is the first page of
// this menu too (getFirstNavLeaf).
const MENU_ORDER = ['PM Projects', 'Marketing', 'Web', 'Leave Status', 'Cybernext InHouse', 'Help'];
const menuRank = (item: NavItem): number => {
  const label = isNavParent(item) ? item.label : SHEET_LABELS[item.id];
  const i = MENU_ORDER.indexOf(label);
  return i === -1 ? MENU_ORDER.length : i;
};
// Menus shown as dropdowns in the top bar instead of the sidebar. They stay part of ROLE_NAV (so
// access checks and the page a role may open are unchanged); the sidebar just leaves them out.
export const TOP_BAR_MENUS = ['Cybernext InHouse', 'Help'];
export function getNavItems(user: AuthUser): NavItem[] {
  return [...ROLE_NAV[user.role]].sort((a, b) => menuRank(a) - menuRank(b));
}

// The first actual page a role lands on — the first item of the sidebar menu,
// which may be a dropdown, so this drills into its first child rather than
// returning the dropdown itself.
// Exception: a Web / Marketing admin's menu starts with the other team's one-page
// peek (Tasks Overview), which isn't a place to land — they open on their own team.
export function getFirstNavLeaf(user: AuthUser): NavLeaf {
  const items = getNavItems(user);
  const ownTeam = user.role === 'WebAdmin' ? 'Web' : user.role === 'MarketingAdmin' ? 'Marketing' : null;
  const item = (ownTeam && items.find(i => isNavParent(i) && i.label === ownTeam)) || items[0];
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
