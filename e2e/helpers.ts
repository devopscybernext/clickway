import { loadEnvConfig } from '@next/env';
import mysql from 'mysql2/promise';
import { expect, type Page } from '@playwright/test';

// Same settings the dashboard uses (.env.local).
loadEnvConfig(process.cwd());

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
export const PASSWORD = 'E2E-local-only-Passw0rd!';

// Temporary users created by global-setup and deleted by global-teardown.
export const USERS = {
  admin: { username: 'e2e_admin', role: 'HM', displayName: 'E2E Admin', email: 'e2e-admin@example.invalid', loginWith: 'username' },
  pm: { username: 'e2e_pm', role: 'PMWebAdmin', displayName: 'E2E PM', email: 'e2e-pm@example.invalid', loginWith: 'email' },
  team: { username: 'e2e_team', role: 'WebTeam', displayName: 'E2E Team', email: 'e2e-team@example.invalid', loginWith: 'email' },
} as const;
export type E2EUser = (typeof USERS)[keyof typeof USERS];

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

// The suite writes to the database it points at, so it only ever runs
// against a dashboard and a database on this machine.
export function assertLocal(): void {
  const app = new URL(BASE_URL).hostname;
  const dbHost = process.env.MYSQL_HOST || '127.0.0.1';
  if (!LOCAL_HOSTS.has(app)) throw new Error(`E2E tests only run against a local dashboard, not ${app}`);
  if (!LOCAL_HOSTS.has(dbHost)) throw new Error(`E2E tests only run against a local database, not ${dbHost}`);
  if (!process.env.MYSQL_DATABASE) throw new Error('MYSQL_DATABASE is not set in .env.local');
}

export async function query<T = mysql.RowDataPacket[]>(sql: string, params: unknown[] = []): Promise<T> {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE,
  });
  try {
    const [rows] = await conn.query(sql, params);
    return rows as T;
  } finally {
    await conn.end();
  }
}

// Polls the database until fn returns a truthy value (writes from the UI land
// a moment after the click).
export async function waitForDb<T>(fn: () => Promise<T | undefined | null | false>, label: string, timeoutMs = 15_000): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for: ${label}`);
    await new Promise(r => setTimeout(r, 300));
  }
}

export async function login(page: Page, user: E2EUser): Promise<void> {
  await page.goto('/');
  await page.getByPlaceholder('Enter email or username').fill(user.loginWith === 'username' ? user.username : user.email);
  await page.getByPlaceholder('Enter password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('navigation')).toBeVisible();
}

// Opens a sidebar page. Several sections share page names ("Add Task" is in
// Web and Marketing), so the page link is looked up inside its own section.
// Clicking a section heading toggles it, so it's only clicked when that
// section's pages aren't already showing.
export async function openPage(page: Page, section: string, leaf?: string): Promise<void> {
  const nav = page.getByRole('navigation');
  const heading = nav.getByRole('button', { name: section, exact: true });
  // Let the sidebar finish rendering (e.g. after a reload) before deciding
  // whether the section is open — clicking an open heading would close it.
  await expect(heading).toBeVisible();
  await page.waitForLoadState('networkidle');
  if (!leaf) {
    await heading.click();
    return;
  }
  const link = heading.locator('xpath=..').getByRole('button', { name: leaf, exact: true });
  if (!(await link.isVisible())) await heading.click();
  await link.click();
}

// Types into the "Search all columns…" box on a task list, once its rows
// have loaded. The list's own default filters stay on.
export async function searchTasks(page: Page, text: string): Promise<void> {
  await expect(page.getByText(/\d+ of \d+ records/).first()).toBeVisible();
  await page.getByPlaceholder('Search all columns…').fill(text);
}

export const uniqueMark = (what: string) => `E2E ${what} ${Date.now().toString(36)}`;
