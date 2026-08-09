'use client';

import { useState, useRef, useEffect } from 'react';
import { RefreshCw, Calendar, ChevronDown, LogOut } from 'lucide-react';
import { SheetId, AuthUser, getSheetLabel } from '@/lib/auth';
import { memberPhoto } from '@/lib/memberColors';
import ThemeToggle from './ThemeToggle';

const USER_DESIGNATIONS: Record<string, string> = {
  // Web — Development
  lovepreet: 'Web Development', shubham: 'Web Development',
  dhruv: 'Web Development', pawan: 'Web Development',
  // Web — UI/UX Design
  akash: 'UI/UX Design', robin: 'UI/UX Design',
  // Project Management
  yash: 'Project Management', kiran: 'Project Management',
  muskan: 'Project Management', moon: 'Project Management',
  sameer: 'Project Management',
  // Marketing — PPC
  atul: 'PPC', anjali: 'PPC', anurag: 'PPC',
  vansh: 'PPC', dheeraj: 'PPC', shiwangi: 'PPC',
  // Marketing — SMM
  payal: 'SMM', akanksha: 'SMM',
  // Marketing — SEO
  akshay: 'SEO', bhavya: 'SEO', kshitij: 'SEO',
};
function getUserDesignation(username: string, role: string): string {
  const key = Object.keys(USER_DESIGNATIONS).find(k => username.toLowerCase().includes(k));
  if (key) return USER_DESIGNATIONS[key];
  if (role === 'akash' || role === 'admin' || role === 'high' || role === 'mod') return 'Admin';
  if (role === 'pm') return 'Project Manager';
  return 'Resource';
}

interface TopBarProps {
  lastUpdated: string;
  loading: boolean;
  selectedSheet: SheetId;
  onRefresh: () => void;
  user: AuthUser;
  onLogout: () => void;
  isAdmin?: boolean;
}

export default function TopBar({ lastUpdated, loading, selectedSheet, onRefresh, user, onLogout, isAdmin }: TopBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const formattedTime = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  const photo = memberPhoto(user.displayName);

  return (
    <header
      className="sticky top-0 z-10 border-b px-4 sm:px-6 xl:px-8 py-3 flex items-center justify-between gap-4 transition-colors"
      style={{ background: 'var(--cn-bg-header)', borderColor: 'var(--cn-border)' }}
    >
      {/* Left: page title */}
      <div className="flex items-center gap-2 pl-9 lg:pl-0">
        <h1 className="text-sm font-semibold" style={{ color: 'var(--cn-text-primary)' }}>
          {getSheetLabel(selectedSheet, user.role)}
        </h1>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        <ThemeToggle isAdmin={isAdmin} />

        {lastUpdated && (
          <div
            className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}
          >
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>Updated {formattedTime}</span>
          </div>
        )}

        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
          style={{ background: 'var(--cn-accent)' }}
          onMouseEnter={e => !loading && ((e.currentTarget as HTMLButtonElement).style.background = 'var(--cn-accent-hover)')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--cn-accent)')}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{loading ? 'Loading…' : 'Refresh'}</span>
        </button>

        {/* ── User dropdown ── */}
        <div ref={dropRef} className="relative">
          <button
            onClick={() => setDropdownOpen(o => !o)}
            className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-lg border transition-colors cursor-pointer"
            style={{
              background: dropdownOpen ? 'var(--cn-bg-hover)' : 'var(--cn-bg-input)',
              borderColor: 'var(--cn-border)',
            }}
          >
            {/* Avatar circle */}
            {photo ? (
              <img src={photo} alt={user.displayName} className="w-7 h-7 rounded-full object-cover shrink-0"
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: 'var(--cn-accent)' }}
              >
                {user.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="hidden sm:block text-sm font-medium" style={{ color: 'var(--cn-text-primary)' }}>
              {user.displayName}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
              style={{ color: 'var(--cn-text-muted)' }}
            />
          </button>

          {/* Dropdown */}
          {dropdownOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-56 border rounded-xl overflow-hidden z-50"
              style={{
                background: 'var(--cn-bg-dropdown)',
                borderColor: 'var(--cn-border)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)',
              }}
            >
              {/* User info header */}
              <div className="px-4 py-3.5 border-b" style={{ borderColor: 'var(--cn-border)' }}>
                <div className="flex items-center gap-3">
                  {photo ? (
                    <img src={photo} alt={user.displayName} className="w-9 h-9 rounded-full object-cover shrink-0"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                      style={{ background: 'var(--cn-accent)' }}
                    >
                      {user.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--cn-text-primary)' }}>
                      {user.displayName}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--cn-text-muted)' }}>
                      {getUserDesignation(user.username, user.role)} · Cybernext
                    </p>
                  </div>
                </div>
              </div>

              {/* Sign out button */}
              <div className="p-1.5">
                <button
                  onClick={() => { setDropdownOpen(false); onLogout(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors cursor-pointer text-left"
                  style={{ color: 'var(--cn-text-primary)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--cn-bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <LogOut className="w-4 h-4 shrink-0" style={{ color: '#ef4444' }} />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
