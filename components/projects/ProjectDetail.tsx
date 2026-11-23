'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Globe, Pencil, Archive, ArchiveRestore, RefreshCw, Plus, ExternalLink, Trash2, Lock, Link2, Users, FileText } from 'lucide-react';
import { api, postJson, Button, Modal, Pill, PinButton, STATUS_TONE, cardStyle, formatDate, openDocumentInNewTab, useFlash, savePin } from './shared';
import ProjectFormModal from './ProjectFormModal';
import DocumentFormModal, { type TemplateOption } from './DocumentFormModal';
import ProjectMembers, { type Member, type Person } from './ProjectMembers';
import { ACCESS_LABELS, STATUS_LABELS, type ProjectAccess, type ProjectStatus } from '@/lib/projects/rules';

interface Detail {
  project: { id: number; name: string; client: string; platform: string; website: string; description: string; status: ProjectStatus; archived: boolean; driveFolderUrl: string; createdBy: string; createdAt: string | null };
  access: ProjectAccess; canManage: boolean; canAdd: boolean; fullAccess: boolean;
  members: Member[];
  documents: { id: number; title: string; source: string; visibility: 'invite' | 'public'; mimeType: string; template: string; createdBy: string; createdAt: string | null; pendingSharing: boolean; canDelete: boolean; pinned: boolean }[];
  people: Person[];
  templates: TemplateOption[];
}

const SOURCE_LABELS: Record<string, string> = { template: 'Template', upload: 'Upload', url: 'Link' };

// One project: its details, documents and members.
export default function ProjectDetail({ projectId, onBack, onChanged }: { projectId: number; onBack: () => void; onChanged: () => void }) {
  const [data, setData] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { flash, setFlash } = useFlash();

  const load = useCallback(async () => {
    const r = await api(`/api/projects/${projectId}`);
    if (!r.success) { setLoadError(r.error!); return; }
    setLoadError('');
    setData(r as unknown as Detail);
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  const changed = (text: string, note?: string, error?: boolean) => {
    setFlash({ kind: error ? 'error' : note ? 'info' : 'ok', text: note ? `${text} ${note}` : text });
    if (!error) { void load(); onChanged(); }
  };

  const archive = async (archived: boolean) => {
    if (archived && !confirm('Archive this project? It moves to the Archived list; nothing is deleted.')) return;
    setBusy(true);
    const r = await postJson(`/api/projects/${projectId}`, { archived }, 'PATCH');
    setBusy(false);
    changed(r.success ? (archived ? 'Project archived.' : 'Project restored.') : r.error!, undefined, !r.success);
  };
  const retry = async () => {
    setBusy(true);
    const r = await api(`/api/projects/${projectId}/sharing`, { method: 'POST' });
    setBusy(false);
    changed(r.success ? String(r.message) : r.error!, typeof r.note === 'string' ? r.note : undefined, !r.success);
  };
  // Pinned documents go to the top of the list (for this person only)
  const togglePin = async (id: number, pinned: boolean) => {
    const set = (v: boolean) => setData(cur => cur && {
      ...cur,
      documents: cur.documents.map(d => (d.id === id ? { ...d, pinned: v } : d))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id - a.id),
    });
    set(pinned);
    const r = await savePin('document', id, pinned);
    if (!r.success) { set(!pinned); setFlash({ kind: 'error', text: r.error! }); }
  };
  const open = async (id: number) => {
    const error = await openDocumentInNewTab(id);
    if (error) setFlash({ kind: 'error', text: error });
  };
  const remove = async (id: number, title: string) => {
    if (!confirm(`Delete "${title}"? Everyone's access is removed and the file is moved to Google Drive Trash.`)) return;
    setBusy(true);
    const r = await api(`/api/project-documents/${id}`, { method: 'DELETE' });
    setBusy(false);
    changed(r.success ? 'Document deleted.' : r.error!, undefined, !r.success);
  };

  const back = (
    <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold cursor-pointer" style={{ color: 'var(--cn-text-muted)' }}>
      <ArrowLeft className="w-4 h-4" /> All projects
    </button>
  );
  if (loadError) return <div className="space-y-4">{back}<div className="cn-card rounded-lg border p-6 text-sm" style={{ ...cardStyle, color: '#ef4444' }}>{loadError}</div></div>;
  if (!data) return <div className="space-y-4">{back}<div className="flex justify-center py-16"><span className="w-7 h-7 border-2 border-[#FE4A23]/30 border-t-[#FE4A23] rounded-full animate-spin" /></div></div>;

  const { project: p } = data;
  const pending = data.documents.some(d => d.pendingSharing);

  return (
    <div className="space-y-4">
      {back}
      {!membersOpen && flash}

      {/* ── Project ── */}
      <section className="cn-card min-w-0 rounded-2xl border p-5 sm:p-6 space-y-4" style={cardStyle}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight break-words" style={{ color: 'var(--cn-text-primary)' }}>{p.name}</h2>
              <Pill tone={STATUS_TONE[p.status]}>{STATUS_LABELS[p.status]}</Pill>
              {p.archived && <Pill tone="amber">Archived</Pill>}
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--cn-text-muted)' }}>
              {[p.client, p.platform, p.createdBy && `Created by ${p.createdBy}`, formatDate(p.createdAt)].filter(Boolean).join(' · ')}
              {' · '}Your access: {ACCESS_LABELS[data.access]}
            </p>
          </div>
          {data.canManage && (
            <div className="flex flex-wrap gap-2">
              <Button small onClick={() => setEditing(true)} disabled={busy}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
              <Button small onClick={() => void archive(!p.archived)} disabled={busy}>
                {p.archived ? <><ArchiveRestore className="w-3.5 h-3.5" /> Restore</> : <><Archive className="w-3.5 h-3.5" /> Archive</>}
              </Button>
              <Button small onClick={() => void retry()} disabled={busy} title="Bring every restricted document's Google access in line with the members">
                <RefreshCw className="w-3.5 h-3.5" /> Retry sharing
              </Button>
            </div>
          )}
        </div>
        {p.description && <p className="text-sm whitespace-pre-line" style={{ color: 'var(--cn-text-primary)' }}>{p.description}</p>}
        <div className="flex flex-wrap items-center gap-4">
          <Button small onClick={() => setMembersOpen(true)}><Users className="w-4 h-4" /> Members ({data.members.length})</Button>
          {p.website && (
            <a href={p.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline" style={{ color: 'var(--cn-accent)' }}>
              <Globe className="w-4 h-4" /> {p.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            </a>
          )}
        </div>
        {pending && data.canManage && (
          <p className="text-xs" style={{ color: '#d97706' }}>Some Google sharing is still pending. Use Retry sharing to finish it.</p>
        )}
      </section>

      <div className="min-w-0">
        {/* ── Documents ── */}
        <section className="cn-card min-w-0 overflow-hidden rounded-2xl border" style={cardStyle}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 border-b" style={{ borderColor: 'var(--cn-border)' }}>
            <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--cn-text-primary)' }}><FileText className="w-4 h-4" style={{ color: 'var(--cn-accent)' }} /> Documents</h3>
            {data.canAdd && <Button small primary onClick={() => setAdding(true)}><Plus className="w-3.5 h-3.5" /> Add document</Button>}
          </div>
          {data.documents.length === 0 ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: 'var(--cn-text-muted)' }}>No documents yet.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--cn-border)' }}>
              {data.documents.map(d => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-4" style={{ borderColor: 'var(--cn-border)' }}>
                  <div className="min-w-0 basis-full sm:basis-48 flex-1">
                    <p className="text-sm font-semibold break-words" style={{ color: 'var(--cn-text-primary)' }}>{d.title}</p>
                    <p className="text-xs leading-relaxed break-words" style={{ color: 'var(--cn-text-faint)' }}>
                      {[d.mimeType.includes('spreadsheet') ? 'Google Sheet' : d.mimeType ? 'Google Doc' : 'Link', SOURCE_LABELS[d.source] + (d.template ? `: ${d.template}` : ''), d.createdBy && `Added by ${d.createdBy}`, formatDate(d.createdAt)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {d.visibility === 'invite'
                    ? <Pill tone="blue"><Lock className="w-3 h-3 mr-1" /> Members only</Pill>
                    : <Pill><Link2 className="w-3 h-3 mr-1" /> Anyone with link</Pill>}
                  {d.pendingSharing && data.canManage && <Pill tone="amber">Sharing pending</Pill>}
                  <div className="flex shrink-0 items-center gap-2">
                  <Button small onClick={() => void open(d.id)}><ExternalLink className="w-3.5 h-3.5" /> Open</Button>
                  {d.canDelete && (
                    <button onClick={() => void remove(d.id, d.title)} disabled={busy} aria-label={`Delete ${d.title}`} title="Delete document"
                      className="p-1.5 rounded-lg cursor-pointer disabled:opacity-50" style={{ color: '#ef4444' }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <PinButton pinned={d.pinned} label={d.title} onToggle={() => void togglePin(d.id, !d.pinned)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>


      </div>

      {membersOpen && (
        <Modal title="Project members" wide onClose={() => setMembersOpen(false)}>
          <div className="space-y-5">
            <div className="rounded-xl border p-4" style={{ ...cardStyle, background: 'var(--cn-bg-input)' }}>
              <p className="font-semibold break-words" style={{ color: 'var(--cn-text-primary)' }}>{p.name}</p>
              <p className="mt-1 text-sm" style={{ color: 'var(--cn-text-muted)' }}>{data.members.length} member{data.members.length === 1 ? '' : 's'} · People with full access (set in Admin Portal → Projects) can open every project.</p>
            </div>
            {flash}
            <ProjectMembers projectId={projectId} members={data.members} people={data.people} canManage={data.canManage} fullAccess={data.fullAccess} onChanged={changed} />
          </div>
        </Modal>
      )}
      {editing && (
        <ProjectFormModal projectId={projectId}
          initial={{ name: p.name, client: p.client, platform: p.platform, website: p.website, description: p.description, status: p.status }}
          onClose={() => setEditing(false)}
          onSaved={(_, message) => { setEditing(false); changed(message); }} />
      )}
      {adding && (
        <DocumentFormModal projectId={projectId} templates={data.templates}
          onClose={() => setAdding(false)}
          onSaved={(message, note) => { setAdding(false); changed(message, note); }} />
      )}
    </div>
  );
}
