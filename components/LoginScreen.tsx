'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { AuthUser } from '@/lib/auth';

interface Props {
  onLogin: (user: AuthUser) => void;
}

export default function LoginScreen({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('cn-theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved === 'dark' ? 'dark' : 'light');
  }, []);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (json.success) {
        onLogin(json.user as AuthUser);
      } else {
        setError(json.error ?? 'Invalid username or password.');
      }
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--cn-bg-page)' }}>

      <div className="w-full max-w-sm">
        {/* Logo + Brand */}
        <div className="flex flex-col items-center mb-8 gap-4">
          {/* Logo on accent background circle */}
          <div
            className="w-16 h-16 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'var(--cn-accent)' }}
          >
            <svg width="40" height="40" viewBox="0 0 1126 1126" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M563 1126C873.936 1126 1126 873.936 1126 563C1126 252.064 873.936 0 563 0C252.064 0 0 252.064 0 563C0 873.936 252.064 1126 563 1126Z" fill="white"/>
              <path d="M247.038 562.635C247.018 586.057 251.617 609.254 260.571 630.897C269.525 652.54 282.659 672.205 299.221 688.767C315.783 705.329 335.448 718.463 357.091 727.418C378.734 736.372 401.931 740.971 425.353 740.951C484.792 740.951 534.44 712.281 565.209 666.828L526.753 636.758C499.479 673.117 465.912 691.297 426.053 691.297C355.426 691.297 302.281 633.956 302.281 562.63C302.281 492.003 355.426 434.662 426.053 434.662C465.912 434.662 500.177 452.843 527.453 489.905L565.913 459.137C535.145 413.684 484.797 385.014 425.358 385.014C328.153 383.62 244.94 465.435 247.038 562.635Z" fill="black"/>
              <path d="M879.635 522.235C879.635 440.035 831.035 385.001 750.264 385.001C706.664 385.001 668.782 401.44 643.05 430.031V392.863H591.588V740.951H646.628V528.668C646.628 474.346 684.51 435.749 738.118 435.749C791.726 435.749 824.604 473.631 824.604 528.668V740.951H879.64L879.635 522.235Z" fill="black"/>
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold" style={{ color: 'var(--cn-text-primary)' }}>
              Bandwidth Allocation
            </h1>
            <a
              href="https://www.cybernext.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm mt-0.5 hover:opacity-75 transition-opacity"
              style={{ color: 'var(--cn-accent)' }}
            >
              cybernext.io
            </a>
          </div>
        </div>

        {/* Card */}
        <div
          className="rounded-lg p-6 sm:p-8 border"
          style={{
            background: 'var(--cn-bg-card)',
            borderColor: 'var(--cn-border)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          }}
        >
          <h2 className="text-lg font-semibold mb-6" style={{ color: 'var(--cn-text-primary)' }}>
            Sign in to your account
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--cn-text-muted)' }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => { setUsername(e.target.value); setError(''); }}
                placeholder="Enter username"
                autoComplete="username"
                required
                className="w-full rounded-lg px-3 py-2.5 text-sm border focus:outline-none transition-colors"
                style={{
                  background: 'var(--cn-bg-input)',
                  color: 'var(--cn-text-primary)',
                  borderColor: error ? '#dc2626' : 'var(--cn-border)',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--cn-accent)')}
                onBlur={e => (e.currentTarget.style.borderColor = error ? '#dc2626' : 'var(--cn-border)')}
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--cn-text-muted)' }}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-lg px-3 py-2.5 pr-10 text-sm border focus:outline-none transition-colors"
                  style={{
                    background: 'var(--cn-bg-input)',
                    color: 'var(--cn-text-primary)',
                    borderColor: error ? '#dc2626' : 'var(--cn-border)',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--cn-accent)')}
                  onBlur={e => (e.currentTarget.style.borderColor = error ? '#dc2626' : 'var(--cn-border)')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70"
                  style={{ color: 'var(--cn-text-muted)' }}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-xs text-red-500 flex items-center gap-1.5">
                <span className="inline-block w-1 h-1 rounded-full bg-red-500 shrink-0" />
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50 mt-2 cursor-pointer"
              style={{ background: 'var(--cn-accent)' }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'var(--cn-accent-hover)'; }}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--cn-accent)')}
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--cn-text-faint)' }}>
          © {new Date().getFullYear()} Cybernext. All rights reserved.
        </p>
      </div>
    </div>
  );
}
