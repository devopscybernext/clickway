'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Globe, Users, FileText, Lock, Link2 } from 'lucide-react';
import { api, Button, Pill, STATUS_TONE, cardStyle, formatDate } from './shared';
import { STATUS_LABELS, type ProjectAccess, type ProjectStatus } from '@/lib/projects/rules';

const SOURCE_LABELS: Record<string, string> = { template: 'Template', upload: 'Upload', url: 'Link' };

interface Overview {
  project: { id: number; name: string; client: string; platform: string; website: string; description: string; status: ProjectStatus; archived: boolean; createdBy: string; createdAt: string | null };
  documents: { title: string; source: string; visibility: string; mimeType: string; template: string; createdBy: string; createdAt: string | null }[];
  members: { name: string; access: ProjectAccess }[];
  access: ProjectAccess | null;
}

// All Projects → a project the person isn't in: what it is, who created it, and which documents it has
// (titles and details only; they can't be opened from here), so people can ask to be added instead of
// creating a similar project.
export default function ProjectOverview({ projectId, onBack, onOpenFull }: { projectId: number; onBack: () => void; onOpenFull: (id: number) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void api(`/api/projects/${projectId}/overview`).then(r => {
      if (!live) return;
      if (!r.success) setError(r.error!);
      else setData(r as unknown as Overview);
    });
    return () => { live = false; };
  }, [projectId]);

  const back = (
    <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold cursor-pointer" style={{ color: 'var(--cn-text-muted)' }}>
      <ArrowLeft className="w-4 h-4" /> All projects
    </button>
  );
  if (error) return <div className="space-y-4">{back}<div className="rounded-2xl border p-6 text-sm" style={{ ...cardStyle, color: '#ef4444' }}>{error}</div></div>;
  if (!data) return <div className="space-y-4">{back}<div className="flex justify-center py-16"><span className="w-7 h-7 border-2 border-[#FE4A23]/30 border-t-[#FE4A23] rounded-full animate-spin" /></div></div>;

  const p = data.project;
  const creators = data.members.filter(m => m.access === 'manager');

  return (
    <div className="space-y-4">
      {back}
      <section className="rounded-2xl border p-6 space-y-4" style={cardStyle}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold break-words" style={{ color: 'var(--cn-text-primary)' }}>{p.name}</h2>
              <Pill tone={STATUS_TONE[p.status]}>{STATUS_LABELS[p.status]}</Pill>
              {p.archived && <Pill tone="amber">Archived</Pill>}
            </div>
            <p className="text-sm mt-1" style={{ color: 'var(--cn-text-muted)' }}>
              {[p.client, p.platform, p.createdBy && `Created by ${p.createdBy}`, formatDate(p.createdAt)].filter(Boolean).join(' · ')}
            </p>
          </div>
          {data.access && <Button primary onClick={() => onOpenFull(p.id)}>Open project</Button>}
        </div>
        {p.description && <p className="text-sm whitespace-pre-line" style={{ color: 'var(--cn-text-primary)' }}>{p.description}</p>}
        {p.website && (
          <a href={p.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline" style={{ color: 'var(--cn-accent)' }}>
            <Globe className="w-4 h-4" /> {p.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </a>
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm" style={{ color: 'var(--cn-text-muted)' }}>
          <span className="inline-flex items-center gap-1.5"><Users className="w-4 h-4" /> {data.members.length} member{data.members.length === 1 ? '' : 's'}</span>
          <span className="inline-flex items-center gap-1.5"><FileText className="w-4 h-4" /> {data.documents.length} document{data.documents.length === 1 ? '' : 's'}</span>
        </div>
      </section>

      {!data.access && (
        <div className="flex items-start gap-2 rounded-2xl border px-5 py-4 text-sm" style={{ ...cardStyle, color: 'var(--cn-text-muted)' }}>
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            You&apos;re not a member of this project, so you can see its documents but not open them.
            {creators.length > 0 ? ` Ask ${creators.map(c => c.name).join(' or ')} to add you if you need them.` : ' Ask its creator to add you if you need them.'}
          </span>
        </div>
      )}

      <section className="rounded-2xl border" style={cardStyle}>
        <h3 className="px-5 py-4 border-b font-semibold flex items-center gap-2" style={{ color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)' }}>
          <FileText className="w-4 h-4" style={{ color: 'var(--cn-accent)' }} /> Documents
        </h3>
        {data.documents.length === 0 ? (
          <p className="px-5 py-6 text-sm" style={{ color: 'var(--cn-text-muted)' }}>No documents yet.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--cn-border)' }}>
            {data.documents.map((d, i) => (
              <li key={`${d.title}-${i}`} className="flex flex-wrap items-center gap-3 px-5 py-3" style={{ borderColor: 'var(--cn-border)' }}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold break-words" style={{ color: 'var(--cn-text-primary)' }}>{d.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--cn-text-faint)' }}>
                    {[d.mimeType.includes('spreadsheet') ? 'Google Sheet' : d.mimeType ? 'Google Doc' : 'Link',
                      (SOURCE_LABELS[d.source] ?? d.source) + (d.template ? `: ${d.template}` : ''),
                      d.createdBy && `Added by ${d.createdBy}`, formatDate(d.createdAt)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {d.visibility === 'invite'
                  ? <Pill tone="blue"><Lock className="w-3 h-3 mr-1" /> Members only</Pill>
                  : <Pill><Link2 className="w-3 h-3 mr-1" /> Anyone with link</Pill>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
