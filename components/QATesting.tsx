'use client';

import { useEffect, useState, ChangeEvent, useCallback } from 'react';
import { Copy, Check, Search, X, Trash2 } from 'lucide-react';
import { SheetData } from '@/lib/googleSheets';
import { memberColor, memberPhoto } from '@/lib/memberColors';

// Matches the QATesting sheet's actual data-validation lists (Column E "Today's Bucket Set" / Column F "Status")
const BUCKET_OPTIONS = ['No Action Taken', 'Today', 'Tomorrow', 'Everyday'];
const STATUS_OPTIONS = ['No Action Taken', 'Submitted', 'In Progress'];

const BUCKET_COLORS: Record<string, string> = {
  'no action taken': '#6b7280',
  'today': '#16a34a',
  'tomorrow': '#3b82f6',
  'everyday': '#7c3aed',
};

const STATUS_COLORS: Record<string, string> = {
  'no action taken': '#6b7280',
  'submitted': '#0d9488',
  'in progress': '#16a34a',
};

interface Props {
  data: SheetData[];
  headers: string[];
  onCellChange: (row: SheetData, colName: string, value: string) => Promise<void>;
  canEdit?: boolean;
}

// Read-only colored badge — used in place of the editable pill/input when canEdit is false
function StatusBadge({ value, colors }: { value: string; colors: Record<string, string> }) {
  const color = colors[value.trim().toLowerCase()] ?? '#6b7280';
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: color, color: '#fff' }}>
      {value || 'No Action Taken'}
    </span>
  );
}

// Pill-style select — same look as ResourceStatusSelect/PmStatusSelect elsewhere in the app
function PillSelect({ value, options, colors, onChange }: {
  value: string; options: string[]; colors: Record<string, string>;
  onChange: (v: string) => Promise<void>;
}) {
  const match = options.find(o => o.toLowerCase() === value.trim().toLowerCase()) ?? value;
  const [current, setCurrent] = useState(match || options[0]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saving) setCurrent(match || options[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const color = colors[current.toLowerCase()] ?? '#6b7280';

  const handleChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    const newVal = e.target.value;
    setCurrent(newVal);
    setSaving(true);
    setSaved(false);
    try {
      await onChange(newVal);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setCurrent(match);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={current}
        onChange={handleChange}
        disabled={saving}
        className="text-[10px] font-semibold rounded-full pl-2.5 pr-6 py-0.5 border-0 focus:outline-none cursor-pointer disabled:opacity-60 appearance-none"
        style={{
          backgroundColor: color, color: '#fff', minWidth: '110px',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center',
        }}
      >
        {options.map(opt => (
          <option key={opt} value={opt} style={{ background: '#1a1a1a', color: '#fff' }}>{opt}</option>
        ))}
        {current && !options.some(o => o.toLowerCase() === current.toLowerCase()) && (
          <option value={current}>{current}</option>
        )}
      </select>
      {saving && <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin inline-block" style={{ borderColor: 'var(--cn-accent)' }} />}
      {saved && <span className="text-[10px]" style={{ color: '#22c55e' }}>✓</span>}
    </div>
  );
}

// Inline text edit — same look as ResourceTimeLoggedEdit elsewhere in the app
function TimeLoggedEdit({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [current, setCurrent] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (!saving) setCurrent(value); }, [value, saving]);

  const handleSave = async () => {
    if (current.trim() === value.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      await onSave(current.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setCurrent(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={current}
        onChange={e => { setCurrent(e.target.value); setSaved(false); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
        onBlur={handleSave}
        disabled={saving}
        placeholder="—"
        className="w-16 px-1.5 py-0.5 text-[10px] rounded border focus:outline-none disabled:opacity-60 transition-colors"
        style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)' }}
      />
      {saving && <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: 'var(--cn-accent)' }} />}
      {saved && <span className="text-[10px] shrink-0" style={{ color: '#22c55e' }}>✓</span>}
    </div>
  );
}

export default function QATesting({ data, headers, onCellChange, canEdit = true }: Props) {
  const [copiedRowIdx, setCopiedRowIdx] = useState<number | null>(null);
  const [copiedTable, setCopiedTable] = useState(false);
  const [search, setSearch] = useState('');
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  const projectCol    = headers.find(h => h.toLowerCase().includes('project name'));
  const taskCol       = headers.find(h => h.toLowerCase().includes('task name'));
  const urlCol        = headers.find(h => h.toLowerCase().includes('task url'));
  const timeLoggedCol = headers.find(h => h.toLowerCase().includes('time logged'));
  const bucketCol     = headers.find(h => h.toLowerCase().includes('bucket set'));
  const statusCol     = headers.find(h => h.toLowerCase().includes('status') && h !== bucketCol);

  if (!projectCol || !taskCol || !urlCol) {
    return (
      <div className="cn-card rounded-xl p-6 text-center text-sm" style={{ background: 'var(--cn-bg-card)', color: 'var(--cn-text-muted)' }}>
        Project Name, Task Name, or Task URL column not found in the QATesting sheet.
      </div>
    );
  }

  const allRows = data.filter(r => String(r[projectCol] ?? '').trim() || String(r[taskCol] ?? '').trim());

  const searchQ = search.trim().toLowerCase();
  const filteredRows = searchQ
    ? allRows.filter(r =>
        [r[projectCol], r[taskCol], statusCol ? r[statusCol] : '', bucketCol ? r[bucketCol] : '']
          .some(v => String(v ?? '').toLowerCase().includes(searchQ))
      )
    : allRows;

  // Pin "Today" tasks to the top — stable sort keeps everything else in place
  const rows = bucketCol
    ? [...filteredRows].sort((a, b) => {
        const aToday = String(a[bucketCol] ?? '').trim().toLowerCase() === 'today' ? 0 : 1;
        const bToday = String(b[bucketCol] ?? '').trim().toLowerCase() === 'today' ? 0 : 1;
        return aToday - bToday;
      })
    : filteredRows;

  const copyRow = (row: SheetData, idx: number) => {
    const text = `Project Name: ${row[projectCol] ?? ''}\nTask URL: ${row[urlCol] ?? ''}\nEst Time: `;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedRowIdx(idx);
    setTimeout(() => setCopiedRowIdx(null), 2000);
  };

  const COPY_COLS = ['Project Name', 'Task Name', 'Task URL', 'Time Logged On Ac', 'Status'];
  const copyTable = async () => {
    const todayRows = rows.filter(r => {
      const b = bucketCol ? String(r[bucketCol] ?? '').trim().toLowerCase() : '';
      return b === 'today' || b === 'everyday';
    });
    const rowsToCopy = todayRows.map(r => [
      r[projectCol] ?? '', r[taskCol] ?? '', r[urlCol] ?? '',
      timeLoggedCol ? r[timeLoggedCol] ?? '' : '', statusCol ? r[statusCol] ?? '' : '',
    ]);
    const html = `
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;color:#111;">
  <thead>
    <tr style="background-color:#FE4A23;color:#ffffff;">
      <th style="border:1px solid #555;padding:8px 12px;text-align:left;white-space:nowrap;">#</th>
      ${COPY_COLS.map(h => `<th style="border:1px solid #555;padding:8px 12px;text-align:left;white-space:nowrap;">${h}</th>`).join('')}
    </tr>
  </thead>
  <tbody>
    ${rowsToCopy.map((r, i) => `
    <tr style="background-color:${i % 2 === 0 ? '#ffffff' : '#fafafa'};">
      <td style="border:1px solid #ddd;padding:6px 12px;color:#888;">${i + 1}</td>
      ${r.map(v => `<td style="border:1px solid #ddd;padding:6px 12px;">${v ?? ''}</td>`).join('')}
    </tr>`).join('')}
  </tbody>
</table>`;
    const text = [
      ['#', ...COPY_COLS].join('\t'),
      ...rowsToCopy.map((r, i) => [i + 1, ...r].join('\t')),
    ].join('\n');
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html':  new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(text);
    }
    setCopiedTable(true);
    setTimeout(() => setCopiedTable(false), 2500);
  };

  const clearAll = async () => {
    if (!window.confirm('Reset ALL rows? Time Logged, Bucket Set and Status will be cleared.')) return;
    setClearing(true);
    try {
      await Promise.all(allRows.flatMap(row => {
        const ops: Promise<void>[] = [];
        if (timeLoggedCol) ops.push(onCellChange(row, timeLoggedCol, ''));
        if (bucketCol)     ops.push(onCellChange(row, bucketCol, 'No Action Taken'));
        if (statusCol)     ops.push(onCellChange(row, statusCol, 'No Action Taken'));
        return ops;
      }));
      setCleared(true);
      setTimeout(() => setCleared(false), 3000);
    } finally {
      setClearing(false);
    }
  };

  const todayCount = rows.filter(r => bucketCol && String(r[bucketCol] ?? '').trim().toLowerCase() === 'today').length;
  const inProgressCount = rows.filter(r => statusCol && String(r[statusCol] ?? '').trim().toLowerCase() === 'in progress').length;

  const name  = 'Vinay';
  const bg    = memberColor(name);
  const photo = memberPhoto(name);

  if (allRows.length === 0) {
    return (
      <div className="cn-card rounded-xl p-6 text-center text-sm" style={{ background: 'var(--cn-bg-card)', color: 'var(--cn-text-muted)' }}>
        No QA tasks yet. Add rows to the QATesting sheet tab.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--cn-text-muted)' }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search project, task, status, or bucket..."
          className="w-full pl-9 pr-8 py-2 rounded-lg text-xs focus:outline-none"
          style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
            style={{ color: 'var(--cn-text-muted)' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="cn-card rounded-xl overflow-hidden" style={{ background: 'var(--cn-bg-card)', borderLeft: `3px solid ${bg}` }}>
        {/* Header strip — same language as a Tasks Overview resource card */}
        <div className="flex items-center gap-3 px-4 py-3">
          {photo ? (
            <div className="w-10 h-10 rounded-full p-[2px] shrink-0" style={{ background: `conic-gradient(${bg}, #e5e7eb, ${bg})` }}>
              <img src={photo} alt={name} className="w-full h-full rounded-full object-cover"
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ background: `linear-gradient(135deg, ${bg}cc, ${bg}66)` }}>
              VN
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--cn-text-primary)' }}>{name}</p>
              <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: bg + '18', color: bg }}>
                QA Testing
              </span>
            </div>
            <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>
              Dedicated QA task list
            </p>
          </div>

          {/* Stat pills */}
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5 text-xs" title="Today">
              <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: '#16a34a' }} />
              <span style={{ color: 'var(--cn-text-primary)' }} className="font-semibold">{todayCount}</span>
              <span style={{ color: 'var(--cn-text-muted)' }}>today</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs" title="In Progress">
              <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: '#16a34a' }} />
              <span style={{ color: 'var(--cn-text-primary)' }} className="font-semibold">{inProgressCount}</span>
              <span style={{ color: 'var(--cn-text-muted)' }}>in progress</span>
            </div>
          </div>

          {/* Total badge */}
          <div className="px-2.5 py-1 rounded-full text-xs font-bold shrink-0" style={{ background: bg + '18', color: bg }}>
            {rows.length}
          </div>

          {/* Clear All button */}
          {canEdit && (
            <button
              onClick={clearAll}
              disabled={clearing}
              title="Clear all: reset Time Logged, Bucket Set and Status to No Action Taken"
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-all disabled:opacity-60"
              style={cleared
                ? { background: '#16a34a18', border: '1px solid #16a34a40', color: '#16a34a' }
                : { background: '#dc262618', border: '1px solid #dc262630', color: '#dc2626' }}
            >
              {clearing ? <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: '#dc2626' }} /> : cleared ? <Check className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
              {clearing ? 'Clearing…' : cleared ? 'Cleared!' : 'Clear All'}
            </button>
          )}

          {/* Copy table button */}
          {canEdit && (
            <button
              onClick={copyTable}
              title="Copy today's tasks as a table"
              className="shrink-0 w-7 h-7 rounded-lg inline-flex items-center justify-center cursor-pointer transition-all"
              style={copiedTable
                ? { background: '#16a34a18', border: '1px solid #16a34a40', color: '#16a34a' }
                : { background: 'var(--cn-bg-input)', border: '1px solid var(--cn-border)', color: 'var(--cn-text-muted)' }}
            >
              {copiedTable ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm" style={{ borderTop: '1px solid var(--cn-border)', color: 'var(--cn-text-muted)' }}>
            No tasks match your search.
          </div>
        ) : (
          <div style={{ borderTop: '1px solid var(--cn-border)' }}>
            <table className="w-full text-xs table-fixed">
              <colgroup>
                {canEdit && <col style={{ width: '5%' }} />}
                <col style={{ width: '22%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '8%' }} />
                {canEdit && <col style={{ width: '13%' }} />}
                <col style={{ width: '15%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead>
                <tr style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}>
                  {canEdit && <th className="px-2 py-2 w-10" />}
                  <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Project</th>
                  <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Task</th>
                  <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Link</th>
                  {canEdit && <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Time Logged On Ac</th>}
                  <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Today&apos;s Bucket Set</th>
                  <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const url = String(row[urlCol] ?? '');
                  return (
                    <tr key={String(row['__row'] ?? i)} style={{ borderTop: '1px solid var(--cn-border-light, var(--cn-border))' }}>
                      {canEdit && (
                        <td className="px-2 py-2 text-center">
                          <button
                            onClick={() => copyRow(row, i)}
                            title="Copy row"
                            className="w-7 h-7 rounded-lg inline-flex items-center justify-center cursor-pointer transition-all"
                            style={{
                              background: copiedRowIdx === i ? '#16a34a18' : 'var(--cn-bg-input)',
                              color:      copiedRowIdx === i ? '#16a34a'   : 'var(--cn-text-muted)',
                              border:     `1px solid ${copiedRowIdx === i ? '#16a34a40' : 'var(--cn-border)'}`,
                            }}
                          >
                            {copiedRowIdx === i ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </td>
                      )}
                      <td className="px-4 py-2 truncate" style={{ color: 'var(--cn-text-muted)' }}>
                        <span className="truncate block">{row[projectCol] || '—'}</span>
                      </td>
                      <td className="px-4 py-2 truncate" style={{ color: 'var(--cn-text-primary)' }}>
                        <span className="truncate block">{row[taskCol] || '—'}</span>
                      </td>
                      <td className="px-4 py-2">
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ color: 'var(--cn-accent)', background: 'var(--cn-accent)' + '15' }}
                          >
                            Open ↗
                          </a>
                        ) : <span style={{ color: 'var(--cn-text-muted)' }}>—</span>}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-2">
                          {timeLoggedCol && (
                            <TimeLoggedEdit value={String(row[timeLoggedCol] ?? '')} onSave={v => onCellChange(row, timeLoggedCol, v)} />
                          )}
                        </td>
                      )}
                      <td className="px-4 py-2">
                        {bucketCol && (
                          canEdit ? (
                            <PillSelect
                              value={String(row[bucketCol] ?? '')}
                              options={BUCKET_OPTIONS}
                              colors={BUCKET_COLORS}
                              onChange={v => onCellChange(row, bucketCol, v)}
                            />
                          ) : (
                            <StatusBadge value={String(row[bucketCol] ?? '')} colors={BUCKET_COLORS} />
                          )
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {statusCol && !canEdit && (
                          <StatusBadge value={String(row[statusCol] ?? '')} colors={STATUS_COLORS} />
                        )}
                        {statusCol && canEdit && (
                          <PillSelect
                            value={String(row[statusCol] ?? '')}
                            options={STATUS_OPTIONS}
                            colors={STATUS_COLORS}
                            onChange={v => onCellChange(row, statusCol, v)}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
