// Google Drive access for Projects, as the workspace Google account (OAuth refresh token in
// .env.local: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN).
// Plain fetch() against the Drive REST API: no Google package to install. The access token is
// kept in memory until shortly before it expires; a 401 clears it and the call is tried once more.

export class DriveError extends Error {}

// Thrown for a non-2xx answer from Google. Callers read error.response.status.
export class DriveHttpError extends Error {
  response: { status: number };
  constructor(status: number, message: string) {
    super(message);
    this.response = { status };
  }
}

type Params = Record<string, string | number | boolean | undefined>;
export interface DriveRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  params?: Params;
  data?: unknown;                     // an object is sent as JSON; bytes (Uint8Array) as they are
  headers?: Record<string, string>;
  timeout?: number;                   // milliseconds, default 20 s
}
export interface DriveResponse<T> { data: T; headers: Headers }
export interface DriveAuth {
  request<T = unknown>(req: DriveRequest): Promise<DriveResponse<T>>;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const cache = globalThis as unknown as { __projectsDriveToken?: { token: string; expires: number } };

function credentials() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new DriveError('Google Drive is not connected. Add the workspace Google account to the server settings first.');
  }
  return { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, refreshToken: GOOGLE_REFRESH_TOKEN };
}

async function accessToken(): Promise<string> {
  const now = Date.now();
  const held = cache.__projectsDriveToken;
  if (held && held.expires > now + 60_000) return held.token;
  const { clientId, clientSecret, refreshToken } = credentials();
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
  } catch {
    throw new DriveError('Could not reach Google. Check the server connection and try again.');
  }
  const json = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    // invalid_grant: the refresh token was revoked or has expired
    throw new DriveHttpError(401, json.error === 'invalid_grant'
      ? 'Google authorization expired. Reconnect the workspace Google account.'
      : 'Google authorization failed. Check the workspace Google account settings.');
  }
  cache.__projectsDriveToken = { token: json.access_token, expires: now + (json.expires_in ?? 3600) * 1000 };
  return json.access_token;
}

function withParams(url: string, params?: Params): string {
  if (!params) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, String(v));
  return u.toString();
}

async function send<T>(req: DriveRequest, retried: boolean): Promise<DriveResponse<T>> {
  const token = await accessToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, ...req.headers };
  let body: BodyInit | undefined;
  if (req.data instanceof Uint8Array) {
    body = new Uint8Array(req.data);
  } else if (req.data !== undefined) {
    body = JSON.stringify(req.data);
    headers['Content-Type'] = 'application/json; charset=UTF-8';
  }
  let res: Response;
  try {
    res = await fetch(withParams(req.url, req.params), {
      method: req.method ?? 'GET', headers, body,
      signal: AbortSignal.timeout(req.timeout ?? 20_000),
      cache: 'no-store',
    });
  } catch {
    throw new DriveHttpError(0, 'Google Drive did not answer in time.');
  }
  if (res.status === 401 && !retried) {
    cache.__projectsDriveToken = undefined;
    return send<T>(req, true);
  }
  const text = await res.text();
  let data: unknown = undefined;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) {
    const message = (data as { error?: { message?: string } })?.error?.message ?? `Google Drive answered ${res.status}`;
    throw new DriveHttpError(res.status, message);
  }
  return { data: data as T, headers: res.headers };
}

export function driveClient(): DriveAuth {
  credentials(); // fail early with a clear message when Drive isn't configured
  return { request: <T>(req: DriveRequest) => send<T>(req, false) };
}

export function httpStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}
