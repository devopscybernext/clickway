import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type mysql from 'mysql2/promise';
import { getPool, LOGIN_ATTEMPTS_SQL } from './mysql';
import { clientIp, describeAgent } from './loginLog';

// Login protection: at most MAX_FAILED wrong logins per device in WINDOW_MINUTES. After that this
// device can't log in until the window has passed. The account itself is never locked: the same
// person can still log in from another device.
//
// How a device is recognised:
//   device cookie   a random id (cn_device, httpOnly, one year) the server gives every browser that
//                   opens the login, signed with SESSION_SECRET together with the time it was given,
//                   so it can't be made up. Each browser counts its own wrong attempts.
//   fingerprint     IP address + browser string. A request without a valid device cookie, or with one
//                   given in the last 15 minutes, is also counted by its fingerprint. So clearing
//                   cookies (and getting a new one) doesn't reset the count: the wrong attempts made
//                   from this machine and browser before still block it. A browser that had its cookie
//                   for longer (a colleague on the same office network) is counted only by its own.
// A successful login clears the device's wrong attempts.

export const MAX_FAILED = 3;
export const WINDOW_MINUTES = 15;
export const DEVICE_COOKIE = 'cn_device';
const DEVICE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Device {
  id: string;            // the device cookie's id (new when the browser had no valid cookie)
  issuedAt: number;      // when the cookie was given (seconds)
  hadCookie: boolean;    // the request carried a valid, signed device cookie
  isNew: boolean;        // no valid cookie, or one given within the last WINDOW_MINUTES
  fingerprint: string;   // sha256 of IP + browser string
  ip: string;
  userAgent: string;
}

function sign(id: string, issuedAt: number): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return createHmac('sha256', secret).update(`device:${id}.${issuedAt}`).digest('base64url');
}

// "<id>.<issued at>.<signature>", or null when missing, made up or from the older unsigned format
function readCookie(value: string | undefined): { id: string; issuedAt: number } | null {
  const [id, issued, sig] = (value ?? '').split('.');
  const issuedAt = Number(issued);
  if (!id || !UUID.test(id) || !Number.isInteger(issuedAt) || issuedAt <= 0 || !sig) return null;
  const expected = Buffer.from(sign(id.toLowerCase(), issuedAt));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { id: id.toLowerCase(), issuedAt };
}

export function identifyDevice(cookieValue: string | undefined, headers: Headers): Device {
  const ip = clientIp(headers);
  const userAgent = (headers.get('user-agent') ?? '').slice(0, 512);
  const now = Math.floor(Date.now() / 1000);
  const cookie = readCookie(cookieValue);
  return {
    id: cookie?.id ?? randomUUID(),
    issuedAt: cookie?.issuedAt ?? now,
    hadCookie: !!cookie,
    isNew: !cookie || now - cookie.issuedAt < WINDOW_MINUTES * 60,
    fingerprint: createHash('sha256').update(`${ip}|${userAgent}`).digest('hex'),
    ip, userAgent,
  };
}

// The signed device cookie (set on every login answer)
export const deviceCookie = (d: Device) => ({
  name: DEVICE_COOKIE, value: `${d.id}.${d.issuedAt}.${sign(d.id, d.issuedAt)}`,
  options: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: DEVICE_COOKIE_MAX_AGE },
});

const isMissingTable = (e: unknown) => (e as { code?: string })?.code === 'ER_NO_SUCH_TABLE';
// Tables made before had_cookie was added get the column (once per server process)
let columnReady: Promise<void> | null = null;
function ensureColumn(): Promise<void> {
  columnReady ??= (async () => {
    const [rows] = await getPool().query<mysql.RowDataPacket[]>(
      "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'login_attempts' AND COLUMN_NAME = 'had_cookie'"
    );
    if (!rows.length) {
      const [table] = await getPool().query<mysql.RowDataPacket[]>("SHOW TABLES LIKE 'login_attempts'");
      if (table.length) await getPool().query('ALTER TABLE `login_attempts` ADD COLUMN `had_cookie` TINYINT(1) NOT NULL DEFAULT 1 AFTER `fingerprint`');
    }
  })().catch(error => { columnReady = null; throw error; });
  return columnReady;
}
async function withTable<T>(run: () => Promise<T>): Promise<T> {
  try {
    await ensureColumn();
    return await run();
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    await getPool().query(LOGIN_ATTEMPTS_SQL);   // before `npm run db:migrate` has run
    return run();
  }
}

export interface GuardState { blocked: boolean; failed: number; retryMinutes: number }

// Wrong attempts in the window for one way of recognising the device
async function countRecent(where: string, value: string): Promise<{ failed: number; retry: number }> {
  const [rows] = await withTable(() => getPool().query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS failed,
            GREATEST(0, CEIL(TIMESTAMPDIFF(SECOND, NOW(), MIN(created_at) + INTERVAL ? MINUTE) / 60)) AS retry
       FROM (SELECT created_at FROM login_attempts
              WHERE ${where} AND created_at >= NOW() - INTERVAL ? MINUTE
              ORDER BY created_at DESC LIMIT ?) recent`,
    [WINDOW_MINUTES, value, WINDOW_MINUTES, MAX_FAILED]
  ));
  return { failed: Number(rows[0]?.failed ?? 0), retry: Number(rows[0]?.retry ?? 0) };
}

// How many wrong attempts this device has in the window, and whether it is blocked now: counted by its
// cookie id, and (for a new or missing cookie) by its fingerprint as well, whichever is higher
export async function checkDevice(d: Device): Promise<GuardState> {
  try {
    const counts = [await countRecent('device_id = ?', d.id)];
    if (d.isNew) counts.push(await countRecent('fingerprint = ?', d.fingerprint));
    const failed = Math.max(...counts.map(c => c.failed));
    const blocking = counts.filter(c => c.failed >= MAX_FAILED);
    // Blocked until the oldest of the last MAX_FAILED wrong attempts leaves the window
    const retry = blocking.length ? Math.max(...blocking.map(c => c.retry)) : 0;
    return { blocked: blocking.length > 0, failed, retryMinutes: Math.max(1, retry || WINDOW_MINUTES) };
  } catch (error) {
    // The check never locks everyone out if the database has a problem
    console.error('[login-guard] check', error);
    return { blocked: false, failed: 0, retryMinutes: 0 };
  }
}

// One wrong login from this device
export async function recordFailure(d: Device, identifier: string): Promise<void> {
  try {
    await withTable(() => getPool().query(
      'INSERT INTO login_attempts (device_id, fingerprint, had_cookie, identifier, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
      [d.id, d.fingerprint, d.hadCookie ? 1 : 0, identifier.slice(0, 191), d.ip, d.userAgent]
    ));
    await getPool().query('DELETE FROM login_attempts WHERE created_at < NOW() - INTERVAL 1 DAY');
  } catch (error) {
    console.error('[login-guard] record', error);
  }
}

// A successful login: this device starts again from zero
export async function clearFailures(d: Device): Promise<void> {
  try {
    await withTable(() => getPool().query('DELETE FROM login_attempts WHERE device_id = ? OR fingerprint = ?', [d.id, d.fingerprint]));
  } catch (error) {
    console.error('[login-guard] clear', error);
  }
}

// ─── Admin Portal > Login Tracker > Failed attempts ──────────────────────────

// One device's wrong logins in the last day. `key` names the device the same way checkDevice counts
// it: "d:<device id>" for a browser with its device cookie, "f:<fingerprint>" for requests without one.
export interface FailedDevice {
  key: string; attempts: number; recent: number; blocked: boolean; retryMinutes: number;
  identifiers: string[]; firstAt: string; lastAt: string;
  ip: string; browser: string; os: string; device: string; userAgent: string; cookie: boolean;
}

export async function listFailedDevices(): Promise<FailedDevice[]> {
  let rows: mysql.RowDataPacket[];
  let now: Date;
  try {
    await getPool().query('DELETE FROM login_attempts WHERE created_at < NOW() - INTERVAL 1 DAY');
    [rows] = await withTable(() => getPool().query<mysql.RowDataPacket[]>(
      'SELECT device_id, fingerprint, had_cookie, identifier, ip, user_agent, created_at FROM login_attempts ORDER BY created_at ASC'
    ));
    const [clock] = await getPool().query<mysql.RowDataPacket[]>('SELECT NOW() AS now');
    now = new Date(clock[0].now);
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
  const windowMs = WINDOW_MINUTES * 60_000;
  const times = (list: mysql.RowDataPacket[]) => list.map(r => new Date(r.created_at).getTime());
  const groups = new Map<string, mysql.RowDataPacket[]>();
  for (const r of rows) {
    const key = Number(r.had_cookie) === 1 ? `d:${r.device_id}` : `f:${r.fingerprint}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out: FailedDevice[] = [];
  for (const [key, list] of groups) {
    // Counted like checkDevice: by device id, or (no cookie) by every attempt with this fingerprint
    const counted = key.startsWith('d:') ? list : rows.filter(r => r.fingerprint === key.slice(2));
    const inWindow = times(counted).filter(t => t >= now.getTime() - windowMs).sort((a, b) => b - a).slice(0, MAX_FAILED);
    const blocked = inWindow.length >= MAX_FAILED;
    const until = blocked ? Math.min(...inWindow) + windowMs : 0;
    const last = list[list.length - 1];
    const ua = String(last.user_agent ?? '');
    const { browser, os, device } = describeAgent(ua);
    out.push({
      key, attempts: list.length, recent: inWindow.length, blocked,
      retryMinutes: blocked ? Math.max(1, Math.ceil((until - now.getTime()) / 60_000)) : 0,
      identifiers: [...new Set(list.map(r => String(r.identifier)).filter(Boolean))],
      firstAt: new Date(list[0].created_at).toISOString(), lastAt: new Date(last.created_at).toISOString(),
      ip: String(last.ip ?? ''), browser, os, device, userAgent: ua, cookie: key.startsWith('d:'),
    });
  }
  return out.sort((a, b) => Number(b.blocked) - Number(a.blocked) || b.lastAt.localeCompare(a.lastAt));
}

// Unblocks a device: its wrong logins are forgotten, so it can log in again straight away
export async function unblockDevice(key: string): Promise<boolean> {
  const m = key.match(/^(d):([0-9a-f-]{36})$|^(f):([0-9a-f]{64})$/i);
  if (!m) return false;
  // The device's own attempts, and every attempt from the same machine and browser (fingerprint), so a
  // new cookie on that machine isn't still blocked by them
  const value = (m[2] ?? m[4]).toLowerCase();
  const [res] = await withTable(() => getPool().query<mysql.ResultSetHeader>(
    m[1]
      ? `DELETE FROM login_attempts WHERE device_id = ? OR fingerprint IN (SELECT fingerprint FROM (SELECT DISTINCT fingerprint FROM login_attempts WHERE device_id = ?) f)`
      : 'DELETE FROM login_attempts WHERE fingerprint = ?',
    m[1] ? [value, value] : [value]
  ));
  return res.affectedRows > 0;
}

export function blockedMessage(minutes: number): string {
  return `Too many failed login attempts from this device. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}
