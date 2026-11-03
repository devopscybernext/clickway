'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Download, FileSpreadsheet } from 'lucide-react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { INHOUSE_IMPORT, InHouseImportTab, ImportSummary } from '@/lib/inhouseImport';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

type Cell = string | number | boolean | Date | null | undefined;

const cellText = (c: Cell): string =>
  c instanceof Date ? c.toISOString().slice(0, 10) : c === null || c === undefined ? '' : String(c);

async function post(body: object) {
  const res = await fetch('/api/inhouse/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || 'The upload did not work');
  return json;
}

// "Upload Excel" for one Cybernext InHouse tab (Super Admin). Pick an .xlsx whose first row is
// the column names: the dialog says what would change, then Import adds the new rows to the
// ones already there (and, if ticked, fills in changed cells of rows that already exist).
export default function InHouseUpload({ tab, onClose, onImported }: {
  tab: InHouseImportTab; onClose: () => void; onImported: () => void;
}) {
  useBodyScrollLock();
  const def = INHOUSE_IMPORT[tab];
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<string[][] | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [busy, setBusy] = useState<'reading' | 'importing' | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ added: number; updated: number; unchanged: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const downloadTemplate = async () => {
    const { default: writeExcelFile } = await import('write-excel-file/browser');
    await writeExcelFile(
      [
        def.headers.map(h => ({ value: h, fontWeight: 'bold' as const })),
        def.example.map(v => ({ value: v })),
      ] as never,
      { sheet: def.label.slice(0, 31), columns: def.headers.map(h => ({ width: Math.max(h.length + 4, 22) })), stickyRowsCount: 1 } as never,
    ).toFile(`${def.label.replace(/\s+/g, '-')}-template.xlsx`);
  };

  const pick = async (file: File | undefined) => {
    setError(''); setSummary(null); setRows(null); setResult(null);
    if (!file) return;
    setFileName(file.name);
    if (!/\.xlsx$/i.test(file.name)) { setError('Choose an Excel file saved as .xlsx.'); return; }
    if (file.size > MAX_FILE_BYTES) { setError('That file is over 5 MB.'); return; }
    setBusy('reading');
    try {
      const { readSheet } = await import('read-excel-file/browser');
      const raw = (await readSheet(file)) as Cell[][];
      const parsed = raw.map(r => r.map(cellText));
      setRows(parsed);
      const json = await post({ tab, rows: parsed, mode: 'preview' });
      setSummary(json.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    } finally {
      setBusy(null);
    }
  };

  const doImport = async () => {
    if (!rows) return;
    setError(''); setBusy('importing');
    try {
      const json = await post({ tab, rows, mode: 'import', updateExisting });
      setResult({ added: json.added, updated: json.updated, unchanged: json.unchanged });
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The upload did not work');
    } finally {
      setBusy(null);
    }
  };

  const nothingToDo = !!summary && summary.newRows === 0 && !(updateExisting && summary.changedExisting > 0);
  const muted = { color: 'var(--cn-text-muted)' };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div role="dialog" aria-modal="true" aria-label={`Upload Excel to ${def.label}`} className="rounded-lg w-full flex flex-col"
        style={{ background: 'var(--cn-bg-card)', maxWidth: 620, maxHeight: '92vh', border: '1px solid var(--cn-border)' }}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--cn-border)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>Upload Excel — {def.label}</h2>
          <button type="button" onClick={onClose} disabled={busy !== null} title="Close" className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4 text-sm">
          {!result && (
            <>
              <p style={muted}>
                Use an .xlsx file whose first row holds the column names:{' '}
                <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{def.headers.join(', ')}</span>.
                &quot;{def.key}&quot; is required. Rows are added to what is already here — nothing is removed.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => input.current?.click()} disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-60"
                  style={{ background: 'var(--cn-accent)', color: '#fff' }}>
                  <Upload className="w-3.5 h-3.5" /> {fileName ? 'Choose another file' : 'Choose Excel file'}
                </button>
                <button type="button" onClick={() => void downloadTemplate()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                  style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>
                  <Download className="w-3.5 h-3.5" /> Download template
                </button>
                <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" aria-label="Excel file"
                  onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
                {fileName && <span className="inline-flex items-center gap-1.5 text-xs" style={muted}><FileSpreadsheet className="w-3.5 h-3.5" />{fileName}</span>}
              </div>
            </>
          )}

          {busy === 'reading' && <p style={muted}>Reading the file…</p>}

          {summary && !result && (
            <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--cn-bg-input)', border: '1px solid var(--cn-border)' }}>
              <p style={{ color: 'var(--cn-text-primary)' }}>
                <span className="font-semibold">{summary.newRows}</span> new {summary.newRows === 1 ? 'row' : 'rows'} will be added
                {summary.existingRows > 0 && <> · <span className="font-semibold">{summary.existingRows}</span> already in the table ({summary.changedExisting} with different details, {summary.unchanged} identical)</>}
              </p>
              {summary.sampleNew.length > 0 && (
                <ul className="text-xs space-y-0.5" style={muted}>
                  {summary.sampleNew.map((r, i) => <li key={i}>+ {r[def.key]}</li>)}
                  {summary.newRows > summary.sampleNew.length && <li>…and {summary.newRows - summary.sampleNew.length} more</li>}
                </ul>
              )}
              {summary.changedExisting > 0 && (
                <label className="flex items-start gap-2 text-xs cursor-pointer pt-1" style={{ color: 'var(--cn-text-primary)' }}>
                  <input type="checkbox" checked={updateExisting} onChange={e => setUpdateExisting(e.target.checked)} className="mt-0.5" style={{ accentColor: 'var(--cn-accent)' }} />
                  <span>
                    Also update the {summary.changedExisting} existing {summary.changedExisting === 1 ? 'row that has' : 'rows that have'} different details in the sheet
                    (matched by {def.key}; empty cells never erase anything).
                    <span className="block mt-1" style={muted}>
                      {summary.sampleChanged.map(c => `${c.key}: ${c.changes.map(x => x.column).join(', ')}`).join(' · ')}
                    </span>
                  </span>
                </label>
              )}
              {summary.ignoredColumns.length > 0 && <p className="text-xs" style={muted}>Ignored columns: {summary.ignoredColumns.join(', ')}</p>}
              {summary.skipped.length > 0 && (
                <p className="text-xs" style={{ color: '#d97706' }}>
                  Skipped {summary.skipped.length}: {summary.skipped.slice(0, 4).map(s => `row ${s.row} (${s.reason})`).join('; ')}{summary.skipped.length > 4 ? '…' : ''}
                </p>
              )}
            </div>
          )}

          {result && (
            <div role="status" className="rounded-lg p-3" style={{ background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.3)', color: '#16a34a' }}>
              Done — {result.added} added{result.updated > 0 ? `, ${result.updated} updated` : ''}{result.unchanged > 0 ? `, ${result.unchanged} already the same` : ''}.
            </div>
          )}
          {error && <p role="alert" className="text-xs font-medium" style={{ color: '#ef4444' }}>{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: 'var(--cn-border)' }}>
          <button type="button" onClick={onClose} disabled={busy !== null} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>{result ? 'Close' : 'Cancel'}</button>
          {!result && (
            <button type="button" onClick={() => void doImport()} disabled={!summary || nothingToDo || busy !== null}
              className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }}>
              {busy === 'importing' ? 'Importing…' : 'Import'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
