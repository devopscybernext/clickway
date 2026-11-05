import { test, expect, type Page } from '@playwright/test';
import { USERS, login, openPage, query, searchTasks, uniqueMark, waitForDb } from './helpers';
import { SHEET_IDS, TAB_BANDWIDTH, MARKETING_TEAM_SHEET_ID, TAB_MARKETING_TASKS } from '../lib/config';

// Tasks Assigned: while editing, the HM (and Super Admin) can change every column of a task. Others cannot.

async function startEditing(page: Page, team: 'Web' | 'Marketing', project: string) {
  await openPage(page, team, 'Tasks Assigned');
  await searchTasks(page, project);
  // show every column (the picker keeps a default few)
  const columns = page.locator('div.relative', { has: page.locator('label', { hasText: /^Columns$/ }) });
  await columns.getByRole('button').click();
  await columns.getByRole('button', { name: 'Select all' }).click();
  await page.locator('h1').click();
  await page.getByRole('button', { name: 'Edit Task' }).click();
}

test('Web: the HM edits every kind of column of a task', async ({ page }) => {
  const project = uniqueMark('Edit All Web');
  const id = (await query<{ insertId: number }>(
    `INSERT INTO web_tasks (sheet_id, sheet_tab, project_name, task_name, task_url, task_priority, assigned_person, task_daily_bucket, task_status_updation, pm_status, team_required, task_information, email_address, timestamp)
     VALUES (?, ?, ?, 'edit everything', 'https://old.invalid', 'Low', 'Pawan', 'No Action Taken', 'No Action Taken', 'No Action Taken', 'QA', 'New', 'old@example.invalid', '01/10/2026 09:00:00')`,
    [SHEET_IDS['1'], TAB_BANDWIDTH, project])).insertId;
  const cell = async (col: string) => (await query<Record<string, string>[]>(`SELECT ${col} AS v FROM web_tasks WHERE id = ?`, [id]))[0].v;
  try {
    await login(page, USERS.admin);
    await startEditing(page, 'Web', project);
    const row = page.locator(`tr[data-fdt-id$="::${id}"]`);

    // text, choice, date, times, timestamp
    await row.getByLabel('Edit Task URL').fill('https://new.invalid/task');
    await row.getByLabel('Edit Task URL').press('Enter');
    await waitForDb(async () => (await cell('task_url')) === 'https://new.invalid/task', 'url saved');

    await row.getByLabel('Edit Task Priority').selectOption('Urgent');
    await waitForDb(async () => (await cell('task_priority')) === 'Urgent', 'priority saved');

    await row.getByLabel('Edit Team Required').selectOption('FrontEnd');
    await waitForDb(async () => (await cell('team_required')) === 'FrontEnd', 'team required saved');

    await row.getByLabel('Edit Deadline').fill('2026-12-24');
    await waitForDb(async () => (await cell('deadline')) === '24/12/2026', 'deadline saved day first');

    await row.getByLabel('Edit Time Logged On Ac hours').selectOption('1');
    await row.getByLabel('Edit Time Logged On Ac minutes').selectOption('30');
    await waitForDb(async () => (await cell('time_logged_on_ac')) === '01.30 Hours', 'time logged saved');

    await row.getByLabel('Edit Total Time hours').selectOption('2');
    await waitForDb(async () => (await cell('total_time')) === '02.00 Hours', 'total time saved');

    await row.getByLabel('Edit Timestamp').fill('2026-10-05 10:30:00');
    await row.getByLabel('Edit Timestamp').press('Enter');
    await waitForDb(async () => (await cell('timestamp')) === '05/10/2026 10:30:00', 'timestamp saved in the team format');

    // a Timestamp that is not a date is refused, and what was there stays
    await row.getByLabel('Edit Timestamp').fill('whenever');
    await row.getByLabel('Edit Timestamp').press('Enter');
    await expect(row.getByRole('alert')).toHaveText('Not a date');
    expect(await cell('timestamp')).toBe('05/10/2026 10:30:00');
  } finally {
    await query('DELETE FROM web_tasks WHERE id = ?', [id]);
  }
});

test('Marketing: the HM edits department, notes and a date (month first)', async ({ page }) => {
  const project = uniqueMark('Edit All Mkt');
  const id = (await query<{ insertId: number }>(
    `INSERT INTO marketing_tasks (sheet_id, sheet_tab, project_name, task_name, department, assigned_person, task_daily_bucket, task_status_updation, pm_status, timestamp)
     VALUES (?, ?, ?, 'edit mkt', 'SEO', 'Bhavya', 'No Action Taken', 'No Action Taken', 'No Action Taken', '10/1/2026 09:00:00')`,
    [MARKETING_TEAM_SHEET_ID, TAB_MARKETING_TASKS, project])).insertId;
  const cell = async (col: string) => (await query<Record<string, string>[]>(`SELECT ${col} AS v FROM marketing_tasks WHERE id = ?`, [id]))[0].v;
  try {
    await login(page, USERS.admin);
    await startEditing(page, 'Marketing', project);
    const row = page.locator(`tr[data-fdt-id$="::${id}"]`);
    await row.getByLabel('Edit Department').selectOption('PPC');
    await waitForDb(async () => (await cell('department')) === 'PPC', 'department saved');
    await row.getByLabel('Edit Blocker').fill('Waiting for the client');
    await row.getByLabel('Edit Blocker').press('Enter');
    await waitForDb(async () => (await cell('blocker')) === 'Waiting for the client', 'blocker saved');
    await row.getByLabel('Edit Deadline').fill('2026-12-24');
    await waitForDb(async () => (await cell('deadline')) === '12/24/2026', 'deadline saved month first');
  } finally {
    await query('DELETE FROM marketing_tasks WHERE id = ?', [id]);
  }
});

test('a PM editing Tasks Assigned does not get the every-column editors', async ({ page }) => {
  const project = uniqueMark('Edit All PM');
  const id = (await query<{ insertId: number }>(
    `INSERT INTO web_tasks (sheet_id, sheet_tab, project_name, task_name, task_url, task_priority, assigned_person, task_daily_bucket, task_status_updation, pm_status, timestamp)
     VALUES (?, ?, ?, 'pm view', 'https://old.invalid', 'Low', 'Pawan', 'No Action Taken', 'No Action Taken', 'No Action Taken', '01/10/2026 09:00:00')`,
    [SHEET_IDS['1'], TAB_BANDWIDTH, project])).insertId;
  try {
    await login(page, USERS.pm);
    await startEditing(page, 'Web', project);
    await expect(page.locator(`tr[data-fdt-id$="::${id}"]`)).toBeVisible();
    // the usual editors are there (project name is an input), the extra ones are not
    await expect(page.locator(`tr[data-fdt-id$="::${id}"]`).locator('input[type="text"]').first()).toBeVisible();
    await expect(page.getByLabel('Edit Task URL')).toHaveCount(0);
    await expect(page.getByLabel('Edit Task Priority')).toHaveCount(0);
    await expect(page.getByLabel('Edit Deadline')).toHaveCount(0);
  } finally {
    await query('DELETE FROM web_tasks WHERE id = ?', [id]);
  }
});
