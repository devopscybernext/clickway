'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CopyPlus, Trash2 } from 'lucide-react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';

// "Duplicate" and "Delete" icons for one table row (Tasks Assigned, PM Projects).
// Deleting asks first; a duplicate is made straight away. `what` names the row in the
// messages, e.g. "Cybernext — Weekly Maintenance".
export default function RowActions({ what, onDuplicate, onDelete }: {
  what: string;
  onDuplicate?: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<'duplicate' | 'delete' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const run = async (kind: 'duplicate' | 'delete', fn: () => Promise<void>) => {
    setError('');
    setBusy(kind);
    try { await fn(); setConfirming(false); }
    catch (e) { setError(e instanceof Error ? e.message : 'That did not work'); }
    finally { setBusy(null); }
  };

  const btn = 'w-7 h-7 rounded-lg inline-flex items-center justify-center cursor-pointer transition-colors hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed';
  return (
    <div className="flex items-center gap-1.5">
      {onDuplicate && <button
        type="button"
        onClick={e => { e.stopPropagation(); void run('duplicate', onDuplicate); }}
        disabled={busy !== null}
        title="Duplicate this row"
        aria-label={`Duplicate ${what}`}
        className={btn}
        style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
      >
        {busy === 'duplicate'
          ? <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--cn-accent)' }} />
          : <CopyPlus className="w-3.5 h-3.5" />}
      </button>}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setError(''); setConfirming(true); }}
        disabled={busy !== null}
        title="Delete this row"
        aria-label={`Delete ${what}`}
        className={btn}
        style={{ background: 'var(--cn-bg-input)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      {error && !confirming && <span role="alert" className="text-[10px] font-medium max-w-[140px]" style={{ color: '#ef4444' }}>{error}</span>}
      {confirming && (
        <ConfirmDelete
          what={what}
          busy={busy === 'delete'}
          error={error}
          onCancel={() => setConfirming(false)}
          onConfirm={() => run('delete', onDelete)}
        />
      )}
    </div>
  );
}

function ConfirmDelete({ what, busy, error, onCancel, onConfirm }: {
  what: string; busy: boolean; error: string; onCancel: () => void; onConfirm: () => void;
}) {
  useBodyScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
      <div role="dialog" aria-modal="true" aria-label="Delete row" className="rounded-lg w-full p-5 space-y-4"
        style={{ background: 'var(--cn-bg-card)', maxWidth: 440, border: '1px solid var(--cn-border)' }}>
        <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>Delete this row?</h2>
        <p className="text-sm break-words" style={{ color: 'var(--cn-text-secondary)' }}>
          <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{what}</span> will be removed from the table for everyone.
          What it held is kept in the change log.
        </p>
        {error && <p role="alert" className="text-xs font-medium" style={{ color: '#ef4444' }}>{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60"
            style={{ background: '#dc2626', color: '#fff', border: '1px solid #dc2626' }}>{busy ? 'Deleting…' : 'Delete'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
