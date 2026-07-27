'use client';

import { RefreshCw, Calendar, LogOut } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { AuthUser, SheetId, SHEET_LABELS } from '@/lib/auth';

interface HeaderProps {
  lastUpdated: string;
  loading: boolean;
  selectedSheet: SheetId;
  allowedSheets: SheetId[];
  user: AuthUser;
  onRefresh: () => void;
  onSheetChange: (sheet: SheetId) => void;
  onLogout: () => void;
}

export default function Header({
  lastUpdated,
  loading,
  selectedSheet,
  allowedSheets,
  user,
  onRefresh,
  onSheetChange,
  onLogout,
}: HeaderProps) {
  const formattedTime = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  return (
    <header
      className="border-b sticky top-0 z-10 transition-colors"
      style={{ background: 'var(--cn-bg-header)', borderColor: 'var(--cn-border)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
    >
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 xl:px-10 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 shrink-0">
            <svg width="36" height="36" viewBox="0 0 1126 1126" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M563 1126C873.936 1126 1126 873.936 1126 563C1126 252.064 873.936 0 563 0C252.064 0 0 252.064 0 563C0 873.936 252.064 1126 563 1126Z" fill="white"/>
              <path d="M247.038 562.635C247.018 586.057 251.617 609.254 260.571 630.897C269.525 652.54 282.659 672.205 299.221 688.767C315.783 705.329 335.448 718.463 357.091 727.418C378.734 736.372 401.931 740.971 425.353 740.951C484.792 740.951 534.44 712.281 565.209 666.828L526.753 636.758C499.479 673.117 465.912 691.297 426.053 691.297C355.426 691.297 302.281 633.956 302.281 562.63C302.281 492.003 355.426 434.662 426.053 434.662C465.912 434.662 500.177 452.843 527.453 489.905L565.913 459.137C535.145 413.684 484.797 385.014 425.358 385.014C328.153 383.62 244.94 465.435 247.038 562.635Z" fill="black"/>
              <path d="M879.635 522.235C879.635 440.035 831.035 385.001 750.264 385.001C706.664 385.001 668.782 401.44 643.05 430.031V392.863H591.588V740.951H646.628V528.668C646.628 474.346 684.51 435.749 738.118 435.749C791.726 435.749 824.604 473.631 824.604 528.668V740.951H879.64L879.635 522.235Z" fill="black"/>
            </svg>
          </div>
          <div>
            <h1 className="font-semibold text-base sm:text-lg leading-tight" style={{ color: 'var(--cn-text-primary)' }}>
              Cybernext Bandwidth Allocation Sheet
            </h1>
            <a
              href="https://www.cybernext.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs transition-opacity hover:opacity-70"
              style={{ color: 'var(--cn-accent)' }}
            >
              www.cybernext.io
            </a>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {lastUpdated && (
            <div
              className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Updated {formattedTime}</span>
            </div>
          )}

          {/* Sheet selector */}
          <select
            value={selectedSheet}
            onChange={(e) => onSheetChange(e.target.value as SheetId)}
            className="text-xs sm:text-sm rounded-lg px-2 sm:px-3 py-1.5 border focus:outline-none cursor-pointer max-w-[140px] sm:max-w-none transition-colors"
            style={{
              background: 'var(--cn-bg-input)',
              color: 'var(--cn-text-primary)',
              borderColor: 'var(--cn-border)',
              outlineColor: 'var(--cn-accent)',
            }}
          >
            {allowedSheets.map(id => (
              <option key={id} value={id}>{SHEET_LABELS[id]}</option>
            ))}
          </select>

          {/* Theme toggle */}
          <ThemeToggle />

          {/* Refresh */}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
            style={{ background: 'var(--cn-accent)' }}
            onMouseEnter={e => !loading && ((e.currentTarget as HTMLButtonElement).style.background = 'var(--cn-accent-hover)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--cn-accent)')}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{loading ? 'Loading…' : 'Refresh'}</span>
          </button>

          {/* User + Logout */}
          <div className="flex items-center gap-1.5">
            <span
              className="hidden sm:inline text-xs px-2 py-1.5 rounded-lg"
              style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}
            >
              {user.displayName}
            </span>
            <button
              onClick={onLogout}
              title="Sign out"
              className="flex items-center gap-1.5 text-sm font-medium px-2 sm:px-3 py-1.5 rounded-lg border transition-colors"
              style={{
                background: 'transparent',
                color: 'var(--cn-text-muted)',
                borderColor: 'var(--cn-border)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--cn-text-primary)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--cn-text-muted)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--cn-text-muted)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--cn-border)';
              }}
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
