'use client';

import { useState } from 'react';
import { X, Pencil } from 'lucide-react';
import { EDIT_KINDS, EditKind } from '@/lib/inhouseEdit';

// The edit form of one entry of a Cybernext InHouse page (Websites, Case Studies, Brand Kit, Documentations,
// Holiday Calendar, AI Tools). Shown to Super Admin and HM; saves through /api/inhouse/edit.

const inputStyle = { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)' };

export default function EntryEditModal({ kind, row, initial, onClose, onSaved }: {
  kind: EditKind;
  row: number;                                // the entry's __row handle
  initial: Record<string, string>;            // its current values by column name
  onClose: () => void;
  onSaved: () => void;
}) {
  const def = EDIT_KINDS[kind];
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(def.fields.map(f => [f.header, initial[f.header] ?? ''])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async () => {
    setBusy(true); setError(''); setErrors({});
    try {
      const res = await fetch('/api/inhouse/edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, row, values }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) { setError(json.error || 'Could not save.'); setErrors(json.errors ?? {}); return; }
      onSaved();
      onClose();
    } catch {
      setError('Could not save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label={`Edit ${def.label}`} className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl" style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--cn-border)' }}>
          <h3 className="flex items-center gap-2 font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>
            <Pencil className="w-4 h-4" style={{ color: 'var(--cn-accent)' }} /> Edit {def.label}
          </h3>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg cursor-pointer" style={{ color: 'var(--cn-text-muted)' }}><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); void save(); }} className="p-5 space-y-4">
          {def.fields.map(f => {
            const id = `edit-${f.header.replace(/\W+/g, '-')}`;
            const set = (v: string) => setValues(prev => ({ ...prev, [f.header]: v }));
            const options = f.kind === 'choice' ? [...new Set([...(f.options ?? []), ...(values[f.header] ? [values[f.header]] : [])])] : [];
            return (
              <div key={f.header}>
                <label htmlFor={id} className="block text-xs font-semibold mb-1" style={{ color: 'var(--cn-text-muted)' }}>
                  {f.header}{f.required ? ' *' : ''}
                </label>
                {f.kind === 'long' ? (
                  <textarea id={id} value={values[f.header]} onChange={e => set(e.target.value)} rows={3} className="w-full text-sm rounded-lg px-3 py-2 border focus:outline-none focus:ring-1 focus:ring-[#FE4A23]" style={inputStyle} />
                ) : f.kind === 'choice' ? (
                  <select id={id} value={values[f.header]} onChange={e => set(e.target.value)} className="w-full text-sm rounded-lg px-3 py-2 border focus:outline-none focus:ring-1 focus:ring-[#FE4A23] cursor-pointer" style={inputStyle}>
                    {!f.required && <option value="">—</option>}
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input id={id} value={values[f.header]} onChange={e => set(e.target.value)} className="w-full text-sm rounded-lg px-3 py-2 border focus:outline-none focus:ring-1 focus:ring-[#FE4A23]" style={inputStyle} />
                )}
                {(errors[f.header] || f.hint) && (
                  <p className="text-[11px] mt-1" style={{ color: errors[f.header] ? '#ef4444' : 'var(--cn-text-faint)' }}>{errors[f.header] || f.hint}</p>
                )}
              </div>
            );
          })}
          {error && <p role="alert" className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer border" style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)' }}>Cancel</button>
            <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60" style={{ background: 'var(--cn-accent)', color: '#fff' }}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// The small pencil button an entry shows to Super Admin and HM
export function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} data-testid="edit-entry"
      className="inline-flex items-center justify-center w-8 h-8 rounded-full cursor-pointer transition-all shrink-0"
      style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)', border: '1px solid var(--cn-border)' }}
      onMouseEnter={e => (e.currentTarget.style.color = 'var(--cn-accent)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'var(--cn-text-muted)')}>
      <Pencil className="w-3.5 h-3.5" />
    </button>
  );
}
