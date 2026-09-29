'use client';

import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { memberPhoto } from '@/lib/memberColors';

interface AdminUser {
  row: number;
  username: string;
  role: string;
  displayName: string;
  email: string;
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

// Admin Portal — the one place Role and Display Name (from the UserDetails
// sheet) can be edited through the app, instead of hand-editing the sheet
// directly. Talks to its own dedicated /api/admin-users route rather than
// the generic /api/data + /api/update-status pair, since those explicitly
// refuse to ever touch UserDetails — Password Hash never leaves the
// server here, and Username/Email stay read-only.
export default function AdminPortal() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    fetch('/api/admin-users')
      .then(res => res.json())
      .then(json => {
        if (json.success) setUsers(json.users);
        else setError(json.error || 'Failed to load accounts');
      })
      .catch(() => setError('Failed to load accounts'))
      .finally(() => setLoading(false));
  }, []);

  const roleOptions = [...new Set([...CANONICAL_ROLES, ...users.map(u => u.role).filter(Boolean)])];

  const handleSave = async (row: number, field: 'Role' | 'Display Name', value: string) => {
    const res = await fetch('/api/admin-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row, field, value }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Save failed');
    setUsers(prev => prev.map(u => u.row === row ? { ...u, [field === 'Role' ? 'role' : 'displayName']: value } : u));
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

  return (
    <div className="p-3 sm:p-6 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>User Details</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>
            {users.length} account{users.length === 1 ? '' : 's'} — only Role and Display Name are editable here.
          </p>
        </div>
        <button
          onClick={() => setEditMode(m => !m)}
          title={editMode ? 'Stop editing' : 'Edit'}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all text-xs font-semibold shrink-0"
          style={editMode
            ? { background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }
            : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
        >
          <Pencil className="w-3.5 h-3.5" />
          {editMode ? 'Done Editing' : 'Edit'}
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--cn-border)' }}>
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b" style={{ background: 'var(--cn-bg-row-even)', borderColor: 'var(--cn-border)' }}>
              <th className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--cn-text-secondary)' }}></th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--cn-text-secondary)' }}>Display Name</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--cn-text-secondary)' }}>Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <AdminUserRow key={u.row} user={u} editMode={editMode} roleOptions={roleOptions} onSave={handleSave} />
            ))}
          </tbody>
        </table>
        {!users.length && (
          <div className="p-6 text-center text-sm" style={{ color: 'var(--cn-text-muted)' }}>No accounts found.</div>
        )}
      </div>
    </div>
  );
}

function AdminUserRow({ user, editMode, roleOptions, onSave }: {
  user: AdminUser; editMode: boolean; roleOptions: string[];
  onSave: (row: number, field: 'Role' | 'Display Name', value: string) => Promise<void>;
}) {
  const photo = memberPhoto(user.displayName);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [role, setRole] = useState(user.role);
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [savingRole, setSavingRole] = useState(false);

  useEffect(() => { if (!editingName) setDisplayName(user.displayName); }, [user.displayName, editingName]);
  useEffect(() => { setRole(user.role); }, [user.role]);

  const commitName = async () => {
    setEditingName(false);
    if (displayName.trim() === user.displayName) return;
    setSavingName(true);
    try { await onSave(user.row, 'Display Name', displayName.trim()); }
    catch { setDisplayName(user.displayName); }
    finally { setSavingName(false); }
  };

  const commitRole = async (v: string) => {
    if (v === role) return;
    const prev = role;
    setRole(v);
    setSavingRole(true);
    try { await onSave(user.row, 'Role', v); }
    catch { setRole(prev); }
    finally { setSavingRole(false); }
  };

  const selectOptions = roleOptions.includes(role) ? roleOptions : [role, ...roleOptions];

  return (
    <tr className="border-b hover:bg-[var(--cn-bg-hover)] transition-colors" style={{ borderColor: 'var(--cn-border-light, var(--cn-border))' }}>
      <td className="px-4 py-3">
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
      <td className="px-4 py-3 whitespace-nowrap">
        {editMode && editingName ? (
          <input
            autoFocus
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') { setDisplayName(user.displayName); setEditingName(false); }
            }}
            className="text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#FE4A23]"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
          />
        ) : editMode ? (
          <button
            onClick={() => setEditingName(true)}
            title="Click to edit"
            className="text-left rounded px-1 py-0.5 -mx-1 transition-colors hover:bg-[var(--cn-bg-hover)] cursor-text font-semibold"
            style={{ color: 'var(--cn-text-primary)' }}
          >
            {displayName || '—'}
            {savingName && <span className="ml-1.5 text-[10px] opacity-60">saving…</span>}
          </button>
        ) : (
          <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{displayName || '—'}</span>
        )}
      </td>
      <td className="px-4 py-3">
        {editMode ? (
          <div className="flex items-center gap-2">
            <select
              value={role}
              onChange={e => commitRole(e.target.value)}
              disabled={savingRole}
              className="px-2.5 py-1.5 rounded-lg text-xs focus:outline-none disabled:opacity-60 cursor-pointer"
              style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-accent)' }}
            >
              {selectOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {savingRole && <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: 'var(--cn-accent)' }} />}
          </div>
        ) : (
          <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-secondary)', border: '1px solid var(--cn-border)' }}>
            {role || '—'}
          </span>
        )}
      </td>
    </tr>
  );
}
