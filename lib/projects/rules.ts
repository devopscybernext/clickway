import type { Role } from '../auth';

// Who may do what in Projects (Cybernext InHouse → Documents). Used by the API routes and the page
// alike, so the buttons always match what the server allows.
//
//   Full access   Super Admin (Admin), HM and Mod, plus their legacy slugs. They see and manage every
//                 project, are Google editors on every restricted document, can delete any document
//                 and manage templates. They are never listed as project members.
//   Create        the full-access roles plus pm, PMWebAdmin, PMMarketingAdmin, WebAdmin and
//                 MarketingAdmin. The person who creates a project is its one Creator: nobody else
//                 can be given that level.
//   Everyone      sees All Projects and can request access to any project; inside a project they
//                 have the level their Creator gave them. Nobody is added to projects automatically.
//
// Project levels:  Member < Viewer < Editor < Creator
//   Member    opens only "Anyone with the link" documents
//   Viewer    also views "Project members only" documents
//   Editor    also edits them and adds documents (but doesn't manage members)
//   Creator   the person who created the project: also manages members and the project
// Document levels (for "Project members only" documents): No access, Viewer, Editor. Each person's level
// on a document starts from their project level (Member = No access) and can be changed for that one
// document; the document's level then wins over the project level.
// "Anyone with the link" documents give everyone with the link Viewer or Editor access (link role);
// the person who added one and the full-access roles can always edit it.

const FULL_ACCESS_ROLES: Role[] = ['Admin', 'admin', 'HM', 'high', 'akash', 'Mod', 'mod'];
const CREATE_ROLES: Role[] = [...FULL_ACCESS_ROLES, 'pm', 'PMWebAdmin', 'PMMarketingAdmin', 'WebAdmin', 'MarketingAdmin'];

export type ProjectAccess = 'member' | 'viewer' | 'editor' | 'manager';
export type DocLevel = 'none' | 'viewer' | 'editor';
export type ProjectStatus = 'planning' | 'in_progress' | 'on_hold' | 'completed';

export function hasFullProjectAccess(role: string): boolean {
  return (FULL_ACCESS_ROLES as string[]).includes(role);
}
export function canCreateProjects(role: string): boolean {
  return (CREATE_ROLES as string[]).includes(role);
}
export const FULL_ACCESS_ROLE_LIST: readonly string[] = FULL_ACCESS_ROLES;

// Managing members, editing the project and marking it completed: full access, or the project's Creator.
export function canManageProject(fullAccess: boolean, access: ProjectAccess | null): boolean {
  return access !== null && (fullAccess || access === 'manager');
}
// Adding documents: Editors and Creators.
export function canAddDocuments(access: ProjectAccess | null): boolean {
  return access === 'editor' || access === 'manager';
}
// A person's level on a "Project members only" document when nothing was set for that document
export function defaultDocLevel(access: ProjectAccess): DocLevel {
  return access === 'member' ? 'none' : access === 'viewer' ? 'viewer' : 'editor';
}

export const PROJECT_LEVELS: ProjectAccess[] = ['member', 'viewer', 'editor', 'manager'];
// The levels that can be given to someone (Creator is only ever the person who created the project)
export const ASSIGNABLE_LEVELS: ProjectAccess[] = ['member', 'viewer', 'editor'];
export const ACCESS_LABELS: Record<ProjectAccess, string> = { member: 'Member', viewer: 'Viewer', editor: 'Editor', manager: 'Creator' };
export const ACCESS_HINTS: Record<ProjectAccess, string> = {
  member: 'Opens only "Anyone with the link" documents',
  viewer: 'Also views "Project members only" documents',
  editor: 'Also edits them and adds documents; can\'t manage members',
  manager: 'Created the project: also manages members and the project',
};
export const DOC_LEVELS: DocLevel[] = ['none', 'viewer', 'editor'];
export type LinkRole = 'reader' | 'writer';
export const LINK_ROLES: LinkRole[] = ['reader', 'writer'];
export const LINK_ROLE_LABELS: Record<LinkRole, string> = { reader: 'Viewer', writer: 'Editor' };
export const DOC_LEVEL_LABELS: Record<DocLevel, string> = { none: 'No access', viewer: 'Viewer', editor: 'Editor' };
export const STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planning', in_progress: 'In progress', on_hold: 'On hold', completed: 'Completed',
};
export const PROJECT_STATUSES = Object.keys(STATUS_LABELS) as ProjectStatus[];
