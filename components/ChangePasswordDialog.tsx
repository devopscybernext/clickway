'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Eye, EyeOff } from 'lucide-react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';

const MIN_PASSWORD = 8;

// "Change password" from the profile menu — open to every logged-in user. Asks
// for the current password, then the new one twice, and saves through
// /api/change-password.
export default function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  useBodyScrollLock();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next.length < MIN_PASSWORD) { setError(`The new password must be at least ${MIN_PASSWORD} characters`); return; }
    if (next !== confirm) { setError('The new password and its confirmation do not match'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) { setError(json.error || 'Could not change the password'); return; }
      setDone(true);
      setTimeout(onClose, 1500);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#FE4A23] disabled:opacity-60';
  const inputStyle = { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' };
  const label = 'text-[11px] font-semibold uppercase tracking-wide';
  const type = show ? 'text' : 'password';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-label="Change password" className="rounded-lg w-full flex flex-col"
        style={{ background: 'var(--cn-bg-card)', maxWidth: 420, border: '1px solid var(--cn-border)' }}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--cn-border)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>Change password</h2>
          <button type="button" onClick={onClose} disabled={saving} title="Close" className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="pw-current" className={label} style={{ color: 'var(--cn-text-muted)' }}>Current password</label>
            <input id="pw-current" type={type} value={current} onChange={e => setCurrent(e.target.value)} disabled={saving || done}
              autoComplete="current-password" autoFocus className={field} style={inputStyle} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="pw-new" className={label} style={{ color: 'var(--cn-text-muted)' }}>New password (8+ characters)</label>
            <input id="pw-new" type={type} value={next} onChange={e => setNext(e.target.value)} disabled={saving || done}
              autoComplete="new-password" className={field} style={inputStyle} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="pw-confirm" className={label} style={{ color: 'var(--cn-text-muted)' }}>Confirm new password</label>
            <input id="pw-confirm" type={type} value={confirm} onChange={e => setConfirm(e.target.value)} disabled={saving || done}
              autoComplete="new-password" className={field} style={inputStyle} />
          </div>
          <button type="button" onClick={() => setShow(s => !s)} className="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer" style={{ color: 'var(--cn-text-muted)' }}>
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {show ? 'Hide passwords' : 'Show passwords'}
          </button>
          {error && <p role="alert" className="text-xs font-medium" style={{ color: '#ef4444' }}>{error}</p>}
          {done && <p role="status" className="text-xs font-medium" style={{ color: '#16a34a' }}>Your password was changed.</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: 'var(--cn-border)' }}>
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>Cancel</button>
          <button type="submit" disabled={saving || done} className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60"
            style={{ background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }}>{saving ? 'Saving…' : 'Change password'}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}
