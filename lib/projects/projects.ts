import type mysql from 'mysql2/promise';
import { randomUUID } from 'crypto';
import {
  type Actor, type Conn, type Row, ProjectError, pool, withConnection, withLock, logChange, requireProject, projectScope, projectAccess,
  SHARING_LOCK, text, positiveId, webUrl, websiteUrl, creationKey,
} from './store';
import {
  canManageProject, canAddDocuments, defaultDocLevel, ACCESS_LABELS, DOC_LEVEL_LABELS, LINK_ROLE_LABELS,
  DOC_LEVELS, LINK_ROLES, PROJECT_STATUSES, type DocLevel, type LinkRole, type ProjectAccess, type ProjectStatus,
} from './rules';
import {
  ensureProjectFolder, ensurePrivateFolder, createNativeFile, readNativeFile, readUpload, fileUrl,
  protectPrivateFile, makePublic, removePublic, updateFile, trashDocumentFile, type SavedFile, type Upload,
} from './drive';
import { DriveError } from './google';
import { syncDocumentSharing, effectiveLevel, loadDocPermissions, type SharingResult } from './sharing';
import { loadPeople } from './policy';

// The Projects operations behind the API routes. Every one re-checks access with the database.

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);

function sharingNote(r: SharingResult): string | undefined {
  const parts: string[] = [];
  if (r.failed) parts.push('Some Google sharing is still pending. Use "Retry sharing" on the project to finish it.');
  if (r.noEmail.length) parts.push(`No email address on file for ${r.noEmail.join(', ')}, so they were not given Google access.`);
  return parts.join(' ') || undefined;
}

// ─── Projects ────────────────────────────────────────────────────────────────

export async function listProjects(actor: Actor) {
  const scope = projectScope(actor);
  const full = actor.policy.full;
  const [rows] = await pool().query<Row[]>(
    `SELECT p.id, p.name, p.client_name, p.platform, p.website_url, p.status, p.is_archived, p.drive_folder_url,
            p.created_by_name, p.created_at, p.updated_at,
            (SELECT COUNT(*) FROM doc_project_members x WHERE x.project_id = p.id) AS member_count,
            (SELECT COUNT(*) FROM doc_documents x WHERE x.project_id = p.id) AS document_count,
            (SELECT access_level FROM doc_project_members x WHERE x.project_id = p.id AND x.user_id = ?) AS my_access,
            EXISTS (SELECT 1 FROM doc_pins pin WHERE pin.user_id = ? AND pin.kind = 'project' AND pin.item_id = p.id) AS pinned
       FROM doc_projects p WHERE ${scope.sql} ORDER BY pinned DESC, p.updated_at DESC, p.id DESC`,
    [actor.id, actor.id, ...scope.values]
  );
  return {
    canCreate: actor.policy.create,
    fullAccess: full,
    projects: rows.map(r => ({
      id: Number(r.id), name: r.name, client: r.client_name ?? '', platform: r.platform ?? '', website: r.website_url ?? '',
      status: r.status as ProjectStatus, archived: !!r.is_archived,
      // The Drive folder link is for Super Admin and HM only
      driveFolderUrl: full ? (r.drive_folder_url ?? '') : '',
      createdBy: r.created_by_name ?? '', createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
      members: Number(r.member_count), documents: Number(r.document_count),
      access: (full ? 'manager' : r.my_access) as ProjectAccess,
      pinned: Number(r.pinned) === 1,
    })),
  };
}

// All Projects: every project, for everyone signed in, so people can see what already exists before
// creating something similar. Only the project's description fields: no documents and no Drive links.
// `access` says whether the person can open the project; if not, they can ask its Creator to add them
// (`requested` once they have).
export async function listAllProjects(actor: Actor) {
  const full = actor.policy.full;
  const [rows] = await pool().query<Row[]>(
    `SELECT p.id, p.name, p.client_name, p.platform, p.website_url, p.status, p.is_archived,
            p.created_by_name, p.created_at, p.updated_at,
            (SELECT COUNT(*) FROM doc_project_members x WHERE x.project_id = p.id) AS member_count,
            (SELECT COUNT(*) FROM doc_documents x WHERE x.project_id = p.id) AS document_count,
            (SELECT access_level FROM doc_project_members x WHERE x.project_id = p.id AND x.user_id = ?) AS my_access,
            EXISTS (SELECT 1 FROM doc_pins pin WHERE pin.user_id = ? AND pin.kind = 'project' AND pin.item_id = p.id) AS pinned,
            EXISTS (SELECT 1 FROM doc_access_requests q WHERE q.user_id = ? AND q.project_id = p.id) AS requested
       FROM doc_projects p ORDER BY p.updated_at DESC, p.id DESC`,
    [actor.id, actor.id, actor.id]
  );
  return {
    canCreate: actor.policy.create,
    projects: rows.map(r => {
      const access = full ? 'manager' : (r.my_access as ProjectAccess | null) ?? null;
      return {
        id: Number(r.id), name: r.name, client: r.client_name ?? '', platform: r.platform ?? '', website: r.website_url ?? '',
        status: r.status as ProjectStatus, archived: !!r.is_archived, driveFolderUrl: '',
        createdBy: r.created_by_name ?? '', createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
        members: Number(r.member_count), documents: Number(r.document_count),
        access, pinned: access !== null && Number(r.pinned) === 1,
        requested: access === null && Number(r.requested) === 1,
      };
    }),
  };
}

// A read-only overview of a project (no longer used by the screens: people outside a project now ask
// for access instead). Only for people in the project.
export async function getProjectOverview(actor: Actor, projectId: number) {
  const access = await requireProject(actor, projectId, 'view');
  const db = pool();
  const [rows] = await db.query<Row[]>('SELECT * FROM doc_projects WHERE id = ?', [projectId]);
  const p = rows[0];
  if (!p) throw new ProjectError('This project no longer exists.', 404);
  const [members] = await db.query<Row[]>(
    `SELECT m.user_id, m.access_level, u.username, u.display_name
       FROM doc_project_members m LEFT JOIN users u ON u.id = m.user_id
      WHERE m.project_id = ? ORDER BY FIELD(m.access_level, 'manager', 'editor', 'viewer', 'member'), u.display_name`,
    [projectId]
  );
  const [documents] = await db.query<Row[]>(
    `SELECT d.title, d.source_type, d.visibility, d.mime_type, d.created_by_name, d.created_at, t.name AS template_name
       FROM doc_documents d LEFT JOIN doc_templates t ON t.id = d.template_id
      WHERE d.project_id = ? ORDER BY d.created_at DESC, d.id DESC`,
    [projectId]
  );
  const policyOf = new Map((await loadPeople(db)).map(x => [x.id, x.policy]));
  return {
    project: {
      id: Number(p.id), name: p.name, client: p.client_name ?? '', platform: p.platform ?? '', website: p.website_url ?? '',
      description: p.description ?? '', status: p.status as ProjectStatus, archived: !!p.is_archived,
      createdBy: p.created_by_name ?? '', createdAt: iso(p.created_at), updatedAt: iso(p.updated_at),
    },
    documents: documents.map(d => ({
      title: String(d.title), source: String(d.source_type), visibility: String(d.visibility), mimeType: String(d.mime_type ?? ''),
      template: d.template_name ?? '', createdBy: d.created_by_name ?? '', createdAt: iso(d.created_at),
    })),
    members: members
      .filter(m => m.username !== null && m.username !== undefined && !policyOf.get(Number(m.user_id))?.full)
      .map(m => ({ name: String(m.display_name || m.username), access: m.access_level as ProjectAccess })),
    access,
  };
}

function projectInput(body: Record<string, unknown>) {
  const name = text(body.name, 'Project name', 200, true);
  const client = text(body.client, 'Client name', 200);
  const platform = text(body.platform, 'Platform', 100);
  const website = websiteUrl(text(body.website, 'Website', 2048));
  const description = text(body.description, 'Description', 5000);
  const status = text(body.status, 'Status', 30, true) as ProjectStatus;
  if (!PROJECT_STATUSES.includes(status)) throw new ProjectError('Choose a valid project status.');
  return { name, client, platform, website, description, status };
}

// New project: its Drive folder first (found again by the creation key on a retry), then the rows.
// The creator becomes its Creator (unless they have full access anyway). Nobody else is added
// automatically: people with full access see every project anyway, everyone else is added by hand.
export async function createProject(actor: Actor, body: Record<string, unknown>): Promise<number> {
  if (!actor.policy.create) throw new ProjectError('You cannot create projects.', 403);
  const key = creationKey(body.creationKey);
  const p = projectInput(body);
  return withConnection(c => withLock(c, `projects:create:${key}`, async () => {
    const [existing] = await c.query<Row[]>('SELECT id, created_by FROM doc_projects WHERE creation_key = ?', [key]);
    if (existing[0]) {
      if (Number(existing[0].created_by) !== actor.id) throw new ProjectError('This form was already used by someone else. Close it and open it again.');
      return Number(existing[0].id);
    }
    const folder = await ensureProjectFolder(p.name, key);
    await c.beginTransaction();
    try {
      const [res] = await c.query<mysql.ResultSetHeader>(
        `INSERT INTO doc_projects (name, client_name, platform, website_url, description, status, is_archived, drive_folder_id, drive_folder_url, creation_key, created_by, created_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.name, p.client || null, p.platform || null, p.website, p.description || null, p.status, p.status === 'completed' ? 1 : 0, folder.id, folder.url, key, actor.id, actor.name]
      );
      const id = res.insertId;
      if (!actor.policy.full) {
        await c.query("INSERT INTO doc_project_members (project_id, user_id, access_level) VALUES (?, ?, 'manager')", [id, actor.id]);
      }
      await logChange(c, actor, 'doc_projects', id, 'Project created', null, p.name);
      await c.commit();
      return id;
    } catch (error) {
      await c.rollback();
      console.error('[projects] create', error);
      // The tagged folder stays, so submitting the same form again finishes the save
      throw new ProjectError('The Drive folder is ready, but the project could not be saved. Submit again to finish.', 500);
    }
  }));
}

export async function getProject(actor: Actor, projectId: number) {
  const access = await requireProject(actor, projectId, 'view');
  const full = actor.policy.full;
  const manage = canManageProject(full, access);
  const db = pool();
  const [projectRows] = await db.query<Row[]>('SELECT * FROM doc_projects WHERE id = ?', [projectId]);
  const p = projectRows[0];
  if (!p) throw new ProjectError('This project no longer exists.', 404);
  const [members] = await db.query<Row[]>(
    `SELECT m.user_id, m.access_level, m.added_at, u.username, u.display_name, u.email, u.role
       FROM doc_project_members m LEFT JOIN users u ON u.id = m.user_id
      WHERE m.project_id = ? ORDER BY FIELD(m.access_level, 'manager', 'editor', 'viewer', 'member'), u.display_name`,
    [projectId]
  );
  const [documents] = await db.query<Row[]>(
    `SELECT d.id, d.title, d.source_type, d.visibility, d.link_role, d.drive_file_id, d.mime_type, d.created_by, d.created_by_name, d.created_at, t.name AS template_name,
            (SELECT level FROM doc_document_permissions dp WHERE dp.document_id = d.id AND dp.user_id = ?) AS my_level,
            (SELECT COUNT(*) FROM doc_document_access a WHERE a.document_id = d.id AND a.status = 'pending') AS pending,
            EXISTS (SELECT 1 FROM doc_pins pin WHERE pin.user_id = ? AND pin.kind = 'document' AND pin.item_id = d.id) AS pinned
       FROM doc_documents d LEFT JOIN doc_templates t ON t.id = d.template_id
      WHERE d.project_id = ? ORDER BY pinned DESC, d.created_at DESC, d.id DESC`,
    [actor.id, actor.id, projectId]
  );
  // People with full access aren't listed as members (they see every project); anyone else can be added.
  const everyone = await loadPeople(db);
  const policyOf = new Map(everyone.map(x => [x.id, x.policy]));
  const memberIds = new Set(members.map(m => Number(m.user_id)));
  const people = manage ? everyone.filter(x => !x.policy.full && !memberIds.has(x.id)) : [];
  const [requests] = manage ? await db.query<Row[]>(
    `SELECT q.user_id, q.requested_at, u.username, u.display_name, u.email, u.role
       FROM doc_access_requests q JOIN users u ON u.id = q.user_id
      WHERE q.project_id = ? ORDER BY q.requested_at`,
    [projectId]
  ) : [[] as Row[]];
  const me = { id: actor.id, full, access };
  const [templates] = canAddDocuments(access) ? await db.query<Row[]>(
    'SELECT id, name, category, platform, mime_type FROM doc_templates WHERE is_active = 1 ORDER BY category, name'
  ) : [[] as Row[]];

  return {
    project: {
      id: Number(p.id), name: p.name, client: p.client_name ?? '', platform: p.platform ?? '', website: p.website_url ?? '',
      description: p.description ?? '', status: p.status as ProjectStatus, archived: !!p.is_archived,
      driveFolderUrl: full ? (p.drive_folder_url ?? '') : '',
      createdBy: p.created_by_name ?? '', createdAt: iso(p.created_at), updatedAt: iso(p.updated_at),
    },
    access, canManage: manage, canAdd: canAddDocuments(access), fullAccess: full,
    members: members.filter(m => !policyOf.get(Number(m.user_id))?.full).map(m => ({
      userId: Number(m.user_id), access: m.access_level as ProjectAccess,
      name: String(m.display_name || m.username || '(removed account)'), email: m.email ?? '', role: m.role ?? '',
      removedAccount: m.username === null || m.username === undefined, isMe: Number(m.user_id) === actor.id,
    })),
    documents: documents.map(d => {
      const level = effectiveLevel(d, me, (d.my_level as DocLevel | null) ?? undefined);
      return {
        id: Number(d.id), title: d.title, source: d.source_type, visibility: d.visibility, mimeType: d.mime_type ?? '',
        template: d.template_name ?? '', createdBy: d.created_by_name ?? '', createdAt: iso(d.created_at),
        pendingSharing: Number(d.pending) > 0,
        pinned: Number(d.pinned) === 1,
        myLevel: level ?? 'none', canOpen: !!level && level !== 'none',
        canDelete: full || Number(d.created_by) === actor.id,
        ...documentExtras(d, full, actor.id),
        // A Creator whose own access to this document is No access can't change who opens it
        canSetAccess: d.visibility === 'invite' && level === 'editor' && (manage || Number(d.created_by) === actor.id),
      };
    }),
    people: people.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role })),
    requests: requests.map(q => ({
      userId: Number(q.user_id), name: String(q.display_name || q.username), email: q.email ?? '', role: q.role ?? '',
      requestedAt: iso(q.requested_at),
    })),
    templates: templates.map(t => ({ id: Number(t.id), name: t.name, category: t.category, platform: t.platform ?? '', mimeType: t.mime_type })),
  };
}

export async function updateProject(actor: Actor, projectId: number, body: Record<string, unknown>) {
  await withConnection(async c => {
    await requireProject(actor, projectId, 'manage', c);
    // Mark completed / reopen (the Completed list). Completed is also the project's status, so the two
    // always agree; reopening puts the project back In progress.
    if (body.archived !== undefined && Object.keys(body).length === 1) {
      const completed = body.archived === true;
      await c.query(
        completed
          ? "UPDATE doc_projects SET is_archived = 1, status = 'completed' WHERE id = ?"
          : "UPDATE doc_projects SET is_archived = 0, status = IF(status = 'completed', 'in_progress', status) WHERE id = ?",
        [projectId]
      );
      await logChange(c, actor, 'doc_projects', projectId, completed ? 'Project completed' : 'Project reopened', null, null);
      return;
    }
    const p = projectInput(body);
    await c.query(
      'UPDATE doc_projects SET name = ?, client_name = ?, platform = ?, website_url = ?, description = ?, status = ?, is_archived = ? WHERE id = ?',
      [p.name, p.client || null, p.platform || null, p.website, p.description || null, p.status, p.status === 'completed' ? 1 : 0, projectId]
    );
    await logChange(c, actor, 'doc_projects', projectId, 'Project updated', null, JSON.stringify(p));
  });
}

// ─── Members ─────────────────────────────────────────────────────────────────

// Adds a person, changes their access, or removes them ('remove'). Their Google access to the
// project's restricted documents follows straight away.
export async function saveMember(actor: Actor, projectId: number, body: Record<string, unknown>) {
  const userId = positiveId(body.userId, 'person');
  const access = text(body.access, 'Access', 10, true);
  if (access === 'manager') throw new ProjectError("Only the person who created the project is its Creator. Choose Member, Viewer or Editor.");
  if (!['member', 'viewer', 'editor', 'remove', 'decline'].includes(access)) throw new ProjectError('Choose Member, Viewer or Editor.');
  return withConnection(c => withLock(c, SHARING_LOCK, async () => {
    await requireProject(actor, projectId, 'manage', c);
    const target = (await loadPeople(c)).find(x => x.id === userId);
    if (!target && access !== 'remove' && access !== 'decline') throw new ProjectError('That account no longer exists.');
    if (target?.policy.full) throw new ProjectError('This person has full Projects access and already sees every project.');
    // The project's Creator (the person who created it) keeps that role: nobody changes or removes it
    const [owner] = await c.query<Row[]>('SELECT created_by FROM doc_projects WHERE id = ?', [projectId]);
    if (Number(owner[0]?.created_by) === userId && access !== 'decline') {
      throw new ProjectError('This is the person who created the project. They stay its Creator.', 403);
    }
    if (access === 'decline') {
      // An access request turned down: it goes away, and the person can ask again
      await c.query('DELETE FROM doc_access_requests WHERE project_id = ? AND user_id = ?', [projectId, userId]);
      await logChange(c, actor, 'doc_project_members', projectId, 'Access request declined', String(userId), null);
      return { message: 'Request declined.' };
    }
    const [before] = await c.query<Row[]>('SELECT access_level FROM doc_project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);
    const [cleared] = await c.query<mysql.ResultSetHeader>('DELETE FROM doc_access_requests WHERE project_id = ? AND user_id = ?', [projectId, userId]);
    const requested = access !== 'remove' && cleared.affectedRows > 0;
    if (access === 'remove') {
      await c.query('DELETE FROM doc_project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);
      await c.query('DELETE dp FROM doc_document_permissions dp JOIN doc_documents d ON d.id = dp.document_id WHERE d.project_id = ? AND dp.user_id = ?', [projectId, userId]);
    } else {
      await c.query(
        'INSERT INTO doc_project_members (project_id, user_id, access_level) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE access_level = VALUES(access_level)',
        [projectId, userId, access]
      );
    }
    await logChange(c, actor, 'doc_project_members', projectId, 'Member access', String(userId), access);
    if (target) {
      await notifyMemberChange(c, actor, projectId, target, (before[0]?.access_level as ProjectAccess | undefined) ?? null, access as ProjectAccess | 'remove', requested);
    }
    const sharing = await syncDocumentSharing(c, { projectId, userId });
    return { message: access === 'remove' ? 'Member removed.' : 'Project access updated.', note: sharingNote(sharing) };
  }));
}

export async function retrySharing(actor: Actor, projectId: number) {
  return withConnection(c => withLock(c, SHARING_LOCK, async () => {
    await requireProject(actor, projectId, 'manage', c);
    const r = await syncDocumentSharing(c, { projectId }, { recheck: true });
    if (r.failed) throw new ProjectError('Some files could not be shared or unshared. Check the Google account connection and try again.', 502);
    return { message: 'Every restricted document is shared with the right people.', note: sharingNote({ ...r, failed: 0 }) };
  }));
}

// ─── Documents ───────────────────────────────────────────────────────────────

export interface NewDocument {
  creationKey: string; title: string; visibility: string; source: string;
  templateId?: string; url?: string; upload?: File | null;
  permissions?: string;   // "Project members only": JSON [{ userId, level }] for this document
  linkRole?: string;      // "Anyone with the link": 'reader' (view) or 'writer' (edit)
}

function linkRoleInput(value: unknown): LinkRole {
  const role = value === undefined || value === null || value === '' ? 'reader' : String(value);
  if (!LINK_ROLES.includes(role as LinkRole)) throw new ProjectError('Choose Viewer or Editor for link access.');
  return role as LinkRole;
}

// Levels set for a "Project members only" document (from the new-document popup or Access). Only
// project members without full access can have one; the document's creator always edits. A level that
// matches what the person's project level gives anyway isn't stored, so later project changes apply.
function parsePermissions(raw: unknown): Map<number, DocLevel> {
  const out = new Map<number, DocLevel>();
  if (raw === undefined || raw === null || raw === '') return out;
  let list: unknown;
  try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { throw new ProjectError('Invalid document access.'); }
  if (!Array.isArray(list) || list.length > 1000) throw new ProjectError('Invalid document access.');
  for (const item of list) {
    const { userId, level } = (item ?? {}) as { userId?: unknown; level?: unknown };
    if (!DOC_LEVELS.includes(level as DocLevel)) throw new ProjectError('Choose No access, Viewer or Editor.');
    out.set(positiveId(userId, 'person'), level as DocLevel);
  }
  return out;
}

async function storePermissions(c: Conn, actor: Actor, projectId: number, documentId: number, createdBy: number, wanted: Map<number, DocLevel>) {
  if (!wanted.size) return;
  const [members] = await c.query<Row[]>('SELECT user_id, access_level FROM doc_project_members WHERE project_id = ?', [projectId]);
  const levelOf = new Map(members.map(m => [Number(m.user_id), m.access_level as ProjectAccess]));
  const people = await loadPeople(c);
  const fullIds = new Set(people.filter(x => x.policy.full).map(x => x.id));
  const accounts = new Set(people.map(x => x.id));
  for (const [userId, level] of wanted) {
    const projectLevel = levelOf.get(userId);
    if (fullIds.has(userId) || userId === createdBy) continue;
    // Someone outside the project: a guest on this document (No access removes them)
    const isDefault = projectLevel ? level === defaultDocLevel(projectLevel) : level === 'none';
    if (!projectLevel && !accounts.has(userId) && !isDefault) continue;
    if (isDefault) {
      await c.query('DELETE FROM doc_document_permissions WHERE document_id = ? AND user_id = ?', [documentId, userId]);
    } else {
      await c.query(
        'INSERT INTO doc_document_permissions (document_id, user_id, level, set_by) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE level = VALUES(level), set_by = VALUES(set_by)',
        [documentId, userId, level, actor.id]
      );
    }
  }
}

// A new document: a copy of a template, an uploaded file converted to a Google Doc/Sheet, or a link.
// "Project members only" documents are copied into the project's owner-only folder and shared with
// each member; "Anyone with the link" documents go in the project folder (a pasted link is then kept as is).
export async function addDocument(actor: Actor, projectId: number, input: NewDocument) {
  const key = creationKey(input.creationKey);
  const title = text(input.title, 'Document title', 255, true);
  const visibility = input.visibility;
  if (!['public', 'invite'].includes(visibility)) throw new ProjectError('Choose who can open the document.');
  const mode = input.source;
  if (!['template', 'upload', 'url'].includes(mode)) throw new ProjectError('Choose a template, an upload or a link.');
  const permissions = visibility === 'invite' ? parsePermissions(input.permissions) : new Map<number, DocLevel>();
  const linkRole = linkRoleInput(input.linkRole);
  await requireProject(actor, projectId, 'add');

  const url = mode === 'url' ? webUrl(text(input.url, 'Document link', 2048, true), 'Document link') : null;
  let template: Row | undefined;
  if (mode === 'template') {
    const [rows] = await pool().query<Row[]>('SELECT id, source_url FROM doc_templates WHERE id = ? AND is_active = 1', [positiveId(input.templateId, 'template')]);
    template = rows[0];
    if (!template) throw new ProjectError('This template is no longer available. Choose another one.');
  }
  let upload: Upload | null = null;
  if (mode === 'upload') {
    if (!input.upload || !input.upload.name) throw new ProjectError('Choose a file to upload.');
    upload = await readUpload(input.upload);
  }

  return withConnection(c => withLock(c, SHARING_LOCK, async () => {
    await requireProject(actor, projectId, 'add', c);
    const [existing] = await c.query<Row[]>('SELECT id, project_id, created_by FROM doc_documents WHERE creation_key = ?', [key]);
    if (existing[0]) {
      if (Number(existing[0].project_id) !== projectId || Number(existing[0].created_by) !== actor.id) {
        throw new ProjectError('This form was already used. Close it and open it again.');
      }
      const sharing = await syncDocumentSharing(c, { documentId: Number(existing[0].id) });
      return { id: Number(existing[0].id), note: sharingNote(sharing) };
    }
    const [projectRows] = await c.query<Row[]>('SELECT id, name, drive_folder_id, private_drive_folder_id, creation_key FROM doc_projects WHERE id = ?', [projectId]);
    const project = projectRows[0];
    if (!project) throw new ProjectError('This project no longer exists.', 404);

    let saved: SavedFile | null = null;
    if (mode !== 'url' || visibility === 'invite') {
      let parent: string;
      if (visibility === 'invite') {
        parent = await ensurePrivateFolder(projectId, String(project.name), project.private_drive_folder_id ?? null);
        if (parent !== project.private_drive_folder_id) await c.query('UPDATE doc_projects SET private_drive_folder_id = ? WHERE id = ?', [parent, projectId]);
      } else if (project.drive_folder_id) {
        parent = String(project.drive_folder_id);
      } else {
        const folder = await ensureProjectFolder(String(project.name), String(project.creation_key || randomUUID()));
        await c.query('UPDATE doc_projects SET drive_folder_id = ?, drive_folder_url = ? WHERE id = ?', [folder.id, folder.url, projectId]);
        parent = folder.id;
      }
      saved = await createNativeFile({
        parent, name: title, key: `document:${key}`,
        ...(template ? { sourceUrl: String(template.source_url) } : mode === 'url' ? { sourceUrl: url! } : { upload: upload! }),
      });
      if (visibility === 'invite') await protectPrivateFile(saved.id);
      else await makePublic(saved.id, linkRole);
    }

    await c.beginTransaction();
    let documentId: number;
    try {
      const [res] = await c.query<mysql.ResultSetHeader>(
        `INSERT INTO doc_documents (project_id, template_id, title, drive_file_id, document_url, mime_type, source_type, visibility, link_role, creation_key, created_by, created_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [projectId, template ? Number(template.id) : null, title, saved?.id ?? null, saved?.url ?? url, saved?.mimeType ?? null, mode, visibility, linkRole, key, actor.id, actor.name]
      );
      documentId = res.insertId;
      await storePermissions(c, actor, projectId, documentId, actor.id, permissions);
      await c.query('UPDATE doc_projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [projectId]);
      await logChange(c, actor, 'doc_documents', documentId, 'Document added', null, title);
      await c.commit();
    } catch (error) {
      await c.rollback();
      throw error;
    }
    const sharing = await syncDocumentSharing(c, { documentId });
    return { id: documentId, note: sharingNote(sharing) };
  }));
}

// ─── Document access ─────────────────────────────────────────────────────────

// Who may set people's levels on a "Project members only" document: full access, the person who added
// the document, and the project's Creators who can edit it themselves (a Creator set to No access or
// Viewer on this document can't change it).
async function requireDocumentAccessManager(actor: Actor, documentId: number, c: Conn) {
  const [rows] = await c.query<Row[]>('SELECT id, project_id, title, visibility, created_by FROM doc_documents WHERE id = ?', [documentId]);
  const doc = rows[0];
  if (!doc) throw new ProjectError('This document no longer exists.', 404);
  const access = await requireProject(actor, Number(doc.project_id), 'view', c);
  if (!canManageProject(actor.policy.full, access) && Number(doc.created_by) !== actor.id) {
    throw new ProjectError("Only administrators, the project's Creators and the person who added this document can change who can open it.", 403);
  }
  if (doc.visibility !== 'invite') throw new ProjectError('Anyone in the project can open this document (Anyone with the link).');
  const own = effectiveLevel(doc, { id: actor.id, full: actor.policy.full, access }, (await loadDocPermissions(c, [documentId])).get(`${documentId}:${actor.id}`));
  if (own !== 'editor') throw new ProjectError("You don't have edit access to this document, so you can't change who can open it.", 403);
  return doc;
}

// Each project member's level on one document (people with full access and the document's creator
// always edit, so they aren't listed).
export async function getDocumentAccess(actor: Actor, documentId: number) {
  return withConnection(async c => {
    const doc = await requireDocumentAccessManager(actor, documentId, c);
    const [members] = await c.query<Row[]>(
      `SELECT m.user_id, m.access_level, u.username, u.display_name, u.email
         FROM doc_project_members m JOIN users u ON u.id = m.user_id
        WHERE m.project_id = ? ORDER BY FIELD(m.access_level, 'manager', 'editor', 'viewer', 'member'), u.display_name`,
      [doc.project_id]
    );
    const everyone = await loadPeople(c);
    const fullIds = new Set(everyone.filter(x => x.policy.full).map(x => x.id));
    const overrides = await loadDocPermissions(c, [documentId]);
    const memberIds = new Set(members.map(m => Number(m.user_id)));
    const guestLevel = (id: number) => overrides.get(`${documentId}:${id}`);
    const outside = everyone.filter(x => !fullIds.has(x.id) && !memberIds.has(x.id) && x.id !== Number(doc.created_by));
    return {
      document: { id: documentId, title: String(doc.title) },
      // People outside the project who can open this one document
      guests: outside
        .filter(x => { const l = guestLevel(x.id); return l && l !== 'none'; })
        .map(x => ({ userId: x.id, name: x.name, email: x.email, level: guestLevel(x.id) as DocLevel })),
      // Everyone else who could be given access to it
      candidates: outside
        .filter(x => { const l = guestLevel(x.id); return !l || l === 'none'; })
        .map(x => ({ id: x.id, name: x.name, email: x.email, role: x.role })),
      people: members
        .filter(m => !fullIds.has(Number(m.user_id)) && Number(m.user_id) !== Number(doc.created_by))
        .map(m => {
          const projectLevel = m.access_level as ProjectAccess;
          const set = overrides.get(`${documentId}:${m.user_id}`);
          return {
            userId: Number(m.user_id), name: String(m.display_name || m.username), email: m.email ?? '',
            projectLevel, level: set ?? defaultDocLevel(projectLevel), custom: set !== undefined,
          };
        }),
    };
  });
}

export async function saveDocumentAccess(actor: Actor, documentId: number, body: Record<string, unknown>) {
  const wanted = parsePermissions(body.permissions);
  return withConnection(c => withLock(c, SHARING_LOCK, async () => {
    const doc = await requireDocumentAccessManager(actor, documentId, c);
    const before = await documentLevels(c, doc);
    await storePermissions(c, actor, Number(doc.project_id), documentId, Number(doc.created_by), wanted);
    await logChange(c, actor, 'doc_documents', documentId, 'Document access', null, JSON.stringify([...wanted]));
    // Each person whose level on this document changed is told
    const after = await documentLevels(c, doc);
    const changedFor: Notified[] = [];
    const guestsTold: Notified[] = [];
    const [memberRows] = await c.query<Row[]>('SELECT user_id FROM doc_project_members WHERE project_id = ?', [doc.project_id]);
    const memberIds = new Set(memberRows.map(m => Number(m.user_id)));
    for (const [id, now] of after) {
      const was = before.get(id)?.level;
      if (was === now.level) continue;
      const list = memberIds.has(id) ? changedFor : guestsTold;
      list.push({ id, name: now.name, username: now.username,
        text: was
          ? `${actor.name} changed your access to "${doc.title}" from ${DOC_LEVEL_LABELS[was]} to ${DOC_LEVEL_LABELS[now.level]}`
          : `${actor.name} gave you ${DOC_LEVEL_LABELS[now.level]} access to "${doc.title}"` });
    }
    for (const [id, was] of before) {
      if (after.has(id) || memberIds.has(id)) continue;   // a guest whose access was removed
      guestsTold.push({ id, name: was.name, username: was.username, text: `${actor.name} removed your access to "${doc.title}"` });
    }
    const name = await projectName(c, Number(doc.project_id));
    await notifyPeople(c, actor, 'document-access', 'Document access changed', Number(doc.project_id), name, changedFor, String(doc.title));
    // Guests can't open the project, so their notification opens My Documents
    await notifyPeople(c, actor, 'document-access', 'Document access changed', Number(doc.project_id), name, guestsTold, String(doc.title), false, 'documents::0');
    const sharing = await syncDocumentSharing(c, { documentId }, { recheck: true });
    return { message: 'Document access updated.', note: sharingNote(sharing) };
  }));
}

// ─── Access requests ─────────────────────────────────────────────────────────

// Projects notifications in the bell (and the Admin Portal log): told to the people they are about,
// never to the person who made the change. A failed notification never undoes the change.
type Notified = { id: number; name: string; username: string; text: string };
async function notifyPeople(c: Conn, actor: Actor, type: string, title: string, projectId: number, projectName: string, people: Notified[], detail: string, link = true, ref?: string) {
  const who = people.filter(p => p.username && p.id !== actor.id);
  if (!who.length) return;
  try {
    await c.query(
      'INSERT INTO notification_log (type, team, project, task, assignee, detail, actor, recipients) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [type, 'projects', projectName.slice(0, 255), '', who.map(p => p.name || p.username).join(', ').slice(0, 191), detail.slice(0, 100), actor.name.slice(0, 191),
        who.map(p => p.name || p.username).join(', ')]
    );
    await c.query(
      'INSERT INTO notifications (recipient, type, team, title, body, task_ref, actor) VALUES ?',
      [who.map(p => [p.username, type, 'projects', title, p.text.slice(0, 500), ref ?? (link ? `project::${projectId}` : 'project::0'), actor.name.slice(0, 191)])]
    );
  } catch (error) {
    console.error(`[projects] ${type} notification`, error);
  }
}

async function projectName(c: Conn, projectId: number): Promise<string> {
  const [rows] = await c.query<Row[]>('SELECT name FROM doc_projects WHERE id = ?', [projectId]);
  return String(rows[0]?.name ?? 'a project');
}

// A person's project level changed: added (after asking for access, or directly), changed, or removed
async function notifyMemberChange(c: Conn, actor: Actor, projectId: number, person: { id: number; name: string; username: string },
  before: ProjectAccess | null, after: ProjectAccess | 'remove', requested: boolean) {
  if (after !== 'remove' && before === after) return;
  if (after === 'remove' && !before) return;
  const name = await projectName(c, projectId);
  if (after === 'remove') {
    await notifyPeople(c, actor, 'project-access', 'Removed from project', projectId, name,
      [{ ...person, text: `${actor.name} removed you from ${name}` }], 'Removed', false);
  } else if (!before) {
    await notifyPeople(c, actor, requested ? 'access-granted' : 'project-access', requested ? 'Access granted' : 'Added to project', projectId, name,
      [{ ...person, text: `${actor.name} added you to ${name} as ${ACCESS_LABELS[after]}` }], ACCESS_LABELS[after]);
  } else {
    await notifyPeople(c, actor, 'project-access', 'Project access changed', projectId, name,
      [{ ...person, text: `${actor.name} changed your access to ${name} from ${ACCESS_LABELS[before]} to ${ACCESS_LABELS[after]}` }],
      `${ACCESS_LABELS[before]} → ${ACCESS_LABELS[after]}`);
  }
}

// Everyone's level on one "Project members only" document (full-access people and its creator left out)
async function documentLevels(c: Conn, doc: Row): Promise<Map<number, { level: DocLevel; name: string; username: string }>> {
  const [members] = await c.query<Row[]>(
    'SELECT m.user_id, m.access_level, u.username, u.display_name FROM doc_project_members m JOIN users u ON u.id = m.user_id WHERE m.project_id = ?',
    [doc.project_id]
  );
  const fullIds = new Set((await loadPeople(c)).filter(x => x.policy.full).map(x => x.id));
  const overrides = await loadDocPermissions(c, [Number(doc.id)]);
  const out = new Map<number, { level: DocLevel; name: string; username: string }>();
  for (const m of members) {
    const id = Number(m.user_id);
    if (fullIds.has(id) || id === Number(doc.created_by)) continue;
    const level = overrides.get(`${doc.id}:${id}`) ?? defaultDocLevel(m.access_level as ProjectAccess);
    out.set(id, { level, name: String(m.display_name || m.username), username: String(m.username ?? '') });
  }
  // Guests: people outside the project with a level on this document
  const people = new Map((await loadPeople(c)).map(x => [x.id, x]));
  for (const [key, level] of overrides) {
    const id = Number(key.split(':')[1]);
    const person = people.get(id);
    if (out.has(id) || !person || fullIds.has(id) || id === Number(doc.created_by) || level === 'none') continue;
    out.set(id, { level, name: person.name, username: person.username });
  }
  return out;
}

// Someone outside a project asks to join it (All Projects → Request Access). The project's creator is
// told in the notification bell; if their account is gone, the project's Creators, else Super Admin.
export async function requestAccess(actor: Actor, projectId: number) {
  return withConnection(async c => {
    const [rows] = await c.query<Row[]>('SELECT id, name, created_by FROM doc_projects WHERE id = ?', [projectId]);
    const project = rows[0];
    if (!project) throw new ProjectError('This project no longer exists.', 404);
    if (await projectAccess(actor, projectId, c)) throw new ProjectError('You already have access to this project.');
    const [res] = await c.query<mysql.ResultSetHeader>(
      'INSERT IGNORE INTO doc_access_requests (project_id, user_id) VALUES (?, ?)', [projectId, actor.id]
    );
    if (res.affectedRows === 0) return { message: 'You have already asked for access to this project.' };

    const people = await loadPeople(c);
    let recipients = people.filter(x => x.id === Number(project.created_by));
    if (!recipients.length) {
      const [managers] = await c.query<Row[]>("SELECT user_id FROM doc_project_members WHERE project_id = ? AND access_level = 'manager'", [projectId]);
      const ids = new Set(managers.map(m => Number(m.user_id)));
      recipients = people.filter(x => ids.has(x.id));
    }
    if (!recipients.length) recipients = people.filter(x => x.role.toLowerCase() === 'admin');
    recipients = recipients.filter(x => x.id !== actor.id && x.username);
    const projectName = String(project.name);
    const body = `${actor.name} asked for access to ${projectName}`;
    try {
      await c.query(
        'INSERT INTO notification_log (type, team, project, task, assignee, detail, actor, recipients) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['access-request', 'projects', projectName.slice(0, 255), '', '', 'Request Access', actor.name.slice(0, 191),
          recipients.map(r => r.name || r.username).join(', ') || '—']
      );
      if (recipients.length) {
        await c.query(
          'INSERT INTO notifications (recipient, type, team, title, body, task_ref, actor) VALUES ?',
          [recipients.map(r => [r.username, 'access-request', 'projects', 'Access request', body.slice(0, 500), `project::${projectId}`, actor.name.slice(0, 191)])]
        );
      }
    } catch (error) {
      // The request is saved either way: the Creator also sees it on the project's Members panel
      console.error('[projects] access request notification', error);
    }
    await logChange(c, actor, 'doc_projects', projectId, 'Access requested', null, String(actor.id));
    return { message: 'Request sent. The project creator has been notified.' };
  });
}

// ─── Editing a document ──────────────────────────────────────────────────────

// The Edit popup: title, who can open it, and (Anyone with the link) whether the link views or edits.
// Only the person who added the document and Super Admin / HM / Mod. The Drive file follows: renamed,
// moved between the project's folders, and its link access changed; then people's grants are updated.
export async function updateDocument(actor: Actor, documentId: number, body: Record<string, unknown>) {
  const title = text(body.title, 'Document title', 255, true);
  const visibility = String(body.visibility ?? '');
  if (!['public', 'invite'].includes(visibility)) throw new ProjectError('Choose who can open the document.');
  const linkRole = linkRoleInput(body.linkRole);
  return withConnection(c => withLock(c, SHARING_LOCK, async () => {
    const [rows] = await c.query<Row[]>(
      `SELECT d.id, d.project_id, d.title, d.visibility, d.link_role, d.drive_file_id, d.created_by,
              p.name AS project_name, p.drive_folder_id, p.private_drive_folder_id, p.creation_key
         FROM doc_documents d JOIN doc_projects p ON p.id = d.project_id WHERE d.id = ?`,
      [documentId]
    );
    const doc = rows[0];
    if (!doc) throw new ProjectError('This document no longer exists.', 404);
    await requireProject(actor, Number(doc.project_id), 'view', c);
    if (!actor.policy.full && Number(doc.created_by) !== actor.id) {
      throw new ProjectError('Only the person who added this document, Super Admin, HM and Mod can edit it.', 403);
    }
    const fileId = doc.drive_file_id ? String(doc.drive_file_id) : null;
    const projectId = Number(doc.project_id);
    const visibilityChanged = visibility !== doc.visibility;
    if (!fileId && (visibilityChanged || (visibility === 'public' && linkRole !== doc.link_role))) {
      throw new ProjectError("This document is a link to a file outside the project's Drive, so its sharing can't be changed here. Only its title can.");
    }

    if (fileId) {
      let folder: string | undefined;
      if (visibilityChanged && visibility === 'invite') {
        // To Project members only: link access off first, then into the owner-only folder
        await removePublic(fileId);
        folder = await ensurePrivateFolder(projectId, String(doc.project_name), doc.private_drive_folder_id ?? null);
        if (folder !== doc.private_drive_folder_id) await c.query('UPDATE doc_projects SET private_drive_folder_id = ? WHERE id = ?', [folder, projectId]);
      } else if (visibilityChanged) {
        if (doc.drive_folder_id) folder = String(doc.drive_folder_id);
        else {
          const created = await ensureProjectFolder(String(doc.project_name), String(doc.creation_key || randomUUID()));
          await c.query('UPDATE doc_projects SET drive_folder_id = ?, drive_folder_url = ? WHERE id = ?', [created.id, created.url, projectId]);
          folder = created.id;
        }
      }
      if (folder || title !== doc.title) await updateFile(fileId, { name: title !== doc.title ? title : undefined, folder });
      if (visibility === 'public') await makePublic(fileId, linkRole);
    }

    await c.query('UPDATE doc_documents SET title = ?, visibility = ?, link_role = ? WHERE id = ?', [title, visibility, linkRole, documentId]);
    await c.query('UPDATE doc_projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [projectId]);
    await logChange(c, actor, 'doc_documents', documentId, 'Document edited',
      JSON.stringify({ title: doc.title, visibility: doc.visibility, linkRole: doc.link_role }), JSON.stringify({ title, visibility, linkRole }));
    const sharing = await syncDocumentSharing(c, { documentId }, { recheck: visibilityChanged });
    const what = visibility === 'public' ? `Anyone with the link can ${linkRole === 'writer' ? 'edit' : 'view'} it.` : 'Only project members can open it.';
    return { message: `Document saved. ${what}`, note: sharingNote(sharing), linkLabel: LINK_ROLE_LABELS[linkRole] };
  }));
}

// Only the person who added a document, Super Admin or HM may delete it. Drive first (everyone's
// access removed, file moved to Drive Trash), then the record, so a failure never leaves a deleted
// record pointing at a file that is still shared.
export async function deleteDocument(actor: Actor, documentId: number) {
  await withConnection(c => withLock(c, SHARING_LOCK, async () => {
    const [rows] = await c.query<Row[]>('SELECT id, project_id, title, drive_file_id, created_by FROM doc_documents WHERE id = ?', [documentId]);
    const doc = rows[0];
    if (!doc) throw new ProjectError('This document no longer exists.', 404);
    await requireProject(actor, Number(doc.project_id), 'view', c);
    if (!actor.policy.full && Number(doc.created_by) !== actor.id) {
      throw new ProjectError('Only the person who added this document, Super Admin or HM can delete it.', 403);
    }
    let drive = 'none';
    if (doc.drive_file_id) {
      try { drive = await trashDocumentFile(String(doc.drive_file_id)); }
      catch { throw new DriveError('Google Drive could not remove this file. Nothing was deleted; please try again.'); }
    }
    await c.beginTransaction();
    try {
      await c.query('DELETE FROM doc_documents WHERE id = ?', [documentId]);
      await c.query("DELETE FROM doc_pins WHERE kind = 'document' AND item_id = ?", [documentId]);
      await c.query('UPDATE doc_projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [doc.project_id]);
      await logChange(c, actor, 'doc_documents', documentId, 'Document deleted', JSON.stringify({ title: doc.title, projectId: doc.project_id, driveFileId: doc.drive_file_id, drive }), null);
      await c.commit();
    } catch (error) {
      await c.rollback();
      throw error;
    }
  }));
}

// What the document lists show about link access and editing a document
function documentExtras(d: Row, full: boolean, actorId: number) {
  return {
    linkRole: (d.link_role === 'writer' ? 'writer' : 'reader') as LinkRole,
    inDrive: !!d.drive_file_id,                                   // false: a pasted link kept as it is
    canEdit: full || Number(d.created_by) === actorId,            // the Edit popup
  };
}

// Every document the person can see, across their projects (the Documents page).
export async function listDocuments(actor: Actor) {
  const scope = projectScope(actor);
  const full = actor.policy.full;
  const [rows] = await pool().query<Row[]>(
    `SELECT d.id, d.title, d.source_type, d.visibility, d.link_role, d.drive_file_id, d.mime_type, d.created_by, d.created_by_name, d.created_at,
            p.id AS project_id, p.name AS project_name, p.is_archived,
            (SELECT access_level FROM doc_project_members x WHERE x.project_id = p.id AND x.user_id = ?) AS my_access,
            (SELECT level FROM doc_document_permissions dp WHERE dp.document_id = d.id AND dp.user_id = ?) AS my_level,
            EXISTS (SELECT 1 FROM doc_pins pin WHERE pin.user_id = ? AND pin.kind = 'document' AND pin.item_id = d.id) AS pinned
       FROM doc_documents d JOIN doc_projects p ON p.id = d.project_id
      WHERE (${scope.sql})
         OR (d.visibility = 'invite' AND EXISTS (SELECT 1 FROM doc_document_permissions g WHERE g.document_id = d.id AND g.user_id = ? AND g.level <> 'none'))
      ORDER BY pinned DESC, d.created_at DESC, d.id DESC`,
    [actor.id, actor.id, actor.id, ...scope.values, actor.id]
  );
  return {
    documents: rows.map(d => {
      const access = (full ? 'manager' : d.my_access) as ProjectAccess | null;
      const level = effectiveLevel(d, { id: actor.id, full, access }, (d.my_level as DocLevel | null) ?? undefined);
      return {
        id: Number(d.id), title: d.title, source: d.source_type, visibility: d.visibility, mimeType: d.mime_type ?? '',
        createdBy: d.created_by_name ?? '', createdAt: iso(d.created_at),
        projectId: Number(d.project_id), projectName: d.project_name, archived: !!d.is_archived,
        pinned: Number(d.pinned) === 1,
        myLevel: level ?? 'none', canOpen: !!level && level !== 'none',
        shared: access === null,   // outside the project: shared with them on this document only
        canDelete: full || (access !== null && Number(d.created_by) === actor.id),
        ...documentExtras(d, full, actor.id),
        ...(access === null ? { canEdit: false } : {}),
        canSetAccess: access !== null && d.visibility === 'invite' && level === 'editor' && (canManageProject(full, access) || Number(d.created_by) === actor.id),
      };
    }),
  };
}

// ─── Pins ────────────────────────────────────────────────────────────────────

// Pins or unpins a project or a document for the signed-in person only (it shows first in their lists).
export async function setPin(actor: Actor, body: Record<string, unknown>) {
  const kind = body.kind;
  if (kind !== 'project' && kind !== 'document') throw new ProjectError('Invalid request.');
  const id = positiveId(body.id, kind);
  if (typeof body.pinned !== 'boolean') throw new ProjectError('Invalid request.');
  await withConnection(async c => {
    let projectId = id;
    if (kind === 'document') {
      const [rows] = await c.query<Row[]>('SELECT project_id FROM doc_documents WHERE id = ?', [id]);
      if (!rows[0]) throw new ProjectError('This document no longer exists.', 404);
      projectId = Number(rows[0].project_id);
    }
    await requireProject(actor, projectId, 'view', c);
    if (body.pinned) {
      await c.query('INSERT IGNORE INTO doc_pins (user_id, kind, item_id) VALUES (?, ?, ?)', [actor.id, kind, id]);
    } else {
      await c.query('DELETE FROM doc_pins WHERE user_id = ? AND kind = ? AND item_id = ?', [actor.id, kind, id]);
    }
  });
}

// ─── Templates ───────────────────────────────────────────────────────────────

export async function listTemplates(actor: Actor) {
  const [rows] = await pool().query<Row[]>(
    'SELECT id, name, category, platform, description, source_url, mime_type, created_by_name, created_at FROM doc_templates WHERE is_active = 1 ORDER BY category, name'
  );
  const full = actor.policy.full;
  return {
    canManage: full,
    templates: rows.map(t => ({
      id: Number(t.id), name: t.name, category: t.category, platform: t.platform ?? '', description: t.description ?? '',
      mimeType: t.mime_type, createdBy: t.created_by_name ?? '', createdAt: iso(t.created_at),
      url: full ? t.source_url : '',
    })),
  };
}

// Super Admin and HM: a template from an upload (saved in ADMIN_ROOT_DRIVE_FOLDER_ID) or a Google file link.
export async function addTemplate(actor: Actor, input: { creationKey: string; name: string; category: string; platform: string; description: string; source: string; url?: string; upload?: File | null }) {
  if (!actor.policy.full) throw new ProjectError('Only people with full Projects access can add templates.', 403);
  const key = creationKey(input.creationKey);
  const name = text(input.name, 'Template name', 200, true);
  const category = text(input.category, 'Category', 100, true);
  const platform = text(input.platform, 'Platform', 100);
  const description = text(input.description, 'Description', 5000);
  if (!['upload', 'url'].includes(input.source)) throw new ProjectError('Choose an upload or a Google file link.');
  const sourceUrl = input.source === 'url' ? webUrl(text(input.url, 'Template link', 2048, true), 'Template link') : null;
  let upload: Upload | null = null;
  if (input.source === 'upload') {
    if (!input.upload || !input.upload.name) throw new ProjectError('Choose a file to upload.');
    upload = await readUpload(input.upload);
  }
  await withConnection(c => withLock(c, `projects:template:${key}`, async () => {
    const [existing] = await c.query<Row[]>('SELECT id FROM doc_templates WHERE creation_key = ?', [key]);
    if (existing[0]) return;
    let saved: SavedFile;
    if (upload) {
      const parent = process.env.ADMIN_ROOT_DRIVE_FOLDER_ID;
      if (!parent) throw new ProjectError('The templates Drive folder (ADMIN_ROOT_DRIVE_FOLDER_ID) is not set on the server.');
      saved = await createNativeFile({ parent, name, key: `template:${key}`, upload });
    } else {
      const source = await readNativeFile(sourceUrl!);
      saved = { id: source.id, url: fileUrl(source), mimeType: source.mimeType };
    }
    const [res] = await c.query<mysql.ResultSetHeader>(
      `INSERT INTO doc_templates (name, category, platform, description, drive_file_id, source_url, mime_type, creation_key, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, category, platform || null, description || null, saved.id, saved.url, saved.mimeType, key, actor.id, actor.name]
    );
    await logChange(c, actor, 'doc_templates', res.insertId, 'Template added', null, name);
  }));
}

// Removing a template hides it from the document form; documents already made from it keep working.
export async function removeTemplate(actor: Actor, templateId: number) {
  if (!actor.policy.full) throw new ProjectError('Only people with full Projects access can remove templates.', 403);
  await withConnection(async (c: Conn) => {
    await c.query('UPDATE doc_templates SET is_active = 0 WHERE id = ?', [templateId]);
    await logChange(c, actor, 'doc_templates', templateId, 'Template removed', null, null);
  });
}
