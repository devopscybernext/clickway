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

// People outside the project given access to this one document
interface Guest { userId: number; name: string; email: string; level: DocLevel; removed?: boolean }
interface Candidate { id: number; name: string; email: string; role: string }
const GUEST_LEVELS: DocLevel[] = ['viewer', 'editor'];

// The "Access" button on a document: loads, changes and saves its people's levels, including people
// outside the project who can open only this document
export function DocumentAccessModal({ documentId, title, onClose, onSaved }: {
  documentId: number; title: string; onClose: () => void; onSaved: (message: string, note?: string) => void;
}) {
  const [rows, setRows] = useState<AccessRow[] | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [addId, setAddId] = useState('');
  const [addLevel, setAddLevel] = useState<DocLevel>('viewer');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await api(`/api/project-documents/${documentId}/access`);
      if (!r.success) { setError(r.error!); return; }
      setRows(r.people as AccessRow[]);
      setGuests((r.guests as Guest[]) ?? []);
      setCandidates((r.candidates as Candidate[]) ?? []);
    })();
  }, [documentId]);

  const addGuest = () => {
    const person = candidates.find(x => String(x.id) === addId);
    if (!person) return;
    setGuests(list => [...list.filter(g => g.userId !== person.id), { userId: person.id, name: person.name, email: person.email, level: addLevel }]);
    setCandidates(list => list.filter(x => x.id !== person.id));
    setAddId('');
  };
  const removeGuest = (g: Guest) => {
    setGuests(list => list.map(x => (x.userId === g.userId ? { ...x, removed: true } : x)));
  };

  const save = async () => {
    if (!rows) return;
    setBusy(true);
    const permissions = [
      ...permissionsOf(rows),
      ...guests.map(g => ({ userId: g.userId, level: g.removed ? 'none' : g.level })),
    ];
    const r = await postJson(`/api/project-documents/${documentId}/access`, { permissions }, 'PUT');
    setBusy(false);
    if (!r.success) { setError(r.error!); return; }
    onSaved(String(r.message), typeof r.note === 'string' ? r.note : undefined);
  };

  const shown = guests.filter(g => !g.removed);
  return (
    <Modal title={`Access: ${title}`} wide onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--cn-text-muted)' }}>
          Choose who can open this document. This only changes this document; their project level stays the same.
        </p>
        {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
        {rows === null
          ? !error && <div className="flex justify-center py-8"><span className="w-6 h-6 border-2 border-[#FE4A23]/30 border-t-[#FE4A23] rounded-full animate-spin" /></div>
          : (
            <>
              <p className="text-xs font-semibold" style={{ color: 'var(--cn-text-primary)' }}>Project members</p>
              <AccessTable rows={rows} disabled={busy} onChange={(id, level) => setRows(list => list && list.map(x => (x.userId === id ? { ...x, level } : x)))} />

              <div className="space-y-3 pt-2">
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--cn-text-primary)' }}>People outside the project</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>They can open only this document (from My Documents), not the rest of the project.</p>
                </div>
                {shown.length > 0 && (
                  <ul className="divide-y rounded-xl border" style={{ borderColor: 'var(--cn-border)' }}>
                    {shown.map(g => (
                      <li key={g.userId} className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ borderColor: 'var(--cn-border)' }}>
                        <div className="min-w-0 flex-1" style={{ flexBasis: '12rem' }}>
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--cn-text-primary)' }}>{g.name}</p>
                          <p className="text-xs break-all" style={{ color: 'var(--cn-text-faint)' }}>{g.email || 'No email: no Google access'} · Outside the project</p>
                        </div>
                        <select value={g.level} disabled={busy} aria-label={`Access to this document for ${g.name}`}
                          onChange={e => setGuests(list => list.map(x => (x.userId === g.userId ? { ...x, level: e.target.value as DocLevel } : x)))}
                          className="h-9 rounded-lg border px-3 text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#FE4A23]/30" style={{ ...inputStyle, width: '8.5rem' }}>
                          {GUEST_LEVELS.map(l => <option key={l} value={l}>{DOC_LEVEL_LABELS[l]}</option>)}
                        </select>
                        <Button small disabled={busy} onClick={() => removeGuest(g)}>Remove</Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <select value={addId} onChange={e => setAddId(e.target.value)} disabled={busy || candidates.length === 0} aria-label="Person outside the project"
                    className="h-9 min-w-0 flex-1 rounded-lg border px-3 text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#FE4A23]/30" style={{ ...inputStyle, flexBasis: '14rem' }}>
                    <option value="">{candidates.length ? 'Choose a person…' : 'Nobody else to add'}</option>
                    {candidates.map(x => <option key={x.id} value={x.id}>{x.name}{x.email ? ` (${x.email})` : ''}</option>)}
                  </select>
                  <select value={addLevel} onChange={e => setAddLevel(e.target.value as DocLevel)} disabled={busy} aria-label="Access"
                    className="h-9 rounded-lg border px-3 text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#FE4A23]/30" style={{ ...inputStyle, width: '8.5rem' }}>
                    {GUEST_LEVELS.map(l => <option key={l} value={l}>{DOC_LEVEL_LABELS[l]}</option>)}
                  </select>
                  <Button small disabled={busy || !addId} onClick={addGuest}>Add</Button>
                </div>
              </div>
            </>
          )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button primary onClick={() => void save()} disabled={busy || !rows}>{busy ? 'Saving…' : 'Save access'}</Button>
        </div>
      </div>
    </Modal>
  );
}
