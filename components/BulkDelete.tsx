'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';

// Picking several rows of a table (Tasks Assigned for Web and Marketing, PM Projects) to delete them
// in one go. Rows are identified by their __id. Selection lives only while Edit is on.
export function useRowSelection() {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const toggle = useCallback((id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);
  const setMany = useCallback((ids: string[], on: boolean) => setSelected(prev => {
    const next = new Set(prev);
    ids.forEach(id => (on ? next.add(id) : next.delete(id)));
    return next;
  }), []);
  const clear = useCallback(() => setSelected(new Set()), []);
  return { selected, toggle, setMany, clear };
}

// A tick box for one row, or for the header (select this page)
export function SelectBox({ checked, indeterminate = false, onChange, label }: {
  checked: boolean; indeterminate?: boolean; onChange: (on: boolean) => void; label: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={el => { if (el) el.indeterminate = indeterminate && !checked; }}
      onChange={e => onChange(e.target.checked)}
      onClick={e => e.stopPropagation()}
      className="w-4 h-4 cursor-pointer align-middle"
      style={{ accentColor: 'var(--cn-accent)' }}
    />
  );
}

// The strip above the table: how many are ticked, Delete selected, Clear. Deleting asks first.
export default function BulkDeleteBar({ count, total, noun, onSelectAll, onClear, onDelete }: {
  count: number;          // ticked rows that are in the table now
  total: number;          // rows the filters currently show (all pages)
  noun: string;           // "task" / "project"
  onSelectAll: () => void;
  onClear: () => void;
  onDelete: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const plural = (n: number) => `${n} ${noun}${n === 1 ? '' : 's'}`;

  const run = async () => {
    setBusy(true); setError('');
    try { await onDelete(); setConfirming(false); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete'); }
    finally { setBusy(false); }
  };

  const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed';
  return (
    <>
      <div
        role="toolbar" aria-label="Delete several rows"
        className="flex items-center justify-between gap-3 flex-wrap rounded-lg px-3 py-2 text-xs"
        style={count > 0
          ? { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--cn-text-primary)' }
          : { background: 'var(--cn-bg-input)', border: '1px solid var(--cn-border)', color: 'var(--cn-text-muted)' }}
      >
        {count === 0 ? (
          <span>Tick the boxes to pick rows, then delete them all at once.</span>
        ) : (
          <span className="font-semibold">
            {plural(count)} selected
            {count < total && (
              <button type="button" onClick={onSelectAll} className="ml-3 font-semibold underline cursor-pointer" style={{ color: 'var(--cn-accent)' }}>
                Select all {total} shown
              </button>
            )}
          </span>
        )}
        {count > 0 && (
          <span className="flex items-center gap-2">
            <button type="button" onClick={onClear} className={btn} style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>
              <X className="w-3.5 h-3.5" /> Clear
            </button>
            <button type="button" onClick={() => { setError(''); setConfirming(true); }} className={btn} style={{ background: '#ef4444', color: '#fff', border: '1px solid #ef4444' }}>
              <Trash2 className="w-3.5 h-3.5" /> Delete selected ({count})
            </button>
          </span>
        )}
      </div>
      {confirming && <ConfirmBulkDelete what={plural(count)} busy={busy} error={error} onCancel={() => setConfirming(false)} onConfirm={() => void run()} />}
    </>
  );
}

function ConfirmBulkDelete({ what, busy, error, onCancel, onConfirm }: {
  what: string; busy: boolean; error: string; onCancel: () => void; onConfirm: () => void;
}) {
  useBodyScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div role="dialog" aria-modal="true" aria-label="Delete selected rows" className="rounded-lg w-full p-5 space-y-4"
        style={{ background: 'var(--cn-bg-card)', maxWidth: 440, border: '1px solid var(--cn-border)' }}>
        <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>Delete {what}?</h2>
        <p className="text-sm" style={{ color: 'var(--cn-text-secondary)' }}>
          <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{what}</span> will be removed from the table for everyone.
          What each one held is kept in the change log.
        </p>
        {error && <p role="alert" className="text-xs font-medium" style={{ color: '#ef4444' }}>{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50"
            style={{ background: '#ef4444', color: '#fff', border: '1px solid #ef4444' }}>{busy ? 'Deleting…' : `Delete ${what}`}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
