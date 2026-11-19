'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, ExternalLink, LayoutTemplate } from 'lucide-react';
import { api, Button, Field, Modal, Notice, Pill, cardStyle, inputClass, inputStyle, newKey, formatDate, useFlash } from './shared';
import { UPLOAD_ACCEPT, MAX_UPLOAD_BYTES } from '@/lib/projects/formats';

interface Template { id: number; name: string; category: string; platform: string; description: string; mimeType: string; createdBy: string; createdAt: string | null; url: string }

// Document templates. Everyone who adds documents picks from them; Super Admin and HM add and remove them.
export default function TemplatesPage() {
  const [list, setList] = useState<Template[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const { flash, setFlash } = useFlash();

  const load = useCallback(async () => {
    const r = await api('/api/project-templates');
    if (!r.success) { setError(r.error!); return; }
    setError('');
    setList(r.templates as Template[]);
    setCanManage(!!r.canManage);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const remove = async (t: Template) => {
    if (!confirm(`Remove the template "${t.name}"? Documents already made from it are not affected.`)) return;
    const r = await api(`/api/project-templates/${t.id}`, { method: 'DELETE' });
    setFlash(r.success ? { kind: 'ok', text: 'Template removed.' } : { kind: 'error', text: r.error! });
    if (r.success) void load();
  };

  return (
    <div className="space-y-4">
      {canManage && <div className="flex justify-end"><Button primary onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> New template</Button></div>}
      {flash}
      {error ? (
        <div className="cn-card rounded-lg border p-6 text-sm" style={{ ...cardStyle, color: '#ef4444' }}>{error}</div>
      ) : list === null ? (
        <div className="flex justify-center py-16"><span className="w-7 h-7 border-2 border-[#FE4A23]/30 border-t-[#FE4A23] rounded-full animate-spin" /></div>
      ) : list.length === 0 ? (
        <div className="cn-card rounded-lg border py-16 text-center" style={cardStyle}>
          <LayoutTemplate className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--cn-text-faint)' }} />
          <p className="text-sm" style={{ color: 'var(--cn-text-muted)' }}>No templates yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
          {list.map(t => (
            <div key={t.id} className="cn-card min-w-0 rounded-2xl border p-5 sm:p-6 flex flex-col gap-3" style={cardStyle}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="min-w-0 font-bold break-words" style={{ color: 'var(--cn-text-primary)' }}>{t.name}</h3>
                <Pill tone={t.mimeType.includes('spreadsheet') ? 'green' : 'blue'}>{t.mimeType.includes('spreadsheet') ? 'Sheet' : 'Doc'}</Pill>
              </div>
              <p className="text-xs" style={{ color: 'var(--cn-text-muted)' }}>{[t.category, t.platform].filter(Boolean).join(' · ')}</p>
              {t.description && <p className="text-sm" style={{ color: 'var(--cn-text-primary)' }}>{t.description}</p>}
              <div className="flex flex-wrap items-center gap-3 mt-auto pt-4">
                <span className="text-xs leading-relaxed min-w-0 break-words flex-1" style={{ color: 'var(--cn-text-faint)' }}>{[t.createdBy && `Added by ${t.createdBy}`, formatDate(t.createdAt)].filter(Boolean).join(' · ')}</span>
                {t.url && <a href={t.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: 'var(--cn-accent)' }}><ExternalLink className="w-3.5 h-3.5" /> Open</a>}
                {canManage && (
                  <button onClick={() => void remove(t)} aria-label={`Remove ${t.name}`} title="Remove template" className="p-1.5 rounded-lg cursor-pointer" style={{ color: '#ef4444' }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {adding && <TemplateFormModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setFlash({ kind: 'ok', text: 'Template added.' }); void load(); }} />}
    </div>
  );
}

function TemplateFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [key] = useState(newKey);
  const [v, setV] = useState({ name: '', category: '', platform: '', description: '', url: '' });
  const [source, setSource] = useState<'upload' | 'url'>('url');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(x => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    setError('');
    if (source === 'upload' && !file) { setError('Choose a file to upload.'); return; }
    if (file && file.size > MAX_UPLOAD_BYTES) { setError('Choose a file no larger than 10 MB.'); return; }
    const form = new FormData();
    form.set('creationKey', key);
    Object.entries(v).forEach(([k, val]) => form.set(k, val));
    form.set('source', source);
    if (source === 'upload' && file) form.set('upload', file);
    setBusy(true);
    const r = await api('/api/project-templates', { method: 'POST', body: form });
    setBusy(false);
    if (!r.success) { setError(r.error!); return; }
    onSaved();
  };

  return (
    <Modal wide title="New template" onClose={busy ? () => {} : onClose}>
      <form onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-6">
        <Field label="Name *" htmlFor="tf-name"><input id="tf-name" required maxLength={200} value={v.name} onChange={set('name')} className={inputClass} style={inputStyle} autoFocus /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Category *" htmlFor="tf-category"><input id="tf-category" required maxLength={100} value={v.category} onChange={set('category')} placeholder="Proposal, SOW, Report…" className={inputClass} style={inputStyle} /></Field>
          <Field label="Platform" htmlFor="tf-platform"><input id="tf-platform" maxLength={100} value={v.platform} onChange={set('platform')} className={inputClass} style={inputStyle} /></Field>
        </div>
        <Field label="Description" htmlFor="tf-description"><textarea id="tf-description" rows={2} maxLength={5000} value={v.description} onChange={set('description')} className={inputClass} style={inputStyle} /></Field>
        <div className="flex gap-2">
          {(['url', 'upload'] as const).map(s => (
            <button key={s} type="button" onClick={() => setSource(s)} aria-pressed={source === s}
              className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold cursor-pointer border"
              style={source === s ? { background: 'var(--cn-accent)', color: '#fff', borderColor: 'var(--cn-accent)' } : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)' }}>
              {s === 'url' ? 'Google file link' : 'Upload a file'}
            </button>
          ))}
        </div>
        {source === 'url' ? (
          <Field label="Google Docs or Sheets link *" htmlFor="tf-url" hint="The workspace Google account must be able to open it.">
            <input id="tf-url" type="url" required maxLength={2048} value={v.url} onChange={set('url')} placeholder="https://docs.google.com/…" className={inputClass} style={inputStyle} />
          </Field>
        ) : (
          <Field label="File *" htmlFor="tf-file" hint="Saved as a Google Doc or Sheet in the templates folder. Up to 10 MB.">
            <input id="tf-file" type="file" accept={UPLOAD_ACCEPT} onChange={e => setFile(e.target.files?.[0] ?? null)} className={`${inputClass} cursor-pointer`} style={inputStyle} />
          </Field>
        )}
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex flex-wrap justify-end gap-2 border-t pt-5 border-[var(--cn-border)]">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" primary disabled={busy}>{busy ? 'Saving…' : 'Add template'}</Button>
        </div>
      </form>
    </Modal>
  );
}
