import type { Role } from '../auth';

// Who may do what in Projects (the shared Google Drive documents of each project).
// These are the built-in DEFAULTS. Admin Portal → Projects can change them per department and per
// person; lib/projects/policy.ts works out what applies to each account.
// Used by the API routes and the page alike, so the buttons always match what the server allows.
//
//   Full access   Super Admin (Admin) and HM, plus their legacy slugs. They see and manage every
//                 project, get Drive editing access to every restricted document, and can delete
//                 any document and manage templates. They are never listed as project members.
//   Create        the full-access roles, Mod, the PMs and the Web team.
//   Web team      added to every new project automatically (as Viewers; the Creator can change it).
//   Everyone else sees only the projects they are a member of.

const FULL_ACCESS_ROLES: Role[] = ['Admin', 'admin', 'HM', 'high', 'akash'];
const WEB_TEAM_ROLES: Role[] = ['WebAdmin', 'WebTeam', 'resource', 'PMWebAdmin'];
const CREATE_ROLES: Role[] = [...FULL_ACCESS_ROLES, 'Mod', 'mod', 'pm', 'PMWebAdmin', 'PMMarketingAdmin', ...WEB_TEAM_ROLES];

export type ProjectAccess = 'viewer' | 'editor' | 'manager';
export type ProjectStatus = 'planning' | 'in_progress' | 'on_hold' | 'completed';

// The access level a Web team member gets when a project is created
export const WEB_TEAM_DEFAULT_ACCESS: ProjectAccess = 'viewer';

export function hasFullProjectAccess(role: string): boolean {
  return (FULL_ACCESS_ROLES as string[]).includes(role);
}
export function canCreateProjects(role: string): boolean {
  return (CREATE_ROLES as string[]).includes(role);
}
export function isWebTeamRole(role: string): boolean {
  return (WEB_TEAM_ROLES as string[]).includes(role);
}
export const WEB_TEAM_ROLE_LIST: readonly string[] = WEB_TEAM_ROLES;
export const FULL_ACCESS_ROLE_LIST: readonly string[] = FULL_ACCESS_ROLES;

// Managing members, editing the project and archiving it: full access, or the project's Creator.
export function canManageProject(fullAccess: boolean, access: ProjectAccess | null): boolean {
  return access !== null && (fullAccess || access === 'manager');
}
// Adding documents: anyone in the project except Viewers.
export function canAddDocuments(access: ProjectAccess | null): boolean {
  return access === 'editor' || access === 'manager';
}

export const ACCESS_LABELS: Record<ProjectAccess, string> = { viewer: 'Viewer', editor: 'Editor', manager: 'Creator' };
export const STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planning', in_progress: 'In progress', on_hold: 'On hold', completed: 'Completed',
};
export const PROJECT_STATUSES = Object.keys(STATUS_LABELS) as ProjectStatus[];
