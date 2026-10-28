'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Plus, Trash2, Eye, EyeOff, KeyRound, X, Copy, Check, RefreshCw } from 'lucide-react';
import { memberPhoto } from '@/lib/memberColors';
import { DEPARTMENTS, NO_DEPARTMENT, SUB_DEPARTMENTS, type SubDeptKey } from '@/lib/roster';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';

interface AdminUser {
  row: number;
  username: string;
  role: string;
  displayName: string;
  email: string;
  department: string;           // Web / Marketing / PM / None
  subDepartments: SubDeptKey[];
  hasPassword: boolean;
}

// Current-taxonomy roles, offered first — whatever a row already holds
// (including a not-yet-migrated legacy value like "akash" or "resource")
// stays selectable too via the union built in the component below, same
// "canonical + extras" pattern used elsewhere in the app (e.g. PM
// Projects' Status/Phase dropdowns).
const CANONICAL_ROLES = [
  'HM', 'Admin', 'Mod',
  'PMWebAdmin', 'PMMarketingAdmin',
  'WebAdmin', 'MarketingAdmin',
  'WebTeam', 'MarketingTeam', 'smm', 'pm',
];
const DEPARTMENT_CHOICES = [...DEPARTMENTS, NO_DEPARTMENT];

const selectStyle = { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-accent)' };
const inputStyle = { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' };

type Patch = Partial<{ displayName: string; username: string; email: string; password: string; role: string; department: string; subDepartments: SubDeptKey[] }>;

async function api(method: 'POST' | 'PATCH' | 'DELETE', body: object): Promise<{ row?: number }> {
  const res = await fetch('/api/admin-users', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || 'Save failed');
  return json;
}

async function fetchAccounts(): Promise<{ users?: AdminUser[]; error?: string }> {
  try {
    const json = await (await fetch('/api/admin-users')).json();
    return json.success ? { users: json.users } : { error: json.error };
  } catch {
    return { error: 'Failed to load accounts' };
  }
}

// A random 12-character password without look-alike characters
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

// Admin Portal — HM and Admin add, edit and remove accounts here instead of
// hand-editing the sheet. Talks to its own /api/admin-users route. Every field
// is editable (name, username, email, password, role, department, sub
// department) and the department is what puts a person into their team's forms
// and Team Bandwidth cards. An existing password can't be read back — it is
// stored hashed — so it can only be set again.
export default function AdminPortal({ currentUsername, onChanged }: { currentUsername?: string; onChanged?: () => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<AdminUser | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const apply = useCallback((result: { users?: AdminUser[]; error?: string }) => {
    if (result.users) setUsers(result.users);
    else setError(result.error || 'Failed to load accounts');
    setLoading(false);
  }, []);
  const load = useCallback(async () => apply(await fetchAccounts()), [apply]);
  useEffect(() => {
    let alive = true;
    fetchAccounts().then(result => { if (alive) apply(result); });
    return () => { alive = false; };
  }, [apply]);

  const say = (kind: 'ok' | 'error', text: string) => setNotice({ kind, text });
  const roleOptions = [...new Set([...CANONICAL_ROLES, ...users.map(u => u.role).filter(Boolean)])];

  // Saves some fields of one account; the list is reloaded so what's shown is what's stored.
  // Throws on failure so the cell can put its old value back.
  const handleSave = async (user: AdminUser, patch: Patch, okText?: string) => {
    try {
      await api('PATCH', { row: user.row, ...patch });
    } catch (e) {
      say('error', e instanceof Error ? e.message : 'Save failed');
      throw e;
    }
    if (okText) say('ok', okText);
    await load();
    onChanged?.();
  };

  if (loading) {
    return (
      <div className="p-3 sm:p-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: 'var(--cn-bg-input)' }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 sm:p-6 text-sm" style={{ color: '#ef4444' }}>{error}</div>
    );
  }

  const th = 'px-4 py-3 font-semibold whitespace-nowrap';
  return (
    <div className="p-3 sm:p-6 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>User Details</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>
            {users.length} account{users.length === 1 ? '' : 's'} — add people, or press Edit to change or remove them. A person&apos;s department decides which team&apos;s forms and cards they appear in.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all text-xs font-semibold"
            style={{ background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }}
          >
            <Plus className="w-3.5 h-3.5" />
            Add User
          </button>
          <button
            onClick={() => setEditMode(m => !m)}
            title={editMode ? 'Stop editing' : 'Edit'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all text-xs font-semibold"
            style={editMode
              ? { background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }
              : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
          >
            <Pencil className="w-3.5 h-3.5" />
            {editMode ? 'Done Editing' : 'Edit'}
          </button>
        </div>
      </div>

      {notice && (
        <div role={notice.kind === 'error' ? 'alert' : 'status'} className="flex items-start justify-between gap-3 rounded-lg px-4 py-2.5 text-sm font-medium"
          style={notice.kind === 'ok'
            ? { background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.3)', color: '#16a34a' }
            : { background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="cursor-pointer shrink-0"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--cn-border)' }}>
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b" style={{ background: 'var(--cn-bg-row-even)', borderColor: 'var(--cn-border)' }}>
              <th className={th} style={{ color: 'var(--cn-text-secondary)' }}></th>
              <th className={th} style={{ color: 'var(--cn-text-secondary)' }}>Display Name</th>
              <th className={th} style={{ color: 'var(--cn-text-secondary)' }}>Username</th>
              <th className={th} style={{ color: 'var(--cn-text-secondary)' }}>Email</th>
              <th className={th} style={{ color: 'var(--cn-text-secondary)' }}>Password</th>
              <th className={th} style={{ color: 'var(--cn-text-secondary)' }}>Role</th>
              <th className={th} style={{ color: 'var(--cn-text-secondary)' }}>Department</th>
              <th className={th} style={{ color: 'var(--cn-text-secondary)' }}>Sub Department</th>
              {editMode && <th className={th} style={{ color: 'var(--cn-text-secondary)' }}><span className="sr-only">Remove</span></th>}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <AdminUserRow
                key={u.row}
                user={u}
                editMode={editMode}
                roleOptions={roleOptions}
                isSelf={!!currentUsername && u.username.toLowerCase() === currentUsername.toLowerCase()}
                onSave={handleSave}
                onRemove={() => setRemoving(u)}
              />
            ))}
          </tbody>
        </table>
        {!users.length && (
          <div className="p-6 text-center text-sm" style={{ color: 'var(--cn-text-muted)' }}>No accounts found.</div>
        )}
      </div>

      {adding && (
        <AddUserDialog
          roleOptions={roleOptions}
          onClose={() => setAdding(false)}
          onAdded={async (name, department) => {
            setAdding(false);
            say('ok', department === 'Web' || department === 'Marketing'
              ? `${name} was added to ${department}. They now appear in the ${department} forms and cards.`
              : `${name} was added.`);
            await load();
            onChanged?.();
          }}
        />
      )}

      {removing && (
        <ConfirmRemove
          user={removing}
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await api('DELETE', { row: removing.row });
              say('ok', `${removing.displayName} was removed. They can no longer log in; their tasks and history stay.`);
              setRemoving(null);
              await load();
              onChanged?.();
            } catch (e) {
              say('error', e instanceof Error ? e.message : 'Could not remove the account');
              setRemoving(null);
            }
          }}
        />
      )}
    </div>
  );
}

// Click-to-edit text cell (display name / username / email)
function EditableText({ value, editMode, label, type = 'text', onCommit }: {
  value: string; editMode: boolean; label: string; type?: string; onCommit: (v: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const commit = async () => {
    setEditing(false);
    const next = draft.trim();
    if (next === value) { setDraft(value); return; }
    setSaving(true);
    try { await onCommit(next); }
    catch { setDraft(value); }
    finally { setSaving(false); }
  };

  if (editMode && editing) {
    return (
      <input
        autoFocus
        type={type}
        aria-label={label}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        className="text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#FE4A23]"
        style={inputStyle}
      />
    );
  }
  if (editMode) {
    return (
      <button
        onClick={() => { setDraft(value); setEditing(true); }}
        title={`Click to edit the ${label.toLowerCase()}`}
        className="text-left rounded px-1 py-0.5 -mx-1 transition-colors hover:bg-[var(--cn-bg-hover)] cursor-text"
        style={{ color: 'var(--cn-text-primary)' }}
      >
        {value || '—'}
        {saving && <span className="ml-1.5 text-[10px] opacity-60">saving…</span>}
      </button>
    );
  }
  return <span>{value || '—'}</span>;
}

// Password cell: never shows the stored password (it is hashed) — in edit mode a new one can be set
function PasswordCell({ user, editMode, onSave }: { user: AdminUser; editMode: boolean; onSave: (password: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [show, setShow] = useState(true);
  const [saving, setSaving] = useState(false);
  const tooShort = value.length > 0 && value.length < 8;

  const save = async () => {
    setSaving(true);
    try { await onSave(value); setOpen(false); setValue(''); }
    catch { /* the portal shows the reason */ }
    finally { setSaving(false); }
  };

  if (editMode && open) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          type={show ? 'text' : 'password'}
          aria-label="New password"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="New password (8+)"
          className="w-40 text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#FE4A23]"
          style={inputStyle}
        />
        <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="cursor-pointer" style={{ color: 'var(--cn-text-muted)' }}>
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
        <button type="button" onClick={() => { setValue(generatePassword()); setShow(true); }} aria-label="Generate a password" title="Generate a password" className="cursor-pointer" style={{ color: 'var(--cn-text-muted)' }}>
          <RefreshCw className="w-4 h-4" />
        </button>
        <button type="button" onClick={save} disabled={saving || value.length < 8}
          className="px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50" style={{ background: 'var(--cn-accent)', color: '#fff' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setValue(''); }} aria-label="Cancel" className="cursor-pointer" style={{ color: 'var(--cn-text-muted)' }}>
          <X className="w-4 h-4" />
        </button>
        {tooShort && <span className="text-[10px]" style={{ color: '#ef4444' }}>8+ characters</span>}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span title="Stored encrypted — it can be replaced but not shown" className="tracking-widest select-none" style={{ color: user.hasPassword ? 'var(--cn-text-secondary)' : '#ef4444' }}>
        {user.hasPassword ? '••••••••' : 'Not set'}
      </span>
      {editMode && (
        <button onClick={() => setOpen(true)} title="Set a new password" aria-label={`Set a new password for ${user.displayName}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold cursor-pointer"
          style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>
          <KeyRound className="w-3 h-3" />
          Set new
        </button>
      )}
    </div>
  );
}

// Sub-department toggles for a Web or Marketing person
function SubDeptChips({ department, selected, editable, onChange }: {
  department: string; selected: SubDeptKey[]; editable: boolean; onChange: (next: SubDeptKey[]) => void;
}) {
  if (department !== 'Web' && department !== 'Marketing') return <span style={{ color: 'var(--cn-text-faint)' }}>—</span>;
  const choices = SUB_DEPARTMENTS[department];
  if (!editable) {
    return selected.length
      ? <div className="flex flex-wrap gap-1">{choices.filter(c => selected.includes(c.key)).map(c => <Pill key={c.key}>{c.label}</Pill>)}</div>
      : <span style={{ color: 'var(--cn-text-faint)' }}>—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {choices.map(c => {
        const on = selected.includes(c.key);
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? selected.filter(k => k !== c.key) : [...selected, c.key])}
            className="px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors"
            style={on
              ? { background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }
              : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-secondary)', border: '1px solid var(--cn-border)' }}>
      {children}
    </span>
  );
}

function AdminUserRow({ user, editMode, roleOptions, isSelf, onSave, onRemove }: {
  user: AdminUser; editMode: boolean; roleOptions: string[]; isSelf: boolean;
  onSave: (user: AdminUser, patch: Patch, okText?: string) => Promise<void>;
  onRemove: () => void;
}) {
  const photo = memberPhoto(user.displayName);
  const [savingRole, setSavingRole] = useState(false);
  const [savingDept, setSavingDept] = useState(false);
  const selectOptions = roleOptions.includes(user.role) ? roleOptions : [user.role, ...roleOptions];
  const td = 'px-4 py-3';

  const run = async (set: (b: boolean) => void, patch: Patch) => {
    set(true);
    try { await onSave(user, patch); } catch { /* shown by the portal */ } finally { set(false); }
  };

  return (
    <tr className="border-b hover:bg-[var(--cn-bg-hover)] transition-colors" style={{ borderColor: 'var(--cn-border-light, var(--cn-border))' }}>
      <td className={td}>
        {photo ? (
          <img src={photo} alt={user.displayName} className="w-8 h-8 rounded-full object-cover shrink-0"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ background: 'var(--cn-accent)' }}>
            {(user.displayName || user.username).charAt(0).toUpperCase() || '?'}
          </div>
        )}
      </td>
      <td className={`${td} whitespace-nowrap font-semibold`} style={{ color: 'var(--cn-text-primary)' }}>
        <EditableText value={user.displayName} label="Display name" editMode={editMode} onCommit={v => onSave(user, { displayName: v })} />
      </td>
      <td className={`${td} whitespace-nowrap`} style={{ color: 'var(--cn-text-secondary)' }}>
        <EditableText value={user.username} label="Username" editMode={editMode} onCommit={v => onSave(user, { username: v })} />
      </td>
      <td className={`${td} whitespace-nowrap`} style={{ color: 'var(--cn-text-secondary)' }}>
        <EditableText value={user.email} label="Email" type="email" editMode={editMode} onCommit={v => onSave(user, { email: v })} />
      </td>
      <td className={`${td} whitespace-nowrap`}>
        <PasswordCell user={user} editMode={editMode} onSave={p => onSave(user, { password: p }, `Password updated for ${user.displayName}.`)} />
      </td>
      <td className={td}>
        {editMode ? (
          <div className="flex items-center gap-2">
            <select
              aria-label="Role"
              value={user.role}
              onChange={e => run(setSavingRole, { role: e.target.value })}
              disabled={savingRole}
              className="px-2.5 py-1.5 rounded-lg text-xs focus:outline-none disabled:opacity-60 cursor-pointer"
              style={selectStyle}
            >
              {selectOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {savingRole && <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: 'var(--cn-accent)' }} />}
          </div>
        ) : (
          <Pill>{user.role || '—'}</Pill>
        )}
      </td>
      <td className={td}>
        {editMode ? (
          <div className="flex items-center gap-2">
            <select
              aria-label="Department"
              value={user.department}
              onChange={e => run(setSavingDept, { department: e.target.value })}
              disabled={savingDept}
              className="px-2.5 py-1.5 rounded-lg text-xs focus:outline-none disabled:opacity-60 cursor-pointer"
              style={selectStyle}
            >
              {DEPARTMENT_CHOICES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {savingDept && <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: 'var(--cn-accent)' }} />}
          </div>
        ) : user.department === NO_DEPARTMENT ? (
          <span style={{ color: 'var(--cn-text-faint)' }}>—</span>
        ) : (
          <Pill>{user.department}</Pill>
        )}
      </td>
      <td className={td}>
        <SubDeptChips
          department={user.department}
          selected={user.subDepartments}
          editable={editMode}
          onChange={next => { void onSave(user, { subDepartments: next }).catch(() => {}); }}
        />
      </td>
      {editMode && (
        <td className={td}>
          <button
            onClick={onRemove}
            disabled={isSelf}
            title={isSelf ? 'You cannot remove your own account' : `Remove ${user.displayName}`}
            aria-label={`Remove ${user.displayName}`}
            className="w-8 h-8 rounded-lg inline-flex items-center justify-center cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[rgba(239,68,68,0.12)]"
            style={{ color: '#ef4444' }}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </td>
      )}
    </tr>
  );
}

function ConfirmRemove({ user, onCancel, onConfirm }: { user: AdminUser; onCancel: () => void; onConfirm: () => Promise<void> }) {
  useBodyScrollLock();
  const [busy, setBusy] = useState(false);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div role="dialog" aria-modal="true" aria-label="Remove account" className="rounded-lg w-full p-5 space-y-4"
        style={{ background: 'var(--cn-bg-card)', maxWidth: 440, border: '1px solid var(--cn-border)' }}>
        <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>Remove {user.displayName}?</h2>
        <p className="text-sm" style={{ color: 'var(--cn-text-secondary)' }}>
          {user.username} ({user.role}) will no longer be able to log in, and will disappear from the team forms and cards.
          Their past tasks and history are kept.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>Cancel</button>
          <button onClick={async () => { setBusy(true); await onConfirm(); }} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60"
            style={{ background: '#dc2626', color: '#fff', border: '1px solid #dc2626' }}>{busy ? 'Removing…' : 'Remove'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function AddUserDialog({ roleOptions, onClose, onAdded }: {
  roleOptions: string[]; onClose: () => void; onAdded: (name: string, department: string) => Promise<void>;
}) {
  useBodyScrollLock();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(true);
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState<string>(NO_DEPARTMENT);
  const [subs, setSubs] = useState<SubDeptKey[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const onEmail = (v: string) => {
    setEmail(v);
    if (!usernameTouched) setUsername(v.split('@')[0].toLowerCase());
  };
  // Picking a department suggests the matching role, unless one was already chosen
  const onDepartment = (v: string) => {
    setDepartment(v);
    setSubs([]);
    if (!role) setRole(v === 'Web' ? 'WebTeam' : v === 'Marketing' ? 'MarketingTeam' : '');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api('POST', { displayName, email, username, password, role, department, subDepartments: subs });
      await onAdded(displayName.trim(), department);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the user');
      setSaving(false);
    }
  };

  const field = 'w-full text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#FE4A23] disabled:opacity-60';
  const label = 'text-[11px] font-semibold uppercase tracking-wide';
  const labelStyle = { color: 'var(--cn-text-muted)' };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-label="Add user" className="rounded-lg w-full flex flex-col"
        style={{ background: 'var(--cn-bg-card)', maxWidth: 560, maxHeight: '92vh', border: '1px solid var(--cn-border)' }}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--cn-border)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>Add User</h2>
          <button type="button" onClick={onClose} disabled={saving} title="Close" className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="new-name" className={label} style={labelStyle}>Display name *</label>
            <input id="new-name" value={displayName} onChange={e => setDisplayName(e.target.value)} disabled={saving} className={field} style={inputStyle} placeholder="As it appears on tasks, e.g. Riya" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="new-email" className={label} style={labelStyle}>Email *</label>
            <input id="new-email" type="email" value={email} onChange={e => onEmail(e.target.value)} disabled={saving} className={field} style={inputStyle} placeholder="name@cybernext.io" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="new-username" className={label} style={labelStyle}>Username *</label>
            <input id="new-username" value={username} onChange={e => { setUsername(e.target.value); setUsernameTouched(true); }} disabled={saving} className={field} style={inputStyle} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="new-password" className={label} style={labelStyle}>Password * (8+ characters)</label>
            <div className="flex items-center gap-1.5">
              <input id="new-password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} disabled={saving} className={field} style={inputStyle} autoComplete="new-password" />
              <button type="button" onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="cursor-pointer shrink-0" style={{ color: 'var(--cn-text-muted)' }}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button type="button" onClick={() => { setPassword(generatePassword()); setShowPassword(true); }} aria-label="Generate a password" title="Generate a password" className="cursor-pointer shrink-0" style={{ color: 'var(--cn-text-muted)' }}>
                <RefreshCw className="w-4 h-4" />
              </button>
              <button type="button" disabled={!password}
                onClick={async () => { try { await navigator.clipboard.writeText(password); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } }}
                aria-label="Copy password" title="Copy password" className="cursor-pointer shrink-0 disabled:opacity-40" style={{ color: 'var(--cn-text-muted)' }}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="new-department" className={label} style={labelStyle}>Department</label>
            <select id="new-department" value={department} onChange={e => onDepartment(e.target.value)} disabled={saving} className={`${field} cursor-pointer`} style={inputStyle}>
              {DEPARTMENT_CHOICES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="new-role" className={label} style={labelStyle}>Role *</label>
            <select id="new-role" value={role} onChange={e => setRole(e.target.value)} disabled={saving} className={`${field} cursor-pointer`} style={inputStyle}>
              <option value="">Choose</option>
              {roleOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {(department === 'Web' || department === 'Marketing') && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <span className={label} style={labelStyle}>Sub department</span>
              <SubDeptChips department={department} selected={subs} editable onChange={setSubs} />
            </div>
          )}
          <p className="sm:col-span-2 text-xs" style={{ color: 'var(--cn-text-muted)' }}>
            The role decides what they can open; the department decides which team&apos;s forms and cards they appear in.
            Share the password with them — it is stored encrypted and can&apos;t be shown again later, only replaced.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: 'var(--cn-border)' }}>
          {error && <span role="alert" className="text-xs mr-auto" style={{ color: '#ef4444' }}>{error}</span>}
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60"
            style={{ background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }}>{saving ? 'Adding…' : 'Add User'}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}
