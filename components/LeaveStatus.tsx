'use client';

import { useState } from 'react';
import { SheetData } from '@/lib/googleSheets';

interface Props {
  data: SheetData[];
  headers: string[];
  onUpdate: (row: SheetData, colName: string, newValue: string) => Promise<void>;
  loading: boolean;
}

function findCol(headers: string[], ...terms: string[]): string | undefined {
  for (const term of terms) {
    const t = term.toLowerCase();
    const found = headers.find(h => h.toLowerCase() === t || h.toLowerCase().includes(t));
    if (found) return found;
  }
  return undefined;
}

// Click-to-edit — the sheet holds free text ("No Action Taken", "Two Days
// Leave", ...) rather than a fixed enum, so this is a plain text field
// rather than a dropdown.
function LeaveCell({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const commit = async () => {
    setEditing(false);
    if (draft.trim() === value.trim()) return;
    setSaving(true);
    try { await onSave(draft); } finally { setSaving(false); }
  };

  const onLeave = value.trim().toLowerCase().includes('leave');

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        className="px-2.5 py-1.5 rounded-lg text-xs w-full max-w-[220px] focus:outline-none"
        style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-accent)' }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(value); setEditing(true); }}
      disabled={saving}
      className="px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-opacity disabled:opacity-60 text-left"
      style={{
        background: onLeave ? '#ef444422' : 'var(--cn-bg-input)',
        color: onLeave ? '#ef4444' : 'var(--cn-text-secondary)',
        border: `1px solid ${onLeave ? '#ef444455' : 'var(--cn-border)'}`,
      }}
    >
      {value.trim() || 'No Action Taken'}
    </button>
  );
}

export default function LeaveStatus({ data, headers, onUpdate, loading }: Props) {
  const nameCol  = findCol(headers, 'team', 'name');
  const emailCol = findCol(headers, 'email');
  const leaveCol = findCol(headers, 'leave');

  if (loading) {
    return (
      <div className="p-3 sm:p-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: 'var(--cn-bg-input)' }} />
        ))}
      </div>
    );
  }

  if (!nameCol || !leaveCol) {
    return (
      <div className="p-3 sm:p-6 text-sm" style={{ color: 'var(--cn-text-muted)' }}>
        Leave sheet not reachable — expected a Name/Team column and a Leave column.
      </div>
    );
  }

  const rows = data.filter(r => String(r[nameCol] ?? '').trim());

  return (
    <div className="p-3 sm:p-6">
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--cn-border)' }}>
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b" style={{ background: 'var(--cn-bg-row-even)', borderColor: 'var(--cn-border)' }}>
              <th className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--cn-text-secondary)' }}>Name</th>
              {emailCol && (
                <th className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--cn-text-secondary)' }}>Email</th>
              )}
              <th className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--cn-text-secondary)' }}>Leave Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b hover:bg-[var(--cn-bg-hover)] transition-colors" style={{ borderColor: 'var(--cn-border-light, var(--cn-border))' }}>
                <td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--cn-text-primary)' }}>
                  {String(row[nameCol] ?? '') || '—'}
                </td>
                {emailCol && (
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--cn-text-muted)' }}>
                    {String(row[emailCol] ?? '') || '—'}
                  </td>
                )}
                <td className="px-4 py-3">
                  <LeaveCell value={String(row[leaveCol] ?? '')} onSave={v => onUpdate(row, leaveCol, v)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="p-6 text-center text-sm" style={{ color: 'var(--cn-text-muted)' }}>No entries yet.</div>
        )}
      </div>
    </div>
  );
}
