'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderKanban, FileText } from 'lucide-react';
import { api, postJson, cardStyle, useFlash, savePin, type ProjectSummary } from './shared';
import ProjectList from './ProjectList';
import ProjectDetail from './ProjectDetail';
import ProjectFormModal from './ProjectFormModal';
import DocumentsPage from './DocumentsPage';
import TemplatesPage from './TemplatesPage';

export type ProjectsSubTab = 'all' | 'projects' | 'documents' | 'templates';

// Cybernext InHouse → Documents:
//   All Projects   every project, for everyone. One you're in opens the project page; one you're not in
//                  can't be opened and offers Request Access, which tells its creator (notification bell).
//   My Projects    the projects you're in (cards → the project page), with My Documents as a sub-tab:
//                  every document in those projects.
//   Templates      full access.
// `focus` opens one project (a click on an access notification in the bell); `members` also opens its
// Members popup, where an access request is answered.
// Data comes from /api/projects/directory, /api/projects, /api/project-documents and
// /api/project-templates; every rule is checked again on the server.
export default function ProjectsSection({ subTab, onSubTabChange, hasAccess = true, focus }: {
  subTab: ProjectsSubTab;
  onSubTabChange: (t: ProjectsSubTab) => void;
  hasAccess?: boolean;
  focus?: { projectId: number; n: number; members?: boolean };
}) {
  const [mine, setMine] = useState<ProjectSummary[]>([]);
  const [all, setAll] = useState<ProjectSummary[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { flash, setFlash } = useFlash();

  const isAll = subTab === 'all';

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api(isAll ? '/api/projects/directory' : '/api/projects');
    setLoading(false);
    if (!r.success) { setLoadError(r.error!); return; }
    setLoadError('');
    (isAll ? setAll : setMine)(r.projects as ProjectSummary[]);
    setCanCreate(!!r.canCreate);
  }, [isAll]);
  useEffect(() => { if (subTab === 'all' || subTab === 'projects') void load(); }, [load, subTab]);

  // Without Projects access only All Projects is available
  useEffect(() => { if (!hasAccess && subTab !== 'all') onSubTabChange('all'); }, [hasAccess, subTab, onSubTabChange]);

  // Picking a page in the menu shows that page's list again (or the project chosen on My Documents)
  const openNext = useRef<number | null>(null);
  useEffect(() => {
    setOpen(openNext.current);
    openNext.current = null;
  }, [subTab]);

  // A notification asked for this project
  const [membersKey, setMembersKey] = useState(0);
  useEffect(() => {
    if (!focus) return;
    setOpen(focus.projectId);
    if (focus.members) setMembersKey(focus.n);
  }, [focus]);

  const requestAccess = async (project: ProjectSummary) => {
    const r = await postJson(`/api/projects/${project.id}/request-access`, {});
    if (!r.success) { setFlash({ kind: 'error', text: r.error! }); return; }
    setAll(list => list.map(p => (p.id === project.id ? { ...p, requested: true } : p)));
    setFlash({ kind: 'ok', text: r.message ?? 'Request sent.' });
  };

  const changed = () => { void load(); setRefreshKey(k => k + 1); };

  // Pinning shows at once; it is put back if the server refuses
  const togglePin = async (project: ProjectSummary) => {
    const pinned = !project.pinned;
    const set = (v: boolean) => (isAll ? setAll : setMine)(list => list.map(p => (p.id === project.id ? { ...p, pinned: v } : p)));
    set(pinned);
    const r = await savePin('project', project.id, pinned);
    if (!r.success) { set(!pinned); setFlash({ kind: 'error', text: r.error! }); }
  };

  if (subTab === 'templates') return <TemplatesPage />;

  // My Projects / My Documents switch
  const mySwitch = !isAll && (
    <div role="tablist" aria-label="My projects or my documents" className="inline-flex gap-1 rounded-xl border p-1" style={{ ...cardStyle, borderColor: 'var(--cn-border)' }}>
      {([['projects', 'My Projects', FolderKanban], ['documents', 'My Documents', FileText]] as const).map(([id, label, Icon]) => (
        <button key={id} type="button" role="tab" aria-selected={subTab === id} onClick={() => onSubTabChange(id)}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold cursor-pointer transition-colors"
          style={subTab === id ? { background: 'var(--cn-accent)', color: '#fff' } : { color: 'var(--cn-text-muted)' }}>
          <Icon className="w-3.5 h-3.5" /> {label}
        </button>
      ))}
    </div>
  );

  if (subTab === 'documents') {
    return (
      <div className="space-y-4">
        {mySwitch}
        <DocumentsPage refreshKey={refreshKey} onOpenProject={id => { openNext.current = id; onSubTabChange('projects'); }} />
      </div>
    );
  }

  const openProject = (id: number) => {
    const project = (isAll ? all : mine).find(p => p.id === id);
    if (!isAll || project?.access) setOpen(id);
  };

  return (
    <div className="space-y-4">
      {!open && mySwitch}
      {flash}
      {open !== null ? (
        <ProjectDetail key={open} projectId={open} onBack={() => setOpen(null)} onChanged={changed}
          openMembersKey={focus?.members && focus.projectId === open ? membersKey : 0} />
      ) : loadError ? (
        <div className="cn-card rounded-lg border p-6 text-sm" style={{ ...cardStyle, color: '#ef4444' }}>{loadError}</div>
      ) : (
        <ProjectList
          projects={isAll ? all : mine} loading={loading} canCreate={canCreate}
          onOpen={openProject} onCreate={() => setCreating(true)} onTogglePin={p => void togglePin(p)}
          onRequestAccess={isAll ? requestAccess : undefined}
          title={isAll ? 'All projects' : 'My projects'}
          subtitle={isAll
            ? 'Every project in Cybernext. Check here before creating a new one; ask for access to join a project you are not in.'
            : 'The projects you are in, with their documents and team.'}
          emptyText={isAll ? 'No projects have been created yet.' : undefined}
        />
      )}
      {creating && (
        <ProjectFormModal
          onClose={() => setCreating(false)}
          onSaved={(id, message) => { setCreating(false); setFlash({ kind: 'ok', text: message }); changed(); setOpen(id); }} />
      )}
    </div>
  );
}
