import { grantDocument, revokeEmail, type DriveRole } from './drive';
import { type Actor, type Conn, type Row, ProjectError, projectAccess } from './store';
import { loadPeople } from './policy';
import { defaultDocLevel, type DocLevel, type ProjectAccess } from './rules';

// Who gets Google access to a restricted ("Project members only") document, and at what level:
//   people with full access (Super Admin, HM, Mod)   every restricted document, Drive editor
//   the person who added the document               Drive editor
//   other project members                           their level on that document: the one set for
//                                                    them on it (doc_document_permissions), or else the
//                                                    one their project level gives (Member = No access,
//                                                    Viewer = viewer, Editor and Creator = editor)
// No access means no Google access. Anyone else who holds a grant from an earlier state (removed from
// the project, level lowered, account removed, email changed) has it taken back. The ledger (doc_document_access) records the
// intent before Google is called, so a lost answer can be finished or undone by running this again.
// On top of that, the "always editors" (Admin Portal → Projects) get Drive editor on every restricted
// document, through their own ledger (doc_document_email_access). Their address is then left out of
// the member sharing above, so a member level or a removal never lowers or takes away their access.
// The caller holds SHARING_LOCK.

export async function loadAlwaysEditors(c: Pick<Conn, 'query'>): Promise<Set<string>> {
  const [rows] = await c.query<Row[]>('SELECT email FROM doc_always_editors');
  return new Set(rows.map(r => String(r.email).trim().toLowerCase()));
}

// A person's level on one document. "Anyone with the link" documents open for everyone in the project
// ('link'); for "Project members only" documents see the list above.
export type EffectiveLevel = DocLevel | 'link';
export function effectiveLevel(
  doc: { visibility?: unknown; created_by?: unknown },
  person: { id: number; full: boolean; access: ProjectAccess | null },
  override: DocLevel | undefined,
): EffectiveLevel | null {
  if (!person.full && !person.access) return null;           // not in the project
  if (doc.visibility !== 'invite') return 'link';
  if (person.full || Number(doc.created_by) === person.id) return 'editor';
  return override ?? defaultDocLevel(person.access!);
}

// The levels set on these documents, as "<document id>:<user id>" → level
export async function loadDocPermissions(c: Pick<Conn, 'query'>, documentIds: number[]): Promise<Map<string, DocLevel>> {
  if (!documentIds.length) return new Map();
  const [rows] = await c.query<Row[]>(
    `SELECT document_id, user_id, level FROM doc_document_permissions WHERE document_id IN (${documentIds.map(() => '?').join(',')})`,
    documentIds
  );
  return new Map(rows.map(r => [`${r.document_id}:${r.user_id}`, r.level as DocLevel]));
}

export interface SharingResult { shared: number; revoked: number; failed: number; noEmail: string[] }
interface Wanted { document_id: number; drive_file_id: string; user_id: number; email: string; drive_role: DriveRole }

export async function syncDocumentSharing(
  c: Conn,
  filter: { projectId?: number; documentId?: number; userId?: number },
  opts: { recheck?: boolean } = {},   // recheck: ask Google again even for grants already confirmed
): Promise<SharingResult> {
  const result: SharingResult = { shared: 0, revoked: 0, failed: 0, noEmail: [] };
  const where: string[] = [];
  const values: unknown[] = [];
  if (filter.projectId !== undefined) { where.push('d.project_id = ?'); values.push(filter.projectId); }
  if (filter.documentId !== undefined) { where.push('d.id = ?'); values.push(filter.documentId); }

  // Who should hold access now
  const [docs] = await c.query<Row[]>(
    `SELECT d.id, d.project_id, d.drive_file_id, d.visibility, d.created_by FROM doc_documents d
      WHERE d.visibility = 'invite' AND d.drive_file_id IS NOT NULL ${where.length ? 'AND ' + where.join(' AND ') : ''}`,
    values
  );
  const always = await loadAlwaysEditors(c);
  const want = new Map<string, Wanted>();
  if (docs.length) {
    const projectIds = [...new Set(docs.map(d => Number(d.project_id)))];
    const [members] = await c.query<Row[]>(
      `SELECT project_id, user_id, access_level FROM doc_project_members WHERE project_id IN (${projectIds.map(() => '?').join(',')})`,
      projectIds
    );
    const level = new Map(members.map(m => [`${m.project_id}:${m.user_id}`, m.access_level as ProjectAccess]));
    const overrides = await loadDocPermissions(c, docs.map(d => Number(d.id)));
    const people = (await loadPeople(c)).filter(p => filter.userId === undefined || p.id === filter.userId);
    for (const d of docs) {
      for (const p of people) {
        const lvl = effectiveLevel(d, { id: p.id, full: p.policy.full, access: level.get(`${d.project_id}:${p.id}`) ?? null }, overrides.get(`${d.id}:${p.id}`));
        if (!lvl || lvl === 'none' || lvl === 'link') continue;
        if (!p.email) {
          if (!result.noEmail.includes(p.name)) result.noEmail.push(p.name);
          continue;
        }
        if (always.has(p.email)) continue; // shared as an always editor below
        const role: DriveRole = lvl === 'editor' ? 'writer' : 'reader';
        want.set(`${d.id}:${p.id}`, { document_id: Number(d.id), drive_file_id: String(d.drive_file_id), user_id: p.id, email: p.email, drive_role: role });
      }
    }
  }

  // Who holds (or may hold) access now, according to the ledger
  const [held] = await c.query<Row[]>(
    `SELECT a.document_id, a.user_id, a.email, a.status, a.drive_role, d.drive_file_id
       FROM doc_document_access a JOIN doc_documents d ON d.id = a.document_id
      WHERE a.status <> 'revoked' ${where.length ? 'AND ' + where.join(' AND ') : ''}${filter.userId !== undefined ? ' AND a.user_id = ?' : ''}`,
    [...values, ...(filter.userId !== undefined ? [filter.userId] : [])]
  );
  const holding = new Map<string, Row>();

  // 1. Take back what nobody should hold any more (or what went to an old email address)
  for (const h of held) {
    const key = `${h.document_id}:${h.user_id}`;
    const w = want.get(key);
    if (w && w.email === h.email) { holding.set(key, h); continue; }
    try {
      // An always editor keeps their Google access: only this ledger row is closed
      if (h.drive_file_id && !always.has(String(h.email))) await revokeEmail(String(h.drive_file_id), String(h.email));
      await c.query("UPDATE doc_document_access SET status = 'revoked', drive_role = NULL, drive_permission_id = NULL WHERE document_id = ? AND user_id = ?", [h.document_id, h.user_id]);
      result.revoked++;
    } catch {
      result.failed++;
    }
  }

  // 2. Give what is missing, or move it to the right level
  for (const [key, w] of want) {
    const h = holding.get(key);
    if (!opts.recheck && h && h.status === 'granted' && h.drive_role === w.drive_role) continue;
    await c.query(
      `INSERT INTO doc_document_access (document_id, user_id, email, status, drive_role) VALUES (?, ?, ?, 'pending', ?)
       ON DUPLICATE KEY UPDATE email = VALUES(email), status = 'pending', drive_role = VALUES(drive_role)`,
      [w.document_id, w.user_id, w.email, w.drive_role]
    );
    try {
      const permission = await grantDocument(String(w.drive_file_id), String(w.email), w.drive_role as DriveRole);
      await c.query("UPDATE doc_document_access SET status = 'granted', drive_permission_id = ? WHERE document_id = ? AND user_id = ?", [permission, w.document_id, w.user_id]);
      result.shared++;
    } catch {
      // stays 'pending': Retry sharing finishes it, and grantDocument reuses a grant Google already made
      result.failed++;
    }
  }

  // 3. Always editors (not when only one person's sharing is being updated)
  if (filter.userId === undefined) {
    const memberEmails = new Set([...want.values()].map(w => `${w.document_id}:${w.email}`));
    const [heldEmails] = await c.query<Row[]>(
      `SELECT a.document_id, a.email, a.status, d.drive_file_id
         FROM doc_document_email_access a JOIN doc_documents d ON d.id = a.document_id
        WHERE a.status <> 'revoked' ${where.length ? 'AND ' + where.join(' AND ') : ''}`,
      values
    );
    const granted = new Set<string>();
    for (const h of heldEmails) {
      const key = `${h.document_id}:${h.email}`;
      if (always.has(String(h.email))) { if (h.status === 'granted') granted.add(key); continue; }
      // Removed from the list: take the access back, unless the same address still gets it as a member
      // (step 2 has already set that member's level)
      try {
        if (h.drive_file_id && !memberEmails.has(key)) await revokeEmail(String(h.drive_file_id), String(h.email));
        await c.query("UPDATE doc_document_email_access SET status = 'revoked', drive_permission_id = NULL WHERE document_id = ? AND email = ?", [h.document_id, h.email]);
        result.revoked++;
      } catch {
        result.failed++;
      }
    }
    for (const d of docs) {
      for (const email of always) {
        const key = `${d.id}:${email}`;
        if (!opts.recheck && granted.has(key)) continue;
        await c.query(
          `INSERT INTO doc_document_email_access (document_id, email, status) VALUES (?, ?, 'pending')
           ON DUPLICATE KEY UPDATE status = 'pending'`,
          [d.id, email]
        );
        try {
          const permission = await grantDocument(String(d.drive_file_id), email, 'writer');
          await c.query("UPDATE doc_document_email_access SET status = 'granted', drive_permission_id = ? WHERE document_id = ? AND email = ?", [permission, d.id, email]);
          result.shared++;
        } catch {
          result.failed++;
        }
      }
    }
  }
  return result;
}

// Opening a document: checks the person may see it, makes sure their Google account has the right
// Drive role on a restricted document (when their account has an email), and returns the document's link.
export async function openDocument(c: Conn, actor: Actor, documentId: number): Promise<string> {
  const [rows] = await c.query<Row[]>('SELECT id, project_id, document_url, drive_file_id, visibility, created_by FROM doc_documents WHERE id = ?', [documentId]);
  const doc = rows[0];
  if (!doc) throw new ProjectError('This document no longer exists.', 404);
  const access = await projectAccess(actor, Number(doc.project_id), c);
  if (!access) throw new ProjectError('You do not have access to this document.', 403);
  const overrides = await loadDocPermissions(c, [documentId]);
  const lvl = effectiveLevel(doc, { id: actor.id, full: actor.policy.full, access }, overrides.get(`${documentId}:${actor.id}`));
  const isAlways = !!actor.email && (await loadAlwaysEditors(c)).has(actor.email);
  if ((!lvl || lvl === 'none') && !isAlways) {
    throw new ProjectError("You don't have access to this document. Ask the project's Creator if you need it.", 403);
  }

  // An account without an email address (often Super Admin or HM) gets no Google access from here: the
  // document simply opens, and Google lets them in if the Google account they are signed in to already
  // has access (for example the workspace account that owns the files, or an always editor).
  if (doc.visibility === 'invite' && actor.email) {
    if (!doc.drive_file_id) throw new ProjectError('This document is unavailable.');
    if (isAlways) {
      // An always editor: make sure they are a Drive editor, through their own ledger
      await grantDocument(String(doc.drive_file_id), actor.email, 'writer');
      await c.query(
        `INSERT INTO doc_document_email_access (document_id, email, status) VALUES (?, ?, 'granted')
         ON DUPLICATE KEY UPDATE status = 'granted'`,
        [documentId, actor.email]
      );
      const target = new URL(String(doc.document_url));
      if (!['https:', 'http:'].includes(target.protocol)) throw new ProjectError('Invalid document link.');
      return target.href;
    }
    const role: DriveRole = lvl === 'editor' ? 'writer' : 'reader';
    const [state] = await c.query<Row[]>('SELECT status, drive_role, email FROM doc_document_access WHERE document_id = ? AND user_id = ?', [documentId, actor.id]);
    const s = state[0];
    if (!(s && s.status === 'granted' && s.drive_role === role && s.email === actor.email)) {
      if (s && s.status !== 'revoked' && s.email !== actor.email) await revokeEmail(String(doc.drive_file_id), String(s.email));
      await c.query(
        `INSERT INTO doc_document_access (document_id, user_id, email, status, drive_role) VALUES (?, ?, ?, 'pending', ?)
         ON DUPLICATE KEY UPDATE email = VALUES(email), status = 'pending', drive_role = VALUES(drive_role)`,
        [documentId, actor.id, actor.email, role]
      );
      const permission = await grantDocument(String(doc.drive_file_id), actor.email, role);
      await c.query("UPDATE doc_document_access SET status = 'granted', drive_permission_id = ? WHERE document_id = ? AND user_id = ?", [permission, documentId, actor.id]);
    }
  }
  const target = new URL(String(doc.document_url));
  if (!['https:', 'http:'].includes(target.protocol)) throw new ProjectError('Invalid document link.');
  return target.href;
}
