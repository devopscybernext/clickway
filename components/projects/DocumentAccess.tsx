'use client';

import { useEffect, useState } from 'react';
import { api, postJson, Button, Modal, Notice, inputStyle } from './shared';
import { ACCESS_LABELS, DOC_LEVELS, DOC_LEVEL_LABELS, defaultDocLevel, type DocLevel, type ProjectAccess } from '@/lib/projects/rules';

// Who can open a "Project members only" document, person by person. Each project member starts at the
// level their project level gives (Member = No access, Viewer = Viewer, Editor and Creator = Editor) and
// can be set differently for this one document; that setting wins over the project level.
// Super Admin, HM and Mod, and the person who added the document, always edit it, so they aren't listed.

export interface AccessRow { userId: number; name: string; email: string; projectLevel: ProjectAccess; level: DocLevel }

export function rowsFromMembers(members: { userId: number; name: string; email: string; access: ProjectAccess; isMe: boolean; removedAccount: boolean }[]): AccessRow[] {
  return members
    .filter(m => !m.isMe && !m.removedAccount)
    .map(m => ({ userId: m.userId, name: m.name, email: m.email, projectLevel: m.access, level: defaultDocLevel(m.access) }));
}

export function AccessTable({ rows, onChange, disabled }: { rows: AccessRow[]; onChange: (userId: number, level: DocLevel) => void; disabled?: boolean }) {
  if (rows.length === 0) {
    return <p className="text-sm" style={{ color: 'var(--cn-text-muted)' }}>No other project members yet. Administrators and you always have access.</p>;
  }
  return (
    <ul className="divide-y rounded-xl border" style={{ borderColor: 'var(--cn-border)' }}>
      {rows.map(r => {
        const changed = r.level !== defaultDocLevel(r.projectLevel);
        return (
          <li key={r.userId} className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ borderColor: 'var(--cn-border)' }}>
            <div className="min-w-0 flex-1" style={{ flexBasis: '12rem' }}>
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--cn-text-primary)' }}>{r.name}</p>
              <p className="text-xs break-all" style={{ color: 'var(--cn-text-faint)' }}>
                {r.email || 'No email: no Google access'} · Project: {ACCESS_LABELS[r.projectLevel]}{changed ? ' · set for this document' : ''}
              </p>
            </div>
            <select value={r.level} disabled={disabled} aria-label={`Access to this document for ${r.name}`}
              onChange={e => onChange(r.userId, e.target.value as DocLevel)}
              className="h-9 rounded-lg border px-3 text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#FE4A23]/30" style={{ ...inputStyle, width: '8.5rem' }}>
              {DOC_LEVELS.map(l => <option key={l} value={l}>{DOC_LEVEL_LABELS[l]}</option>)}
            </select>
          </li>
        );
      })}
    </ul>
  );
}

export const permissionsOf = (rows: AccessRow[]) => rows.map(r => ({ userId: r.userId, level: r.level }));

// The "Access" button on a document: loads, changes and saves its people's levels
export function DocumentAccessModal({ documentId, title, onClose, onSaved }: {
  documentId: number; title: string; onClose: () => void; onSaved: (message: string, note?: string) => void;
}) {
  const [rows, setRows] = useState<AccessRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await api(`/api/project-documents/${documentId}/access`);
      if (!r.success) { setError(r.error!); return; }
      setRows(r.people as AccessRow[]);
    })();
  }, [documentId]);

  const save = async () => {
    if (!rows) return;
    setBusy(true);
    const r = await postJson(`/api/project-documents/${documentId}/access`, { permissions: permissionsOf(rows) }, 'PUT');
    setBusy(false);
    if (!r.success) { setError(r.error!); return; }
    onSaved(String(r.message), typeof r.note === 'string' ? r.note : undefined);
  };

  return (
    <Modal title={`Access: ${title}`} wide onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--cn-text-muted)' }}>
          Choose who can open this document. This only changes this document; their project level stays the same.
        </p>
        {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
        {rows === null
          ? !error && <div className="flex justify-center py-8"><span className="w-6 h-6 border-2 border-[#FE4A23]/30 border-t-[#FE4A23] rounded-full animate-spin" /></div>
          : <AccessTable rows={rows} disabled={busy} onChange={(id, level) => setRows(list => list && list.map(x => (x.userId === id ? { ...x, level } : x)))} />}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button primary onClick={() => void save()} disabled={busy || !rows}>{busy ? 'Saving…' : 'Save access'}</Button>
        </div>
      </div>
    </Modal>
  );
}
