'use client';

import { useCallback, useEffect, useState } from 'react';
import { MapPin, LogOut } from 'lucide-react';
import { AuthUser } from '@/lib/auth';
import LoginScreen from './LoginScreen';
import Dashboard from './Dashboard';
import { getBrowserLocation, locationMessage, type LocationResult } from '@/lib/geo';

// Logging out: if the person already allowed location (Login Tracker), their current coordinates go with
// the logout. Never asks for permission here, and gives up after a few seconds so logout is never held up.
type Coords = { latitude: number; longitude: number; accuracy: number };
async function logout() {
  let coords: Coords | null = null;
  try {
    const state = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    if (state?.state === 'granted') {
      coords = await new Promise<Coords | null>(resolve => {
        navigator.geolocation.getCurrentPosition(
          p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 60_000 },
        );
      });
    }
  } catch { /* no location: the IP location is still recorded */ }
  await fetch('/api/logout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(coords ?? {}), keepalive: true,
  }).catch(() => {});
}

type LocationState = 'checking' | 'ok' | Exclude<LocationResult, { ok: true }>['reason'];

export default function AuthGate() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [required, setRequired] = useState(true);
  const [location, setLocation] = useState<LocationState>('checking');

  useEffect(() => {
    fetch('/api/session')
      .then(res => res.json())
      .then(json => { setUser(json.user ?? null); setRequired(json.locationRequired !== false); })
      .catch(() => setUser(null))
      .finally(() => setChecked(true));
  }, []);

  // The dashboard only opens while the browser shares the location (when required)
  const checkLocation = useCallback(async () => {
    setLocation('checking');
    const r = await getBrowserLocation();
    setLocation(r.ok ? 'ok' : r.reason);
  }, []);
  useEffect(() => {
    if (!user || !required) return;
    const t = setTimeout(() => void checkLocation(), 0);
    // Turning location off while signed in closes the dashboard until it is allowed again
    let status: PermissionStatus | undefined;
    const onChange = () => { if (status?.state === 'denied') setLocation('denied'); else if (status?.state === 'granted') void checkLocation(); };
    navigator.permissions?.query({ name: 'geolocation' as PermissionName })
      .then(s => { status = s; s.addEventListener('change', onChange); })
      .catch(() => { /* older browsers: checked at sign-in and on each visit */ });
    return () => { clearTimeout(t); status?.removeEventListener('change', onChange); };
  }, [user, required, checkLocation]);

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

  if (required && location !== 'ok') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--cn-bg-page)' }}>
        {location === 'checking' ? (
          <div className="flex flex-col items-center gap-3 text-sm" style={{ color: 'var(--cn-text-muted)' }}>
            <span className="w-8 h-8 border-2 border-[#FE4A23]/30 border-t-[#FE4A23] rounded-full animate-spin" />
            Checking your location…
          </div>
        ) : (
          <div className="w-full max-w-md rounded-lg border p-6 sm:p-8 space-y-4 text-center"
            style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)', boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
            <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(254,74,35,0.12)', color: 'var(--cn-accent)' }}>
              <MapPin className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--cn-text-primary)' }}>Location access required</h2>
            <p className="text-sm" style={{ color: 'var(--cn-text-muted)' }}>
              The dashboard can only be used while your browser shares your location. {locationMessage(location)}
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <button onClick={() => void checkLocation()} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer" style={{ background: 'var(--cn-accent)' }}>
                <MapPin className="w-4 h-4" /> Try again
              </button>
              <button onClick={() => { void logout(); setUser(null); setLocation('checking'); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer border"
                style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)' }}>
                <LogOut className="w-4 h-4" /> Log out
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Dashboard
      user={user}
      onLogout={() => {
        void logout();
        setUser(null);
        setLocation('checking');
      }}
    />
  );
}
