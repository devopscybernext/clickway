'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, ExternalLink, Trash2, Lock, Link2, FileText, Pin, ShieldCheck, Pencil } from 'lucide-react';
import { api, Button, Pill, PinButton, cardStyle, inputClass, inputStyle, formatDate, openDocumentInNewTab, useFlash, savePin } from './shared';
import styles from './DocumentsPage.module.css';
import { DocumentAccessModal } from './DocumentAccess';
import DocumentEditModal from './DocumentEditModal';
import { LINK_ROLE_LABELS, type LinkRole } from '@/lib/projects/rules';

interface Doc {
  id: number; title: string; source: string; visibility: 'invite' | 'public'; mimeType: string; createdBy: string; createdAt: string | null;
  projectId: number; projectName: string; archived: boolean; canDelete: boolean; pinned: boolean;
  canOpen: boolean; canSetAccess: boolean; linkRole: LinkRole; inDrive: boolean; canEdit: boolean;
  shared?: boolean;   // outside the project: only this document was shared with them
}

// Every document in the projects the person can see: the ones they pinned first, then newest first.
export default function DocumentsPage({ refreshKey, onOpenProject }: { refreshKey: number; onOpenProject: (id: number) => void }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [project, setProject] = useState('');
  const [busy, setBusy] = useState(false);
  const [accessFor, setAccessFor] = useState<Doc | null>(null);
  const [editingDoc, setEditingDoc] = useState<Doc | null>(null);
  const { flash, setFlash } = useFlash();

  const load = useCallback(async () => {
    const r = await api('/api/project-documents');
    if (!r.success) { setError(r.error!); return; }
    setError('');
    setDocs(r.documents as Doc[]);
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const projects = useMemo(() => [...new Map((docs ?? []).map(d => [d.projectId, d.projectName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [docs]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (docs ?? []).filter(d => (!project || String(d.projectId) === project) && (!q || [d.title, d.projectName, d.createdBy].some(v => v.toLowerCase().includes(q))));
  }, [docs, search, project]);

  const togglePin = async (d: Doc) => {
    const pinned = !d.pinned;
    const set = (v: boolean) => setDocs(list => (list ?? []).map(x => (x.id === d.id ? { ...x, pinned: v } : x))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id - a.id));
    set(pinned);
    const r = await savePin('document', d.id, pinned);
    if (!r.success) { set(!pinned); setFlash({ kind: 'error', text: r.error! }); }
  };

  const open = async (id: number) => {
    const e = await openDocumentInNewTab(id);
    if (e) setFlash({ kind: 'error', text: e });
  };
  const remove = async (d: Doc) => {
    if (!confirm(`Delete "${d.title}"? Everyone's access is removed and the file is moved to Google Drive Trash.`)) return;
    setBusy(true);
    const r = await api(`/api/project-documents/${d.id}`, { method: 'DELETE' });
    setBusy(false);
    setFlash(r.success ? { kind: 'ok', text: 'Document deleted.' } : { kind: 'error', text: r.error! });
    if (r.success) void load();
  };

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--cn-text-primary)' }}>My Documents</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--cn-text-muted)' }}>Find and open files across your projects.</p>
        </div>
        {docs !== null && !error && <Pill>{docs.length} document{docs.length === 1 ? '' : 's'}</Pill>}
      </header>
      {flash}
      <section className="min-w-0 space-y-4" aria-label="Project documents">
      <div className={styles.toolbar} style={cardStyle}>
        <div className="relative min-w-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--cn-text-faint)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents…" aria-label="Search documents" className={`${inputClass} pl-9`} style={inputStyle} />
        </div>
        <select value={project} onChange={e => setProject(e.target.value)} aria-label="Project" className={`${inputClass} cursor-pointer`} style={inputStyle}>
          <option value="">All projects</option>
          {projects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>
        {error ? (
          <p className="px-5 py-8 text-sm" style={{ color: '#ef4444' }}>{error}</p>
        ) : docs === null ? (
          <div className="flex justify-center py-16"><span className="w-7 h-7 border-2 border-[#FE4A23]/30 border-t-[#FE4A23] rounded-full animate-spin" /></div>
        ) : shown.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--cn-text-faint)' }} />
            <p className="text-sm" style={{ color: 'var(--cn-text-muted)' }}>{docs.length ? 'No documents match.' : 'No documents yet. Add them from a project.'}</p>
          </div>
        ) : (
          <div className={styles.tableWrap} style={cardStyle} role="region" aria-label="Documents table" tabIndex={0}>
            <table className={styles.table}>
              <thead><tr><th scope="col">Document</th><th scope="col">Project</th><th scope="col">Access</th><th scope="col" className={styles.actionsHeading}>Actions</th></tr></thead>
              <tbody>
            {shown.map(d => (
              <tr key={d.id}><td>
                <div className={styles.document}>
                  <span className={styles.icon}><FileText className="w-5 h-5" /></span>
                  <div className="min-w-0">
                  <p className="text-sm font-semibold break-words" style={{ color: 'var(--cn-text-primary)' }}>
                    {d.pinned && <Pin className="inline w-3.5 h-3.5 mr-1 -mt-0.5" fill="currentColor" style={{ color: 'var(--cn-accent)' }} aria-label="Pinned" />}
                    {d.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed break-words" style={{ color: 'var(--cn-text-muted)' }}>
                    {[d.createdBy && `Added by ${d.createdBy}`, d.createdAt && formatDate(d.createdAt)].filter(Boolean).join(' · ')}
                  </p>
                  </div>
                </div>
                </td><td>
                  {d.shared ? (
                    <>
                      <p className="text-sm font-medium break-words" style={{ color: 'var(--cn-text-primary)' }}>{d.projectName}</p>
                      <p className="mt-1 text-xs" style={{ color: 'var(--cn-text-muted)' }}>Shared with you (this document only)</p>
                    </>
                  ) : (
                    <button onClick={() => onOpenProject(d.projectId)} className="text-left text-sm font-medium break-words hover:underline cursor-pointer" style={{ color: 'var(--cn-accent)' }}>{d.projectName}</button>
                  )}
                  {d.archived && <p className="mt-1 text-xs" style={{ color: 'var(--cn-text-muted)' }}>Completed project</p>}
                </td><td>
                {d.visibility === 'invite'
                  ? <Pill tone="blue"><Lock className="w-3 h-3 mr-1" /> Members only</Pill>
                  : <Pill><Link2 className="w-3 h-3 mr-1" /> Anyone with link{d.inDrive ? ` · ${LINK_ROLE_LABELS[d.linkRole]}` : ''}</Pill>}
                {!d.canOpen && <span className="ml-1"><Pill tone="muted"><Lock className="w-3 h-3 mr-1" /> No access</Pill></span>}
                </td><td>
                <div className={styles.actions}>
                {d.canOpen && <Button small onClick={() => void open(d.id)}><ExternalLink className="w-3.5 h-3.5" /> Open</Button>}
                {d.canEdit && <Button small onClick={() => setEditingDoc(d)} title="Edit title and sharing"><Pencil className="w-3.5 h-3.5" /> Edit</Button>}
                {d.canSetAccess && <Button small onClick={() => setAccessFor(d)} title="Choose who can open this document"><ShieldCheck className="w-3.5 h-3.5" /> Access</Button>}
                {d.canDelete && (
                  <button onClick={() => void remove(d)} disabled={busy} aria-label={`Delete ${d.title}`} title="Delete document"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg cursor-pointer hover:bg-red-500/10 disabled:opacity-50" style={{ color: '#ef4444' }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <PinButton pinned={d.pinned} label={d.title} onToggle={() => void togglePin(d)} />
                </div>
              </td></tr>
            ))}
          </tbody></table></div>
        )}
        {docs !== null && !error && <p className="py-3 text-xs" style={{ borderColor: 'var(--cn-border)', color: 'var(--cn-text-muted)' }} aria-live="polite">Showing {shown.length} of {docs.length} documents</p>}
      </section>
      {editingDoc && (
        <DocumentEditModal doc={editingDoc} onClose={() => setEditingDoc(null)}
          onSaved={(message, note) => { setEditingDoc(null); setFlash({ kind: note ? 'info' : 'ok', text: note ? `${message} ${note}` : message }); void load(); }} />
      )}
      {accessFor && (
        <DocumentAccessModal documentId={accessFor.id} title={accessFor.title}
          onClose={() => setAccessFor(null)}
          onSaved={(message, note) => { setAccessFor(null); setFlash({ kind: note ? 'info' : 'ok', text: note ? `${message} ${note}` : message }); }} />
      )}
    </div>
  );
}
