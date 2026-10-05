'use client';

import { useEffect, useState } from 'react';
import { Copy, Check, Pencil, X } from 'lucide-react';
import { SheetData } from '@/lib/googleSheets';
import { parseHHMM, formatHHMM } from './SpecificCharts';

// Report columns, in display order. `editable: false` ones come straight
// from the sheet; the rest are filled in through the row popup and written
// back to the same sheet. Every editable one is mandatory.
const REPORT_COLUMNS: { header: string; label: string; editable: boolean; hours?: boolean }[] = [
  { header: 'project name', label: 'Project Name', editable: false },
  { header: 'assigned', label: 'Assigned', editable: false },
  { header: 'total hours', label: 'Total Hours', editable: false, hours: true },
  { header: 'ac hours', label: 'AC Hours', editable: false, hours: true },
  { header: 'project progress update', label: 'Project Progress Update', editable: true },
  { header: 'upsell', label: 'Upsell', editable: true },
  { header: 'escalation', label: 'Escalation', editable: true },
  { header: 'client feedback', label: 'Client Feedback', editable: true },
  { header: 'resource feedback', label: 'Resource Feedback', editable: true },
  { header: 'problems - next month needs', label: 'Problems - Next Month Needs', editable: true },
  { header: 'comments', label: 'Comments', editable: true },
];

type ReportCol = (typeof REPORT_COLUMNS)[number] & { sheetCol: string };

// Same HH.MM literal handling as the main PM table: "30" is 30h 0m, and
// "12.50" is 12h 50m (never 12.5 hours).
function displayHours(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  if (v.includes('.')) { const { h, m } = parseHHMM(v); return formatHHMM(h, m); }
  const h = parseInt(v, 10);
  return isNaN(h) ? v : formatHHMM(h, 0);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>');

const cellValue = (row: SheetData, c: ReportCol) => {
  const raw = String(row[c.sheetCol] ?? '');
  return c.hours ? displayHours(raw) : raw;
};

// One project's report popup — the four reference fields are shown but
// locked, the seven report fields are editable and all required. Nothing is
// written until Save, and Save is refused while any required field is blank.
function ReportEditModal({ row, cols, onSave, onCancel }: {
  row: SheetData;
  cols: ReportCol[];
  onSave: (changes: Record<string, string>) => Promise<void>;
  onCancel: () => void;
}) {
  const editable = cols.filter(c => c.editable);
  const projectCol = cols.find(c => c.header === 'project name');
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    editable.forEach(c => { d[c.sheetCol] = String(row[c.sheetCol] ?? ''); });
    return d;
  });
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [saving, onCancel]);

  const missing = editable.filter(c => !draft[c.sheetCol].trim());

  const handleSave = async () => {
    setTried(true);
    if (missing.length) return;
    const changes: Record<string, string> = {};
    editable.forEach(c => {
      const next = draft[c.sheetCol].trim();
      if (next !== String(row[c.sheetCol] ?? '')) changes[c.sheetCol] = next;
    });
    setSaving(true);
    setError('');
    try {
      await onSave(changes);
    } catch {
      setError('Could not save — nothing was lost, please try again.');
      setSaving(false);
    }
  };

  const inputStyle = (bad: boolean) => ({
    background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)',
    border: `1px solid ${bad ? '#ef4444' : 'var(--cn-border)'}`,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div role="dialog" aria-modal="true" className="rounded-lg w-full flex flex-col"
        style={{ background: 'var(--cn-bg-card)', maxWidth: 720, maxHeight: '90vh', border: '1px solid var(--cn-border)' }}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--cn-border)' }}>
          <div className="min-w-0">
            <h2 className="font-semibold text-base truncate" style={{ color: 'var(--cn-text-primary)' }}>Project Report</h2>
            <p className="text-xs truncate" style={{ color: 'var(--cn-text-muted)' }}>
              {(projectCol && cellValue(row, projectCol)) || 'Untitled project'}
            </p>
          </div>
          <button onClick={onCancel} disabled={saving} title="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors hover:opacity-80 shrink-0 disabled:opacity-50"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {/* Reference, locked */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg p-3" style={{ background: 'var(--cn-bg-input)' }}>
            {cols.filter(c => !c.editable).map(c => (
              <div key={c.header} className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>{c.label}</div>
                <div className="text-sm mt-0.5 break-words" style={{ color: 'var(--cn-text-primary)' }}>{cellValue(row, c) || '—'}</div>
              </div>
            ))}
          </div>

          {/* Editable, all required */}
          {editable.map(c => {
            const bad = tried && !draft[c.sheetCol].trim();
            return (
              <div key={c.header} className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--cn-text-muted)' }}>
                  {c.label} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  value={draft[c.sheetCol]}
                  rows={3}
                  disabled={saving}
                  onChange={e => setDraft(d => ({ ...d, [c.sheetCol]: e.target.value }))}
                  className="w-full text-sm rounded-lg px-3 py-2 resize-y focus:outline-none focus:ring-1 focus:ring-[#FE4A23] disabled:opacity-60"
                  style={inputStyle(bad)}
                />
                {bad && <span className="text-xs" style={{ color: '#ef4444' }}>This field is required.</span>}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: 'var(--cn-border)' }}>
          {tried && missing.length > 0 && !error && (
            <span className="text-xs mr-auto" style={{ color: '#ef4444' }}>
              {missing.length} required field{missing.length === 1 ? '' : 's'} left.
            </span>
          )}
          {error && <span className="text-xs mr-auto" style={{ color: '#ef4444' }}>{error}</span>}
          <button onClick={onCancel} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all disabled:opacity-50"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all disabled:opacity-60"
            style={{ background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }}>
            {saving && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  // The signed-in PM's own rows from the Current Month sheet.
  data: SheetData[];
  headers: string[];
  onCellChange: (row: SheetData, colName: string, value: string) => Promise<void>;
}

// My Projects → Generate Report. A read-only table of the PM's current month
// projects (same look as All Projects); "Edit" reveals a pencil on each row
// which opens a popup to fill that project's report fields. "Copy table"
// puts every column on the clipboard as both a real table (for Docs / Gmail /
// Slack / Word) and tab-separated text (for Sheets / Excel / plain editors).
export default function ProjectReport({ data, headers, onCellChange }: Props) {
  const cols: ReportCol[] = REPORT_COLUMNS
    .map(c => ({ ...c, sheetCol: headers.find(h => h.trim().toLowerCase() === c.header) }))
    .filter((c): c is ReportCol => !!c.sheetCol);

  const [editMode, setEditMode] = useState(false);
  const [popupRow, setPopupRow] = useState<SheetData | null>(null);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);

  const copyTable = async () => {
    const header = cols.map(c => c.label);
    const body = data.map(r => cols.map(c => cellValue(r, c)));
    const tsv = [header, ...body]
      .map(line => line.map(v => (/[\t\n"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join('\t'))
      .join('\n');
    const cell = 'border:1px solid #999;padding:6px 8px;vertical-align:top;';
    const html =
      `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">` +
      `<thead><tr>${header.map(h => `<th style="${cell}background:#f1f1f1;text-align:left">${escapeHtml(h)}</th>`).join('')}</tr></thead>` +
      `<tbody>${body.map(line => `<tr>${line.map(v => `<td style="${cell}">${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([tsv], { type: 'text/plain' }),
        }),
      ]);
      setCopied('ok');
    } catch {
      try { await navigator.clipboard.writeText(tsv); setCopied('ok'); } catch { setCopied('fail'); }
    }
    setTimeout(() => setCopied(null), 2500);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: 'var(--cn-text-muted)' }}>
          <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{data.length}</span> project{data.length === 1 ? '' : 's'} this month
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditMode(m => !m)}
            title={editMode ? 'Stop editing' : 'Edit'}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg cursor-pointer transition-all text-xs font-semibold"
            style={editMode
              ? { background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }
              : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
          >
            <Pencil className="w-3.5 h-3.5" />
            {editMode ? 'Done Editing' : 'Edit'}
          </button>
          <button
            onClick={copyTable}
            disabled={data.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={copied === 'ok'
              ? { background: '#16a34a', color: '#fff', border: '1px solid #16a34a' }
              : { background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }}
          >
            {copied === 'ok' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied === 'ok' ? 'Copied!' : copied === 'fail' ? 'Copy failed' : 'Copy table'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border" style={{ borderColor: 'var(--cn-border)' }}>
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b" style={{ background: 'var(--cn-bg-input)', borderColor: 'var(--cn-border)' }}>
              {editMode && <th className="px-2 py-2 w-10" aria-label="Edit row" />}
              <th className="px-4 py-2 font-semibold uppercase tracking-wide text-[10px] w-12" style={{ color: 'var(--cn-text-muted)' }}>#</th>
              {cols.map(c => (
                <th key={c.header} className="px-4 py-2 font-semibold uppercase tracking-wide text-[10px] min-w-[120px]" style={{ color: 'var(--cn-text-muted)' }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={cols.length + 1 + (editMode ? 1 : 0)} className="text-center py-12" style={{ color: 'var(--cn-text-muted)' }}>
                  No projects this month yet.
                </td>
              </tr>
            ) : data.map((row, i) => (
              <tr
                key={String(row['__id'])}
                className={`border-b transition-colors hover:bg-[var(--cn-bg-hover)] ${editMode ? 'cursor-pointer' : ''}`}
                style={{ backgroundColor: i % 2 === 0 ? 'var(--cn-bg-row-even)' : 'var(--cn-bg-row-odd)', borderColor: 'var(--cn-border-light)' }}
                onClick={editMode ? () => setPopupRow(row) : undefined}
              >
                {editMode && (
                  <td className="px-2 py-2">
                    <button
                      onClick={e => { e.stopPropagation(); setPopupRow(row); }}
                      title="Edit this project's report"
                      className="w-7 h-7 rounded-lg inline-flex items-center justify-center cursor-pointer transition-colors hover:opacity-80"
                      style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-accent)', border: '1px solid var(--cn-border)' }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                )}
                <td className="px-4 py-2 tabular-nums align-top" style={{ color: 'var(--cn-text-faint)' }}>{i + 1}</td>
                {cols.map(c => (
                  <td key={c.header} className={`px-4 py-2 align-top ${c.hours ? 'whitespace-nowrap' : 'break-words min-w-[120px] max-w-xs whitespace-pre-wrap'}`}
                    style={{ color: 'var(--cn-text-secondary)' }}>
                    {cellValue(row, c) || '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {popupRow && (
        <ReportEditModal
          key={String(popupRow['__id'])}
          row={popupRow}
          cols={cols}
          onSave={async changes => {
            // One write per changed column; a failure throws and keeps the
            // popup open (columns already written stay written).
            for (const [col, val] of Object.entries(changes)) await onCellChange(popupRow, col, val);
            setPopupRow(null);
          }}
          onCancel={() => setPopupRow(null)}
        />
      )}
    </div>
  );
}
