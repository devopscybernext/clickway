'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, UserPlus } from 'lucide-react';
import { api, postJson, Pill, Button, useFlash, inputClass, inputStyle } from './shared';
import styles from './ProjectSettings.module.css';

// Admin Portal → Projects: the always editors, email addresses that are Google editors on every
// "Project members only" document. Who may create projects is set by role; who is in a project is set
// on the project (Members), and nobody is added automatically.

interface AlwaysEditor { email: string; name: string; addedBy: string; addedAt: string | null }

export default function ProjectSettings() {
  const [editors, setEditors] = useState<AlwaysEditor[] | null>(null);
  const [newEditor, setNewEditor] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { flash, setFlash } = useFlash();

  const load = useCallback(async () => {
    const r = await api('/api/project-settings');
    if (!r.success) { setError(r.error!); return; }
    setError('');
    setEditors((r.alwaysEditors as AlwaysEditor[]) ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const saveEditor = async (action: 'add' | 'remove', email: string) => {
    if (action === 'remove' && !confirm(`Remove ${email}? They lose Google editor access to restricted documents, unless their project access gives it.`)) return;
    setBusy(true);
    const r = await postJson('/api/project-settings', { action, email });
    setBusy(false);
    setFlash(r.success ? { kind: 'ok', text: String(r.message ?? 'Saved.') } : { kind: 'error', text: r.error! });
    if (r.success) { if (action === 'add') setNewEditor(''); void load(); }
  };

  if (error) return <div className="p-3 sm:p-6"><div role="alert" className="rounded-lg px-4 py-3 text-sm" style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>{error}</div></div>;
  if (!editors) return <div className="flex justify-center py-16"><span className="w-7 h-7 border-2 border-[#FE4A23]/30 border-t-[#FE4A23] rounded-full animate-spin" /></div>;

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <div>
          <h2>Projects settings</h2>
          <p>Email addresses that can edit every restricted project document.</p>
        </div>
        <Pill tone={busy ? 'amber' : 'muted'}>{busy ? 'Saving changes…' : 'Changes save automatically'}</Pill>
      </header>
      {flash}

      {/* ── Always editors ── */}
      <section className={styles.section}>
        <div className={styles.heading}>
          <div>
            <h3>Always editors</h3>
            <p>These email addresses are Google editors on every &ldquo;Project members only&rdquo; document, in every project, including ones added later. They don&apos;t need a dashboard account or project membership.</p>
          </div>
          <Pill>{editors.length} {editors.length === 1 ? 'email' : 'emails'}</Pill>
        </div>
        <form className={styles.filters} onSubmit={e => { e.preventDefault(); if (newEditor.trim()) void saveEditor('add', newEditor); }}>
          <input type="email" value={newEditor} onChange={e => setNewEditor(e.target.value)} placeholder="name@cybernext.io" aria-label="Email to add"
            maxLength={191} className={`${inputClass} sm:max-w-sm`} style={inputStyle} />
          <Button type="submit" primary disabled={busy || !newEditor.trim()}><UserPlus className="w-4 h-4" /> Add email</Button>
        </form>
        <ul className={styles.editorList}>
          {editors.length === 0 && <li className={styles.editorEmpty}>No always editors.</li>}
          {editors.map(e => (
            <li key={e.email} className={styles.editor}>
              <div className="min-w-0">
                <span className="font-semibold break-all" style={{ color: 'var(--cn-text-primary)' }}>{e.email}</span>
                <span className="block text-xs mt-0.5" style={{ color: 'var(--cn-text-faint)' }}>
                  {e.name ? `${e.name} · dashboard account` : 'No dashboard account'}
                </span>
              </div>
              <Pill tone="green">Editor</Pill>
              <button type="button" onClick={() => void saveEditor('remove', e.email)} disabled={busy} aria-label={`Remove ${e.email}`} title="Remove"
                className="p-1.5 rounded-lg cursor-pointer disabled:opacity-50" style={{ color: '#ef4444' }}>
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>

    </div>
  );
}
