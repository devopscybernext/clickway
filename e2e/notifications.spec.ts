import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'crypto';
import { PASSWORD, USERS, login, query, type E2EUser } from './helpers';
import { SHEET_IDS, TAB_BANDWIDTH } from '../lib/config';
import { findDataset } from '../lib/data/datasets';

// Notifications: who is told about PM Status and Task Status changes, the bell's own list, and the
// Admin Portal log. The tasks are inserted straight into the local database and removed afterwards.

const FETCH = { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' };
const ds = findDataset(SHEET_IDS['1'], TAB_BANDWIDTH)!;
const col = (h: string) => ds.headers.indexOf(h);

async function signIn(playwright: { request: { newContext: (o: { baseURL?: string }) => Promise<APIRequestContext> } }, baseURL: string | undefined, user: E2EUser) {
  const ctx = await playwright.request.newContext({ baseURL });
  const res = await ctx.post('/api/login', { data: { identifier: user.loginWith === 'username' ? user.username : user.email, password: PASSWORD } });
  expect(res.status()).toBe(200);
  return ctx;
}

async function newTask(project: string): Promise<number> {
  const res = await query<{ insertId: number }>(
    `INSERT INTO web_tasks (sheet_id, sheet_tab, project_name, task_name, assigned_person, email_address, task_status_updation, pm_status, timestamp)
     VALUES (?, ?, ?, 'E2E notification task', ?, ?, 'No Action Taken', 'No Action Taken', '01/01/2026 10:00:00')`,
    [SHEET_IDS['1'], TAB_BANDWIDTH, project, USERS.team.displayName, USERS.admin.email]
  );
  return res.insertId;
}

const setCell = (ctx: APIRequestContext, row: number, header: string, value: string) =>
  ctx.post('/api/update-status', { data: { spreadsheetId: SHEET_IDS['1'], sheetName: TAB_BANDWIDTH, row, colIndex: col(header), value } });

type Item = { id: number; type: string; title: string; body: string; taskRef: string; read: boolean };
const bell = async (ctx: APIRequestContext) => (await (await ctx.get('/api/notifications', { headers: FETCH })).json()) as { items: Item[]; unread: number };

test('PM Status and Task Status changes tell the right people, and only them', async ({ playwright, baseURL }) => {
  const project = `E2E Notify ${Date.now().toString(36)}`;
  const row = await newTask(project);
  const [admin, pm, team] = await Promise.all([signIn(playwright, baseURL, USERS.admin), signIn(playwright, baseURL, USERS.pm), signIn(playwright, baseURL, USERS.team)]);
  try {
    // The PM sets PM Status: the assignee is told; the PM (who did it) and the HM (not a Super Admin) are not
    expect((await setCell(pm, row, 'PM Status', 'Approved')).status()).toBe(200);
    const mine = (await bell(team)).items.filter(i => i.taskRef.endsWith(`::${row}`));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ type: 'pm-status', title: 'PM Status: Approved', read: false });
    expect((await bell(pm)).items.filter(i => i.taskRef.endsWith(`::${row}`))).toHaveLength(0);
    expect((await bell(admin)).items.filter(i => i.taskRef.endsWith(`::${row}`))).toHaveLength(0);

    // The same value again, and a status that is not one of the listed ones, tell nobody
    expect((await setCell(pm, row, 'PM Status', 'Approved')).status()).toBe(200);
    expect((await setCell(pm, row, 'PM Status', 'No Action Taken')).status()).toBe(200);
    expect((await bell(team)).items.filter(i => i.taskRef.endsWith(`::${row}`))).toHaveLength(1);

    // The assignee hands the task on: "Submitted To PM" goes to whoever added it (matched on email),
    // "Submitted To Web Admin" to the Web admins (PMWebAdmin here)
    expect((await setCell(team, row, 'Task Status Updation', 'Submitted To PM')).status()).toBe(200);
    expect((await bell(admin)).items.filter(i => i.title === 'Task Status: Submitted To PM' && i.taskRef.endsWith(`::${row}`))).toHaveLength(1);
    expect((await setCell(team, row, 'Task Status Updation', 'Submitted To Web Admin')).status()).toBe(200);
    expect((await bell(pm)).items.filter(i => i.title === 'Task Status: Submitted To Web Admin' && i.taskRef.endsWith(`::${row}`))).toHaveLength(1);
    expect((await bell(team)).items.filter(i => i.type === 'task-status' && i.taskRef.endsWith(`::${row}`))).toHaveLength(0);

    // Marking read changes only the caller's own notifications
    const before = await bell(team);
    expect(before.unread).toBeGreaterThan(0);
    expect((await team.post('/api/notifications', { data: { ids: [mine[0].id] } })).status()).toBe(200);
    const after = await bell(team);
    expect(after.items.find(i => i.id === mine[0].id)?.read).toBe(true);
    expect((await admin.post('/api/notifications', { data: {} })).status()).toBe(400);

    // The Admin Portal log: HM can read it, a team member cannot, and only the Super Admin can clear it
    const log = await (await admin.get('/api/notifications/log', { headers: FETCH })).json();
    expect(log.success).toBe(true);
    expect(log.canClear).toBe(false);
    expect(log.rows.filter((r: { project: string }) => r.project === project).length).toBeGreaterThanOrEqual(3);
    expect((await team.get('/api/notifications/log', { headers: FETCH })).status()).toBe(401);
    expect((await admin.delete('/api/notifications/log')).status()).toBe(401);
    expect((await team.delete('/api/notifications/log')).status()).toBe(401);
  } finally {
    await query('DELETE FROM web_tasks WHERE id = ?', [row]);
    await query("DELETE FROM notifications WHERE task_ref LIKE ?", [`%::${row}`]);
    await query('DELETE FROM notification_log WHERE project = ?', [project]);
    await Promise.all([admin.dispose(), pm.dispose(), team.dispose()]);
  }
});

test('the notification routes refuse requests without a login', async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL });
  expect((await anon.get('/api/notifications', { headers: FETCH })).status()).toBe(401);
  expect((await anon.post('/api/notifications', { data: { all: true } })).status()).toBe(401);
  expect((await anon.get('/api/notifications/log', { headers: FETCH })).status()).toBe(401);
  expect((await anon.delete('/api/notifications/log')).status()).toBe(401);
  await anon.dispose();
});

test('the bell shows a notification, marks the tab, and clicking it opens the task', async ({ page, playwright, baseURL }) => {
  const project = `E2E Bell ${Date.now().toString(36)}`;
  const [{ insertId: row }] = [await query<{ insertId: number }>(
    `INSERT INTO web_tasks (sheet_id, sheet_tab, project_name, task_name, assigned_person, email_address, task_status_updation, pm_status, time_estimation, timestamp)
     VALUES (?, ?, ?, 'E2E bell task', ?, ?, 'To Be Started', 'No Action Taken', '01.00 Hours', '01/01/2026 10:00:00')`,
    [SHEET_IDS['1'], TAB_BANDWIDTH, project, USERS.team.displayName, USERS.admin.email]
  )];
  const pm = await signIn(playwright, baseURL, USERS.pm);
  // The test member has to be on the Web team for Tasks Overview to list their task
  const before = (await query<{ d: string | null }[]>('SELECT department AS d FROM users WHERE username = ?', [USERS.team.username]))[0]?.d ?? null;
  await query("UPDATE users SET department = 'Web' WHERE username = ?", [USERS.team.username]);
  try {
    expect((await setCell(pm, row, 'PM Status', 'Changes')).status()).toBe(200);

    await login(page, USERS.team);
    const count = page.getByTestId('notification-count');
    await expect(count).toHaveText('1');
    await expect(page).toHaveTitle(/^\(1\) /);
    await expect(page.locator('link[data-cn-notify]')).toHaveCount(1);

    await page.getByRole('button', { name: /Notifications/ }).click();
    await page.getByRole('menuitem', { name: /PM Status: Changes/ }).click();

    // Opens Tasks Overview and brings the task into view
    await expect(page.getByRole('heading', { name: 'Tasks Overview', level: 1 })).toBeVisible();
    await expect(page.locator(`tr[data-task-id$="::${row}"]`)).toBeVisible();
    // What was clicked is highlighted for about two seconds: the row, and the cell that changed (PM Status)
    const animating = (sel: string) => page.evaluate(s => !!document.querySelector(s)?.getAnimations().length, sel);
    const rowSel = `tr[data-task-id$="::${row}"]`;
    await expect.poll(() => animating(`${rowSel} td[data-cell="pm-status"]`)).toBe(true);
    await expect.poll(() => animating(`${rowSel} > td`)).toBe(true);
    await expect.poll(() => animating(`${rowSel} td[data-cell="pm-status"]`), { timeout: 5000 }).toBe(false);
    // Clicking the same notification again shows it again (it is not a one-off)
    await page.getByRole('button', { name: /Notifications/ }).click();
    await page.getByRole('menuitem', { name: /PM Status: Changes/ }).click();
    await expect.poll(() => animating(`${rowSel} td[data-cell="pm-status"]`)).toBe(true);
    await expect.poll(() => animating(`${rowSel} td[data-cell="pm-status"]`), { timeout: 5000 }).toBe(false);
    // Read now: the count and the tab badge go away
    await expect(count).toHaveCount(0);
    await expect(page).not.toHaveTitle(/^\(\d+\) /);
    await expect(page.locator('link[data-cn-notify]')).toHaveCount(0);
  } finally {
    await query('UPDATE users SET department = ? WHERE username = ?', [before, USERS.team.username]);
    await query('DELETE FROM web_tasks WHERE id = ?', [row]);
    await query('DELETE FROM notifications WHERE task_ref LIKE ?', [`%::${row}`]);
    await query('DELETE FROM notification_log WHERE project = ?', [project]);
    await pm.dispose();
  }
});

test('Admin Portal has a Notifications tab with the log and an Excel download (no Clear all for an HM)', async ({ page }) => {
  const project = `E2E Log ${Date.now().toString(36)}`;
  await query(
    "INSERT INTO notification_log (type, team, project, task, assignee, detail, actor, recipients) VALUES ('pm-status', 'web', ?, 'E2E log task', 'E2E Team', 'Approved', 'E2E PM', 'E2E Team')",
    [project]
  );
  try {
    await login(page, USERS.admin);
    await page.getByRole('button', { name: USERS.admin.displayName }).first().click();
    await page.getByRole('button', { name: 'Admin Portal' }).click();
    await page.getByRole('tab', { name: 'Notifications' }).click();
    await expect(page.getByRole('cell', { name: project })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download Excel' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Clear all' })).toHaveCount(0);
    // The Users tab is still there
    await page.getByRole('tab', { name: 'Users' }).click();
    await expect(page.getByText('User Details')).toBeVisible();
  } finally {
    await query('DELETE FROM notification_log WHERE project = ?', [project]);
  }
});

test('a notification for a task that is already closed still lands on its row', async ({ page, playwright, baseURL }) => {
  const project = `E2E Closed ${Date.now().toString(36)}`;
  const { insertId: row } = await query<{ insertId: number }>(
    `INSERT INTO web_tasks (sheet_id, sheet_tab, project_name, task_name, assigned_person, email_address, task_status_updation, pm_status, time_estimation, timestamp)
     VALUES (?, ?, ?, 'E2E closed task', ?, ?, 'Task Closed', 'No Action Taken', '01.00 Hours', '01/01/2026 10:00:00')`,
    [SHEET_IDS['1'], TAB_BANDWIDTH, project, USERS.team.displayName, USERS.admin.email]
  );
  const pm = await signIn(playwright, baseURL, USERS.pm);
  const before = (await query<{ d: string | null }[]>('SELECT department AS d FROM users WHERE username = ?', [USERS.team.username]))[0]?.d ?? null;
  await query("UPDATE users SET department = 'Web' WHERE username = ?", [USERS.team.username]);
  try {
    // Closed tasks are normally left out of Tasks Overview; the one being shown is not
    expect((await setCell(pm, row, 'PM Status', 'Approved')).status()).toBe(200);
    await login(page, USERS.team);
    await page.getByRole('button', { name: /Notifications/ }).click();
    await page.getByRole('menuitem', { name: /PM Status: Approved/ }).click();
    await expect(page.getByRole('heading', { name: 'Tasks Overview', level: 1 })).toBeVisible();
    const taskRow = page.locator(`tr[data-task-id$="::${row}"]`);
    await expect(taskRow).toBeVisible();
    await expect(taskRow).toBeInViewport();
  } finally {
    await query('UPDATE users SET department = ? WHERE username = ?', [before, USERS.team.username]);
    await query('DELETE FROM web_tasks WHERE id = ?', [row]);
    await query('DELETE FROM notifications WHERE task_ref LIKE ?', [`%::${row}`]);
    await query('DELETE FROM notification_log WHERE project = ?', [project]);
    await pm.dispose();
  }
});

test('a new task tells the people who assign that team\'s tasks, and the click opens Tasks Assigned', async ({ page, playwright, baseURL }) => {
  const stamp = Date.now().toString(36);
  const webProject = `E2E Assign Web ${stamp}`;
  const mktProject = `E2E Assign Mkt ${stamp}`;
  const admin = await signIn(playwright, baseURL, USERS.admin);
  try {
    // The HM adds a Web task and a Marketing task, both unassigned
    const web = await admin.post('/api/forms', { data: { form: 'web-task', submissionId: randomUUID(), answers: { 'Project Name': webProject, 'Task Name': 'QA Testing', 'Task URL': 'https://example.invalid/e2e-assign', 'Task Priority': 'Low', 'Team Required': 'QA' } } });
    expect(web.status()).toBe(200);
    const webId = (await web.json()).id as number;
    const mkt = await admin.post('/api/forms', { data: { form: 'marketing-task', submissionId: randomUUID(), answers: { 'Project Name': mktProject, 'Task Name': 'Monthly Report', 'Task URL': 'https://example.invalid/e2e-assign' } } });
    expect(mkt.status()).toBe(200);

    // The PMWebAdmin is told about the Web task, not the Marketing one
    const pm = await signIn(playwright, baseURL, USERS.pm);
    const items = (await bell(pm)).items;
    expect(items.filter(i => i.type === 'task-added' && i.body.includes(webProject))).toHaveLength(1);
    expect(items.filter(i => i.body.includes(mktProject))).toHaveLength(0);
    // The person who added it is not told about their own task
    expect((await bell(admin)).items.filter(i => i.body.includes(webProject))).toHaveLength(0);
    await pm.dispose();

    // Clicking it opens Tasks Assigned (not Tasks Overview) and shows the row
    await login(page, USERS.pm);
    await page.getByRole('button', { name: /Notifications/ }).click();
    await page.getByRole('menuitem', { name: /New task added/ }).filter({ hasText: webProject }).click();
    await expect(page.getByRole('heading', { name: 'Tasks Assigned', level: 1 })).toBeVisible();
    const taskRow = page.locator(`tr[data-fdt-id$="::${webId}"]`);
    await expect(taskRow).toBeVisible();
    await expect(taskRow).toBeInViewport();
    await expect.poll(() => page.evaluate(id => [...(document.querySelector(`tr[data-fdt-id$="::${id}"]`)?.querySelectorAll(':scope > td') ?? [])].some(td => td.getAnimations().length > 0), webId)).toBe(true);
  } finally {
    await query('DELETE FROM web_tasks WHERE project_name = ?', [webProject]);
    await query('DELETE FROM marketing_tasks WHERE project_name = ?', [mktProject]);
    await query('DELETE FROM notifications WHERE body LIKE ? OR body LIKE ?', [`%${webProject}%`, `%${mktProject}%`]);
    await query('DELETE FROM notification_log WHERE project IN (?, ?)', [webProject, mktProject]);
    await admin.dispose();
  }
});
