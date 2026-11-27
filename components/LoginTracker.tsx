'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Search, LogIn, LogOut, MapPin, ShieldAlert, Unlock } from 'lucide-react';
import { memberPhoto } from '@/lib/memberColors';

interface LoginRow {
  id: number; createdAt: string; event: 'login' | 'logout';
  username: string; displayName: string; email: string; role: string;
  ip: string; browser: string; os: string; device: string; userAgent: string;
  city: string; region: string; country: string; isp: string;
  latitude: number | null; longitude: number | null; accuracy: number | null;
}

const place = (r: LoginRow) => [r.city, r.region, r.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
const mapLink = (r: LoginRow) => `https://www.google.com/maps?q=${r.latitude},${r.longitude}`;
const accuracy = (m: number | null) => (m === null ? '' : m >= 1000 ? `±${(m / 1000).toFixed(1)} km` : `±${m} m`);

const LOG_DAYS = 90;
const date = (iso: string) => new Date(iso).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function Avatar({ name }: { name: string }) {
  const photo = memberPhoto(name);
  const [failed, setFailed] = useState(false);
  return photo && !failed ? (
    <img src={photo} alt={name} className="w-8 h-8 rounded-full object-cover shrink-0" onError={() => setFailed(true)} />
  ) : (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: 'var(--cn-accent)' }}>
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

// Admin Portal > Login Tracker (HM and Admin): every sign-in and sign-out, laid out like Users (without
// the departments), with the date and time, IP address and its location, the exact location when the
// person allowed the browser's prompt, and the browser, operating system and device.
// A session that simply expires, or a closed browser, has no sign-out row: only pressing Logout records one.
function LoginHistory() {
  const [rows, setRows] = useState<LoginRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [event, setEvent] = useState<'' | 'login' | 'logout'>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/login-log', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not load the login history');
      setRows(json.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the login history');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r =>
      (!event || r.event === event) &&
      (!from || dayKey(r.createdAt) >= from) &&
      (!to || dayKey(r.createdAt) <= to) &&
      (!q || [r.displayName, r.username, r.email, r.role, r.ip, r.browser, r.os, r.city, r.region, r.country, r.isp].some(v => v.toLowerCase().includes(q))));
  }, [rows, search, event, from, to]);

  const download = async () => {
    const { default: writeExcelFile } = await import('write-excel-file/browser');
    const headers = ['Date', 'Time', 'Event', 'Display Name', 'Username', 'Email', 'Role', 'IP Address', 'Location (from IP)', 'Internet Provider', 'Exact Location', 'Accuracy', 'Browser', 'Operating System', 'Device', 'User Agent'];
    const data = [
      headers.map(h => ({ value: h, fontWeight: 'bold' as const })),
      ...shown.map(r => [
        date(r.createdAt), time(r.createdAt), r.event === 'login' ? 'Login' : 'Logout', r.displayName, r.username, r.email, r.role,
        r.ip, place(r), r.isp, r.latitude !== null ? mapLink(r) : '', accuracy(r.accuracy), r.browser, r.os, r.device, r.userAgent,
      ].map(v => ({ value: v }))),
    ];
    await writeExcelFile(
      data as never,
      { sheet: 'Login Tracker', columns: headers.map(h => ({ width: h === 'User Agent' ? 60 : ['Email', 'Location (from IP)', 'Exact Location', 'Internet Provider'].includes(h) ? 30 : 18 })), stickyRowsCount: 1 } as never,
    ).toFile(`Login-Tracker-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const th = 'px-4 py-3 font-semibold whitespace-nowrap';
  const td = 'px-4 py-3';
  const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all text-xs font-semibold disabled:opacity-50 disabled:cursor-default';
  const quiet = { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' };
  const field = 'h-9 rounded-lg border px-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#FE4A23]/30';
  const filtering = !!(search || event || from || to);

  return (
    <div className="p-3 sm:p-6 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>Login Tracker</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>
            Every login and logout from the last {LOG_DAYS} days, newest first; older entries are removed automatically. A logout is recorded when someone presses Logout (not when a session simply expires).
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => { setLoading(true); void load(); }} className={btn} style={quiet}><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
          <button onClick={() => void download()} disabled={shown.length === 0} className={btn} style={quiet}><Download className="w-3.5 h-3.5" /> Download Excel</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1" style={{ flexBasis: '16rem' }}>
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--cn-text-faint)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, username, email, IP, city, browser…" aria-label="Search"
            className={`${field} w-full pl-9`} style={quiet} />
        </div>
        <select value={event} onChange={e => setEvent(e.target.value as '' | 'login' | 'logout')} aria-label="Event" className={`${field} cursor-pointer`} style={quiet}>
          <option value="">Logins and logouts</option>
          <option value="login">Logins only</option>
          <option value="logout">Logouts only</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--cn-text-muted)' }}>From
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={field} style={quiet} />
        </label>
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--cn-text-muted)' }}>To
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={field} style={quiet} />
        </label>
        {filtering && (
          <button onClick={() => { setSearch(''); setEvent(''); setFrom(''); setTo(''); }} className="text-xs font-semibold cursor-pointer" style={{ color: 'var(--cn-accent)' }}>Clear filters</button>
        )}
      </div>

      {error && <p role="alert" className="text-xs font-medium" style={{ color: '#ef4444' }}>{error}</p>}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: 'var(--cn-bg-input)' }} />)}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--cn-border)' }}>
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b" style={{ background: 'var(--cn-bg-row-even)', borderColor: 'var(--cn-border)' }}>
                {['', 'Display Name', 'Username', 'Email', 'Role', 'Event', 'Date', 'Time', 'IP Address', 'Location', 'Browser', 'Operating System', 'Device'].map((h, i) => (
                  <th key={i} className={th} style={{ color: 'var(--cn-text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.id} className="border-b hover:bg-[var(--cn-bg-hover)] transition-colors" style={{ borderColor: 'var(--cn-border-light, var(--cn-border))' }}>
                  <td className={td}><Avatar name={r.displayName || r.username} /></td>
                  <td className={`${td} whitespace-nowrap font-semibold`} style={{ color: 'var(--cn-text-primary)' }}>{r.displayName || '—'}</td>
                  <td className={`${td} whitespace-nowrap`} style={{ color: 'var(--cn-text-secondary)' }}>{r.username}</td>
                  <td className={`${td} whitespace-nowrap`} style={{ color: 'var(--cn-text-secondary)' }}>{r.email || '—'}</td>
                  <td className={`${td} whitespace-nowrap`} style={{ color: 'var(--cn-text-secondary)' }}>{r.role || '—'}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
                      style={r.event === 'login'
                        ? { background: 'rgba(22,163,74,0.12)', color: '#16a34a' }
                        : { background: 'rgba(100,116,139,0.15)', color: 'var(--cn-text-secondary)' }}>
                      {r.event === 'login' ? <LogIn className="w-3 h-3" /> : <LogOut className="w-3 h-3" />}
                      {r.event === 'login' ? 'Login' : 'Logout'}
                    </span>
                  </td>
                  <td className={`${td} whitespace-nowrap`} style={{ color: 'var(--cn-text-secondary)' }}>{date(r.createdAt)}</td>
                  <td className={`${td} whitespace-nowrap`} style={{ color: 'var(--cn-text-secondary)' }}>{time(r.createdAt)}</td>
                  <td className={`${td} whitespace-nowrap font-mono text-xs`} style={{ color: 'var(--cn-text-secondary)' }}>{r.ip || '—'}</td>
                  <td className={`${td} min-w-[180px]`} style={{ color: 'var(--cn-text-secondary)' }}>
                    <p>{place(r) || '—'}</p>
                    {r.isp && <p className="text-xs" style={{ color: 'var(--cn-text-faint)' }}>{r.isp}</p>}
                    {r.latitude !== null && r.longitude !== null && (
                      <a href={mapLink(r)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: 'var(--cn-accent)' }}
                        title="Location the person's browser shared after logging in">
                        <MapPin className="w-3 h-3" /> Exact location {accuracy(r.accuracy)}
                      </a>
                    )}
                  </td>
                  <td className={`${td} whitespace-nowrap`} style={{ color: 'var(--cn-text-secondary)' }} title={r.userAgent}>{r.browser || '—'}</td>
                  <td className={`${td} whitespace-nowrap`} style={{ color: 'var(--cn-text-secondary)' }}>{r.os || '—'}</td>
                  <td className={`${td} whitespace-nowrap`} style={{ color: 'var(--cn-text-secondary)' }}>{r.device || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && (
            <div className="p-6 text-center text-sm" style={{ color: 'var(--cn-text-muted)' }}>{rows.length ? 'No entries match these filters.' : 'No logins recorded yet.'}</div>
          )}
          {shown.length > 0 && (
            <p className="px-4 py-2 text-xs" style={{ color: 'var(--cn-text-muted)' }}>Showing {shown.length} of {rows.length} entries</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Failed attempts ─────────────────────────────────────────────────────────

interface FailedDevice {
  key: string; attempts: number; recent: number; blocked: boolean; retryMinutes: number;
  identifiers: string[]; firstAt: string; lastAt: string;
  ip: string; browser: string; os: string; device: string; userAgent: string; cookie: boolean;
}

// Devices with wrong logins in the last day: 3 wrong logins in 15 minutes block a device (not the
// account) for 15 minutes. An administrator can unblock a device straight away.
function FailedAttempts({ onCount }: { onCount: (blocked: number) => void }) {
  const [devices, setDevices] = useState<FailedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/login-attempts', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not load the failed attempts');
      setDevices(json.devices);
      onCount((json.devices as FailedDevice[]).filter(d => d.blocked).length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the failed attempts');
    } finally {
      setLoading(false);
    }
  }, [onCount]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const unblock = async (d: FailedDevice) => {
    if (!confirm(`Unblock this device${d.identifiers.length ? ` (tried: ${d.identifiers.join(', ')})` : ''}? Its failed attempts are cleared and it can log in again straight away.`)) return;
    setBusy(d.key); setError(''); setNotice('');
    try {
      const res = await fetch(`/api/login-attempts?key=${encodeURIComponent(d.key)}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not unblock the device');
      setNotice(json.message || 'Device unblocked.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not unblock the device');
    } finally {
      setBusy(null);
    }
  };

  const th = 'px-4 py-3 font-semibold whitespace-nowrap';
  const td = 'px-4 py-3';
  const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all text-xs font-semibold disabled:opacity-50 disabled:cursor-default';
  const quiet = { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' };
  const blockedCount = devices.filter(d => d.blocked).length;

  return (
    <div className="p-3 sm:p-6 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>Failed login attempts</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>
            Devices with wrong logins in the last 24 hours. Three wrong logins in 15 minutes block that device (not the account) for 15 minutes.
            {blockedCount > 0 ? ` ${blockedCount} device${blockedCount === 1 ? ' is' : 's are'} blocked right now.` : ''}
          </p>
        </div>
        <button onClick={() => { setLoading(true); void load(); }} className={btn} style={quiet}><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
      </div>

      {notice && <p role="status" className="text-xs font-medium" style={{ color: '#16a34a' }}>{notice}</p>}
      {error && <p role="alert" className="text-xs font-medium" style={{ color: '#ef4444' }}>{error}</p>}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: 'var(--cn-bg-input)' }} />)}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--cn-border)' }}>
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b" style={{ background: 'var(--cn-bg-row-even)', borderColor: 'var(--cn-border)' }}>
                {['Status', 'Tried to log in as', 'Wrong attempts', 'Last attempt', 'IP Address', 'Browser', 'Operating System', 'Device', ''].map((h, i) => (
                  <th key={i} className={th} style={{ color: 'var(--cn-text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {devices.map(d => (
                <tr key={d.key} className="border-b hover:bg-[var(--cn-bg-hover)] transition-colors" style={{ borderColor: 'var(--cn-border-light, var(--cn-border))' }}>
                  <td className={`${td} whitespace-nowrap`}>
                    {d.blocked ? (
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                        <ShieldAlert className="w-3 h-3" /> Blocked · {d.retryMinutes} min left
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'rgba(100,116,139,0.15)', color: 'var(--cn-text-secondary)' }}>
                        Not blocked
                      </span>
                    )}
                  </td>
                  <td className={`${td} min-w-[180px]`} style={{ color: 'var(--cn-text-primary)' }}>{d.identifiers.join(', ') || '—'}</td>
                  <td className={`${td} whitespace-nowrap`} style={{ color: 'var(--cn-text-secondary)' }}>
                    {d.attempts} today{d.recent ? ` · ${d.recent} in the last 15 min` : ''}
                  </td>
                  <td className={`${td} whitespace-nowrap`} style={{ color: 'var(--cn-text-secondary)' }}>{date(d.lastAt)}, {time(d.lastAt)}</td>
                  <td className={`${td} whitespace-nowrap font-mono text-xs`} style={{ color: 'var(--cn-text-secondary)' }}>{d.ip || '—'}</td>
                  <td className={`${td} whitespace-nowrap`} style={{ color: 'var(--cn-text-secondary)' }} title={d.userAgent}>{d.browser || '—'}</td>
                  <td className={`${td} whitespace-nowrap`} style={{ color: 'var(--cn-text-secondary)' }}>{d.os || '—'}</td>
                  <td className={`${td} whitespace-nowrap`} style={{ color: 'var(--cn-text-secondary)' }}>
                    {d.device || '—'}
                    {!d.cookie && <p className="text-xs" style={{ color: 'var(--cn-text-faint)' }} title="No device cookie: recognised by IP address and browser">No device cookie</p>}
                  </td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    <button onClick={() => void unblock(d)} disabled={busy !== null} className={btn}
                      style={d.blocked ? { background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' } : quiet}>
                      <Unlock className="w-3.5 h-3.5" /> {busy === d.key ? 'Unblocking…' : d.blocked ? 'Unblock' : 'Clear'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!devices.length && <div className="p-6 text-center text-sm" style={{ color: 'var(--cn-text-muted)' }}>No failed login attempts in the last 24 hours.</div>}
        </div>
      )}
    </div>
  );
}

// Admin Portal > Login Tracker: logins and logouts, and failed attempts with blocked devices
export default function LoginTracker() {
  const [view, setView] = useState<'history' | 'failed'>('history');
  const [blocked, setBlocked] = useState(0);
  useEffect(() => {
    // The blocked count for the switch, before the Failed attempts view is opened
    fetch('/api/login-attempts', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (j?.success) setBlocked((j.devices as FailedDevice[]).filter(d => d.blocked).length); })
      .catch(() => { /* shown when the view opens */ });
  }, []);
  const tab = (id: 'history' | 'failed', label: string) => (
    <button key={id} onClick={() => setView(id)} aria-pressed={view === id}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all"
      style={view === id
        ? { background: 'var(--cn-text-primary)', color: 'var(--cn-bg-card)', border: '1px solid var(--cn-text-primary)' }
        : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>
      {label}
    </button>
  );
  return (
    <div>
      <div className="flex flex-wrap gap-2 px-3 sm:px-6 pt-3 sm:pt-5" role="group" aria-label="Login Tracker view">
        {tab('history', 'Logins & logouts')}
        {tab('failed', `Failed attempts${blocked ? ` · ${blocked} blocked` : ''}`)}
      </div>
      {view === 'history' ? <LoginHistory /> : <FailedAttempts onCount={setBlocked} />}
    </div>
  );
}
