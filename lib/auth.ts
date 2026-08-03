export type SheetId = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '14';
export type Role = 'pm' | 'resource' | 'akash' | 'admin' | 'high' | 'mod';

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

// Individual Analysis ('10') removed from every role's nav — component code
// is left in place (unreachable) rather than deleted, to keep this change low-risk.
export const ROLE_SHEETS: Record<Role, SheetId[]> = {
  pm:       ['3', '6', '9', '11', '12', '7', '14'],
  resource: ['3', '9', '7', '14'],
  akash:    ['3', '6', '1', '9', '11', '12', '7', '14'],
  admin:    ['3', '6', '1', '9', '11', '12', '7', '14'],
  high:     ['3', '6', '1', '9', '11', '12', '7', '14'],
  mod:      ['3', '6', '1', '9', '11', '12', '7', '14'],
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
