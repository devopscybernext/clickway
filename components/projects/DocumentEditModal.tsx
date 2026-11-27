'use client';

import { useState } from 'react';
import { postJson, Button, Modal, Notice, Field, inputClass, inputStyle } from './shared';
import { LINK_ROLES, LINK_ROLE_LABELS, type LinkRole } from '@/lib/projects/rules';

// Editing a document (the person who added it, Super Admin, HM and Mod): its title, who can open it,
// and for "Anyone with the link" whether the link lets people view or edit. A document added as a
// pasted link (not copied into the project's Drive) can only be renamed.

export interface EditableDocument {
  id: number; title: string; visibility: 'invite' | 'public'; linkRole: LinkRole; inDrive: boolean;
}

export default function DocumentEditModal({ doc, onClose, onSaved }: {
  doc: EditableDocument; onClose: () => void; onSaved: (message: string, note?: string) => void;
}) {
  const [title, setTitle] = useState(doc.title);
  const [visibility, setVisibility] = useState(doc.visibility);
  const [linkRole, setLinkRole] = useState<LinkRole>(doc.linkRole);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!title.trim()) { setError('Enter a title.'); return; }
    if (visibility !== doc.visibility && !confirm(visibility === 'invite'
      ? 'Make this document Project members only? The link stops working for anyone outside the project; members get access by their level.'
      : 'Make this document open to anyone with the link? Anyone who has the link will be able to ' + (linkRole === 'writer' ? 'edit' : 'view') + ' it.')) return;
    setBusy(true);
    setError('');
    const r = await postJson(`/api/project-documents/${doc.id}`, { title: title.trim(), visibility, linkRole }, 'PATCH');
    setBusy(false);
    if (!r.success) { setError(r.error!); return; }
    onSaved(String(r.message ?? 'Document saved.'), typeof r.note === 'string' ? r.note : undefined);
  };

  const choice = (value: 'public' | 'invite', label: string, hint: string) => (
    <label className="flex-1 min-w-[12rem] cursor-pointer rounded-xl border p-3"
      style={{ borderColor: visibility === value ? 'var(--cn-accent)' : 'var(--cn-border)', background: 'var(--cn-bg-input)', opacity: !doc.inDrive && value !== doc.visibility ? 0.5 : 1 }}>
      <input type="radio" name="visibility" value={value} checked={visibility === value} disabled={busy || !doc.inDrive}
        onChange={() => setVisibility(value)} className="mr-2 accent-[#FE4A23]" />
      <span className="text-sm font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{label}</span>
      <span className="block mt-1 text-xs" style={{ color: 'var(--cn-text-muted)' }}>{hint}</span>
    </label>
  );

  return (
    <Modal title="Edit document" onClose={busy ? () => {} : onClose}>
      <form onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-5">
        <Field label="Title">
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={255} disabled={busy} className={inputClass} style={inputStyle} />
        </Field>
        <div className="space-y-2">
          <p className="text-xs font-semibold" style={{ color: 'var(--cn-text-primary)' }}>Who can open it</p>
          <div className="flex flex-wrap gap-3">
            {choice('public', 'Anyone with the link', 'Everyone in the project, and anyone the link is sent to.')}
            {choice('invite', 'Project members only', 'Each member by their access level.')}
          </div>
          {!doc.inDrive && (
            <p className="text-xs" style={{ color: 'var(--cn-text-muted)' }}>This document links to a file outside the project&apos;s Drive, so its sharing is set in Google.</p>
          )}
        </div>
        {visibility === 'public' && doc.inDrive && (
          <Field label="People with the link can">
            <select value={linkRole} onChange={e => setLinkRole(e.target.value as LinkRole)} disabled={busy} className={`${inputClass} cursor-pointer`} style={inputStyle}>
              {LINK_ROLES.map(r => <option key={r} value={r}>{r === 'writer' ? 'Edit (Editor)' : 'View (Viewer)'}</option>)}
            </select>
          </Field>
        )}
        {visibility === 'public' && doc.inDrive && linkRole === 'reader' && (
          <p className="text-xs" style={{ color: 'var(--cn-text-muted)' }}>You and Super Admin, HM and Mod can still edit it.</p>
        )}
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex justify-end gap-2 border-t pt-5 border-[var(--cn-border)]">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" primary disabled={busy}>{busy ? 'Saving…' : `Save${visibility === 'public' && doc.inDrive ? ` · link: ${LINK_ROLE_LABELS[linkRole]}` : ''}`}</Button>
        </div>
      </form>
    </Modal>
  );
}
