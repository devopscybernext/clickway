'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { BELL_DAYS, NOTIFICATION_TYPE_LABELS, type NotificationItem } from '@/lib/notifications';

const POLL_MS = 45_000;

// "5 min ago", "2 h ago", "Yesterday"
function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

// A small red dot on the tab's icon, and the unread count in the tab's title, while anything is unread
function useTabBadge(unread: number) {
  const base = useRef<string | null>(null);
  useEffect(() => {
    if (base.current === null) base.current = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = unread > 0 ? `(${unread > 99 ? '99+' : unread}) ${base.current}` : base.current;

    const old = document.querySelector('link[data-cn-notify]');
    if (unread === 0) { old?.remove(); return; }

    let cancelled = false;
    const original = document.querySelector<HTMLLinkElement>('link[rel~="icon"]:not([data-cn-notify])')?.href ?? '/favicon.ico';
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      ctx.beginPath();
      ctx.arc(size - 16, 16, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      const link = (document.querySelector('link[data-cn-notify]') as HTMLLinkElement | null) ?? document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/png';
      link.setAttribute('data-cn-notify', '');
      link.href = canvas.toDataURL('image/png');
      document.head.appendChild(link);
    };
    img.src = original;
    return () => { cancelled = true; };
  }, [unread]);
}

// The bell in the top bar: what happened on the tasks that concern this person in the last three
// days. Clicking one marks it read and opens the task.
export default function NotificationBell({ onOpen }: { onOpen: (n: NotificationItem) => void }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter(i => !i.read).length;
  useTabBadge(unread);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setItems(json.items);
    } catch { /* keep what is shown; the next check tries again */ }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(first); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const mark = async (body: { ids: number[] } | { all: true }) => {
    await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  };

  const pick = (n: NotificationItem) => {
    setOpen(false);
    if (!n.read) {
      setItems(prev => prev.map(i => (i.id === n.id ? { ...i, read: true } : i)));
      void mark({ ids: [n.id] });
    }
    onOpen(n);
  };

  const readAll = () => {
    setItems(prev => prev.map(i => ({ ...i, read: true })));
    void mark({ all: true });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(o => !o); if (!open) void load(); }}
        aria-haspopup="menu" aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'} title="Notifications"
        className="relative flex items-center justify-center w-9 h-9 rounded-lg border transition-colors cursor-pointer"
        style={{ background: open ? 'var(--cn-bg-hover)' : 'var(--cn-bg-input)', borderColor: 'var(--cn-border)', color: 'var(--cn-text-primary)' }}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span
            data-testid="notification-count"
            className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
            style={{ background: '#ef4444' }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="fixed left-3 right-3 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[360px] border rounded-xl overflow-hidden z-50"
          style={{ background: 'var(--cn-bg-dropdown)', borderColor: 'var(--cn-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--cn-border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--cn-text-primary)' }}>Notifications</span>
            <button
              onClick={readAll} disabled={unread === 0}
              className="inline-flex items-center gap-1 text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-default"
              style={{ color: 'var(--cn-accent)' }}
            >
              <CheckCheck className="w-3.5 h-3.5" /> Mark all read
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--cn-text-muted)' }}>
                No notifications in the last {BELL_DAYS} days.
              </p>
            ) : items.map(n => (
              <button
                key={n.id} role="menuitem" onClick={() => pick(n)}
                className="w-full text-left px-4 py-3 flex gap-3 border-b last:border-b-0 cursor-pointer transition-colors"
                style={{ borderColor: 'var(--cn-border)', background: n.read ? '' : 'rgba(254,74,35,0.06)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--cn-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = n.read ? '' : 'rgba(254,74,35,0.06)')}
              >
                <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: n.read ? 'transparent' : 'var(--cn-accent)' }} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--cn-text-primary)' }}>{n.title}</span>
                  </span>
                  <span className="block text-xs mt-0.5 break-words" style={{ color: 'var(--cn-text-secondary)' }}>{n.body}</span>
                  <span className="block text-[11px] mt-1" style={{ color: 'var(--cn-text-muted)' }}>
                    {NOTIFICATION_TYPE_LABELS[n.type]} · {n.team === 'web' ? 'Web' : 'Marketing'} · by {n.actor} · {ago(n.createdAt)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
