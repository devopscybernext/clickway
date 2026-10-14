'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { FileText, FileSpreadsheet, X, AlertCircle } from 'lucide-react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { TEAM_LABELS, type ReportTeam } from '@/lib/productivity';
import { startOfDay, type ReportTask } from '@/lib/reportTasks';
import type { ReportDoc } from '@/lib/reportDoc';
import { downloadReportDocPdf } from '@/lib/reportDocPdf';
import { downloadReportDocExcel } from '@/lib/reportDocExcel';

export type Format = 'pdf' | 'xlsx';

// Local date <-> "YYYY-MM-DD" (toISOString would shift the day by the UTC offset)
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fromIso = (s: string): Date | null => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

export const inputStyle = { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)' };
export const chipClass = 'px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-all border';
export const chipStyle = (on: boolean) => on
  ? { background: 'var(--cn-accent)', color: '#fff', borderColor: 'var(--cn-accent)' }
  : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-secondary)', borderColor: 'var(--cn-border)' };

export const SectionLabel = ({ children }: { children: ReactNode }) => (
  <h3 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>{children}</h3>
);

// The popup every report opens: title, a scrolling body, and a footer with the
// count, Cancel and Generate.
export function DialogFrame({ title, intro, format, busy, canGenerate, footer, error, onClose, onGenerate, children }: {
  title: string;
  intro: string;
  format: Format;
  busy: boolean;
  canGenerate: boolean;
  footer: string;
  error: string;
  onClose: () => void;
  onGenerate: () => void;
  children: ReactNode;
}) {
  useBodyScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => { if (!busy) onClose(); }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="rounded-xl w-full flex flex-col"
        style={{ background: 'var(--cn-bg-card)', maxWidth: 560, maxHeight: '92vh', border: '1px solid var(--cn-border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>
              {title} — {format === 'pdf' ? 'PDF' : 'Excel'}
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--cn-text-muted)' }}>{intro}</p>
          </div>
          <button onClick={onClose} disabled={busy} title="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-50"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-4 overflow-y-auto overscroll-contain space-y-5">
          {children}
          {error && <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--cn-border)' }}>
          <span className="text-xs" style={{ color: 'var(--cn-text-muted)' }}>{footer}</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all disabled:opacity-50"
              style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>
              Cancel
            </button>
            <button onClick={onGenerate} disabled={!canGenerate}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }}>
              {busy
                ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : format === 'pdf' ? <FileText className="w-4 h-4" /> : <FileSpreadsheet className="w-4 h-4" />}
              {busy ? 'Generating…' : format === 'pdf' ? 'Generate PDF' : 'Generate Excel'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export interface Preset { key: string; label: string; range: () => [string, string] }

// From / to dates with quick presets. `children` slots in extra controls under the dates.
export function DateRangeSection({ from, to, setFrom, setTo, presets, invalid, children }: {
  from: string; to: string;
  setFrom: (v: string) => void; setTo: (v: string) => void;
  presets: Preset[];
  invalid: boolean;
  children?: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2 gap-2">
        <SectionLabel>Date range</SectionLabel>
        <div className="flex flex-wrap justify-end gap-1.5">
          {presets.map(p => (
            <button key={p.key} onClick={() => { const [a, b] = p.range(); setFrom(a); setTo(b); }} className={chipClass} style={chipStyle(false)}>{p.label}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} aria-label="From date"
          className="flex-1 text-sm rounded-lg px-2.5 py-2 border focus:outline-none focus:ring-1 focus:ring-[#FE4A23]" style={inputStyle} />
        <span className="text-xs" style={{ color: 'var(--cn-text-muted)' }}>to</span>
        <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} aria-label="To date"
          className="flex-1 text-sm rounded-lg px-2.5 py-2 border focus:outline-none focus:ring-1 focus:ring-[#FE4A23]" style={inputStyle} />
      </div>
      {children}
      {invalid && <p className="text-xs mt-2" style={{ color: '#ef4444' }}>The start date is after the end date.</p>}
    </section>
  );
}

// Tickable list of resources with a live count beside each name.
export function ResourceSection({ people, selected, setSelected, countOf, unit }: {
  people: string[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  countOf: (name: string) => number;
  /** "task" -> "3 tasks" */
  unit: string;
}) {
  const toggle = (name: string) => {
    const n = new Set(selected);
    if (n.has(name)) n.delete(name); else n.add(name);
    setSelected(n);
  };
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <SectionLabel>Resources</SectionLabel>
        <div className="flex items-center gap-3 text-xs font-semibold">
          <button onClick={() => setSelected(new Set(people))} className="cursor-pointer hover:opacity-80" style={{ color: 'var(--cn-accent)' }}>Select all</button>
          <span style={{ color: 'var(--cn-border)' }}>·</span>
          <button onClick={() => setSelected(new Set())} className="cursor-pointer hover:opacity-80" style={{ color: 'var(--cn-text-muted)' }}>Clear</button>
        </div>
      </div>
      {people.length === 0 ? (
        <p className="text-sm py-4 text-center" style={{ color: 'var(--cn-text-muted)' }}>No resources found in the task data.</p>
      ) : (
        <div className="rounded-lg border divide-y" style={{ borderColor: 'var(--cn-border)' }}>
          {people.map(p => {
            const n = countOf(p);
            return (
              <label key={p} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-[var(--cn-bg-hover)] text-sm" style={{ borderColor: 'var(--cn-border)' }}>
                <input type="checkbox" checked={selected.has(p)} onChange={() => toggle(p)} className="accent-[#FE4A23] cursor-pointer" />
                <span className="flex-1" style={{ color: 'var(--cn-text-primary)' }}>{p}</span>
                <span className="text-xs tabular-nums" style={{ color: n ? 'var(--cn-text-secondary)' : 'var(--cn-text-faint)' }}>
                  {n} {unit}{n === 1 ? '' : 's'}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function Hint({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'warn' }) {
  return (
    <p className="text-xs flex items-start gap-1.5" style={{ color: tone === 'warn' ? '#b45309' : 'var(--cn-text-muted)' }}>
      <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}

// ─── Helpers every report popup uses ─────────────────────────────────────────
export interface DialogProps {
  format: Format;
  team: ReportTeam;
  roster: string[];
  tasks: ReportTask[];
  people: string[];
  onClose: () => void;
}

export const today0 = () => startOfDay(new Date());
export const teamSuffix = (team: ReportTeam) => (team === 'web' ? '' : ` · ${TEAM_LABELS[team].team}`);

export async function exportDoc(doc: ReportDoc, format: Format) {
  if (format === 'pdf') await downloadReportDocPdf(doc);
  else await downloadReportDocExcel(doc);
}

// Busy / error handling around generating a file; closes the popup when done
export function useGenerate(onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (task: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await task();
      onClose();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not generate the report. Please try again.');
      setBusy(false);
    }
  };
  return { busy, error, run };
}

export const rangePresets = (extra: Preset[] = []): Preset[] => [
  { key: 'month', label: 'This month', range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(n)]; } },
  { key: 'last', label: 'Last month', range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), iso(new Date(n.getFullYear(), n.getMonth(), 0))]; } },
  { key: 'three', label: 'Last 3 months', range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth() - 2, 1)), iso(n)]; } },
  ...extra,
  { key: 'all', label: 'All time', range: () => ['', ''] },
];
