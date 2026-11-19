'use client';

import { useMemo, useState } from 'react';
import { Search, Plus, Users, FileText, Globe, FolderOpen, FolderKanban } from 'lucide-react';
import { Button, Pill, STATUS_TONE, inputClass, inputStyle, cardStyle, formatDate, type ProjectSummary } from './shared';
import { ACCESS_LABELS, PROJECT_STATUSES, STATUS_LABELS } from '@/lib/projects/rules';

// The project cards, with search, status and archive filters.
export default function ProjectList({ projects, loading, canCreate, onOpen, onCreate }: {
  projects: ProjectSummary[];
  loading: boolean;
  canCreate: boolean;
  onOpen: (id: number) => void;
  onCreate: () => void;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [archived, setArchived] = useState(false);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter(p =>
      p.archived === archived &&
      (!status || p.status === status) &&
      (!q || [p.name, p.client, p.platform, p.website, p.createdBy].some(v => v.toLowerCase().includes(q)))
    );
  }, [projects, search, status, archived]);
  const archivedCount = projects.filter(p => p.archived).length;

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--cn-text-primary)' }}>Project workspace</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--cn-text-muted)' }}>Keep your clients, documents, and team in one place.</p>
        </div>
        {canCreate && <Button primary onClick={onCreate}><Plus className="w-4 h-4" /> New project</Button>}
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border p-3 sm:p-4" style={cardStyle}>
        <div className="relative flex-1 min-w-0 basis-full sm:basis-60">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--cn-text-faint)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects, clients, websites…" aria-label="Search projects"
            className={`${inputClass} pl-9`} style={inputStyle} />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Status" className={`${inputClass} sm:w-auto cursor-pointer`} style={inputStyle}>
          <option value="">All statuses</option>
          {PROJECT_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--cn-border)' }} role="group" aria-label="Active or archived">
          {[false, true].map(a => (
            <button key={String(a)} onClick={() => setArchived(a)} aria-pressed={archived === a}
              className="px-3 py-2 text-sm font-semibold cursor-pointer"
              style={archived === a ? { background: 'var(--cn-accent)', color: '#fff' } : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}>
              {a ? `Archived${archivedCount ? ` (${archivedCount})` : ''}` : 'Active'}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs font-medium" style={{ color: 'var(--cn-text-muted)' }} aria-live="polite">
        {loading ? 'Loading projects…' : `${shown.length} ${archived ? 'archived' : 'active'} project${shown.length === 1 ? '' : 's'}`}
      </p>

      {loading && projects.length === 0 ? (
        <div className="flex justify-center py-16"><span className="w-7 h-7 border-2 border-[#FE4A23]/30 border-t-[#FE4A23] rounded-full animate-spin" /></div>
      ) : shown.length === 0 ? (
        <div className="cn-card rounded-lg border py-16 text-center" style={cardStyle}>
          <FolderKanban className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--cn-text-faint)' }} />
          <p className="text-sm" style={{ color: 'var(--cn-text-muted)' }}>
            {projects.length === 0
              ? canCreate ? 'No projects yet. Create the first one.' : 'You have not been added to any project yet.'
              : 'No projects match these filters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map(p => (
            <div key={p.id} role="button" tabIndex={0} onClick={() => onOpen(p.id)} onKeyDown={e => { if (e.key === 'Enter') onOpen(p.id); }}
              className="min-w-0 rounded-3xl border p-7 cursor-pointer transition-shadow hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FE4A23] flex flex-col gap-5" style={cardStyle}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold leading-tight tracking-tight break-words" style={{ color: 'var(--cn-text-primary)' }}>{p.name}</h3>
                  {p.client && <p className="mt-1 text-sm break-words" style={{ color: 'var(--cn-text-muted)' }}>{p.client}</p>}
                </div>
                <Pill tone={STATUS_TONE[p.status]}>{STATUS_LABELS[p.status]}</Pill>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--cn-text-muted)' }}>
                <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {p.members} member{p.members === 1 ? '' : 's'}</span>
                <span className="inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> {p.documents} document{p.documents === 1 ? '' : 's'}</span>
                {p.platform && <span>{p.platform}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-auto border-t pt-5" style={{ borderColor: 'var(--cn-border)' }}>
                {p.website && (
                  <a href={p.website} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-semibold transition-colors hover:brightness-95" style={{ background: 'var(--cn-accent)', color: '#fff' }}>
                    <Globe className="w-3.5 h-3.5" /> Website
                  </a>
                )}
                {p.driveFolderUrl && (
                  <a href={p.driveFolderUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full border text-xs font-semibold transition-colors hover:bg-black/5" style={{ color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)' }}>
                    <FolderOpen className="w-3.5 h-3.5" /> Drive folder
                  </a>
                )}
                <span className="w-full text-xs leading-relaxed break-words" style={{ color: 'var(--cn-text-faint)' }}>
                  {p.access ? ACCESS_LABELS[p.access] : ''}{p.createdBy ? ` · by ${p.createdBy}` : ''}{p.createdAt ? ` · ${formatDate(p.createdAt)}` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
