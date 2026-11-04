'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, Trash2 } from 'lucide-react';
import { LOG_DAYS, NOTIFICATION_TYPE_LABELS, type NotificationLogRow } from '@/lib/notifications';

const when = (iso: string) => new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const teamName = (t: string) => (t === 'web' ? 'Web' : 'Marketing');

// Admin Portal > Notifications (HM and Admin): every notification of the last thirty days in one
// table, with an Excel download. The Super Admin can also clear them all at once.
export default function NotificationsAdmin() {
  const [rows, setRows] = useState<NotificationLogRow[]>([]);
  const [canClear, setCanClear] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/notifications/log', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not load the notifications');
      setRows(json.rows);
      setCanClear(!!json.canClear);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const download = async () => {
    const { default: writeExcelFile } = await import('write-excel-file/browser');
    const headers = ['Date', 'Type', 'Team', 'Project', 'Task', 'Assigned To', 'Detail', 'By', 'Notified'];
    const data = [
      headers.map(h => ({ value: h, fontWeight: 'bold' as const })),
      ...rows.map(r => [
        when(r.createdAt), NOTIFICATION_TYPE_LABELS[r.type], teamName(r.team), r.project, r.task, r.assignee, r.detail, r.actor, r.recipients,
      ].map(v => ({ value: v }))),
    ];
    await writeExcelFile(
      data as never,
      { sheet: 'Notifications', columns: headers.map((h, i) => ({ width: i >= 3 ? 30 : 20 + (h.length > 12 ? 4 : 0) })), stickyRowsCount: 1 } as never,
    ).toFile(`Notifications-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const clearAll = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/notifications/log', { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not clear the notifications');
      setConfirming(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear the notifications');
    } finally {
      setBusy(false);
    }
  };

  const th = 'px-4 py-3 font-semibold whitespace-nowrap text-left';
  const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all text-xs font-semibold disabled:opacity-50 disabled:cursor-default';
  const quiet = { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' };

  return (
    <div className="p-3 sm:p-6 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>Notifications</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>
            {rows.length} notification{rows.length === 1 ? '' : 's'} from the last {LOG_DAYS} days — older ones are removed automatically. People&apos;s own bells keep only the last 3 days.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => void load()} className={btn} style={quiet}><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
          <button onClick={() => void download()} disabled={rows.length === 0} className={btn} style={quiet}><Download className="w-3.5 h-3.5" /> Download Excel</button>
          {canClear && (
            <button onClick={() => setConfirming(true)} disabled={rows.length === 0} className={btn} style={{ background: '#ef4444', color: '#fff', border: '1px solid #ef4444' }}>
              <Trash2 className="w-3.5 h-3.5" /> Clear all
            </button>
          )}
        </div>
      </div>

      {confirming && (
        <div role="alertdialog" className="rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap text-sm" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: 'var(--cn-text-primary)' }}>
          <span>Clear every notification? This empties everyone&apos;s bell and this table, and cannot be undone.</span>
          <span className="flex items-center gap-2">
            <button onClick={() => setConfirming(false)} disabled={busy} className={btn} style={quiet}>Cancel</button>
            <button onClick={() => void clearAll()} disabled={busy} className={btn} style={{ background: '#ef4444', color: '#fff', border: '1px solid #ef4444' }}>{busy ? 'Clearing…' : 'Yes, clear all'}</button>
          </span>
        </div>
      )}

      {error && <p role="alert" className="text-xs font-medium" style={{ color: '#ef4444' }}>{error}</p>}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: 'var(--cn-bg-input)' }} />)}</div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm" style={{ color: 'var(--cn-text-muted)' }}>No notifications yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--cn-border)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}>
                {['Date', 'Type', 'Team', 'Project', 'Task', 'Assigned To', 'Detail', 'By', 'Notified'].map(h => <th key={h} className={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--cn-border-light, var(--cn-border))', color: 'var(--cn-text-secondary)' }}>
                  <td className="px-4 py-2 whitespace-nowrap">{when(r.createdAt)}</td>
                  <td className="px-4 py-2 whitespace-nowrap font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{NOTIFICATION_TYPE_LABELS[r.type]}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{teamName(r.team)}</td>
                  <td className="px-4 py-2 min-w-[140px]">{r.project || '—'}</td>
                  <td className="px-4 py-2 min-w-[160px]">{r.task || '—'}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{r.assignee || 'Not assigned'}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{r.detail || '—'}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{r.actor}</td>
                  <td className="px-4 py-2 min-w-[180px]">{r.recipients}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
