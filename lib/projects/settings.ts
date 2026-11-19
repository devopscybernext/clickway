import { canManageUsers, type Role } from '../auth';
import {
  type Actor, ProjectError, pool, withConnection, withLock, logChange, SHARING_LOCK, positiveId,
} from './store';
import { loadPeople, loadRules, roleDefaults, PROJECT_DEPARTMENTS, EMPTY_RULE, type Rule, type AutoAdd } from './policy';
import { syncDocumentSharing } from './sharing';

// Admin Portal → Projects: reading and saving who may use Projects, per department and per person.
// Only the people who can open the Admin Portal (HM and Super Admin) may do this.

export function requireSettingsManager(actor: Actor) {
  if (!canManageUsers(actor.role as Role)) throw new ProjectError('Only HM and Super Admin can change Projects settings.', 403);
}

export async function getSettings(actor: Actor) {
  requireSettingsManager(actor);
  const db = pool();
  const [people, rules] = await Promise.all([loadPeople(db), loadRules(db)]);
  return {
    departments: PROJECT_DEPARTMENTS.map(name => ({
      name,
      rule: rules.departments.get(name) ?? EMPTY_RULE,
      people: people.filter(p => p.department === name).length,
    })),
    people: people.map(p => ({
      id: p.id, name: p.name, username: p.username, email: p.email, role: p.role, department: p.department,
      own: p.own, policy: p.policy, roleDefault: roleDefaults(p.role),
    })),
  };
}

const AUTO_ADD: AutoAdd[] = ['none', 'viewer', 'editor', 'manager'];

function ruleFrom(value: unknown): Rule {
  if (!value || typeof value !== 'object') throw new ProjectError('Invalid settings.');
  const v = value as Record<string, unknown>;
  const flag = (k: string): boolean | null => {
    if (v[k] === null || v[k] === undefined) return null;
    if (typeof v[k] !== 'boolean') throw new ProjectError('Invalid settings.');
    return v[k] as boolean;
  };
  const autoAdd = v.autoAdd === null || v.autoAdd === undefined ? null : String(v.autoAdd) as AutoAdd;
  if (autoAdd !== null && !AUTO_ADD.includes(autoAdd)) throw new ProjectError('Invalid automatic access level.');
  return { access: flag('access'), create: flag('create'), full: flag('full'), autoAdd };
}

const dbFlag = (b: boolean | null) => (b === null ? null : b ? 1 : 0);

// Saves one department's or one person's settings (all "not set" removes the row), then brings
// Google access to restricted documents in line, since access and full access decide it.
export async function saveSetting(actor: Actor, body: Record<string, unknown>) {
  requireSettingsManager(actor);
  const scope = body.scope;
  if (scope !== 'department' && scope !== 'user') throw new ProjectError('Invalid settings.');
  const key = scope === 'department' ? String(body.key ?? '') : String(positiveId(body.key, 'person'));
  if (scope === 'department' && !(PROJECT_DEPARTMENTS as readonly string[]).includes(key)) throw new ProjectError('Unknown department.');
  const rule = ruleFrom(body.rule);

  return withConnection(c => withLock(c, SHARING_LOCK, async () => {
    if (scope === 'user') {
      const person = (await loadPeople(c)).find(p => p.id === Number(key));
      if (!person) throw new ProjectError('That account no longer exists.');
      if (person.policy.locked) throw new ProjectError('Super Admin always has full Projects access.');
    }
    if (rule.access === null && rule.create === null && rule.full === null && rule.autoAdd === null) {
      await c.query('DELETE FROM doc_project_access WHERE scope = ? AND scope_key = ?', [scope, key]);
    } else {
      await c.query(
        `INSERT INTO doc_project_access (scope, scope_key, can_access, can_create, full_access, auto_add, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE can_access = VALUES(can_access), can_create = VALUES(can_create), full_access = VALUES(full_access),
                                 auto_add = VALUES(auto_add), updated_by = VALUES(updated_by)`,
        [scope, key, dbFlag(rule.access), dbFlag(rule.create), dbFlag(rule.full), rule.autoAdd, actor.email || actor.username]
      );
    }
    await logChange(c, actor, 'doc_project_access', scope === 'user' ? Number(key) : 0, `Projects settings: ${scope} ${key}`, null, JSON.stringify(rule));

    const sharing = await syncDocumentSharing(c, scope === 'user' ? { userId: Number(key) } : {});
    const parts = ['Saved.'];
    if (sharing.shared || sharing.revoked) parts.push(`Google access updated (${sharing.shared} given, ${sharing.revoked} removed).`);
    if (sharing.failed) parts.push('Some Google access could not be updated yet; it is finished the next time sharing runs on those projects (Retry sharing).');
    return { message: parts.join(' ') };
  }));
}
