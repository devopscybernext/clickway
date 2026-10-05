'use client';

import { useState } from 'react';
import { Copy, Check, AlertCircle } from 'lucide-react';
import { SheetData } from '@/lib/googleSheets';
import { parseHHMM, formatHHMM } from './SpecificCharts';

// Report columns, in display order. `editable: false` ones come straight
// from the sheet and are shown as plain text; the rest are filled in by the
// PM right here and written back to the same sheet.
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

interface Props {
  // The signed-in PM's own rows from the Current Month sheet.
  data: SheetData[];
  headers: string[];
  onCellChange: (row: SheetData, colName: string, value: string) => Promise<void>;
}

// My Projects → Generate Report. A trimmed-down table of the PM's current
// month projects where the report fields are editable inline, plus a Copy
// button that puts the whole table (every column) on the clipboard as both
// a real table (for Docs / Gmail / Slack / Word) and tab-separated text
// (for Sheets / Excel / plain editors).
export default function ProjectReport({ data, headers, onCellChange }: Props) {
  const cols = REPORT_COLUMNS
    .map(c => ({ ...c, sheetCol: headers.find(h => h.trim().toLowerCase() === c.header) }))
    .filter((c): c is typeof c & { sheetCol: string } => !!c.sheetCol);

  // Unsaved text lives here (keyed row|column) so Copy always picks up what
  // is on screen — even if the PM clicks Copy while still typing in a box.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);

  const keyOf = (row: SheetData, sheetCol: string) => `${row['__id']}|${sheetCol}`;
  const valueOf = (row: SheetData, c: { sheetCol: string; hours?: boolean }) => {
    const k = keyOf(row, c.sheetCol);
    if (k in drafts) return drafts[k];
    const raw = String(row[c.sheetCol] ?? '');
    return c.hours ? displayHours(raw) : raw;
  };

  const save = async (row: SheetData, sheetCol: string) => {
    const k = keyOf(row, sheetCol);
    if (!(k in drafts)) return;
    const next = drafts[k];
    if (next === String(row[sheetCol] ?? '')) {
      setDrafts(d => { const n = { ...d }; delete n[k]; return n; });
      return;
    }
    setStatus(s => ({ ...s, [k]: 'saving' }));
    try {
      await onCellChange(row, sheetCol, next);
      setDrafts(d => { const n = { ...d }; delete n[k]; return n; });
      setStatus(s => ({ ...s, [k]: 'saved' }));
      setTimeout(() => setStatus(s => { if (s[k] !== 'saved') return s; const n = { ...s }; delete n[k]; return n; }), 2000);
    } catch {
      setStatus(s => ({ ...s, [k]: 'error' })); // draft stays so nothing typed is lost
    }
  };

  const copyTable = async () => {
    const header = cols.map(c => c.label);
    const body = data.map(r => cols.map(c => valueOf(r, c)));
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

  const hasUnsaved = Object.keys(drafts).length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: 'var(--cn-text-muted)' }}>
          <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{data.length}</span> project{data.length === 1 ? '' : 's'} this month
          {' · '}type in the boxes — each one saves when you click away.
        </p>
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
      {hasUnsaved && (
        <p className="text-xs" style={{ color: 'var(--cn-text-faint)' }}>Unsaved changes are included when you copy.</p>
      )}

      <div className="overflow-x-auto rounded-md border" style={{ borderColor: 'var(--cn-border)' }}>
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b" style={{ background: 'var(--cn-bg-input)', borderColor: 'var(--cn-border)' }}>
              {cols.map(c => (
                <th key={c.header} className="px-3 py-2 font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap" style={{ color: 'var(--cn-text-muted)' }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="text-center py-12" style={{ color: 'var(--cn-text-muted)' }}>
                  No projects this month yet.
                </td>
              </tr>
            ) : data.map((row, i) => (
              <tr
                key={String(row['__id'])}
                className="border-b align-top"
                style={{ backgroundColor: i % 2 === 0 ? 'var(--cn-bg-row-even)' : 'var(--cn-bg-row-odd)', borderColor: 'var(--cn-border-light)' }}
              >
                {cols.map(c => {
                  if (!c.editable) {
                    return (
                      <td key={c.header} className={`px-3 py-2 ${c.hours ? 'whitespace-nowrap' : 'min-w-[120px]'}`} style={{ color: 'var(--cn-text-secondary)' }}>
                        <span className={c.header === 'project name' ? 'font-semibold' : ''} style={c.header === 'project name' ? { color: 'var(--cn-text-primary)' } : undefined}>
                          {valueOf(row, c) || '—'}
                        </span>
                      </td>
                    );
                  }
                  const k = keyOf(row, c.sheetCol);
                  const st = status[k];
                  return (
                    <td key={c.header} className="px-2 py-2 min-w-[210px]">
                      <textarea
                        value={valueOf(row, c)}
                        rows={2}
                        aria-label={`${c.label} — ${String(row[headers.find(h => h.toLowerCase().includes('project name')) ?? ''] ?? '')}`}
                        onChange={e => { setDrafts(d => ({ ...d, [k]: e.target.value })); if (st === 'error') setStatus(s => { const n = { ...s }; delete n[k]; return n; }); }}
                        onBlur={() => save(row, c.sheetCol)}
                        className="w-full text-xs rounded-md px-2 py-1.5 resize-y field-sizing-content focus:outline-none focus:ring-1 focus:ring-[#FE4A23]"
                        style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: `1px solid ${st === 'error' ? '#ef4444' : 'var(--cn-border)'}` }}
                      />
                      <div className="h-4 text-[10px] mt-0.5 px-1">
                        {st === 'saving' && <span style={{ color: 'var(--cn-text-muted)' }}>saving…</span>}
                        {st === 'saved' && <span style={{ color: '#22c55e' }}>✓ saved</span>}
                        {st === 'error' && (
                          <button onClick={() => save(row, c.sheetCol)} className="inline-flex items-center gap-1 cursor-pointer" style={{ color: '#ef4444' }}>
                            <AlertCircle className="w-3 h-3" /> not saved — retry
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
