import type mysql from 'mysql2/promise';
import { randomUUID } from 'crypto';
import {
  type Actor, type Conn, type Row, ProjectError, pool, withConnection, withLock, logChange, requireProject, projectScope,
  SHARING_LOCK, text, positiveId, webUrl, websiteUrl, creationKey,
} from './store';
import {
  canManageProject, canAddDocuments,
  PROJECT_STATUSES, type ProjectAccess, type ProjectStatus,
} from './rules';
import {
  ensureProjectFolder, ensurePrivateFolder, createNativeFile, readNativeFile, readUpload, fileUrl,
  protectPrivateFile, makePublic, trashDocumentFile, type SavedFile, type Upload,
} from './drive';
import { DriveError } from './google';
import { syncDocumentSharing, type SharingResult } from './sharing';
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
// The creator becomes its Creator (unless they have full access anyway); the Web team joins as Viewers.
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
    const autoAdd = (await loadPeople(c))
      .filter(x => x.id !== actor.id && x.policy.autoAdd)
      .map(x => ({ id: x.id, level: x.policy.autoAdd! }));
    await c.beginTransaction();
    try {
      const [res] = await c.query<mysql.ResultSetHeader>(
        `INSERT INTO doc_projects (name, client_name, platform, website_url, description, status, drive_folder_id, drive_folder_url, creation_key, created_by, created_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.name, p.client || null, p.platform || null, p.website, p.description || null, p.status, folder.id, folder.url, key, actor.id, actor.name]
      );
      const id = res.insertId;
      if (!actor.policy.full) {
        await c.query("INSERT INTO doc_project_members (project_id, user_id, access_level) VALUES (?, ?, 'manager')", [id, actor.id]);
      }
      // Everyone set to be added automatically (Admin Portal → Projects), at their level. People with
      // full access aren't added: they see every project anyway.
      for (const person of autoAdd) {
        await c.query('INSERT IGNORE INTO doc_project_members (project_id, user_id, access_level) VALUES (?, ?, ?)', [id, person.id, person.level]);
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
      WHERE m.project_id = ? ORDER BY FIELD(m.access_level, 'manager', 'editor', 'viewer'), u.display_name`,
    [projectId]
  );
  const [documents] = await db.query<Row[]>(
    `SELECT d.id, d.title, d.source_type, d.visibility, d.mime_type, d.created_by, d.created_by_name, d.created_at, t.name AS template_name,
            (SELECT COUNT(*) FROM doc_document_access a WHERE a.document_id = d.id AND a.status = 'pending') AS pending,
            EXISTS (SELECT 1 FROM doc_pins pin WHERE pin.user_id = ? AND pin.kind = 'document' AND pin.item_id = d.id) AS pinned
       FROM doc_documents d LEFT JOIN doc_templates t ON t.id = d.template_id
      WHERE d.project_id = ? ORDER BY pinned DESC, d.created_at DESC, d.id DESC`,
    [actor.id, projectId]
  );
  // Everyone's Projects access (Admin Portal → Projects). People with full access aren't listed as
  // members (they see every project); people can be added only if they have Projects access.
  const everyone = await loadPeople(db);
  const policyOf = new Map(everyone.map(x => [x.id, x.policy]));
  const memberIds = new Set(members.map(m => Number(m.user_id)));
  const people = manage ? everyone.filter(x => x.policy.access && !x.policy.full && !memberIds.has(x.id)) : [];
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
      noAccess: policyOf.get(Number(m.user_id))?.access === false,
    })),
    documents: documents.map(d => ({
      id: Number(d.id), title: d.title, source: d.source_type, visibility: d.visibility, mimeType: d.mime_type ?? '',
      template: d.template_name ?? '', createdBy: d.created_by_name ?? '', createdAt: iso(d.created_at),
      pendingSharing: Number(d.pending) > 0,
      pinned: Number(d.pinned) === 1,
      canDelete: full || Number(d.created_by) === actor.id,
    })),
    people: people.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role })),
    templates: templates.map(t => ({ id: Number(t.id), name: t.name, category: t.category, platform: t.platform ?? '', mimeType: t.mime_type })),
  };
}

export async function updateProject(actor: Actor, projectId: number, body: Record<string, unknown>) {
  await withConnection(async c => {
    await requireProject(actor, projectId, 'manage', c);
    if (body.archived !== undefined && Object.keys(body).length === 1) {
      const archived = body.archived === true;
      await c.query('UPDATE doc_projects SET is_archived = ? WHERE id = ?', [archived ? 1 : 0, projectId]);
      await logChange(c, actor, 'doc_projects', projectId, archived ? 'Project archived' : 'Project restored', null, null);
      return;
    }
    const p = projectInput(body);
    await c.query(
      'UPDATE doc_projects SET name = ?, client_name = ?, platform = ?, website_url = ?, description = ?, status = ? WHERE id = ?',
      [p.name, p.client || null, p.platform || null, p.website, p.description || null, p.status, projectId]
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
  if (!['viewer', 'editor', 'manager', 'remove'].includes(access)) throw new ProjectError('Choose Viewer, Editor or Creator.');
  return withConnection(c => withLock(c, SHARING_LOCK, async () => {
    await requireProject(actor, projectId, 'manage', c);
    const target = (await loadPeople(c)).find(x => x.id === userId);
    if (!target && access !== 'remove') throw new ProjectError('That account no longer exists.');
    if (target?.policy.full) throw new ProjectError('This person has full Projects access and already sees every project.');
    if (target && !target.policy.access && access !== 'remove') throw new ProjectError('This person does not have Projects access. Turn it on in Admin Portal → Projects first.');
    if (access === 'remove') {
      await c.query('DELETE FROM doc_project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);
    } else {
      await c.query(
        'INSERT INTO doc_project_members (project_id, user_id, access_level) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE access_level = VALUES(access_level)',
        [projectId, userId, access]
      );
    }
    await logChange(c, actor, 'doc_project_members', projectId, 'Member access', String(userId), access);
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
      else await makePublic(saved.id);
    }

    await c.beginTransaction();
    let documentId: number;
    try {
      const [res] = await c.query<mysql.ResultSetHeader>(
        `INSERT INTO doc_documents (project_id, template_id, title, drive_file_id, document_url, mime_type, source_type, visibility, creation_key, created_by, created_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [projectId, template ? Number(template.id) : null, title, saved?.id ?? null, saved?.url ?? url, saved?.mimeType ?? null, mode, visibility, key, actor.id, actor.name]
      );
      documentId = res.insertId;
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

// Every document the person can see, across their projects (the Documents page).
export async function listDocuments(actor: Actor) {
  const scope = projectScope(actor);
  const full = actor.policy.full;
  const [rows] = await pool().query<Row[]>(
    `SELECT d.id, d.title, d.source_type, d.visibility, d.mime_type, d.created_by, d.created_by_name, d.created_at,
            p.id AS project_id, p.name AS project_name, p.is_archived,
            EXISTS (SELECT 1 FROM doc_pins pin WHERE pin.user_id = ? AND pin.kind = 'document' AND pin.item_id = d.id) AS pinned
       FROM doc_documents d JOIN doc_projects p ON p.id = d.project_id
      WHERE ${scope.sql} ORDER BY pinned DESC, d.created_at DESC, d.id DESC`,
    [actor.id, ...scope.values]
  );
  return {
    documents: rows.map(d => ({
      id: Number(d.id), title: d.title, source: d.source_type, visibility: d.visibility, mimeType: d.mime_type ?? '',
      createdBy: d.created_by_name ?? '', createdAt: iso(d.created_at),
      projectId: Number(d.project_id), projectName: d.project_name, archived: !!d.is_archived,
      pinned: Number(d.pinned) === 1,
      canDelete: full || Number(d.created_by) === actor.id,
    })),
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
