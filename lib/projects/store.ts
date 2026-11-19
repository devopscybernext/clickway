import type mysql from 'mysql2/promise';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getPool } from '../data/mysql';
import { verifySession, COOKIE_NAME } from '../session';
import { USER_DETAILS_SHEET_ID, TAB_USERS } from '../config';
import { isDirectBrowserNavigation } from '../blockDirectAccess';
import { DriveError } from './google';
import { canManageProject, canAddDocuments, type ProjectAccess } from './rules';
import { policyFor, type Policy } from './policy';

// Shared server pieces for the Projects API routes: who is asking, what they may do in a project,
// row locks, the change log, and turning errors into JSON answers.

export class ProjectError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface Actor { id: number; username: string; role: string; name: string; email: string; policy: Policy }
export type Row = mysql.RowDataPacket;
export type Conn = mysql.PoolConnection;

export const pool = () => getPool();

// The dashboard's accounts live in `users`, next to their (sheet_id, sheet_tab) registry keys.
export const USERS_WHERE = 'u.sheet_id = ? AND u.sheet_tab = ?';
export const USERS_KEYS = [USER_DETAILS_SHEET_ID, TAB_USERS];

// The signed-in person, read fresh from `users` so a role changed in the Admin Portal applies at once,
// with what they may do in Projects (Admin Portal → Projects). Anyone without Projects access is
// refused here, unless `allowNoAccess` (the menu check needs to answer them).
export async function actorFrom(req: NextRequest, opts: { allowNoAccess?: boolean } = {}): Promise<Actor> {
  const session = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!session) throw new ProjectError('Please sign in again.', 401);
  const [rows] = await pool().query<Row[]>(
    `SELECT u.id, u.username, u.role, u.display_name, u.email, u.department, u.sub_department FROM users u
      WHERE ${USERS_WHERE} AND LOWER(TRIM(u.username)) = LOWER(TRIM(?))
      ORDER BY (LOWER(TRIM(u.email)) = LOWER(TRIM(?))) DESC, u.id LIMIT 1`,
    [...USERS_KEYS, session.username, session.email ?? '']
  );
  const u = rows[0];
  if (!u) throw new ProjectError('Your account was not found. Please sign in again.', 401);
  const role = String(u.role ?? '').trim();
  const name = String(u.display_name || u.username || '');
  const policy = await policyFor(pool(), { id: Number(u.id), role, name, department: String(u.department ?? ''), sub: String(u.sub_department ?? '') });
  if (!policy.access && !opts.allowNoAccess) throw new ProjectError('You do not have access to Projects. Ask an administrator if you need it.', 403);
  return { id: Number(u.id), username: String(u.username ?? ''), role, name, email: String(u.email ?? '').trim().toLowerCase(), policy };
}

export async function withConnection<T>(run: (c: Conn) => Promise<T>): Promise<T> {
  const c = await pool().getConnection();
  try {
    return await run(c);
  } finally {
    c.release();
  }
}

// A named MySQL lock held while `run` works, so two requests never share or revoke the same files at once.
export async function withLock<T>(c: Conn, key: string, run: () => Promise<T>): Promise<T> {
  const [rows] = await c.query<Row[]>('SELECT GET_LOCK(?, 15) AS acquired', [key]);
  if (Number(rows[0]?.acquired) !== 1) throw new ProjectError('Another change is still being saved. Please try again in a moment.', 409);
  try {
    return await run();
  } finally {
    try { await c.query('SELECT RELEASE_LOCK(?)', [key]); } catch { c.destroy(); }
  }
}
export const SHARING_LOCK = 'projects:document-access';

// Projects changes go in the dashboard's change_log, like every other edit.
export async function logChange(c: Conn, actor: Actor, table: string, rowId: number, what: string, oldValue: string | null, newValue: string | null) {
  await c.query(
    'INSERT INTO change_log (changed_by, table_name, row_id, column_name, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)',
    [actor.email || actor.username, table, rowId, what, oldValue, newValue]
  );
}

// ─── Access ──────────────────────────────────────────────────────────────────

// The person's access in one project: people with full access count as Creator everywhere; anyone else
// needs a membership row. null = no access (or no such project).
export async function projectAccess(actor: Actor, projectId: number, c?: Conn): Promise<ProjectAccess | null> {
  const db = c ?? pool();
  if (actor.policy.full) {
    const [rows] = await db.query<Row[]>('SELECT id FROM doc_projects WHERE id = ?', [projectId]);
    return rows.length ? 'manager' : null;
  }
  const [rows] = await db.query<Row[]>('SELECT access_level FROM doc_project_members WHERE project_id = ? AND user_id = ?', [projectId, actor.id]);
  return (rows[0]?.access_level as ProjectAccess | undefined) ?? null;
}

export async function requireProject(actor: Actor, projectId: number, need: 'view' | 'add' | 'manage', c?: Conn): Promise<ProjectAccess> {
  const access = await projectAccess(actor, projectId, c);
  if (!access) throw new ProjectError('You do not have access to this project.', 403);
  if (need === 'add' && !canAddDocuments(access)) throw new ProjectError('Viewers cannot add documents to this project.', 403);
  if (need === 'manage' && !canManageProject(actor.policy.full, access)) throw new ProjectError("Only administrators and the project's Creators can do this.", 403);
  return access;
}

// SQL condition limiting doc_projects `p` to the person's projects
export function projectScope(actor: Actor): { sql: string; values: unknown[] } {
  return actor.policy.full
    ? { sql: '1=1', values: [] }
    : { sql: 'EXISTS (SELECT 1 FROM doc_project_members m WHERE m.project_id = p.id AND m.user_id = ?)', values: [actor.id] };
}

// ─── Input ───────────────────────────────────────────────────────────────────

export function text(value: unknown, label: string, max: number, required = false): string {
  if (value !== undefined && value !== null && typeof value !== 'string') throw new ProjectError(`${label} must be text.`);
  const t = (value ?? '').trim();
  if (required && !t) throw new ProjectError(`${label} is required.`);
  if (t.length > max) throw new ProjectError(`${label} must be at most ${max} characters.`);
  return t;
}

export function positiveId(value: unknown, label = 'record'): number {
  const s = String(value ?? '');
  if (!/^[1-9]\d{0,9}$/.test(s) || Number(s) > 4294967295) throw new ProjectError(`Invalid ${label}.`);
  return Number(s);
}

export function webUrl(value: string, label: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.href;
  } catch {
    throw new ProjectError(`${label} must be a valid http(s) link.`);
  }
}

// Accepts "example.com" as well as full links; stores a https:// URL.
export function websiteUrl(value: string): string | null {
  if (!value) return null;
  const url = webUrl(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`, 'Website')!;
  if (!new URL(url).hostname.includes('.')) throw new ProjectError('Website must be a valid http(s) link.');
  return url;
}

export function creationKey(value: unknown): string {
  const key = String(value ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    throw new ProjectError('This form has expired. Close it and open it again.');
  }
  return key.toLowerCase();
}

// ─── Route plumbing ──────────────────────────────────────────────────────────

// Runs a route body and answers with JSON. Expected errors carry their message; anything else is
// logged and answered with a generic message.
export async function respond(req: NextRequest, run: () => Promise<Record<string, unknown>>, opts: { allowNavigation?: boolean } = {}) {
  if (!opts.allowNavigation && isDirectBrowserNavigation(req)) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  try {
    const body = await run();
    return NextResponse.json({ success: true, ...body });
  } catch (error) {
    if (error instanceof ProjectError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof DriveError) return NextResponse.json({ success: false, error: error.message }, { status: 502 });
    console.error('[projects]', error);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ProjectError('Invalid request.');
  return body as Record<string, unknown>;
}
