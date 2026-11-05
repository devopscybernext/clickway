import { test, expect, type APIRequestContext } from '@playwright/test';
import { PASSWORD, USERS, login, openPage, query, searchTasks, uniqueMark, type E2EUser } from './helpers';
import { SHEET_IDS, TAB_BANDWIDTH, PM_BANDWIDTH_SHEET_ID, TAB_PM_PROJECTS, MARKETING_TEAM_SHEET_ID, TAB_MARKETING_TASKS } from '../lib/config';

// Deleting several rows at once: Tasks Assigned (Web) and PM Projects. The rows are inserted straight
// into the local database; whatever the tests leave behind is removed at the end.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

async function signIn(playwright: { request: { newContext: (o: { baseURL?: string }) => Promise<APIRequestContext> } }, baseURL: string | undefined, user: E2EUser) {
  const ctx = await playwright.request.newContext({ baseURL });
  const res = await ctx.post('/api/login', { data: { identifier: user.loginWith === 'username' ? user.username : user.email, password: PASSWORD } });
  expect(res.status()).toBe(200);
  return ctx;
}

const newWebTask = async (project: string, name: string) => (await query<{ insertId: number }>(
  `INSERT INTO web_tasks (sheet_id, sheet_tab, project_name, task_name, task_status_updation, pm_status, task_daily_bucket, timestamp)
   VALUES (?, ?, ?, ?, 'No Action Taken', 'No Action Taken', 'No Action Taken', '01/01/2026 10:00:00')`,
  [SHEET_IDS['1'], TAB_BANDWIDTH, project, name])).insertId;

const newPmProject = async (project: string) => {
  const now = new Date();
  return (await query<{ insertId: number }>(
    `INSERT INTO pm_projects (sheet_id, sheet_tab, timestamp, email_address, department, year, month, project_name, client_name, status, total_hours)
     VALUES (?, ?, '1/1/2026 10:00:00', ?, 'Web', ?, ?, ?, 'E2E Client', 'In Progress', '10.00 Hours')`,
    [PM_BANDWIDTH_SHEET_ID, TAB_PM_PROJECTS, USERS.pm.email, String(now.getFullYear()), MONTHS[now.getMonth()], project])).insertId;
};

const rows = (ctx: APIRequestContext, sheetName: string, spreadsheetId: string, ids: number[]) =>
  ctx.post('/api/rows', { data: { action: 'delete', spreadsheetId, sheetName, rows: ids } });

test('bulk delete: removes the rows in one go, logs each, and keeps its limits', async ({ playwright, baseURL }) => {
  const project = uniqueMark('Bulk API');
  const [a, b, c] = [await newWebTask(project, 'one'), await newWebTask(project, 'two'), await newWebTask(project, 'three')];
  const pmA = await newPmProject(`${project} pm A`);
  const pmB = await newPmProject(`${project} pm B`);
  const [admin, pm, team] = await Promise.all([signIn(playwright, baseURL, USERS.admin), signIn(playwright, baseURL, USERS.pm), signIn(playwright, baseURL, USERS.team)]);
  try {
    // A team member may not delete; nothing is touched
    expect((await rows(team, TAB_BANDWIDTH, SHEET_IDS['1'], [a])).status()).toBe(403);
    // Bad requests
    expect((await rows(admin, TAB_BANDWIDTH, SHEET_IDS['1'], [])).status()).toBe(400);
    expect((await rows(admin, TAB_BANDWIDTH, SHEET_IDS['1'], Array.from({ length: 501 }, (_, i) => i + 1))).status()).toBe(400);
    expect(await query<{ id: number }[]>('SELECT id FROM web_tasks WHERE project_name = ?', [project])).toHaveLength(3);

    // The HM deletes two of three (and names one that no longer exists): only the real ones go
    const res = await rows(admin, TAB_BANDWIDTH, SHEET_IDS['1'], [a, b, 99999999]);
    expect(res.status()).toBe(200);
    expect((await res.json()).deleted).toBe(2);
    expect((await query<{ id: number }[]>('SELECT id FROM web_tasks WHERE project_name = ?', [project])).map(r => r.id)).toEqual([c]);
    const log = await query<{ row_id: number; old_value: string }[]>("SELECT row_id, old_value FROM change_log WHERE table_name = 'web_tasks' AND column_name = 'Row deleted' AND row_id IN (?, ?)", [a, b]);
    expect(log).toHaveLength(2);
    expect(JSON.parse(log[0].old_value)['Project Name']).toBe(project);

    // PM projects: only HM and Admin may delete (a PM is refused), and the HM can delete several
    expect((await rows(pm, TAB_PM_PROJECTS, PM_BANDWIDTH_SHEET_ID, [pmA, pmB])).status()).toBe(403);
    expect(await query<{ id: number }[]>('SELECT id FROM pm_projects WHERE project_name LIKE ?', [`${project} pm%`])).toHaveLength(2);
    const pmRes = await rows(admin, TAB_PM_PROJECTS, PM_BANDWIDTH_SHEET_ID, [pmA, pmB]);
    expect(pmRes.status()).toBe(200);
    expect((await pmRes.json()).deleted).toBe(2);
    expect(await query<{ id: number }[]>('SELECT id FROM pm_projects WHERE project_name LIKE ?', [`${project} pm%`])).toHaveLength(0);

    // Marketing tasks work the same way
    const mkt = [1, 2].map(async n => (await query<{ insertId: number }>(
      `INSERT INTO marketing_tasks (sheet_id, sheet_tab, project_name, task_name, task_status_updation, timestamp) VALUES (?, ?, ?, ?, 'No Action Taken', '1/1/2026 10:00:00')`,
      [MARKETING_TEAM_SHEET_ID, TAB_MARKETING_TASKS, `${project} mkt`, `m${n}`])).insertId);
    const mktRes = await rows(admin, TAB_MARKETING_TASKS, MARKETING_TEAM_SHEET_ID, await Promise.all(mkt));
    expect(mktRes.status()).toBe(200);
    expect((await mktRes.json()).deleted).toBe(2);
  } finally {
    await query('DELETE FROM marketing_tasks WHERE project_name LIKE ?', [`${project} mkt%`]);
    await query('DELETE FROM web_tasks WHERE project_name = ?', [project]);
    await query('DELETE FROM pm_projects WHERE project_name LIKE ?', [`${project} pm%`]);
    await query("DELETE FROM change_log WHERE table_name IN ('web_tasks', 'pm_projects') AND column_name = 'Row deleted' AND old_value LIKE ?", [`%${project}%`]);
    await Promise.all([admin.dispose(), pm.dispose(), team.dispose()]);
  }
});

test('Tasks Assigned: tick several tasks and delete them together', async ({ page }) => {
  const project = uniqueMark('Bulk UI');
  const ids = [await newWebTask(project, 'one'), await newWebTask(project, 'two'), await newWebTask(project, 'three')];
  try {
    await login(page, USERS.admin);
    await openPage(page, 'Web', 'Tasks Assigned');
    await searchTasks(page, project);
    await expect(page.getByRole('cell', { name: project, exact: true })).toHaveCount(3);

    // The boxes only appear while editing
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit Task' }).click();
    await expect(page.getByRole('toolbar', { name: 'Delete several rows' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Delete selected/ })).toHaveCount(0);

    // Two ticked: the bar says so; Cancel in the confirm leaves everything in place
    await page.getByRole('checkbox', { name: `Select ${project} — one` }).check();
    await page.getByRole('checkbox', { name: `Select ${project} — two` }).check();
    await expect(page.getByText('2 tasks selected')).toBeVisible();
    await page.getByRole('button', { name: 'Delete selected (2)' }).click();
    await page.getByRole('dialog', { name: 'Delete selected rows' }).getByRole('button', { name: 'Cancel' }).click();
    expect(await query<{ id: number }[]>('SELECT id FROM web_tasks WHERE project_name = ?', [project])).toHaveLength(3);

    // Confirm: only the two ticked tasks are deleted
    await page.getByRole('button', { name: 'Delete selected (2)' }).click();
    await page.getByRole('dialog', { name: 'Delete selected rows' }).getByRole('button', { name: 'Delete 2 tasks' }).click();
    // (while editing, the project name is an input, so the rows are told apart by their tick boxes)
    await expect(page.getByRole('checkbox', { name: new RegExp(`^Select ${project} — `) })).toHaveCount(1);
    expect((await query<{ id: number }[]>('SELECT id FROM web_tasks WHERE project_name = ?', [project])).map(r => r.id)).toEqual([ids[2]]);
    await expect(page.getByText(/tasks? selected/)).toHaveCount(0);

    // The header box picks the whole page
    await page.getByRole('checkbox', { name: 'Select all rows on this page' }).check();
    await expect(page.getByRole('checkbox', { name: `Select ${project} — three` })).toBeChecked();
  } finally {
    await query('DELETE FROM web_tasks WHERE project_name = ?', [project]);
    await query("DELETE FROM change_log WHERE table_name = 'web_tasks' AND column_name = 'Row deleted' AND old_value LIKE ?", [`%${project}%`]);
  }
});

test('PM Projects: tick several projects and delete them together (HM)', async ({ page }) => {
  const project = uniqueMark('Bulk PM');
  const [a, b, c] = [await newPmProject(`${project} A`), await newPmProject(`${project} B`), await newPmProject(`${project} C`)];
  try {
    await login(page, USERS.admin);
    await openPage(page, 'PM Projects', 'Current Month');
    await expect(page.getByText(`${project} A`).first()).toBeVisible();

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('checkbox', { name: `Select ${project} A` }).check();
    await page.getByRole('checkbox', { name: `Select ${project} B` }).check();
    await expect(page.getByText('2 projects selected')).toBeVisible();
    await page.getByRole('button', { name: 'Delete selected (2)' }).click();
    await page.getByRole('dialog', { name: 'Delete selected rows' }).getByRole('button', { name: 'Delete 2 projects' }).click();

    await expect(page.getByText(`${project} A`)).toHaveCount(0);
    expect((await query<{ id: number }[]>('SELECT id FROM pm_projects WHERE project_name LIKE ?', [`${project}%`])).map(r => r.id)).toEqual([c]);
    expect(a).not.toBe(b);
  } finally {
    await query('DELETE FROM pm_projects WHERE project_name LIKE ?', [`${project}%`]);
    await query("DELETE FROM change_log WHERE table_name = 'pm_projects' AND column_name = 'Row deleted' AND old_value LIKE ?", [`%${project}%`]);
  }
});
