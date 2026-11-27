import type mysql from 'mysql2/promise';
import { getPool, LOGIN_LOG_SQL } from './mysql';

// Admin Portal → Login Tracker: one row per sign-in and sign-out, with when it happened, the IP
// address and the browser it came from. Kept LOGIN_LOG_DAYS days; older rows are removed automatically.
//
// Location, two ways:
//   from the IP address   city, region, country and internet provider, looked up with ipinfo.io right
//                         after the row is saved (IPINFO_TOKEN in .env.local; works without it at a
//                         lower free limit). The same IP is looked up at most once a month.
//   from the browser      exact coordinates, when the person allows the browser's location prompt
//                         after logging in (saved on their latest login, see saveBrowserLocation), and
//                         again when they press Logout (sent with the logout, if they allowed it).

export const LOGIN_LOG_DAYS = 90;

// Signing in and using the dashboard need the browser's location (allowed in the browser). Set
// REQUIRE_LOGIN_LOCATION=false in .env.local to turn the requirement off (for example in an emergency).
export function locationRequired(): boolean {
  return process.env.REQUIRE_LOGIN_LOCATION !== 'false';
}

export interface LoginLogRow {
  id: number; createdAt: string; event: 'login' | 'logout';
  username: string; displayName: string; email: string; role: string;
  ip: string; browser: string; os: string; device: string; userAgent: string;
  city: string; region: string; country: string; isp: string;
  latitude: number | null; longitude: number | null; accuracy: number | null;
}

// Tables created before location was added get the columns (once per server process)
let columnsReady: Promise<void> | null = null;
function ensureLocationColumns(): Promise<void> {
  columnsReady ??= (async () => {
    const pool = getPool();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'login_log'"
    );
    if (!rows.length) return;   // no table yet: LOGIN_LOG_SQL creates it with every column
    const have = new Set(rows.map(r => String(r.COLUMN_NAME)));
    const add: [string, string][] = [
      ['city', "VARCHAR(100) NOT NULL DEFAULT ''"], ['region', "VARCHAR(100) NOT NULL DEFAULT ''"],
      ['country', "VARCHAR(100) NOT NULL DEFAULT ''"], ['isp', "VARCHAR(191) NOT NULL DEFAULT ''"],
      ['latitude', 'DECIMAL(9,6) NULL'], ['longitude', 'DECIMAL(9,6) NULL'], ['accuracy_m', 'INT UNSIGNED NULL'],
    ];
    for (const [name, type] of add) {
      if (!have.has(name)) await pool.query(`ALTER TABLE \`login_log\` ADD COLUMN \`${name}\` ${type}`);
    }
  })().catch(error => { columnsReady = null; throw error; });
  return columnsReady;
}

// Addresses that can't be located (this machine, office network, etc.)
function isPrivateIp(ip: string): boolean {
  return !ip || ip === '::1' || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|f[cd]|fe80)/i.test(ip);
}

let countryNames: Intl.DisplayNames | null = null;
const countryName = (code: string) => {
  try { countryNames ??= new Intl.DisplayNames(['en'], { type: 'region' }); return countryNames.of(code) ?? code; } catch { return code; }
};

// Fills in the city, region, country and provider of one row from its IP address
async function fillIpLocation(id: number, ip: string): Promise<void> {
  if (isPrivateIp(ip)) return;
  const pool = getPool();
  // Already looked up this month: reuse it
  const [known] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT city, region, country, isp FROM login_log
      WHERE ip = ? AND country <> '' AND created_at >= NOW() - INTERVAL 30 DAY ORDER BY id DESC LIMIT 1`, [ip]
  );
  let place = known[0] as { city: string; region: string; country: string; isp: string } | undefined;
  if (!place) {
    const token = process.env.IPINFO_TOKEN;
    const res = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000), cache: 'no-store',
    });
    if (!res.ok) throw new Error(`ipinfo answered ${res.status}`);
    const j = await res.json() as { city?: string; region?: string; country?: string; org?: string; bogon?: boolean };
    if (j.bogon) return;
    place = {
      city: String(j.city ?? '').slice(0, 100), region: String(j.region ?? '').slice(0, 100),
      country: j.country ? countryName(String(j.country)).slice(0, 100) : '',
      isp: String(j.org ?? '').replace(/^AS\d+\s+/, '').slice(0, 191),   // "AS9829 BSNL" → "BSNL"
    };
  }
  await pool.query('UPDATE login_log SET city = ?, region = ?, country = ?, isp = ? WHERE id = ?', [place.city, place.region, place.country, place.isp, id]);
}

// The browser's location prompt: exact coordinates, saved on the person's latest login (last 12 hours)
export async function saveBrowserLocation(username: string, latitude: number, longitude: number, accuracy: number | null): Promise<boolean> {
  await ensureLocationColumns();
  const [res] = await getPool().query<mysql.ResultSetHeader>(
    `UPDATE login_log SET latitude = ?, longitude = ?, accuracy_m = ?
      WHERE id = (SELECT id FROM (SELECT id FROM login_log WHERE username = ? AND event = 'login' AND created_at >= NOW() - INTERVAL 12 HOUR ORDER BY id DESC LIMIT 1) latest)`,
    [latitude, longitude, accuracy, username]
  );
  return res.affectedRows > 0;
}

// The visitor's IP address: the first address in X-Forwarded-For (set by the server's proxy), else
// X-Real-IP / CF-Connecting-IP.
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || headers.get('x-real-ip')?.trim() || headers.get('cf-connecting-ip')?.trim() || '';
  return ip.replace(/^::ffff:/, '').slice(0, 64);
}

// A readable browser, operating system and device type from the User-Agent header
export function describeAgent(ua: string): { browser: string; os: string; device: string } {
  const v = (re: RegExp) => ua.match(re)?.[1]?.split('.')[0] ?? '';
  let browser = 'Unknown';
  if (/Edg(e|A|iOS)?\//.test(ua)) browser = `Edge ${v(/Edg(?:e|A|iOS)?\/([\d.]+)/)}`;
  else if (/OPR\/|Opera/.test(ua)) browser = `Opera ${v(/OPR\/([\d.]+)/)}`;
  else if (/SamsungBrowser\//.test(ua)) browser = `Samsung Internet ${v(/SamsungBrowser\/([\d.]+)/)}`;
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = `Firefox ${v(/(?:Firefox|FxiOS)\/([\d.]+)/)}`;
  else if (/Chrome\/|CriOS\//.test(ua)) browser = `Chrome ${v(/(?:Chrome|CriOS)\/([\d.]+)/)}`;
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = `Safari ${v(/Version\/([\d.]+)/)}`;

  let os = 'Unknown';
  if (/Windows NT 10\.0/.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT 6\.3/.test(ua)) os = 'Windows 8.1';
  else if (/Windows NT 6\.1/.test(ua)) os = 'Windows 7';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/iPhone|iPad|iPod/.test(ua)) os = `iOS ${(ua.match(/OS (\d+)[_.]/)?.[1]) ?? ''}`;
  else if (/Android/.test(ua)) os = `Android ${v(/Android ([\d.]+)/)}`;
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  const device = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'Tablet'
    : /Mobi|iPhone|Android/.test(ua) ? 'Mobile' : ua ? 'Desktop' : '';
  return { browser: browser.trim(), os: os.trim(), device };
}

const isMissingTable = (e: unknown) => (e as { code?: string })?.code === 'ER_NO_SUCH_TABLE';

export interface Coordinates { latitude: number; longitude: number; accuracy: number | null }

// Browser coordinates sent by the page: checked and rounded, or null when missing or invalid
export function parseCoordinates(body: unknown): Coordinates | null {
  const b = (body ?? {}) as { latitude?: unknown; longitude?: unknown; accuracy?: unknown };
  if (b.latitude === undefined || b.longitude === undefined || b.latitude === null || b.longitude === null) return null;
  const lat = Number(b.latitude), lng = Number(b.longitude), acc = Number(b.accuracy);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    latitude: Math.round(lat * 1e6) / 1e6, longitude: Math.round(lng * 1e6) / 1e6,
    accuracy: b.accuracy !== undefined && b.accuracy !== null && Number.isFinite(acc) && acc >= 0 ? Math.min(Math.round(acc), 4_000_000) : null,
  };
}

// Records a sign-in or sign-out (with the browser's coordinates when it sent them). Never throws: a
// failure here must not stop anyone logging in or out.
export async function recordLoginEvent(
  event: 'login' | 'logout',
  user: { username: string; displayName?: string; email?: string; role?: string },
  headers: Headers,
  coords: Coordinates | null = null,
): Promise<void> {
  const ua = (headers.get('user-agent') ?? '').slice(0, 512);
  const { browser, os, device } = describeAgent(ua);
  const values = [
    event, user.username.slice(0, 191), (user.displayName ?? '').slice(0, 191), (user.email ?? '').slice(0, 191), (user.role ?? '').slice(0, 64),
    clientIp(headers), browser.slice(0, 100), os.slice(0, 100), device, ua,
  ];
  const insert = () => getPool().query<mysql.ResultSetHeader>(
    'INSERT INTO login_log (event, username, display_name, email, role, ip, browser, os, device, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    values
  );
  try {
    let id: number;
    try {
      id = (await insert())[0].insertId;
    } catch (e) {
      if (!isMissingTable(e)) throw e;
      await getPool().query(LOGIN_LOG_SQL);   // before `npm run db:migrate` has run
      id = (await insert())[0].insertId;
    }
    // The IP's location is looked up after the login has gone through (it never slows it down)
    const ip = String(values[5]);
    void ensureLocationColumns()
      .then(async () => {
        if (coords) {
          await getPool().query('UPDATE login_log SET latitude = ?, longitude = ?, accuracy_m = ? WHERE id = ?',
            [coords.latitude, coords.longitude, coords.accuracy, id]);
        }
        await fillIpLocation(id, ip);
      })
      .catch(error => console.error('[login-log] location', error));
  } catch (error) {
    console.error('[login-log]', error);
  }
}

export async function listLoginLog(): Promise<LoginLogRow[]> {
  const pool = getPool();
  try {
    await ensureLocationColumns();
    await pool.query('DELETE FROM login_log WHERE created_at < NOW() - INTERVAL ? DAY', [LOGIN_LOG_DAYS]);
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT id, created_at, event, username, display_name, email, role, ip, browser, os, device, user_agent,
            city, region, country, isp, latitude, longitude, accuracy_m
       FROM login_log ORDER BY id DESC LIMIT 10000`
  );
  return rows.map(r => ({
    id: Number(r.id), createdAt: new Date(r.created_at).toISOString(), event: r.event,
    username: r.username, displayName: r.display_name, email: r.email, role: r.role,
    ip: r.ip, browser: r.browser, os: r.os, device: r.device, userAgent: r.user_agent,
    city: r.city ?? '', region: r.region ?? '', country: r.country ?? '', isp: r.isp ?? '',
    latitude: r.latitude === null || r.latitude === undefined ? null : Number(r.latitude),
    longitude: r.longitude === null || r.longitude === undefined ? null : Number(r.longitude),
    accuracy: r.accuracy_m === null || r.accuracy_m === undefined ? null : Number(r.accuracy_m),
  }));
}
