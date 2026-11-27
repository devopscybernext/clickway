import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { fetchSheetData } from '@/lib/dataStore';
import { USER_DETAILS_SHEET_ID, RANGE_USERS } from '@/lib/config';
import { signSession, COOKIE_NAME } from '@/lib/session';
import { MOD_ENABLED, Role, AuthUser, isAdminTierRole } from '@/lib/auth';
import { recordLoginEvent, parseCoordinates, locationRequired } from '@/lib/data/loginLog';
import { identifyDevice, checkDevice, recordFailure, clearFailures, blockedMessage, deviceCookie, DEVICE_COOKIE, MAX_FAILED } from '@/lib/data/loginGuard';

export const runtime = 'nodejs';

// Admin-tier roles (HM/Admin/Mod) log in with Username; everyone else logs
// in with Email — a single "identifier" field on the client, resolved here
// per-row against whichever column that row's role is supposed to use.
//
// Login protection (lib/data/loginGuard.ts): after 3 wrong logins in 15 minutes this device is blocked
// from logging in until the 15 minutes have passed. The account is not locked.
export async function POST(req: NextRequest) {
  // Every answer carries the device cookie, so the browser keeps its id
  const device = identifyDevice(req.cookies.get(DEVICE_COOKIE)?.value, req.headers);
  const reply = (body: Record<string, unknown>, status = 200) => {
    const res = NextResponse.json(body, { status });
    const c = deviceCookie(device);
    res.cookies.set(c.name, c.value, c.options);
    return res;
  };
  try {
    const body = await req.json() as { identifier?: string; password?: string; location?: unknown };
    const { identifier, password } = body;
    if (!identifier || !password) {
      return reply({ success: false, error: 'Email/username and password are required' }, 400);
    }

    // Blocked device: no password is even checked until the 15 minutes have passed
    const guard = await checkDevice(device);
    if (guard.blocked) {
      return reply({ success: false, code: 'too-many-attempts', error: blockedMessage(guard.retryMinutes) }, 429);
    }

    const { data } = await fetchSheetData(USER_DETAILS_SHEET_ID, RANGE_USERS);
    const input = identifier.trim().toLowerCase();
    const row = data.find(r => {
      const role = String(r['Role'] ?? '').trim() as Role;
      if (isAdminTierRole(role)) {
        return String(r['Username'] ?? '').trim().toLowerCase() === input;
      }
      const email = String(r['Email'] ?? '').trim().toLowerCase();
      return !!email && email === input;
    });

    // A wrong login counts against this device; the third one blocks it
    const invalidResponse = async () => {
      await recordFailure(device, input);
      const left = MAX_FAILED - (guard.failed + 1);
      if (left <= 0) {
        const after = await checkDevice(device);
        return reply({ success: false, code: 'too-many-attempts', error: blockedMessage(after.retryMinutes || 15) }, 429);
      }
      return reply({ success: false, error: `Invalid credentials. ${left} attempt${left === 1 ? '' : 's'} left before this device is blocked for 15 minutes.` }, 401);
    };

    if (!row) return await invalidResponse();

    const hash = String(row['Password Hash'] ?? '');
    if (!hash) return await invalidResponse();

    const ok = await bcrypt.compare(password, hash);
    if (!ok) return await invalidResponse();

    const role = String(row['Role'] ?? '').trim() as Role;
    if (role.toLowerCase() === 'mod' && !MOD_ENABLED) return await invalidResponse();

    const user: AuthUser = {
      username: String(row['Username']).trim(),
      role,
      displayName: String(row['Display Name'] ?? row['Username']).trim(),
      email: row['Email'] ? String(row['Email']).trim() : undefined,
    };

    // Signing in needs the browser's location (checked after the password, so it reveals nothing)
    const coords = parseCoordinates(body.location);
    if (!coords && locationRequired()) {
      return reply(
        { success: false, code: 'location-required', error: 'Location access is required to sign in. Allow location for this site in your browser, then try again.' },
        403
      );
    }

    // Admin Portal > Login Tracker (never stops the login if it fails)
    await recordLoginEvent('login', user, req.headers, coords);
    await clearFailures(device);

    const { token, maxAge } = signSession(user);
    const res = reply({ success: true, user });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge,
    });
    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return reply({ success: false, error: message }, 500);
  }
}
