'use client';

import { Sun, Moon } from 'lucide-react';
import { useEffect, useState } from 'react';

type BaseTheme = 'dark' | 'light';

interface ThemeToggleProps {
  isAdmin?: boolean;
}

export default function ThemeToggle({ isAdmin }: ThemeToggleProps) {
  const [base, setBase] = useState<BaseTheme>('dark');

  useEffect(() => {
    const saved = (localStorage.getItem('cn-theme') as BaseTheme) || 'light';
    const valid: BaseTheme = saved === 'light' ? 'light' : 'dark';
    setBase(valid);
    document.documentElement.setAttribute('data-theme', `admin-${valid}`);
  }, []);

  const toggle = () => {
    const next: BaseTheme = base === 'dark' ? 'light' : 'dark';
    setBase(next);
    localStorage.setItem('cn-theme', next);
    document.documentElement.setAttribute('data-theme', `admin-${next}`);
  };

  return (
    <button
      onClick={toggle}
      title={`Switch to ${base === 'dark' ? 'light' : 'dark'} mode`}
      className="flex items-center justify-center w-8 h-8 rounded-lg border transition-all"
      style={{
        background:  'var(--cn-bg-input)',
        borderColor: 'var(--cn-border)',
        color:       'var(--cn-text-muted)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--cn-accent)';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--cn-accent)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--cn-border)';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--cn-text-muted)';
      }}
    >
      {base === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
