'use client';

import { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
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

const NO_ACTION = 'No Action Taken';
// A starting set of common values — any value an admin has already typed
// into the sheet (e.g. "Two Days Leave") is unioned in below, so nothing
// already in use ever falls out of the dropdown.
const CANONICAL_LEAVE_OPTIONS = [
  NO_ACTION, 'Half Day Leave', 'Full Day Leave', 'Two Days Leave', 'Sick Leave', 'Work From Home',
];

// Anything other than blank/"No Action Taken" counts as on leave — this
// overrides the resource's computed status (Occupied/Partially Occupied/
// Available/...) everywhere it's shown once saved.
function isOnLeaveText(v: string): boolean {
  const t = v.trim().toLowerCase();
  return t !== '' && t !== NO_ACTION.toLowerCase();
}

function LeaveBadge({ value }: { value: string }) {
  const onLeave = isOnLeaveText(value);
  return (
    <span
      className="inline-block px-3 py-1.5 rounded-full text-xs font-semibold"
      style={{
        background: onLeave ? '#ef444422' : 'var(--cn-bg-input)',
        color: onLeave ? '#ef4444' : 'var(--cn-text-secondary)',
        border: `1px solid ${onLeave ? '#ef444455' : 'var(--cn-border)'}`,
      }}
    >
      {value.trim() || NO_ACTION}
    </span>
  );
}

export default function LeaveStatus({ data, headers, onUpdate, loading }: Props) {
  const [editMode, setEditMode] = useState(false);
  const nameCol  = findCol(headers, 'team', 'name');
  const emailCol = findCol(headers, 'email');
  const leaveCol = findCol(headers, 'leave');

  const options = useMemo(() => {
    if (!leaveCol) return CANONICAL_LEAVE_OPTIONS;
    const extras = [...new Set(data.map(r => String(r[leaveCol] ?? '').trim()).filter(Boolean))]
      .filter(v => !CANONICAL_LEAVE_OPTIONS.includes(v));
    return [...CANONICAL_LEAVE_OPTIONS, ...extras.sort()];
  }, [data, leaveCol]);

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
    <div className="p-3 sm:p-6 space-y-3">
      <div className="flex items-center justify-end">
        <button
          onClick={() => setEditMode(m => !m)}
          title={editMode ? 'Stop editing' : 'Edit'}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all text-xs font-semibold"
          style={editMode
            ? { background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }
            : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
        >
          <Pencil className="w-3.5 h-3.5" />
          {editMode ? 'Done Editing' : 'Edit'}
        </button>
      </div>

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
            {rows.map((row, i) => {
              const value = String(row[leaveCol] ?? '');
              return (
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
                    {editMode ? (
                      <LeaveSelect value={value} options={options} onSave={v => onUpdate(row, leaveCol, v)} />
                    ) : (
                      <LeaveBadge value={value} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="p-6 text-center text-sm" style={{ color: 'var(--cn-text-muted)' }}>No entries yet.</div>
        )}
      </div>
    </div>
  );
}

function LeaveSelect({ value, options, onSave }: { value: string; options: string[]; onSave: (v: string) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const current = value.trim() || NO_ACTION;

  const commit = async (v: string) => {
    if (v === current) return;
    setSaving(true);
    try { await onSave(v); } finally { setSaving(false); }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={options.includes(current) ? current : NO_ACTION}
        onChange={e => commit(e.target.value)}
        disabled={saving}
        className="px-2.5 py-1.5 rounded-lg text-xs focus:outline-none disabled:opacity-60 cursor-pointer"
        style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-accent)' }}
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      {saving && <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: 'var(--cn-accent)' }} />}
    </div>
  );
}
