'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, X, ChevronDown as ChevDown, ChevronLeft, ChevronRight, Copy, Check } from 'lucide-react';
import { SheetData } from '@/lib/googleSheets';
import { STATUS_COLORS } from './SpecificCharts';

const PAGE_SIZE = 30;

// ─── Avatar helpers ───────────────────────────────────────────────────────────
const AVATAR_PALETTE = ['#FE4A23','#3b82f6','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#84cc16','#ef4444','#14b8a6'];

const PERSON_PHOTOS: Record<string, string> = {
  akash:     '/team/Akash.png',
  lovepreet: '/team/Lovepreet.png',
  manpreet:  '/team/Manpreet.png',
  pawan:     '/team/Pawan.png',
  robin:     '/team/Robin.png',
  shubham:   '/team/Shubham.png',
  vinay:     '/team/Vinay.png',
  dhruv:     '/team/Dhruv.png',
  kiran:     '/team/Kiran.png',
  yash:      '/team/Yash.png',
  muskan:    '/team/Muskan.png',
  moon:      '/team/Moon.png',
  sameer:    '/team/Sameer.png',
};

function getPersonPhoto(name: string): string {
  const lower = name.trim().toLowerCase();
  const key = Object.keys(PERSON_PHOTOS).find(k => lower.includes(k));
  return key ? PERSON_PHOTOS[key] : '';
}

function getAvatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function getInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function PersonCell({ name }: { name: string }) {
  const [imgOk, setImgOk] = useState(true);
  const photo = getPersonPhoto(name);

  useEffect(() => { setImgOk(true); }, [photo]);

  return (
    <div className="flex items-center gap-2">
      {photo && imgOk ? (
        <img
          src={photo}
          alt={name}
          width={24}
          height={24}
          className="w-6 h-6 rounded-full object-cover shrink-0"
          onError={() => setImgOk(false)}
        />
      ) : (
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
          style={{ background: getAvatarColor(name) }}
        >
          {getInitials(name)}
        </div>
      )}
      <span className="truncate">{name}</span>
    </div>
  );
}

const FILTER_CONFIG: Record<'1' | '2', { term: string; label: string }[]> = {
  '1': [
    { term: 'project name',      label: 'Project Name' },
    { term: 'priority',          label: 'Priority' },
    { term: 'department',        label: 'Department' },
    { term: 'assigned person',   label: 'Assigned Person' },
    { term: 'assigned to',       label: 'Assigned To' },
    { term: 'task daily bucket', label: 'Task Daily Bucket' },
    { term: 'task status',       label: 'Task Status' },
    { term: 'pm status',         label: 'PM Status' },
    { term: 'email',             label: 'Assigned By' },
  ],
  '2': [
    { term: 'project name',      label: 'Project Name' },
    { term: 'assigned to',       label: 'Assigned To' },
    { term: 'task daily bucket', label: 'Task Daily Bucket' },
    { term: 'time logged',       label: 'Time Logged' },
    { term: 'task status',       label: 'Task Status' },
  ],
};

// Returns default visible columns per sheet
function getDefaultCols(allCols: string[], sheetNum: '1' | '2'): string[] {
  if (sheetNum === '1') {
    const terms = [
      'project name', 'task name', 'task url', 'time estimation', 'task estimation',
      'department', 'assigned person', 'assigned to', 'task daily bucket', 'task status',
      'time logged', 'today bucket set', 'pm status', 'status updation',
      'preferred resource',
    ];
    return allCols.filter(h => {
      const lower = h.toLowerCase();
      return terms.some(t => lower.includes(t));
    });
  }
  // Sheet 2 — Resource Availability
  const exact = ['name'];
  const includes = ["today's project", 'dailytime', 'daily time', 'tommorow running task', 'tomorrow running task', 'tommorow manual', 'tomorrow manual', 'day after running task', 'day after task name', 'day after manual'];
  return allCols.filter(h => {
    const lower = h.toLowerCase();
    return exact.includes(lower) || includes.some(t => lower.includes(t));
  });
}

function findCol(headers: string[], term: string): string | undefined {
  const t = term.toLowerCase();
  return headers.find(h => h.toLowerCase().includes(t));
}

// ─── Multi-Select Dropdown ───────────────────────────────────────────────────
interface MultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
  accent?: boolean;
}

export function MultiSelect({ label, options, selected, onChange, accent = false }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));
  const isActive = selected.length > 0 && selected.length < options.length;
  const btnLabel = selected.length === 0
    ? 'All'
    : selected.length === options.length
    ? 'All'
    : selected.length === 1
    ? (selected[0].length > 16 ? selected[0].slice(0, 16) + '…' : selected[0])
    : `${selected.length} selected`;

  const toggle = (val: string) =>
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);

  const activeStyle = accent
    ? 'bg-[#FE4A23]/20 border-[#FE4A23] text-[#FE4A23]'
    : 'bg-[#FE4A23]/20 border-[#FE4A23] text-[#FE4A23]';

  return (
    <div ref={ref} className="relative flex flex-col gap-1 w-full sm:w-auto sm:min-w-[150px]">
      <label style={{ color: 'var(--cn-text-muted)' }} className="text-xs font-medium">{label}</label>
      <button
        onClick={() => setOpen(o => !o)}
        style={!isActive ? { background: 'var(--cn-bg-input)', borderColor: 'var(--cn-border)', color: 'var(--cn-text-primary)' } : undefined}
        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm border transition-colors w-full ${
          isActive
            ? activeStyle
            : 'hover:border-[#FE4A23]'
        }`}
      >
        <span className="truncate">{btnLabel}</span>
        <ChevDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div style={{ background: 'var(--cn-bg-dropdown)', borderColor: 'var(--cn-border)', boxShadow: '0 4px 16px rgba(0,0,0,0.30)' }} className="absolute top-full left-0 mt-1 w-[min(16rem,90vw)] border rounded-md z-50 flex flex-col max-h-72">
          <div style={{ borderColor: 'var(--cn-border)' }} className="p-2 border-b">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)' }}
              className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#FE4A23] placeholder-[var(--cn-text-faint)]"
            />
          </div>
          <div style={{ borderColor: 'var(--cn-border)' }} className="flex gap-3 px-3 py-1.5 border-b">
            <button onClick={() => onChange(options)} className="text-xs text-[#FE4A23] hover:opacity-80 transition-opacity">
              Select all
            </button>
            <span style={{ color: 'var(--cn-border)' }}>·</span>
            <button onClick={() => onChange([])} style={{ color: 'var(--cn-text-muted)' }} className="text-xs hover:text-white transition-colors">
              Clear
            </button>
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <p style={{ color: 'var(--cn-text-faint)' }} className="text-xs text-center py-3">No options</p>
            ) : (
              filtered.map(opt => (
                <label key={opt} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer" style={{ ['--hover-bg' as string]: 'var(--cn-bg-input)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--cn-bg-input)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <input
                    type="checkbox"
                    checked={selected.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="rounded accent-[#FE4A23] cursor-pointer"
                  />
                  <span style={{ color: 'var(--cn-text-primary)' }} className="text-sm truncate">{opt}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inline Select Cell (generic — used for Assigned Person & Bucket) ────────
interface InlineSelectCellProps {
  value: string;
  options: string[];
  row: SheetData;
  col: string;
  onStatusChange: (row: SheetData, col: string, newValue: string) => Promise<void>;
  showAvatar?: boolean;
}

function InlineSelectCell({ value, options, row, col, onStatusChange, showAvatar = false }: InlineSelectCellProps) {
  const [current, setCurrent] = useState(value || options[0] || '');
  const [saving, setSaving]   = useState(false);
  const [saved,  setSaved]    = useState(false);

  useEffect(() => {
    if (!saving) setCurrent(value || options[0] || '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVal = e.target.value;
    setCurrent(newVal);
    setSaving(true);
    setSaved(false);
    try {
      await onStatusChange(row, col, newVal);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setCurrent(value);
    } finally {
      setSaving(false);
    }
  };

  const chevron = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`;

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {showAvatar && current && <PersonCell name={current} />}
      <select
        value={current}
        onChange={handleChange}
        disabled={saving}
        className="text-xs rounded-lg border focus:outline-none cursor-pointer disabled:opacity-60 transition-colors appearance-none"
        style={{
          background: 'var(--cn-bg-input)',
          color: 'var(--cn-text-primary)',
          borderColor: 'var(--cn-border)',
          padding: '4px 24px 4px 8px',
          minWidth: showAvatar ? 0 : 110,
          maxWidth: showAvatar ? 0 : undefined,
          width: showAvatar ? 0 : undefined,
          opacity: showAvatar ? 0 : 1,
          position: showAvatar ? 'absolute' : 'relative',
          backgroundImage: chevron,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 6px center',
        }}
      >
        {options.map(opt => (
          <option key={opt} value={opt} style={{ background: '#1a1a1a', color: '#fff' }}>{opt}</option>
        ))}
        {current && !options.map(o => o.toLowerCase()).includes(current.toLowerCase()) && (
          <option value={current}>{current}</option>
        )}
      </select>
      {!showAvatar && saving  && <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: 'var(--cn-accent)' }} />}
      {!showAvatar && saved   && <span className="text-xs shrink-0" style={{ color: '#22c55e' }}>✓</span>}
    </div>
  );
}

// ─── Assigned Person Select (avatar + name + hidden select overlay) ───────────
function AssignedPersonSelect({ value, options, row, col, onStatusChange }: Omit<InlineSelectCellProps, 'showAvatar'>) {
  const [current, setCurrent] = useState(value || '');
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  useEffect(() => {
    if (!saving) setCurrent(value || '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVal = e.target.value;
    setCurrent(newVal);
    setSaving(true);
    setSaved(false);
    try {
      await onStatusChange(row, col, newVal);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setCurrent(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {/* Avatar + name display */}
      <div className="relative flex items-center gap-1.5 min-w-0">
        {current && <PersonCell name={current} />}
        {/* Invisible select overlay so clicking the avatar opens it */}
        <select
          value={current}
          onChange={handleChange}
          disabled={saving}
          title="Click to change"
          className="absolute inset-0 opacity-0 cursor-pointer w-full disabled:cursor-not-allowed"
          style={{ zIndex: 1 }}
        >
          {options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
          {current && !options.map(o => o.toLowerCase()).includes(current.toLowerCase()) && (
            <option value={current}>{current}</option>
          )}
        </select>
      </div>
      {/* Edit icon hint */}
      <svg className="w-3 h-3 shrink-0 opacity-40" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ color: 'var(--cn-accent)' }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l-4 1 1-4 9.293-9.293a1 1 0 011.414 0l2.586 2.586a1 1 0 010 1.414L9 13z" />
      </svg>
      {saving && <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: 'var(--cn-accent)' }} />}
      {saved  && <span className="text-xs shrink-0" style={{ color: '#22c55e' }}>✓</span>}
    </div>
  );
}

// ─── PM Status Select ─────────────────────────────────────────────────────────
const PM_STATUS_OPTIONS = ['No Action Taken', 'Changes', 'Approved', 'Submitted To Client', 'TicketClosed'];
const PM_STATUS_COLORS: Record<string, string> = {
  'no action taken':     '#6b7280',
  'n/a':                 '#6b7280',
  'rework':              '#dc2626',
  'approved':            '#16a34a',
  'submitted to client': '#6d28d9',
  'changes':             '#dc2626',
  'ticketclosed':        '#7c3aed',
};
// Per-status text colors (defaults to white if not listed)
const PM_STATUS_TEXT_COLORS: Record<string, string> = {};

interface PmStatusSelectProps {
  value: string;
  row: SheetData;
  col: string;
  onStatusChange: (row: SheetData, col: string, newValue: string) => Promise<void>;
}

function PmStatusSelect({ value, row, col, onStatusChange }: PmStatusSelectProps) {
  const match = PM_STATUS_OPTIONS.find(o => o.toLowerCase() === value.toLowerCase()) ?? 'No Action Taken';
  const [current, setCurrent] = useState(match);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saving) {
      const m = PM_STATUS_OPTIONS.find(o => o.toLowerCase() === value.toLowerCase()) ?? 'No Action Taken';
      setCurrent(m);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVal = e.target.value;
    setCurrent(newVal);
    setSaving(true);
    setSaved(false);
    try {
      await onStatusChange(row, col, newVal);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setCurrent(match);
    } finally {
      setSaving(false);
    }
  };

  const color = PM_STATUS_COLORS[current.toLowerCase()] ?? '#6b7280';

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={current}
        onChange={handleChange}
        disabled={saving}
        className="text-xs font-semibold rounded-full pl-2.5 pr-7 py-1 border-0 focus:outline-none cursor-pointer disabled:opacity-60 transition-colors appearance-none"
        style={{ backgroundColor: color, color: '#fff', minWidth: '130px', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
      >
        {PM_STATUS_OPTIONS.map(opt => (
          <option key={opt} value={opt} style={{ background: '#1a1a1a', color: '#fff' }}>{opt}</option>
        ))}
      </select>
      {saving && <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--cn-accent)' }} />}
      {saved && <span className="text-xs" style={{ color: '#22c55e' }}>✓</span>}
    </div>
  );
}

// ─── Status Select ────────────────────────────────────────────────────────────
const STATUS_OPTIONS: string[] = [
  'No Action Taken',
  'To Be Started',
  'In Progress',
  'Testing',
  'On Hold',
  'Submitted To Akash',
  'Submitted To PM',
];
const STATUS_OPTIONS_LOWER = STATUS_OPTIONS.map(s => s.toLowerCase());

interface StatusSelectProps {
  value: string;
  row: SheetData;
  col: string;
  onStatusChange: (row: SheetData, col: string, newValue: string) => Promise<void>;
  options?: string[];
}

function StatusSelect({ value, row, col, onStatusChange, options }: StatusSelectProps) {
  const opts = options ?? STATUS_OPTIONS;
  const optsLower = opts.map(s => s.toLowerCase());
  const normalise = (v: string) => {
    const i = optsLower.indexOf(v.toLowerCase());
    return i !== -1 ? opts[i] : v;
  };
  const [current, setCurrent] = useState(() => normalise(value));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync dropdown when parent data refreshes from sheet
  useEffect(() => {
    if (!saving) setCurrent(normalise(value));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVal = e.target.value;
    setCurrent(newVal);
    setSaving(true);
    setSaved(false);
    try {
      await onStatusChange(row, col, newVal);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setCurrent(value); // revert on error
    } finally {
      setSaving(false);
    }
  };

  const color = STATUS_COLORS[current.toLowerCase()] ?? 'var(--cn-border)';

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={current}
        onChange={handleChange}
        disabled={saving}
        className="text-xs font-semibold rounded-full pl-2.5 pr-7 py-1 border-0 focus:outline-none cursor-pointer disabled:opacity-60 transition-colors appearance-none"
        style={{ backgroundColor: color, color: '#fff', minWidth: '130px', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
      >
        {opts.map(opt => (
          <option key={opt} value={opt} style={{ background: '#1a1a1a', color: '#fff' }}>
            {opt}
          </option>
        ))}
        {/* keep current value if not in known list */}
        {!optsLower.includes(current.toLowerCase()) && current && (
          <option value={current}>{current}</option>
        )}
      </select>
      {saving && <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--cn-accent)' }} />}
      {saved && <span className="text-xs" style={{ color: '#22c55e' }}>✓</span>}
    </div>
  );
}

// ─── Inline Edit Cell ─────────────────────────────────────────────────────────
interface InlineEditCellProps {
  value: string;
  row: SheetData;
  col: string;
  onStatusChange: (row: SheetData, col: string, newValue: string) => Promise<void>;
}

function InlineEditCell({ value, row, col, onStatusChange }: InlineEditCellProps) {
  const [current, setCurrent] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const original = useRef(value);

  useEffect(() => {
    if (!saving) {
      setCurrent(value);
      original.current = value;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleSave = async () => {
    if (current === original.current) return;
    setSaving(true);
    setSaved(false);
    try {
      await onStatusChange(row, col, current);
      original.current = current;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setCurrent(original.current);
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
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--cn-accent)')}
        onBlur={e => {
          e.currentTarget.style.borderColor = 'var(--cn-border)';
          handleSave();
        }}
        disabled={saving}
        placeholder="—"
        className="w-20 px-2 py-1 text-xs rounded border focus:outline-none disabled:opacity-60 transition-colors"
        style={{
          background: 'var(--cn-bg-input)',
          color: 'var(--cn-text-primary)',
          borderColor: 'var(--cn-border)',
        }}
      />
      {saving && (
        <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: 'var(--cn-accent)' }} />
      )}
      {saved && (
        <span className="text-xs shrink-0" style={{ color: '#22c55e' }}>✓</span>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props {
  data: SheetData[];
  headers: string[];
  sheetNum: '1' | '2';
  onStatusChange?: (row: SheetData, col: string, newValue: string) => Promise<void>;
  readOnlyStatus?: boolean;
  readOnlyPmStatus?: boolean;
  showCopy?: boolean;
  defaultPersonFilter?: string;
  editPersonBucket?: boolean;
  readOnlyBucket?: boolean;
  readOnlyAssigned?: boolean;
  rowCopy?: boolean;
  restrictToBucketEdit?: boolean;
  editStatusUpdation?: boolean;
  hiddenCols?: string[];
  onlyColTerms?: string[];
  hiddenFilterTerms?: string[];
  // Overrides for the built-in dropdown option lists — used where a data
  // source's valid values differ from Bandwidth Allocation's (e.g. Marketing's
  // Task Status Updation includes "Submitted To Admin"/"Task Closed")
  statusOptions?: string[];
  todayBucketSetOptions?: string[];
  assignedPersonOptions?: string[];
}

const BUCKET_OPTIONS = ['Today', 'Tomorrow', 'Day After Tomorrow', 'Everyday', 'No Action Taken', 'Submitted', 'To Be Expected'];
const BUCKET_OPTIONS_LOWER = BUCKET_OPTIONS.map(s => s.toLowerCase());
// Sheet data uses misspelled values — normalize to canonical display labels
const BUCKET_ALIAS_MAP: Record<string, string> = {
  'tommorow': 'tomorrow',
  'tommorrow': 'tomorrow',
  'tomorow': 'tomorrow',
  'day after tommorow': 'day after tomorrow',
  'day after tommorrow': 'day after tomorrow',
};
const normalizeBucket = (v: string) => {
  const lower = v.trim().toLowerCase();
  return BUCKET_ALIAS_MAP[lower] ?? lower;
};
const TODAY_BUCKET_SET_OPTIONS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'URGENT'];

// Sheet timestamps are "DD/MM/YYYY[ HH:MM:SS]" — parse to epoch ms, NaN if unparseable
function parseTimestamp(v: string): number {
  const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?$/);
  if (!m) return NaN;
  const [, d, mo, y, h = '0', mi = '0', s = '0'] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).getTime();
}

export default function FilteredDataTable({ data, headers, sheetNum, onStatusChange, readOnlyStatus, readOnlyPmStatus, showCopy, defaultPersonFilter, editPersonBucket, readOnlyBucket, readOnlyAssigned, rowCopy, restrictToBucketEdit, editStatusUpdation, hiddenCols, onlyColTerms, hiddenFilterTerms, statusOptions, todayBucketSetOptions, assignedPersonOptions }: Props) {
  const [copiedRow, setCopiedRow] = useState<number | null>(null);
  const effectiveStatusOptions = statusOptions ?? STATUS_OPTIONS;
  const effectiveStatusOptionsLower = effectiveStatusOptions.map(s => s.toLowerCase());
  const effectiveTodayBucketSetOptions = todayBucketSetOptions ?? TODAY_BUCKET_SET_OPTIONS;

  const copyRow = (row: SheetData) => {
    const projectCol = headers.find(h => h.toLowerCase().includes('project'));
    const urlCol     = headers.find(h => h.toLowerCase().includes('url') || h.toLowerCase().includes('link'));
    const project    = projectCol ? String(row[projectCol] ?? '').trim() : '';
    const url        = urlCol     ? String(row[urlCol]     ?? '').trim() : '';
    const text       = `Project Name: ${project}\nTask URL: ${url}\nEst Time: `;
    navigator.clipboard.writeText(text).catch(() => {});
    const idx = Number(row['__row']);
    setCopiedRow(idx);
    setTimeout(() => setCopiedRow(null), 2000);
  };

  // Permanently hide submitted-to-client rows; Task Closed is now a selectable
  // (but default-unselected) Task Status filter option instead of being hidden outright.
  const statusCol = headers.find(h => h.toLowerCase().includes('task status'));
  const HIDDEN_STATUSES = ['submitted to client'];
  const filteredData = useMemo(
    () => statusCol
      ? data.filter(r => !HIDDEN_STATUSES.includes(String(r[statusCol] ?? '').trim().toLowerCase()))
      : data,
    [data, statusCol]
  );

  // Compute person options from data for the AssignedPersonSelect
  const personColHeader = useMemo(
    () => headers.find(h => h.toLowerCase().includes('assigned person') || h.toLowerCase().includes('assigned to')),
    [headers]
  );
  const personOptions = useMemo(() => {
    if (!personColHeader) return [];
    const vals = [...new Set(data.map(r => String(r[personColHeader] ?? '').trim()).filter(Boolean))];
    if (assignedPersonOptions) {
      const extras = vals.filter(v => !assignedPersonOptions.includes(v));
      return [...assignedPersonOptions, ...extras.sort()];
    }
    return vals.sort();
  }, [data, personColHeader]);

  // Bucket options: fixed list only — avoids surfacing typos from sheet data
  const bucketColHeader = useMemo(
    () => headers.find(h => h.toLowerCase().includes('task daily bucket') || h.toLowerCase().includes('bucket')),
    [headers]
  );
  const bucketOptions = BUCKET_OPTIONS;

  // Timestamp column — used to default-sort newest entries first, regardless of
  // where a row physically lives in the sheet (entries aren't reliably appended
  // at the bottom; some get inserted near the top instead)
  const timestampCol = useMemo(
    () => headers.find(h => h.toLowerCase().includes('timestamp')),
    [headers]
  );

  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [colsInitialized, setColsInitialized] = useState(false);

  const filterCols = useMemo(
    () => FILTER_CONFIG[sheetNum]
      .filter(cfg => !hiddenFilterTerms?.includes(cfg.term))
      .map(cfg => ({ ...cfg, col: findCol(headers, cfg.term) }))
      .filter(cfg => cfg.col != null) as { term: string; label: string; col: string }[],
    [headers, sheetNum, hiddenFilterTerms]
  );

  // Column used to highlight "Today" rows
  const bucketCol = useMemo(
    () => filterCols.find(c => c.term === 'task daily bucket')?.col,
    [filterCols]
  );

  // All real headers (exclude auto-named "Column N" placeholders)
  const allCols = useMemo(
    () => headers.filter(h => {
      if (/^column\s+\w+$/i.test(h.trim()) || h === '__row' || hiddenCols?.includes(h)) return false;
      if (onlyColTerms) {
        const lower = h.toLowerCase();
        return onlyColTerms.some(t => lower.includes(t));
      }
      return true;
    }),
    [headers, hiddenCols, onlyColTerms]
  );

  // Initialize selected columns once when headers load (sheet-specific defaults)
  useEffect(() => {
    if (colsInitialized || allCols.length === 0) return;
    const defaults = getDefaultCols(allCols, sheetNum);
    setSelectedCols(defaults.length > 0 ? defaults : allCols);
    setColsInitialized(true);
  }, [allCols, colsInitialized, sheetNum]);

  // Visible headers preserve original column order
  const visibleHeaders = useMemo(
    () => allCols.filter(h => selectedCols.includes(h)),
    [allCols, selectedCols]
  );

  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    filterCols.forEach(({ term, col }) => {
      const dataVals = [...new Set(
        filteredData.map(r => String(r[col] ?? '').trim()).filter(Boolean)
      )];
      if (term === 'task status') {
        // Always list all known statuses + any unknown ones from data
        const extras = dataVals.filter(v => !effectiveStatusOptionsLower.includes(v.toLowerCase()));
        opts[col] = [...effectiveStatusOptions, ...extras];
      } else if (term === 'task daily bucket') {
        const BUCKET_ALIASES = ['n/a', 'tommorow', 'tommorrow', 'tomorow', 'day after tommorow', 'day after tommorrow'];
        const extras = dataVals.filter(v => !BUCKET_OPTIONS_LOWER.includes(v.toLowerCase()) && !BUCKET_ALIASES.includes(v.toLowerCase()));
        opts[col] = [...BUCKET_OPTIONS, ...extras];
      } else {
        opts[col] = dataVals.sort();
      }
    });
    return opts;
  }, [filteredData, filterCols]);

  // Apply default filters once data/options are ready
  useEffect(() => {
    if (defaultsApplied || Object.keys(filterOptions).length === 0 || sheetNum !== '1') {
      if (sheetNum !== '1' && !defaultsApplied) {
        // For sheet 2, still apply person filter if needed
        if (defaultPersonFilter) {
          const personCfg = filterCols.find(c => c.term === 'assigned to' || c.term === 'assigned person');
          if (personCfg) {
            const opts = filterOptions[personCfg.col] ?? [];
            const pLower = defaultPersonFilter.toLowerCase();
            const match = opts.find(o => o.toLowerCase() === pLower)
              ?? opts.find(o => o.toLowerCase().includes(pLower) || pLower.includes(o.toLowerCase()));
            if (match) setFilters({ [personCfg.col]: [match] });
          }
        }
        setDefaultsApplied(true);
      }
      return;
    }
    const defaults: Record<string, string[]> = {};
    filterCols.forEach(({ term, col }) => {
      const opts = filterOptions[col] ?? [];
      if (term === 'task status') {
        // Task Closed is available to select but unchecked by default
        defaults[col] = opts.filter(v => v.toLowerCase() !== 'task closed');
      } else if (term === 'task daily bucket') {
        defaults[col] = opts.filter(v => {
          const lower = v.toLowerCase();
          return lower === 'today' || lower === 'everyday' || lower === 'no action taken' || lower.includes('submit');
        });
      } else if ((term === 'assigned person' || term === 'assigned to') && defaultPersonFilter) {
        const pLower = defaultPersonFilter.toLowerCase();
        const match = opts.find(o => o.toLowerCase() === pLower)
          ?? opts.find(o => o.toLowerCase().includes(pLower) || pLower.includes(o.toLowerCase()));
        if (match) defaults[col] = [match];
      }
    });
    if (Object.keys(defaults).length > 0) setFilters(defaults);
    setDefaultsApplied(true);
  }, [filterOptions, defaultsApplied, filterCols, sheetNum, defaultPersonFilter]);

  // Apply filters
  const filtered = useMemo(
    () => filteredData.filter(row =>
      filterCols.every(({ term, col }) => {
        const selected = filters[col] ?? [];
        if (selected.length === 0) return true;
        const cellVal = String(row[col] ?? '').trim();
        if (term === 'task status') {
          // case-insensitive match since options use proper case but data may vary
          return selected.some(s => s.toLowerCase() === cellVal.toLowerCase());
        }
        if (term === 'task daily bucket') {
          // case-insensitive + handle sheet typos like "Tommorow" -> "Tomorrow"
          return selected.some(s => normalizeBucket(s) === normalizeBucket(cellVal));
        }
        return selected.includes(cellVal);
      })
    ),
    [data, filters, filterCols]
  );

  // Sort — default (no column picked) shows newest entries first, by actual
  // Timestamp value (falls back to sheet row position if unavailable/unparseable)
  const sorted = useMemo(() => {
    if (!sortCol) {
      return [...filtered].sort((a, b) => {
        if (timestampCol) {
          const at = parseTimestamp(String(a[timestampCol] ?? ''));
          const bt = parseTimestamp(String(b[timestampCol] ?? ''));
          if (!isNaN(at) && !isNaN(bt)) return bt - at;
          if (!isNaN(bt)) return 1;
          if (!isNaN(at)) return -1;
        }
        return Number(b['__row'] ?? 0) - Number(a['__row'] ?? 0);
      });
    }
    return [...filtered].sort((a, b) => {
      const av = a[sortCol] ?? '';
      const bv = b[sortCol] ?? '';
      if (typeof av === 'number' && typeof bv === 'number')
        return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [filtered, sortCol, sortDir, timestampCol]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageData = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setPage(1);
  };

  const handleFilter = (col: string, vals: string[]) => {
    setFilters(prev => ({ ...prev, [col]: vals }));
    setPage(1);
  };

  const clearAll = () => { setFilters({}); setPage(1); setDefaultsApplied(false); };

  const activeFilterCount = Object.values(filters).filter(v => v.length > 0).length;

  const [copied, setCopied] = useState(false);

  // Fixed set of columns to include when copying the table, regardless of selected/visible columns
  const COPY_COL_TERMS = ['project name', 'task name', 'task url', 'time estimation', 'time logged on ac', 'task status'];
  const copyCols = useMemo(
    () => COPY_COL_TERMS
      .map(term => allCols.find(h => h.toLowerCase().includes(term)))
      .filter((h): h is string => h != null),
    [allCols]
  );

  const copyTable = async () => {
    const cols = copyCols;
    const rows = sorted; // all filtered rows, not just current page

    // HTML table with inline styles — renders properly in Gmail / Outlook
    const html = `
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;color:#111;">
  <thead>
    <tr style="background-color:#FE4A23;color:#ffffff;">
      <th style="border:1px solid #555;padding:8px 12px;text-align:left;white-space:nowrap;">#</th>
      ${cols.map(h => `<th style="border:1px solid #555;padding:8px 12px;text-align:left;white-space:nowrap;">${h}</th>`).join('')}
    </tr>
  </thead>
  <tbody>
    ${rows.map((row, i) => `
    <tr style="background-color:${i % 2 === 0 ? '#ffffff' : '#fafafa'};">
      <td style="border:1px solid #ddd;padding:6px 12px;color:#888;">${i + 1}</td>
      ${cols.map(h => `<td style="border:1px solid #ddd;padding:6px 12px;">${String(row[h] ?? '')}</td>`).join('')}
    </tr>`).join('')}
  </tbody>
</table>`;

    // Plain-text fallback (tab-separated)
    const text = [
      ['#', ...cols].join('\t'),
      ...rows.map((row, i) => [i + 1, ...cols.map(h => String(row[h] ?? ''))].join('\t')),
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (!headers.length) {
    return <div className="text-slate-400 text-center py-12">No data available</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-2 sm:gap-3">
        {filterCols.map(({ col, label }) => (
          <MultiSelect
            key={col}
            label={label}
            options={filterOptions[col] ?? []}
            selected={filters[col] ?? []}
            onChange={vals => handleFilter(col, vals)}
          />
        ))}

        {/* Column picker */}
        <MultiSelect
          label="Columns"
          options={allCols}
          selected={selectedCols}
          onChange={setSelectedCols}
          accent
        />

        {/* Clear filters button */}
        {activeFilterCount > 0 && (
          <div className="flex items-end col-span-2 sm:col-span-1">
            <button
              onClick={clearAll}
              title={`Clear all ${activeFilterCount} filter(s)`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all text-xs font-medium"
              style={{ background: 'var(--cn-bg-input)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              <X className="w-3.5 h-3.5" />
              Clear all ({activeFilterCount})
            </button>
          </div>
        )}
      </div>

      {/* Count + Copy button */}
      <div className="flex items-center justify-between gap-3">
        <p style={{ color: 'var(--cn-text-muted)' }} className="text-sm">
          <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{sorted.length}</span> of {filteredData.length} records
          {activeFilterCount > 0 && <span className="text-[#FE4A23]"> (filtered)</span>}
        </p>
        {showCopy && (
          <button
            onClick={copyTable}
            title="Copy table"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg cursor-pointer transition-all"
            style={copied
              ? { background: '#16a34a18', border: '1px solid #16a34a40', color: '#16a34a' }
              : { background: 'var(--cn-bg-input)', border: '1px solid var(--cn-border)', color: 'var(--cn-text-muted)' }}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ borderColor: 'var(--cn-border)' }} className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs text-left">
          <thead>
            <tr style={{ background: 'var(--cn-bg-input)', borderColor: 'var(--cn-border)' }} className="border-b">
              <th style={{ color: 'var(--cn-text-muted)' }} className="px-4 py-2 font-semibold uppercase tracking-wide text-[10px] w-12">#</th>
              {rowCopy && <th className="px-3 py-2 w-20" />}
              {visibleHeaders.map(h => (
                <th
                  key={h}
                  onClick={() => handleSort(h)}
                  style={{ color: 'var(--cn-text-muted)' }}
                  className="px-4 py-2 font-semibold uppercase tracking-wide text-[10px] cursor-pointer hover:text-[var(--cn-text-primary)] select-none group min-w-[120px]"
                >
                  <div className="flex items-center gap-1">
                    {h}
                    {sortCol === h ? (
                      sortDir === 'asc'
                        ? <ChevronUp className="w-3 h-3 text-[#FE4A23]" />
                        : <ChevronDown className="w-3 h-3 text-[#FE4A23]" />
                    ) : (
                      <ChevronsUpDown style={{ color: 'var(--cn-text-faint)' }} className="w-3 h-3" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 ? (
              <tr>
                <td colSpan={visibleHeaders.length + 1} style={{ color: 'var(--cn-text-muted)' }} className="text-center py-12">
                  No records found
                </td>
              </tr>
            ) : (
              pageData.map((row, i) => {
                const bucketVal = bucketCol ? String(row[bucketCol] ?? '').trim().toLowerCase() : '';
                const isToday = bucketCol && bucketVal === 'today';
                return (
                  <tr
                    key={String(row['__row'] ?? i)}
                    style={isToday
                      ? { backgroundColor: 'rgba(34,197,94,0.20)', borderColor: 'rgba(34,197,94,0.15)' }
                      : { backgroundColor: i % 2 === 0 ? 'var(--cn-bg-row-even)' : 'var(--cn-bg-row-odd)', borderColor: 'var(--cn-border-light)' }}
                    className={`border-b transition-colors hover:bg-[var(--cn-bg-hover)]`}
                  >
                    <td style={{ color: 'var(--cn-text-faint)' }} className="px-4 py-2 tabular-nums">
                      {(currentPage - 1) * PAGE_SIZE + i + 1}
                    </td>
                    {rowCopy && (
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={() => copyRow(row)}
                          title="Copy task info"
                          className="w-8 h-8 rounded-lg inline-flex items-center justify-center cursor-pointer transition-all"
                          style={{
                            background: copiedRow === Number(row['__row']) ? '#16a34a18' : 'var(--cn-bg-input)',
                            color:      copiedRow === Number(row['__row']) ? '#16a34a'   : 'var(--cn-text-muted)',
                            border:     `1px solid ${copiedRow === Number(row['__row']) ? '#16a34a40' : 'var(--cn-border)'}`,
                          }}
                        >
                          {copiedRow === Number(row['__row'])
                            ? <Check className="w-3.5 h-3.5" />
                            : <Copy  className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                    )}
                    {visibleHeaders.map(h => {
                      const val = String(row[h] ?? '');
                      const isUrl = h.toLowerCase().includes('url') || h.toLowerCase().includes('link');
                      const isStatusUpdation = h.toLowerCase().includes('status updation');
                      const isStatus = h.toLowerCase().includes('task status') && !isStatusUpdation;
                      const isPmStatus = h.toLowerCase().includes('pm status');
                      const isTimeLogged = h.toLowerCase().includes('time logged');
                      const isTimeEst = h.toLowerCase().includes('time estim');
                      const isAssigned = h.toLowerCase().includes('assigned person') || h.toLowerCase().includes('assigned to');
                      const isBucket = h.toLowerCase().includes('task daily bucket') || (h.toLowerCase().includes('bucket') && !h.toLowerCase().includes('today'));
                      const isTodayBucketSet = h.toLowerCase().includes('today bucket') || h.toLowerCase().includes('bucket set');
                      const statusColor = (isStatus || isStatusUpdation) ? STATUS_COLORS[val.toLowerCase()] : isPmStatus ? PM_STATUS_COLORS[val.toLowerCase()] : undefined;
                      return (
                        <td
                          key={h}
                          style={!isStatus && !isStatusUpdation ? { color: 'var(--cn-text-secondary)' } : undefined}
                          className="px-4 py-2 break-words min-w-[120px] max-w-xs"
                        >
                          {isAssigned && editPersonBucket && !readOnlyAssigned && !restrictToBucketEdit && onStatusChange ? (
                            <AssignedPersonSelect
                              value={val}
                              options={personOptions}
                              row={row}
                              col={h}
                              onStatusChange={onStatusChange}
                            />
                          ) : isBucket && editPersonBucket && !readOnlyBucket && !restrictToBucketEdit && onStatusChange ? (
                            <InlineSelectCell
                              value={BUCKET_OPTIONS.find(o => o.toLowerCase() === normalizeBucket(val)) ?? val}
                              options={bucketOptions}
                              row={row}
                              col={h}
                              onStatusChange={onStatusChange}
                            />
                          ) : isTodayBucketSet && editPersonBucket && !restrictToBucketEdit && onStatusChange ? (
                            <InlineSelectCell
                              value={val}
                              options={effectiveTodayBucketSetOptions}
                              row={row}
                              col={h}
                              onStatusChange={onStatusChange}
                            />
                          ) : isAssigned && val ? (
                            <PersonCell name={val} />
                          ) : isUrl && val ? (
                            <a
                              href={val}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline underline-offset-2 hover:opacity-80 transition-opacity text-[#FE4A23]"
                              onClick={e => e.stopPropagation()}
                            >
                              Open
                            </a>
                          ) : isPmStatus && onStatusChange && !readOnlyPmStatus && !restrictToBucketEdit ? (
                            <PmStatusSelect
                              value={val}
                              row={row}
                              col={h}
                              onStatusChange={onStatusChange}
                            />
                          ) : isPmStatus ? (
                            (() => {
                              const c = PM_STATUS_COLORS[val.toLowerCase()] ?? '#6b7280';
                              return (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                                  style={{ background: c + '20', color: c }}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />
                                  {val || 'No Action Taken'}
                                </span>
                              );
                            })()
                          ) : isStatusUpdation && (editPersonBucket || editStatusUpdation) && onStatusChange ? (
                            <StatusSelect
                              value={val}
                              row={row}
                              col={h}
                              onStatusChange={onStatusChange}
                              options={effectiveStatusOptions}
                            />
                          ) : isStatusUpdation && val ? (
                            (() => {
                              const c = statusColor ?? '#6b7280';
                              return (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                                  style={{ background: c + '20', color: c }}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />
                                  {val}
                                </span>
                              );
                            })()
                          ) : isStatus && onStatusChange && !readOnlyStatus && !restrictToBucketEdit ? (
                            <StatusSelect
                              value={val}
                              row={row}
                              col={h}
                              onStatusChange={onStatusChange}
                              options={effectiveStatusOptions}
                            />
                          ) : isStatus && val ? (
                            (() => {
                              const c = statusColor ?? '#6b7280';
                              return (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                                  style={{ background: c + '20', color: c }}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />
                                  {val}
                                </span>
                              );
                            })()
                          ) : isTimeLogged && onStatusChange && (editPersonBucket || editStatusUpdation) ? (
                            <InlineEditCell
                              value={val}
                              row={row}
                              col={h}
                              onStatusChange={onStatusChange}
                            />
                          ) : isTimeEst && onStatusChange && editPersonBucket ? (
                            <InlineEditCell
                              value={val}
                              row={row}
                              col={h}
                              onStatusChange={onStatusChange}
                            />
                          ) : isBucket ? (BUCKET_OPTIONS.find(o => o.toLowerCase() === normalizeBucket(val)) ?? val) || '—'
                          : val || '—'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ color: 'var(--cn-text-muted)' }} className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            title="Previous"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--cn-bg-input)', border: '1px solid var(--cn-border)', color: 'var(--cn-text-muted)' }}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span style={{ color: 'var(--cn-text-faint)' }} className="text-xs">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            title="Next"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--cn-bg-input)', border: '1px solid var(--cn-border)', color: 'var(--cn-text-muted)' }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {totalPages > 1 && (
          <div className="hidden sm:flex gap-1">
            <button onClick={() => setPage(1)} disabled={currentPage === 1}
              className="w-8 h-8 inline-flex items-center justify-center rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold"
              style={{ background: 'var(--cn-bg-input)', border: '1px solid var(--cn-border)', color: 'var(--cn-text-muted)' }}>«</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
              return start + i;
            }).map(p => (
              <button key={p} onClick={() => setPage(p)}
                style={p !== currentPage ? { background: 'var(--cn-bg-input)', color: 'var(--cn-text-secondary)' } : undefined}
                className={`px-2.5 py-1 rounded transition-colors ${
                  p === currentPage ? 'bg-[#FE4A23] text-white' : 'hover:bg-[var(--cn-bg-hover)]'
                }`}>
                {p}
              </button>
            ))}
            <button onClick={() => setPage(totalPages)} disabled={currentPage === totalPages}
              style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)' }}
              className="px-2 py-1 rounded hover:bg-[var(--cn-bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">»</button>
          </div>
        )}
      </div>
    </div>
  );
}
