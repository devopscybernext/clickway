'use client';

import { useRef, useState } from 'react';
import { SheetData } from '@/lib/dataStore';
import { ENTRY_FORMS } from '@/lib/forms';
import { MARKETING_DEPARTMENT_OPTIONS } from '@/lib/config';
import { isoDate, storedDate } from '@/lib/dataImport';
import { toHM, formatHHMM, DURATION_HOUR_OPTIONS, DURATION_MINUTE_OPTIONS } from './SpecificCharts';

// Tasks Assigned (Web and Marketing), for the Super Admin and HM while editing: an editor for every column that
// has no editor of its own (Task URL, Priority, Deadline, Timestamp, Total Time, Time Logged On AC, Team Required,
// Task Information, Preferred Resource, Assigned By, Department, the Marketing notes, any new column).
// What each one saves is the cell as the sheet holds it: "HH.MM Hours" for times, the team's date format for dates.

type Save = (row: SheetData, col: string, value: string) => Promise<void>;

const formOptions = (form: 'web-task' | 'marketing-task', header: string) =>
  ENTRY_FORMS[form].fields.find(f => f.header === header)?.options ?? [];

type Kind =
  | { type: 'text' }
  | { type: 'choice'; options: string[] }
  | { type: 'date' }
  | { type: 'timestamp' }
  | { type: 'duration' };

function kindOf(column: string, personOptions: string[]): Kind {
  const c = column.trim().toLowerCase();
  if (c === 'timestamp') return { type: 'timestamp' };
  if (c.includes('deadline')) return { type: 'date' };
  if (c.includes('time logged') || c.includes('total hours') || (c.includes('total time') && !c.includes('est'))) return { type: 'duration' };
  if (c.includes('priority')) return { type: 'choice', options: formOptions('web-task', 'Task Priority') };
  if (c.includes('team required')) return { type: 'choice', options: formOptions('web-task', 'Team Required') };
  if (c.includes('task information')) return { type: 'choice', options: formOptions('web-task', 'Task Information') };
  if (c.includes('preferred resource')) return { type: 'choice', options: personOptions };
  if (c === 'department') return { type: 'choice', options: MARKETING_DEPARTMENT_OPTIONS };
  return { type: 'text' };
}

const fieldStyle = { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)' };
const fieldCls = 'px-2 py-1 text-xs rounded border focus:outline-none disabled:opacity-60 transition-colors';

// "saving" spinner and the tick after a save, shared by every kind
function useSave(onSave: Save, row: SheetData, col: string) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const run = async (value: string): Promise<boolean> => {
    setSaving(true); setSaved(false);
    try {
      await onSave(row, col, value);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  };
  const marks = (
    <>
      {saving && <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: 'var(--cn-accent)' }} />}
      {saved && <span className="text-xs shrink-0" style={{ color: '#22c55e' }}>✓</span>}
    </>
  );
  return { saving, run, marks };
}

function TextField({ value, row, col, onSave, wide, validate }: {
  value: string; row: SheetData; col: string; onSave: Save; wide?: boolean;
  // returns the text to save, or null to refuse it (the cell goes back to what it held)
  validate?: (text: string) => string | null;
}) {
  const [current, setCurrent] = useState(value);
  const [problem, setProblem] = useState('');
  const original = useRef(value);
  const { saving, run, marks } = useSave(onSave, row, col);

  const commit = async () => {
    if (current === original.current) return;
    const text = validate ? validate(current) : current;
    if (text === null) { setProblem('Not a date'); setCurrent(original.current); return; }
    setProblem('');
    if (text === original.current) { setCurrent(text); return; }
    if (await run(text)) { original.current = text; setCurrent(text); } else setCurrent(original.current); // (a new saved value restarts the cell, see EveryColumnCell)
  };

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text" value={current} disabled={saving} placeholder="—"
        aria-label={`Edit ${col}`}
        onChange={e => { setCurrent(e.target.value); setProblem(''); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
        onBlur={() => void commit()}
        className={`${fieldCls} ${wide ? 'w-44' : 'w-28'}`}
        style={{ ...fieldStyle, ...(problem ? { borderColor: '#ef4444' } : {}) }}
      />
      {problem && <span role="alert" className="text-[10px]" style={{ color: '#ef4444' }}>{problem}</span>}
      {marks}
    </div>
  );
}

function ChoiceField({ value, options, row, col, onSave }: { value: string; options: string[]; row: SheetData; col: string; onSave: Save }) {
  const [current, setCurrent] = useState(value);
  const { saving, run, marks } = useSave(onSave, row, col);
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={current} disabled={saving} aria-label={`Edit ${col}`}
        onChange={async e => { const v = e.target.value; setCurrent(v); if (!(await run(v))) setCurrent(value); }}
        className={`${fieldCls} cursor-pointer min-w-[110px]`} style={fieldStyle}
      >
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
        {current && !options.includes(current) && <option value={current}>{current}</option>}
      </select>
      {marks}
    </div>
  );
}

function DateField({ value, order, row, col, onSave }: { value: string; order: 'dmy' | 'mdy'; row: SheetData; col: string; onSave: Save }) {
  const iso = isoDate(value, order);
  const { saving, run, marks } = useSave(onSave, row, col);
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="date" value={iso} disabled={saving} aria-label={`Edit ${col}`}
        // a value that is not a date shows empty here; it is only replaced when a date is picked
        onChange={e => void run(e.target.value ? storedDate(e.target.value, order).value : '')}
        className={`${fieldCls} cursor-pointer`} style={fieldStyle}
      />
      {marks}
    </div>
  );
}

function DurationField({ value, row, col, onSave }: { value: string; row: SheetData; col: string; onSave: Save }) {
  const { h, m } = toHM(value);
  const { saving, run, marks } = useSave(onSave, row, col);
  return (
    <div className="flex items-center gap-1">
      <select value={h} disabled={saving} aria-label={`Edit ${col} hours`} onChange={e => void run(formatHHMM(Number(e.target.value), m))}
        className={`${fieldCls} cursor-pointer`} style={fieldStyle}>
        {DURATION_HOUR_OPTIONS.map(o => <option key={o} value={o}>{String(o).padStart(2, '0')}</option>)}
      </select>
      <span style={{ color: 'var(--cn-text-muted)' }}>:</span>
      <select value={m} disabled={saving} aria-label={`Edit ${col} minutes`} onChange={e => void run(formatHHMM(h, Number(e.target.value)))}
        className={`${fieldCls} cursor-pointer`} style={fieldStyle}>
        {DURATION_MINUTE_OPTIONS.map(o => <option key={o} value={o}>{String(o).padStart(2, '0')}</option>)}
      </select>
      {marks}
    </div>
  );
}

export default function EveryColumnCell({ column, value, row, onSave, personOptions, dateOrder }: {
  column: string; value: string; row: SheetData; onSave: Save; personOptions: string[]; dateOrder: 'dmy' | 'mdy';
}) {
  const kind = kindOf(column, personOptions);
  // key={value}: when the saved value changes (after a save, or a refresh) the field starts again from it
  switch (kind.type) {
    case 'choice': return <ChoiceField key={value} value={value} options={kind.options} row={row} col={column} onSave={onSave} />;
    case 'date': return <DateField value={value} order={dateOrder} row={row} col={column} onSave={onSave} />;
    case 'duration': return <DurationField value={value} row={row} col={column} onSave={onSave} />;
    case 'timestamp':
      // a Timestamp has to stay a date (and not empty: a row without one is not listed at all)
      return <TextField key={value} value={value} row={row} col={column} onSave={onSave} wide
        validate={text => { const d = storedDate(text, dateOrder); return d.ok ? d.value : null; }} />;
    default: return <TextField key={value} value={value} row={row} col={column} onSave={onSave} wide />;
  }
}
