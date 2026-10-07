'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileSpreadsheet, FileText, FileDown } from 'lucide-react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';

// The PDF sections a user can choose from — Overview, Checklist and Comments
// are always in; the weekly / monthly updates are optional. Keys are the
// lower-cased column names (plus 'overview').
export const DOWNLOAD_PDF_OPTIONS: { key: string; label: string; locked?: boolean }[] = [
  { key: 'overview', label: 'Overview page — total, current & pending hours + project list', locked: true },
  { key: 'checklist', label: 'Checklist', locked: true },
  { key: 'comments', label: 'Comments', locked: true },
  { key: 'week1', label: 'Week1' },
  { key: 'week2', label: 'Week2' },
  { key: 'week3', label: 'Week3' },
  { key: 'week4', label: 'Week4' },
  { key: 'week5', label: 'Week5' },
  { key: 'monthly', label: 'Monthly' },
];

export const ALL_DOWNLOAD_PDF_KEYS = () => new Set(DOWNLOAD_PDF_OPTIONS.map(o => o.key));

// "Download Report" popup: choose the format first. Excel exports the table
// as it is on screen; PDF is one page per project (like the details popup) and
// lets the user pick which weekly / monthly updates to add.
export default function DownloadReportDialog({ rowCount, scopeNote, initialPdfSelection, onExcel, onPdf, onCancel }: {
  rowCount: number;
  /** One line under the title, e.g. "Only the 12 projects matching your filters are included." */
  scopeNote: string;
  initialPdfSelection: Set<string>;
  onExcel: () => void;
  onPdf: (include: Set<string>) => void;
  onCancel: () => void;
}) {
  useBodyScrollLock();
  const [format, setFormat] = useState<'xlsx' | 'pdf'>('xlsx');
  const locked = DOWNLOAD_PDF_OPTIONS.filter(o => o.locked);
  const optional = DOWNLOAD_PDF_OPTIONS.filter(o => !o.locked);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(optional.filter(o => initialPdfSelection.has(o.key)).map(o => o.key)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const toggle = (key: string) =>
    setSelected(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const confirm = () => {
    if (format === 'xlsx') onExcel();
    else onPdf(new Set([...locked.map(o => o.key), ...selected]));
  };

  const rowCls = 'flex items-center gap-3 px-2 py-2 rounded-md text-sm';
  const formats = [
    { id: 'xlsx' as const, label: 'Excel sheet', hint: '.xlsx · the table as shown', Icon: FileSpreadsheet },
    { id: 'pdf' as const, label: 'PDF', hint: 'overview + one page per project', Icon: FileText },
  ];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Download report"
        className="rounded-xl w-full flex flex-col"
        style={{ background: 'var(--cn-bg-card)', maxWidth: 460, maxHeight: '90vh', border: '1px solid var(--cn-border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3">
          <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>Download report</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--cn-text-muted)' }}>{scopeNote}</p>
        </div>

        <div className="px-5 pb-3 grid grid-cols-2 gap-2">
          {formats.map(f => {
            const on = format === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                aria-pressed={on}
                className="flex flex-col items-start gap-1 rounded-lg px-3 py-2.5 text-left cursor-pointer transition-all"
                style={on
                  ? { background: 'rgba(254,74,35,0.12)', border: '1px solid var(--cn-accent)', color: 'var(--cn-text-primary)' }
                  : { background: 'var(--cn-bg-input)', border: '1px solid var(--cn-border)', color: 'var(--cn-text-primary)' }}
              >
                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                  <f.Icon className="w-4 h-4" style={{ color: 'var(--cn-accent)' }} />
                  {f.label}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--cn-text-muted)' }}>{f.hint}</span>
              </button>
            );
          })}
        </div>

        {format === 'pdf' && (
          <div className="px-3 overflow-y-auto overscroll-contain border-t pt-2" style={{ borderColor: 'var(--cn-border)' }}>
            <p className="px-2 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>Always included</p>
            {locked.map(o => (
              <div key={o.key} className={rowCls} style={{ color: 'var(--cn-text-secondary)' }}>
                <input type="checkbox" checked disabled readOnly aria-label={`${o.label} (always included)`} className="accent-[#FE4A23] opacity-70" />
                {o.label}
              </div>
            ))}
            <div className="flex items-center justify-between px-2 pt-4 pb-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>Add if you want</p>
              <div className="flex items-center gap-3">
                <button onClick={() => setSelected(new Set(optional.map(o => o.key)))} className="text-xs font-semibold cursor-pointer hover:opacity-80" style={{ color: 'var(--cn-accent)' }}>Select all</button>
                <span style={{ color: 'var(--cn-border)' }}>·</span>
                <button onClick={() => setSelected(new Set())} className="text-xs font-semibold cursor-pointer hover:opacity-80" style={{ color: 'var(--cn-text-muted)' }}>Clear</button>
              </div>
            </div>
            {optional.map(o => (
              <label key={o.key} className={`${rowCls} cursor-pointer hover:bg-[var(--cn-bg-hover)]`} style={{ color: 'var(--cn-text-primary)' }}>
                <input type="checkbox" checked={selected.has(o.key)} onChange={() => toggle(o.key)} className="accent-[#FE4A23] cursor-pointer" />
                {o.label}
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-5 py-4 mt-1 border-t" style={{ borderColor: 'var(--cn-border)' }}>
          <span className="text-xs" style={{ color: 'var(--cn-text-muted)' }}>
            {rowCount} project{rowCount === 1 ? '' : 's'}
            {format === 'pdf' ? ` · ${selected.size} of ${optional.length} optional added` : ''}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all"
              style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>
              Cancel
            </button>
            <button onClick={confirm}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all"
              style={{ background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }}>
              {format === 'xlsx' ? <FileSpreadsheet className="w-4 h-4" /> : <FileDown className="w-4 h-4" />}
              {format === 'xlsx' ? 'Download Excel' : 'Download PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
