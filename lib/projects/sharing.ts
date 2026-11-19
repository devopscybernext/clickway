import { grantDocument, revokeEmail, type DriveRole } from './drive';
import { type Actor, type Conn, type Row, ProjectError, projectAccess } from './store';
import { loadPeople } from './policy';

// Who gets Google access to a restricted ("Project members only") document, and at what level:
//   people with full access       every restricted document, Drive editor
//   project Creators and Editors  Drive editor
//   project Viewers               Drive viewer
// People without Projects access (Admin Portal → Projects) get none, even if they are still listed as
// members. Anyone else who holds a grant from an earlier state (removed from the project, access or
// account removed, email changed) has it taken back. The ledger (doc_document_access) records the
// intent before Google is called, so a lost answer can be finished or undone by running this again.
// On top of that, the "always editors" (Admin Portal → Projects) get Drive editor on every restricted
// document, through their own ledger (doc_document_email_access). Their address is then left out of
// the member sharing above, so a member level or a removal never lowers or takes away their access.
// The caller holds SHARING_LOCK.

export async function loadAlwaysEditors(c: Pick<Conn, 'query'>): Promise<Set<string>> {
  const [rows] = await c.query<Row[]>('SELECT email FROM doc_always_editors');
  return new Set(rows.map(r => String(r.email).trim().toLowerCase()));
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
    `SELECT d.id, d.project_id, d.drive_file_id FROM doc_documents d
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
    const level = new Map(members.map(m => [`${m.project_id}:${m.user_id}`, String(m.access_level)]));
    const people = (await loadPeople(c)).filter(p => p.policy.access && (filter.userId === undefined || p.id === filter.userId));
    for (const d of docs) {
      for (const p of people) {
        const member = level.get(`${d.project_id}:${p.id}`);
        if (!p.policy.full && !member) continue;
        if (!p.email) {
          if (!result.noEmail.includes(p.name)) result.noEmail.push(p.name);
          continue;
        }
        if (always.has(p.email)) continue; // shared as an always editor below
        const role: DriveRole = p.policy.full || member === 'editor' || member === 'manager' ? 'writer' : 'reader';
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
// Drive role on a restricted document, and returns the document's own link.
export async function openDocument(c: Conn, actor: Actor, documentId: number): Promise<string> {
  const [rows] = await c.query<Row[]>('SELECT id, project_id, document_url, drive_file_id, visibility FROM doc_documents WHERE id = ?', [documentId]);
  const doc = rows[0];
  if (!doc) throw new ProjectError('This document no longer exists.', 404);
  const access = await projectAccess(actor, Number(doc.project_id), c);
  if (!access) throw new ProjectError('You do not have access to this document.', 403);

  if (doc.visibility === 'invite') {
    if (!doc.drive_file_id) throw new ProjectError('This document is unavailable.');
    if (!actor.email) throw new ProjectError('Your account has no email address, so Google access cannot be given. Ask an administrator to add it in the Admin Portal.');
    if ((await loadAlwaysEditors(c)).has(actor.email)) {
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
    const role: DriveRole = actor.policy.full || access === 'editor' || access === 'manager' ? 'writer' : 'reader';
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
