'use client';

import { useState } from 'react';
import { Modal, Field, Button, Notice, inputClass, inputStyle, newKey, api } from './shared';
import { UPLOAD_ACCEPT, MAX_UPLOAD_BYTES } from '@/lib/projects/formats';

export interface TemplateOption { id: number; name: string; category: string; platform: string; mimeType: string }
type Source = 'template' | 'upload' | 'url';

const SOURCES: { id: Source; label: string }[] = [
  { id: 'template', label: 'From a template' },
  { id: 'upload', label: 'Upload a file' },
  { id: 'url', label: 'Paste a link' },
];

// Adding a document to a project: a copy of a template, an uploaded file (converted to a Google Doc or
// Sheet), or a pasted Google Docs / Sheets link. "Project members only" documents are copied into the
// project's private folder and shared with each member at their level.
export default function DocumentFormModal({ projectId, templates, onClose, onSaved }: {
  projectId: number;
  templates: TemplateOption[];
  onClose: () => void;
  onSaved: (message: string, note?: string) => void;
}) {
  const [key] = useState(newKey);
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<'invite' | 'public'>('invite');
  const [source, setSource] = useState<Source>(templates.length ? 'template' : 'upload');
  const [templateId, setTemplateId] = useState(templates[0] ? String(templates[0].id) : '');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    if (source === 'upload') {
      if (!file) { setError('Choose a file to upload.'); return; }
      if (file.size > MAX_UPLOAD_BYTES) { setError('Choose a file no larger than 10 MB.'); return; }
    }
    if (source === 'template' && !templateId) { setError('Choose a template.'); return; }
    const form = new FormData();
    form.set('creationKey', key);
    form.set('title', title);
    form.set('visibility', visibility);
    form.set('source', source);
    if (source === 'template') form.set('templateId', templateId);
    if (source === 'url') form.set('url', url);
    if (source === 'upload' && file) form.set('upload', file);
    setBusy(true);
    const r = await api(`/api/projects/${projectId}/documents`, { method: 'POST', body: form });
    setBusy(false);
    if (!r.success) { setError(r.error!); return; }
    onSaved(String(r.message ?? 'Document added.'), typeof r.note === 'string' ? r.note : undefined);
  };

  return (
    <Modal wide title="Add document" onClose={busy ? () => {} : onClose}>
      <form onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-6">
        <Field label="Document title *" htmlFor="df-title">
          <input id="df-title" required maxLength={255} value={title} onChange={e => setTitle(e.target.value)} className={inputClass} style={inputStyle} autoFocus />
        </Field>

        <Field label="Who can open it">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([['invite', 'Project members only', 'Restricted. Each member gets Google access at their level.'], ['public', 'Anyone with the link', 'Viewable by anyone who has the link.']] as const).map(([v, label, hint]) => (
              <label key={v} className="flex items-start gap-2 rounded-xl border p-4 cursor-pointer text-sm"
                style={{ ...inputStyle, borderColor: visibility === v ? 'var(--cn-accent)' : 'var(--cn-border)' }}>
                <input type="radio" name="visibility" checked={visibility === v} onChange={() => setVisibility(v)} className="mt-0.5 accent-[#FE4A23]" />
                <span>
                  <span className="font-semibold block">{label}</span>
                  <span className="text-[11px]" style={{ color: 'var(--cn-text-faint)' }}>{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </Field>

        <div role="tablist" aria-label="Document source" className="flex flex-wrap gap-2">
          {SOURCES.map(s => (
            <button key={s.id} type="button" role="tab" aria-selected={source === s.id} onClick={() => setSource(s.id)}
              className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold cursor-pointer border"
              style={source === s.id
                ? { background: 'var(--cn-accent)', color: '#fff', borderColor: 'var(--cn-accent)' }
                : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)' }}>
              {s.label}
            </button>
          ))}
        </div>

        {source === 'template' && (
          templates.length === 0
            ? <Notice kind="info">No templates yet. Super Admin or HM can add them on the Templates page.</Notice>
            : (
              <Field label="Template *" htmlFor="df-template">
                <select id="df-template" value={templateId} onChange={e => setTemplateId(e.target.value)} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.category} · {t.name}{t.platform ? ` (${t.platform})` : ''}{t.mimeType.includes('spreadsheet') ? ' · Sheet' : ' · Doc'}</option>
                  ))}
                </select>
              </Field>
            )
        )}
        {source === 'upload' && (
          <Field label="File *" htmlFor="df-file" hint="Word, PDF, text, Excel, CSV or OpenDocument, up to 10 MB. It becomes a Google Doc or Sheet.">
            <input id="df-file" type="file" accept={UPLOAD_ACCEPT} onChange={e => setFile(e.target.files?.[0] ?? null)} className={`${inputClass} cursor-pointer`} style={inputStyle} />
          </Field>
        )}
        {source === 'url' && (
          <Field label="Google Docs or Sheets link *" htmlFor="df-url"
            hint={visibility === 'invite' ? 'A restricted copy is made in the project folder; the original is not changed.' : 'The link is saved as it is.'}>
            <input id="df-url" type="url" required maxLength={2048} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://docs.google.com/…" className={inputClass} style={inputStyle} />
          </Field>
        )}

        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex flex-wrap justify-end gap-2 border-t pt-5 border-[var(--cn-border)]">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" primary disabled={busy || (source === 'template' && templates.length === 0)}>{busy ? 'Adding… (this can take a moment)' : 'Add document'}</Button>
        </div>
      </form>
    </Modal>
  );
}
