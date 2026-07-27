'use client';

import { useEffect, useState } from 'react';
import { AuthUser } from '@/lib/auth';
import LoginScreen from './LoginScreen';
import Dashboard from './Dashboard';

export default function AuthGate() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch('/api/session')
      .then(res => res.json())
      .then(json => setUser(json.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setChecked(true));
  }, []);

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--cn-bg-page)' }}>
        <span className="w-8 h-8 border-2 border-[#FE4A23]/30 border-t-[#FE4A23] rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={u => setUser(u)} />;
  }

  return (
    <Dashboard
      user={user}
      onLogout={() => {
        fetch('/api/logout', { method: 'POST' }).catch(() => {});
        setUser(null);
      }}
    />
  );
}
