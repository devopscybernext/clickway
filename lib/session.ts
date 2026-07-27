import crypto from 'crypto';
import { AuthUser } from './auth';

const COOKIE_NAME = 'cn_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return secret;
}

function sign(body: string): string {
  return crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
}

export function signSession(user: AuthUser): { token: string; maxAge: number } {
  const payload = { ...user, exp: Date.now() + MAX_AGE_SECONDS * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = sign(body);
  return { token: `${body}.${sig}`, maxAge: MAX_AGE_SECONDS };
}

export function verifySession(token: string | undefined | null): AuthUser | null {
  if (!token) return null;
  const dotIdx = token.lastIndexOf('.');
  if (dotIdx === -1) return null;
  const body = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);

  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return null;
  }

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
    const { username, role, displayName, email } = payload;
    if (!username || !role || !displayName) return null;
    return { username, role, displayName, email };
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
