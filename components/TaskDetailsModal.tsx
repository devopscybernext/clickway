'use client';

import { SheetData } from '@/lib/dataStore';
import { PmRowViewModal, statusColor, type ViewField } from './PMProjectBandwidth';
import { displayHHMM, STATUS_COLORS } from './SpecificCharts';
import { PM_STATUS_COLORS } from '@/lib/pmStatusColors';

// The "full details" popup of one task row in Tasks Assigned (Web and Marketing): the same layout as the
// popup of a PM project (components/PMProjectBandwidth.tsx), filled with the task's fields. Read-only.
// Everything is found by column name, so it works for both teams' columns (and shows any new column).

const lc = (s: string) => s.trim().toLowerCase();

// Columns shown as times ("HH:MM"); "Total Time Est" can also be text such as "As Per Task"
const TIME_COLS = ['time estimation', 'task estimation', 'total time est', 'time logged on ac', 'total time', 'total hours'];
// Columns shown as coloured pills
const PILL_COLS = ['task status updation', 'pm status', 'task daily bucket', 'today bucket set', 'task priority'];
// Names on screen that differ from the column's name
const LABELS: Record<string, string> = { 'time estimation': 'Daily Time', 'timestamp': 'Added On', 'email address': 'Added By', 'email': 'Added By' };

function safeUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch { return null; }
}

export default function TaskDetailsModal({ row, headers, onClose }: { row: SheetData; headers: string[]; onClose: () => void }) {
  const col = (name: string) => headers.find(h => lc(h) === name);
  const text = (name: string) => { const h = col(name); return h ? String(row[h] ?? '').trim() : ''; };
  const used = new Set<string>();

  const pill = (val: string, h: string) => {
    const key = lc(val);
    // the same colours the table uses for Task Status and PM Status; other pills use the general palette
    const bg = (lc(h) === 'pm status' ? PM_STATUS_COLORS[key] : lc(h) === 'task status updation' ? STATUS_COLORS[key] : undefined) ?? statusColor(val);
    return <span className="inline-flex items-center whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold" style={{ background: bg, color: '#fff' }}>{val}</span>;
  };

  const field = (name: string): ViewField | null => {
    const h = col(name);
    if (!h) return null;
    used.add(h);
    const raw = String(row[h] ?? '').trim();
    const empty = <span style={{ color: 'var(--cn-text-faint)' }}>—</span>;
    let node: React.ReactNode = raw || empty;
    if (raw) {
      if (TIME_COLS.includes(name)) node = /^\d/.test(raw) ? displayHHMM(raw) : raw;
      else if (name === 'task url') {
        const href = safeUrl(raw);
        node = href
          ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline break-all" style={{ color: 'var(--cn-accent)' }}>{raw}</a>
          : raw;
      } else if (PILL_COLS.includes(name)) node = pill(raw, h);
    }
    return { key: h, label: LABELS[name] ?? h, node };
  };
  const pick = (names: string[]) => names.map(field).filter((f): f is ViewField => !!f);

  const statusHeader = col('task status updation');
  const status = statusHeader ? String(row[statusHeader] ?? '').trim() : '';
  if (statusHeader) used.add(statusHeader);
  const assigneeHeader = col('assigned person') ?? col('assigned to');
  const assignee = assigneeHeader ? String(row[assigneeHeader] ?? '').trim() : '';
  if (assigneeHeader) used.add(assigneeHeader);
  const titleHeader = col('task name');
  if (titleHeader) used.add(titleHeader);

  const meta = pick(['department', 'team required', 'task priority']);
  const sections = [
    pick(['project name', 'task url', 'deadline', 'timestamp']),
    pick(['time estimation', 'task estimation', 'total time est', 'time logged on ac', 'total time', 'total hours']),
    pick(['task daily bucket', 'today bucket set', 'pm status', 'task information', 'preferred resource', 'email address', 'email']),
  ];
  // The marketing notes next, then any column the lists above did not claim (so a new column still shows)
  const long = [
    ...pick(['action taken today', 'performance signal/insights', 'blocker', 'next steps']),
    ...headers.filter(h => !used.has(h) && !/ \(\d+\)$/.test(h)).map(h => field(lc(h))).filter((f): f is ViewField => !!f),
  ];

  return (
    <PmRowViewModal
      title={titleHeader ? String(row[titleHeader] ?? '').trim() : ''}
      untitled="Untitled task"
      statusNode={status ? pill(status, 'task status updation') : null}
      pm={assignee}
      pmLabel="Assigned to"
      assignedNode={null}
      meta={meta}
      sections={sections}
      long={long}
      onClose={onClose}
    />
  );
}
