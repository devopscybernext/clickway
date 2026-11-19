'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, cardStyle, useFlash, type ProjectSummary } from './shared';
import ProjectList from './ProjectList';
import ProjectDetail from './ProjectDetail';
import ProjectFormModal from './ProjectFormModal';
import DocumentsPage from './DocumentsPage';
import TemplatesPage from './TemplatesPage';

export type ProjectsSubTab = 'projects' | 'documents' | 'templates';

// The Projects menu: All Projects (cards → one project's page), Documents (every document the person
// can see) and Templates (Super Admin and HM). Data comes from /api/projects, /api/project-documents
// and /api/project-templates; every rule is checked again on the server.
export default function ProjectsSection({ subTab, onSubTabChange }: { subTab: ProjectsSubTab; onSubTabChange: (t: ProjectsSubTab) => void }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { flash, setFlash } = useFlash();

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api('/api/projects');
    setLoading(false);
    if (!r.success) { setLoadError(r.error!); return; }
    setLoadError('');
    setProjects(r.projects as ProjectSummary[]);
    setCanCreate(!!r.canCreate);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Picking a page in the menu shows that page's list again (or the project chosen on the Documents page)
  const openNext = useRef<number | null>(null);
  useEffect(() => { setOpenId(openNext.current); openNext.current = null; }, [subTab]);

  const changed = () => { void load(); setRefreshKey(k => k + 1); };

  if (subTab === 'templates') return <TemplatesPage />;
  if (subTab === 'documents') {
    return <DocumentsPage refreshKey={refreshKey} onOpenProject={id => { openNext.current = id; onSubTabChange('projects'); }} />;
  }

  return (
    <div className="space-y-4">
      {flash}
      {openId !== null ? (
        <ProjectDetail key={openId} projectId={openId} onBack={() => setOpenId(null)} onChanged={changed} />
      ) : loadError ? (
        <div className="cn-card rounded-lg border p-6 text-sm" style={{ ...cardStyle, color: '#ef4444' }}>{loadError}</div>
      ) : (
        <ProjectList projects={projects} loading={loading} canCreate={canCreate} onOpen={setOpenId} onCreate={() => setCreating(true)} />
      )}
      {creating && (
        <ProjectFormModal
          onClose={() => setCreating(false)}
          onSaved={(id, message) => { setCreating(false); setFlash({ kind: 'ok', text: message }); changed(); setOpenId(id); }} />
      )}
    </div>
  );
}
