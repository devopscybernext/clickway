'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Download, FileSpreadsheet, ListChecks } from 'lucide-react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { DATA_IMPORT, DataImportSummary } from '@/lib/dataImport';
import type { Team } from '@/lib/auth';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

type Cell = string | number | boolean | Date | null | undefined;

const cellText = (c: Cell): string =>
  c instanceof Date ? c.toISOString().slice(0, 10) : c === null || c === undefined ? '' : String(c);

async function post(body: object) {
  const res = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || 'The upload did not work');
  return json;
}

// Import Data (Web / Marketing; Super Admin, HM and Mod): inner tabs like Cybernext InHouse, each
// with its own Upload Excel. Tasks is the only one so far; more data kinds slot into TABS later.
const TABS = [{ id: 'tasks', label: 'Tasks' }] as const;

export default function ImportData({ team, onImported }: { team: Team; onImported: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('tasks');
  const [open, setOpen] = useState(false);
  const def = DATA_IMPORT[team];
  const teamName = team === 'web' ? 'Web' : 'Marketing';

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Import Data" className="flex flex-wrap gap-2">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all"
            style={tab === t.id
              ? { background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }
              : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tasks' && (
        <section className="cn-card rounded-lg border p-5 flex flex-col sm:flex-row sm:items-center gap-4"
          style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }}>
          <span className="w-10 h-10 rounded-lg inline-flex items-center justify-center shrink-0" style={{ background: 'rgba(254,74,35,0.12)', color: 'var(--cn-accent)' }}>
            <ListChecks className="w-5 h-5" />
          </span>
          <div className="flex-1">
            <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>{teamName} Tasks</h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--cn-text-secondary)' }}>
              Upload an Excel sheet of tasks. Every row is added as a new task in {teamName} Tasks Assigned.
            </p>
          </div>
          <button type="button" onClick={() => setOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer"
            style={{ background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }}>
            <Upload className="w-4 h-4" /> Upload Excel
          </button>
        </section>
      )}

      {open && <ImportDialog key={team} team={team} label={def.label} onClose={() => setOpen(false)} onImported={onImported} />}
    </div>
  );
}

function ImportDialog({ team, label, onClose, onImported }: { team: Team; label: string; onClose: () => void; onImported: () => void }) {
  useBodyScrollLock();
  const def = DATA_IMPORT[team];
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<string[][] | null>(null);
  const [summary, setSummary] = useState<DataImportSummary | null>(null);
  const [busy, setBusy] = useState<'reading' | 'importing' | null>(null);
  const [error, setError] = useState('');
  const [added, setAdded] = useState<number | null>(null);

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
      { sheet: label.slice(0, 31), columns: def.headers.map(h => ({ width: Math.max(h.length + 4, 22) })), stickyRowsCount: 1 } as never,
    ).toFile(`${label.replace(/\s+/g, '-')}-template.xlsx`);
  };

  const pick = async (file: File | undefined) => {
    setError(''); setSummary(null); setRows(null); setAdded(null);
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
      const json = await post({ team, rows: parsed, mode: 'preview' });
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
      const json = await post({ team, rows, mode: 'import' });
      setAdded(json.added);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The upload did not work');
    } finally {
      setBusy(null);
    }
  };

  const muted = { color: 'var(--cn-text-muted)' };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div role="dialog" aria-modal="true" aria-label={`Upload Excel to ${label}`} className="rounded-lg w-full flex flex-col"
        style={{ background: 'var(--cn-bg-card)', maxWidth: 620, maxHeight: '92vh', border: '1px solid var(--cn-border)' }}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--cn-border)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>Upload Excel — {label}</h2>
          <button type="button" onClick={onClose} disabled={busy !== null} title="Close" className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4 text-sm">
          {added === null && (
            <>
              <p style={muted}>
                Use an .xlsx file whose first row holds the column names:{' '}
                <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{def.headers.join(', ')}</span>.
                A row needs a {def.required.join(' or ')}. Times are written as HH:MM (for example 02:30). Every row is added as a new task, so
                uploading the same file twice adds everything twice.
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

          {summary && added === null && (
            <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--cn-bg-input)', border: '1px solid var(--cn-border)' }}>
              <p style={{ color: 'var(--cn-text-primary)' }}>
                <span className="font-semibold">{summary.newRows}</span> new {summary.newRows === 1 ? 'task' : 'tasks'} will be added
              </p>
              {summary.sampleNew.length > 0 && (
                <ul className="text-xs space-y-0.5" style={muted}>
                  {summary.sampleNew.map((r, i) => <li key={i}>+ {[r['Project Name'], r['Task Name']].filter(Boolean).join(' — ')}</li>)}
                  {summary.newRows > summary.sampleNew.length && <li>…and {summary.newRows - summary.sampleNew.length} more</li>}
                </ul>
              )}
              {summary.ignoredColumns.length > 0 && <p className="text-xs" style={muted}>Ignored columns: {summary.ignoredColumns.join(', ')}</p>}
              {summary.badTimes.length > 0 && (
                <p className="text-xs" style={{ color: '#d97706' }}>
                  {summary.badTimes.length} time {summary.badTimes.length === 1 ? 'cell is' : 'cells are'} not HH:MM and will be added as typed:{' '}
                  {summary.badTimes.slice(0, 3).map(b => `row ${b.row} ${b.column} "${b.value}"`).join('; ')}{summary.badTimes.length > 3 ? '…' : ''}
                </p>
              )}
              {summary.skipped.length > 0 && (
                <p className="text-xs" style={{ color: '#d97706' }}>
                  Skipped {summary.skipped.length}: {summary.skipped.slice(0, 4).map(s => `row ${s.row} (${s.reason})`).join('; ')}{summary.skipped.length > 4 ? '…' : ''}
                </p>
              )}
            </div>
          )}

          {added !== null && (
            <div role="status" className="rounded-lg p-3" style={{ background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.3)', color: '#16a34a' }}>
              Done — {added} {added === 1 ? 'task' : 'tasks'} added.
            </div>
          )}
          {error && <p role="alert" className="text-xs font-medium" style={{ color: '#ef4444' }}>{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: 'var(--cn-border)' }}>
          <button type="button" onClick={onClose} disabled={busy !== null} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>{added !== null ? 'Close' : 'Cancel'}</button>
          {added === null && (
            <button type="button" onClick={() => void doImport()} disabled={!summary || summary.newRows === 0 || busy !== null}
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
