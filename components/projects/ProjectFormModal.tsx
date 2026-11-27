'use client';

import { useState } from 'react';
import { Modal, Field, Button, Notice, inputClass, inputStyle, newKey, postJson } from './shared';
import { PROJECT_STATUSES, STATUS_LABELS, type ProjectStatus } from '@/lib/projects/rules';

export interface ProjectFields { name: string; client: string; platform: string; website: string; description: string; status: ProjectStatus }
const EMPTY: ProjectFields = { name: '', client: '', platform: '', website: '', description: '', status: 'planning' };

// New project (creates its Drive folder; the creator becomes its Creator) or editing an existing one.
export default function ProjectFormModal({ projectId, initial, onClose, onSaved }: {
  projectId?: number;                  // set when editing
  initial?: ProjectFields;
  onClose: () => void;
  onSaved: (id: number, message: string) => void;
}) {
  const editing = projectId !== undefined;
  const [values, setValues] = useState<ProjectFields>(initial ?? EMPTY);
  const [key] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof ProjectFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setValues(v => ({ ...v, [k]: e.target.value }));

  const save = async () => {
    setBusy(true); setError('');
    const r = editing
      ? await postJson(`/api/projects/${projectId}`, values, 'PATCH')
      : await postJson('/api/projects', { ...values, creationKey: key });
    setBusy(false);
    if (!r.success) { setError(r.error!); return; }
    onSaved(editing ? projectId : Number(r.id), String(r.message ?? 'Saved.'));
  };

  return (
    <Modal title={editing ? 'Edit project' : 'New project'} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-4">
        <Field label="Project name *" htmlFor="pf-name">
          <input id="pf-name" required maxLength={200} value={values.name} onChange={set('name')} className={inputClass} style={inputStyle} autoFocus />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Client name" htmlFor="pf-client">
            <input id="pf-client" maxLength={200} value={values.client} onChange={set('client')} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Platform" htmlFor="pf-platform">
            <input id="pf-platform" maxLength={100} value={values.platform} onChange={set('platform')} placeholder="WordPress, Shopify…" className={inputClass} style={inputStyle} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Website" htmlFor="pf-website" hint="e.g. example.com">
            <input id="pf-website" maxLength={2048} value={values.website} onChange={set('website')} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Status *" htmlFor="pf-status">
            <select id="pf-status" value={values.status} onChange={set('status')} className={`${inputClass} cursor-pointer`} style={inputStyle}>
              {PROJECT_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Description" htmlFor="pf-description">
          <textarea id="pf-description" rows={3} maxLength={5000} value={values.description} onChange={set('description')} className={inputClass} style={inputStyle} />
        </Field>
        {!editing && (
          <p className="text-xs" style={{ color: 'var(--cn-text-faint)' }}>
            A Google Drive folder is made for the project. You become its Creator; add the rest of the team from Members.
          </p>
        )}
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex flex-wrap justify-end gap-2 border-t pt-5 border-[var(--cn-border)]">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" primary disabled={busy}>{busy ? 'Saving…' : editing ? 'Save' : 'Create project'}</Button>
        </div>
      </form>
    </Modal>
  );
}
