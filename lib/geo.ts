// The browser's location, for the Login Tracker and the location requirement (see LOCATION_REQUIRED
// in lib/data/loginLog.ts). Runs in the browser only.

export interface BrowserCoords { latitude: number; longitude: number; accuracy: number }
export type LocationResult =
  | { ok: true; coords: BrowserCoords }
  | { ok: false; reason: 'denied' | 'unavailable' | 'timeout' | 'unsupported' };

// Asks for the location (the browser shows its "Allow location?" prompt the first time)
export function getBrowserLocation(timeout = 20_000): Promise<LocationResult> {
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) { resolve({ ok: false, reason: 'unsupported' }); return; }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ ok: true, coords: { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy } }),
      e => resolve({ ok: false, reason: e.code === e.PERMISSION_DENIED ? 'denied' : e.code === e.TIMEOUT ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: true, timeout, maximumAge: 5 * 60_000 },
    );
  });
}

// What to tell the person when the location couldn't be read
export function locationMessage(reason: Exclude<LocationResult, { ok: true }>['reason']): string {
  switch (reason) {
    case 'denied':
      return 'Location access is blocked for this site. Click the lock (or location) icon next to the address bar, set Location to Allow, then try again.';
    case 'unsupported':
      return 'This browser cannot share your location. Please use an up-to-date Chrome, Edge, Firefox or Safari.';
    case 'timeout':
      return 'Your location took too long to find. Check that location services are turned on for your device, then try again.';
    default:
      return 'Your location could not be found. Turn on location services for your device and browser, then try again.';
  }
}
