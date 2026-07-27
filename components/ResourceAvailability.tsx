'use client';

import { SheetData } from '@/lib/googleSheets';

interface Props {
  data: SheetData[];
  headers: string[];
  loading: boolean;
}

function findCol(headers: string[], ...terms: string[]): string | undefined {
  for (const term of terms) {
    const t = term.toLowerCase();
    const found = headers.find(h => h.toLowerCase().includes(t));
    if (found) return found;
  }
  return undefined;
}

function statusStyle(val: string) {
  const v = val.toLowerCase();
  if (v.includes('occupied')) return 'bg-orange-500 text-white';
  if (v.includes('partially')) return 'bg-amber-400 text-slate-900';
  if (v.includes('available')) return 'bg-emerald-500 text-white';
  if (v.includes('leave')) return 'bg-red-500 text-white';
  return 'bg-slate-600 text-slate-200';
}

function timeStyle(val: string | number) {
  const n = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(n) || String(val).trim() === '') return '';
  if (n >= 7) return 'bg-orange-500/80 text-white font-semibold';
  if (n >= 5) return 'bg-amber-400/80 text-slate-900 font-semibold';
  return 'bg-emerald-500/80 text-white font-semibold';
}

export default function ResourceAvailability({ data, headers, loading }: Props) {
  const nameCol      = findCol(headers, 'name');
  const tasksCol     = findCol(headers, "today's project", 'project and task', 'task');
  const dailyTimeCol = findCol(headers, 'dailytime', 'daily time');
  const statusCol    = findCol(headers, 'daily status');
  const tomTimeCol   = findCol(headers, 'tomorrow time', 'tommorow time');
  const dayAfterCol  = findCol(headers, 'day after tomorrow', 'day after tommorow');
  const leaveCol     = findCol(headers, 'leave zone', 'leave');

  const cols = [nameCol, tasksCol, dailyTimeCol, statusCol, tomTimeCol, dayAfterCol, leaveCol].filter(Boolean) as string[];

  if (loading) {
    return (
      <section style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }} className="border rounded-lg p-6 animate-pulse">
        <div className="h-6 w-52 rounded mb-5" style={{ background: 'var(--cn-bg-input)' }} />
        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} style={{ background: 'var(--cn-bg-input)' }} className="h-12 rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  if (!data.length || !cols.length) return null;

  const rows = data.filter(row => nameCol && String(row[nameCol] ?? '').trim());

  return (
    <section style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' }} className="border rounded-lg p-3 sm:p-6">
      <h2 className="font-semibold text-base sm:text-lg mb-3 sm:mb-5" style={{ color: 'var(--cn-text-primary)' }}>Resource Availability</h2>
      <div style={{ borderColor: 'var(--cn-border)' }} className="overflow-x-auto rounded-md border -mx-1 sm:mx-0">
        <table className="w-full text-sm text-left">
          <thead>
            <tr style={{ background: 'var(--cn-bg-row-even)', borderColor: 'var(--cn-border)' }} className="border-b">
              {cols.map(col => (
                <th key={col} className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--cn-text-secondary)' }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderColor: 'var(--cn-border-light)' }} className="border-b hover:bg-[var(--cn-bg-hover)] transition-colors">
                {cols.map(col => {
                  const val = String(row[col] ?? '');

                  if (col === statusCol) {
                    return (
                      <td key={col} className="px-4 py-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusStyle(val)}`}>
                          {val || '—'}
                        </span>
                      </td>
                    );
                  }

                  if (col === dailyTimeCol || col === tomTimeCol || col === dayAfterCol) {
                    const cls = timeStyle(row[col] ?? '');
                    return (
                      <td key={col} className="px-4 py-3 text-center">
                        {val ? (
                          <span className={`inline-block w-10 text-center py-1 rounded-md text-sm`} style={!cls ? { color: 'var(--cn-text-secondary)' } : undefined}>
                            {val}
                          </span>
                        ) : <span style={{ color: 'var(--cn-text-muted)' }}>—</span>}
                      </td>
                    );
                  }

                  if (col === nameCol) {
                    return (
                      <td key={col} className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--cn-text-primary)' }}>
                        {val || '—'}
                      </td>
                    );
                  }

                  if (col === tasksCol) {
                    return (
                      <td key={col} className="px-4 py-3 max-w-md" style={{ color: 'var(--cn-text-secondary)' }}>
                        <span className="block">{val || '—'}</span>
                      </td>
                    );
                  }

                  return (
                    <td key={col} className="px-4 py-3 text-slate-300 whitespace-nowrap">
                      {val || '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
