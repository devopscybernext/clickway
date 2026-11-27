import { canManageUsers, type Role } from '../auth';
import { type Actor, type Row, ProjectError, pool, withConnection, withLock, logChange, SHARING_LOCK } from './store';
import { loadPeople } from './policy';
import { syncDocumentSharing } from './sharing';

// Admin Portal → Projects: the always editors. Only the people who can open the Admin Portal (HM and
// Super Admin) may change them. Who may use and create projects is set by role (lib/projects/rules.ts).

export function requireSettingsManager(actor: Actor) {
  if (!canManageUsers(actor.role as Role)) throw new ProjectError('Only HM and Super Admin can change Projects settings.', 403);
}

export async function getSettings(actor: Actor) {
  requireSettingsManager(actor);
  const db = pool();
  const [people, [editors]] = await Promise.all([
    loadPeople(db),
    db.query<Row[]>('SELECT email, added_by, added_at FROM doc_always_editors ORDER BY email'),
  ]);
  const byEmail = new Map(people.filter(p => p.email).map(p => [p.email, p.name]));
  return {
    alwaysEditors: editors.map(e => ({
      email: String(e.email), name: byEmail.get(String(e.email)) ?? '', addedBy: String(e.added_by ?? ''),
      addedAt: e.added_at instanceof Date ? e.added_at.toISOString() : e.added_at ? String(e.added_at) : null,
    })),
  };
}

// Always editors: email addresses given Google editor access to every "Project members only" document.
// Adding or removing one updates every restricted document's sharing straight away.
export async function saveAlwaysEditor(actor: Actor, body: Record<string, unknown>) {
  requireSettingsManager(actor);
  const action = body.action;
  if (action !== 'add' && action !== 'remove') throw new ProjectError('Invalid request.');
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 191) throw new ProjectError('Enter a valid email address.');

  return withConnection(c => withLock(c, SHARING_LOCK, async () => {
    if (action === 'add') {
      await c.query('INSERT IGNORE INTO doc_always_editors (email, added_by) VALUES (?, ?)', [email, actor.email || actor.username]);
    } else {
      await c.query('DELETE FROM doc_always_editors WHERE email = ?', [email]);
    }
    await logChange(c, actor, 'doc_always_editors', 0, action === 'add' ? 'Always editor added' : 'Always editor removed', null, email);
    const sharing = await syncDocumentSharing(c, {});
    const parts = [action === 'add' ? `${email} added.` : `${email} removed.`];
    if (sharing.shared || sharing.revoked) parts.push(`Google access updated (${sharing.shared} given, ${sharing.revoked} removed).`);
    if (sharing.failed) parts.push('Some documents could not be updated yet; use Retry sharing on those projects.');
    return { message: parts.join(' ') };
  }));
}
