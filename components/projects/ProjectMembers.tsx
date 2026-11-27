'use client';

import { useState } from 'react';
import { UserPlus, X, MailWarning } from 'lucide-react';
import { Button, inputClass, inputStyle, postJson } from './shared';
import { ACCESS_LABELS, ACCESS_HINTS, PROJECT_LEVELS, type ProjectAccess } from '@/lib/projects/rules';
import { formatDate } from './shared';

export interface Member { userId: number; access: ProjectAccess; name: string; email: string; role: string; removedAccount: boolean; isMe: boolean }
export interface Person { id: number; name: string; email: string; role: string }
export interface AccessRequest { userId: number; name: string; email: string; role: string; requestedAt: string | null }

const LEVELS = PROJECT_LEVELS;
// Only Super Admin, HM, Mod and the project's original creator make people Creators; other Creators can
// give the other levels
const levelsFor = (canAssignCreator: boolean) => (canAssignCreator ? LEVELS : LEVELS.filter(l => l !== 'manager'));
const LEVEL_HINT = ACCESS_HINTS;

// The project's members. Creators (and Super Admin / HM / Mod) add people, change their level or
// remove them, and answer access requests; Google access to the restricted documents follows at once.
// Super Admin, HM and Mod are never listed: they have access to every project already.
export default function ProjectMembers({ projectId, members, people, requests = [], canManage, fullAccess, canAssignCreator = fullAccess, onChanged }: {
  projectId: number;
  members: Member[];
  people: Person[];
  requests?: AccessRequest[];
  canManage: boolean;
  fullAccess: boolean;
  canAssignCreator?: boolean;
  onChanged: (message: string, note?: string, error?: boolean) => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [addId, setAddId] = useState('');
  const [addLevel, setAddLevel] = useState<ProjectAccess>('viewer');
  const [requestLevel, setRequestLevel] = useState<Record<number, ProjectAccess>>({});
  const choices = levelsFor(canAssignCreator);

  const save = async (userId: number, access: ProjectAccess | 'remove' | 'decline') => {
    setBusy(userId);
    const r = await postJson(`/api/projects/${projectId}/members`, { userId, access });
    setBusy(null);
    if (!r.success) { onChanged(r.error!, undefined, true); return; }
    if (userId === Number(addId)) setAddId('');
    onChanged(String(r.message), typeof r.note === 'string' ? r.note : undefined);
  };

  return (
    <div className="space-y-5">
      {canManage && requests.length > 0 && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--cn-accent)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--cn-text-primary)' }}>Access requests ({requests.length})</p>
          <ul className="space-y-3">
            {requests.map(q => (
              <li key={q.userId} className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1" style={{ flexBasis: '12rem' }}>
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--cn-text-primary)' }}>{q.name}</p>
                  <p className="text-xs break-all" style={{ color: 'var(--cn-text-faint)' }}>{q.email || 'No email'}{q.requestedAt ? ` · asked ${formatDate(q.requestedAt)}` : ''}</p>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <select value={requestLevel[q.userId] ?? 'member'} disabled={busy !== null} aria-label={`Level for ${q.name}`}
                    onChange={e => setRequestLevel(v => ({ ...v, [q.userId]: e.target.value as ProjectAccess }))}
                    className="h-9 rounded-lg border px-3 text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#FE4A23]/30" style={{ ...inputStyle, width: '8rem' }}>
                    {choices.map(l => <option key={l} value={l}>{ACCESS_LABELS[l]}</option>)}
                  </select>
                  <Button small primary disabled={busy !== null} onClick={() => void save(q.userId, requestLevel[q.userId] ?? 'member')}>Add</Button>
                  <Button small disabled={busy !== null} onClick={() => void save(q.userId, 'decline')}>Decline</Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="divide-y" style={{ borderColor: 'var(--cn-border)' }}>
        {members.length === 0 && <li className="py-3 text-sm" style={{ color: 'var(--cn-text-muted)' }}>No members yet.</li>}
        {members.map(m => {
          // A Creator doesn't change their own level here, so they can't lock themselves out, and only
          // Super Admin, HM, Mod and the original creator change another Creator
          const editable = canManage && (fullAccess || (!m.isMe && (canAssignCreator || m.access !== 'manager')));
          return (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 py-4" style={{ borderColor: 'var(--cn-border)' }}>
              <div className="min-w-0 flex-1" style={{ flexBasis: '12rem' }}>
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--cn-text-primary)' }}>
                  {m.name}{m.isMe && <span className="font-normal" style={{ color: 'var(--cn-text-faint)' }}> (you)</span>}
                </p>
                <p className="text-xs break-all inline-flex items-center gap-1" style={{ color: m.email ? 'var(--cn-text-faint)' : '#d97706' }}>
                  {m.removedAccount ? 'Account removed' : m.email || <><MailWarning className="w-3 h-3" /> No email: no Google access</>}
                </p>
              </div>
              {editable ? (
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <select value={m.access} disabled={busy !== null || m.removedAccount} aria-label={`Access for ${m.name}`}
                    onChange={e => void save(m.userId, e.target.value as ProjectAccess)}
                    className="h-9 rounded-lg border px-3 text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#FE4A23]/30" style={{ ...inputStyle, width: '8rem' }}>
                    {choices.map(l => <option key={l} value={l}>{ACCESS_LABELS[l]}</option>)}
                  </select>
                  <button onClick={() => { if (confirm(`Remove ${m.name} from this project? Their Google access to its restricted documents is removed too.`)) void save(m.userId, 'remove'); }}
                    disabled={busy !== null} aria-label={`Remove ${m.name}`} title="Remove from project"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg cursor-pointer hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-red-500 disabled:opacity-50" style={{ color: '#ef4444' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <span className="text-xs font-semibold" style={{ color: 'var(--cn-text-muted)' }}>{ACCESS_LABELS[m.access]}</span>
              )}
            </li>
          );
        })}
      </ul>

      {canManage && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--cn-border)' }}>
          <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--cn-text-muted)' }}><UserPlus className="w-3.5 h-3.5" /> Add member</p>
          {people.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--cn-text-faint)' }}>Everyone is already in this project.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] gap-3">
              <select value={addId} onChange={e => setAddId(e.target.value)} aria-label="Person" className={`${inputClass} flex-1 min-w-0 basis-full cursor-pointer`} style={inputStyle}>
                <option value="">Choose a person…</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}{p.email ? ` · ${p.email}` : ' · no email'}</option>)}
              </select>
              <select value={addLevel} onChange={e => setAddLevel(e.target.value as ProjectAccess)} aria-label="Access" className={`${inputClass} w-auto cursor-pointer`} style={inputStyle}>
                {choices.map(l => <option key={l} value={l}>{ACCESS_LABELS[l]}</option>)}
              </select>
              <Button primary disabled={!addId || busy !== null} onClick={() => void save(Number(addId), addLevel)}>Add</Button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-2">{LEVELS.map(l => <div key={l} className="rounded-lg p-3" style={{ background: 'var(--cn-bg-input)' }}><p className="text-xs font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{ACCESS_LABELS[l]}</p><p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--cn-text-muted)' }}>{LEVEL_HINT[l]}</p></div>)}</div>
        </div>
      )}
    </div>
  );
}
