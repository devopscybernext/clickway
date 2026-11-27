'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertCircle, CheckCircle2, Star, ChevronDown } from 'lucide-react';
import type { ProjectAccess, ProjectStatus } from '@/lib/projects/rules';

// Small pieces shared by the Projects pages, in the dashboard's own look (cn-card, --cn-* colours).

export const inputStyle = { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)' };
export const inputClass = 'w-full min-w-0 text-sm rounded-xl px-3 py-2.5 border transition-colors focus:outline-none focus:ring-2 focus:ring-[#FE4A23]/30';
export const cardStyle = { background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' };

export interface ProjectSummary {
  id: number; name: string; client: string; platform: string; website: string; status: ProjectStatus; archived: boolean;
  driveFolderUrl: string; createdBy: string; createdAt: string | null; updatedAt: string | null;
  members: number; documents: number; access: ProjectAccess | null; pinned: boolean;   // access null: not in the project (All Projects)
  requested?: boolean;   // All Projects: the person has asked for access
}

// A one-off key per form, so a double-click or a retry never creates two projects or documents
export function newKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export interface ApiResult { success: boolean; error?: string; message?: string; note?: string; [k: string]: unknown }

export async function api(url: string, init?: RequestInit): Promise<ApiResult> {
  try {
    const res = await fetch(url, { cache: 'no-store', ...init });
    const json = await res.json().catch(() => ({})) as ApiResult;
    if (!res.ok || !json.success) return { ...json, success: false, error: json.error || 'Something went wrong. Please try again.' };
    return json;
  } catch {
    return { success: false, error: 'Could not reach the server. Check your connection and try again.' };
  }
}

export const postJson = (url: string, body: unknown, method = 'POST') =>
  api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Opens a document straight in a new tab. The tab is opened on the click (so it isn't blocked as a
// popup), then sent to the document once the server has made sure the person's Google access is ready.
export async function openDocumentInNewTab(id: number): Promise<string | null> {
  const tab = window.open('', '_blank');
  if (tab) {
    try { tab.document.title = 'Opening document…'; tab.document.body.innerHTML = '<p style="font-family:sans-serif;padding:24px;color:#555">Opening document…</p>'; } catch { /* cross-origin once navigated */ }
  }
  const r = await api(`/api/project-documents/${id}/open`, { method: 'POST' });
  if (!r.success || typeof r.url !== 'string') {
    tab?.close();
    return r.error || 'Could not open this document.';
  }
  if (tab) {
    tab.opener = null;
    tab.location.href = r.url;
  } else {
    window.location.href = r.url; // popups blocked: open it here instead
  }
  return null;
}

export function formatDate(v: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden rounded-2xl border shadow-2xl`} style={cardStyle}>
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 sm:px-6 py-5 border-b" style={{ borderColor: 'var(--cn-border)' }}>
          <h3 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg cursor-pointer hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-[#FE4A23]" style={{ color: 'var(--cn-text-muted)' }}><X className="w-4 h-4" /></button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6">{children}</div>
      </div>
    </div>, document.body
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-semibold mb-2" style={{ color: 'var(--cn-text-muted)' }}>{label}</label>
      {children}
      {hint && <p className="text-xs leading-relaxed mt-1.5" style={{ color: 'var(--cn-text-faint)' }}>{hint}</p>}
    </div>
  );
}

export function Button({ children, onClick, primary, danger, disabled, type = 'button', small, title }: {
  children: React.ReactNode; onClick?: () => void; primary?: boolean; danger?: boolean; disabled?: boolean;
  type?: 'button' | 'submit'; small?: boolean; title?: string;
}) {
  const style = primary
    ? { background: 'var(--cn-accent)', color: '#fff', borderColor: 'var(--cn-accent)' }
    : danger
      ? { background: 'transparent', color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)' }
      : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)' };
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold border cursor-pointer transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FE4A23] disabled:opacity-50 disabled:cursor-not-allowed ${small ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'}`}
      style={style}>
      {children}
    </button>
  );
}

export function Notice({ kind, children, onClose }: { kind: 'error' | 'ok' | 'info'; children: React.ReactNode; onClose?: () => void }) {
  const color = kind === 'error' ? '#ef4444' : kind === 'ok' ? '#22c55e' : 'var(--cn-text-muted)';
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
      style={{ borderColor: 'var(--cn-border)', background: 'var(--cn-bg-input)', color }}>
      {kind === 'error' ? <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}
      <span className="flex-1" style={{ color: kind === 'info' ? 'var(--cn-text-primary)' : color }}>{children}</span>
      {onClose && <button onClick={onClose} aria-label="Dismiss" className="cursor-pointer" style={{ color: 'var(--cn-text-faint)' }}><X className="w-3.5 h-3.5" /></button>}
    </div>
  );
}

// A message that clears itself after a while (successes) or stays until dismissed (errors)
export function useFlash() {
  const [flash, setFlash] = useState<{ kind: 'error' | 'ok' | 'info'; text: string } | null>(null);
  useEffect(() => {
    if (!flash || flash.kind === 'error') return;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);
  const node = flash ? <Notice kind={flash.kind} onClose={() => setFlash(null)}>{flash.text}</Notice> : null;
  return { flash: node, setFlash };
}

export function Pill({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'accent' | 'green' | 'amber' | 'blue' }) {
  const colors: Record<string, string> = { muted: 'var(--cn-text-muted)', accent: 'var(--cn-accent)', green: '#16a34a', amber: '#d97706', blue: '#2563eb' };
  return (
    <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap"
      style={{ color: colors[tone], borderColor: 'var(--cn-border)', background: 'var(--cn-bg-input)' }}>
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<ProjectStatus, 'muted' | 'accent' | 'green' | 'amber' | 'blue'> = {
  planning: 'blue', in_progress: 'accent', on_hold: 'amber', completed: 'green',
};

// Pins a project or a document to the top of the signed-in person's own lists
export const savePin = (kind: 'project' | 'document', id: number, pinned: boolean) =>
  postJson('/api/project-pins', { kind, id, pinned });

export function PinButton({ pinned, label, onToggle, disabled }: { pinned: boolean; label: string; onToggle: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-pressed={pinned} aria-label={`${pinned ? 'Unpin' : 'Pin'} ${label}`} title={pinned ? 'Unpin' : 'Pin to the top'}
      disabled={disabled}
      onClick={e => { e.stopPropagation(); onToggle(); }}
      onKeyDown={e => e.stopPropagation()}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg cursor-pointer transition-colors hover:bg-black/5 disabled:opacity-50"
      style={{ color: pinned ? 'var(--cn-accent)' : 'var(--cn-text-faint)' }}>
      <Star className="w-5 h-5" fill={pinned ? 'currentColor' : 'none'} />
    </button>
  );
}

// A collapsible group heading ("Pinned (2)" / "Other (14)")
export function GroupHeading({ label, count, open, onToggle }: { label: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open}
      className="inline-flex items-center gap-2 text-sm font-semibold cursor-pointer" style={{ color: 'var(--cn-text-muted)' }}>
      <ChevronDown className="w-4 h-4 transition-transform" style={{ transform: open ? 'none' : 'rotate(-90deg)' }} />
      {label} ({count})
    </button>
  );
}
