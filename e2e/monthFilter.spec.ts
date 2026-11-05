import { test, expect, type Page } from '@playwright/test';
import { USERS, login, openPage, query, searchTasks, uniqueMark } from './helpers';
import { SHEET_IDS, TAB_BANDWIDTH, MARKETING_TEAM_SHEET_ID, TAB_MARKETING_TASKS } from '../lib/config';

// Tasks Assigned: the Month filter lists the months tasks were added in (newest first), from the
// Timestamp. Web writes it day first (03/10/2026 = 3 October), Marketing month first (10/3/2026 = 3 October).

const monthFilter = (page: Page) => page.locator('div.relative', { has: page.locator('label', { hasText: /^Month$/ }) });

async function pickMonth(page: Page, label: string) {
  await monthFilter(page).getByRole('button').click();
  await page.getByRole('checkbox', { name: label }).check();
  await page.keyboard.press('Escape');
  await page.locator('h1').click(); // click away so the list closes
}

test('Web: the Month filter narrows Tasks Assigned to the chosen month', async ({ page }) => {
  const project = uniqueMark('Month Web');
  const add = (task: string, ts: string) => query(
    `INSERT INTO web_tasks (sheet_id, sheet_tab, project_name, task_name, task_daily_bucket, task_status_updation, pm_status, timestamp)
     VALUES (?, ?, ?, ?, 'No Action Taken', 'No Action Taken', 'No Action Taken', ?)`, [SHEET_IDS['1'], TAB_BANDWIDTH, project, task, ts]);
  await add('sep task', '15/09/2026 10:00:00');
  await add('oct task', '03/10/2026 09:00:00');
  await add('nov task', '12/11/2026 08:00:00');
  try {
    await login(page, USERS.admin);
    await openPage(page, 'Web', 'Tasks Assigned');
    await searchTasks(page, project);
    await expect(page.getByRole('cell', { name: project, exact: true })).toHaveCount(3);

    // newest month first
    await monthFilter(page).getByRole('button').click();
    const labels = await page.getByRole('checkbox').evaluateAll(boxes => boxes.map(b => (b.parentElement as HTMLElement).innerText.trim()));
    expect(labels.indexOf('November 2026')).toBeGreaterThanOrEqual(0);
    expect(labels.indexOf('November 2026')).toBeLessThan(labels.indexOf('October 2026'));
    expect(labels.indexOf('October 2026')).toBeLessThan(labels.indexOf('September 2026'));
    await page.getByRole('checkbox', { name: 'October 2026' }).check();
    await page.locator('h1').click();

    await expect(page.getByRole('cell', { name: project, exact: true })).toHaveCount(1);
    await expect(page.getByRole('cell', { name: 'oct task', exact: true })).toBeVisible();
    // it counts as an active filter and Clear all brings everything back
    await page.getByRole('button', { name: /Clear all/ }).click();
    await expect(page.getByRole('cell', { name: project, exact: true })).toHaveCount(3);
  } finally {
    await query('DELETE FROM web_tasks WHERE project_name = ?', [project]);
  }
});

test('Marketing: month-first timestamps land in the right month', async ({ page }) => {
  const project = uniqueMark('Month Mkt');
  const add = (task: string, ts: string) => query(
    `INSERT INTO marketing_tasks (sheet_id, sheet_tab, project_name, task_name, department, task_daily_bucket, task_status_updation, pm_status, timestamp)
     VALUES (?, ?, ?, ?, 'SEO', 'No Action Taken', 'No Action Taken', 'No Action Taken', ?)`, [MARKETING_TEAM_SHEET_ID, TAB_MARKETING_TASKS, project, task, ts]);
  await add('mkt sep', '9/15/2026 10:00:00');   // 15 September (read day first this would not even be a date)
  await add('mkt oct', '10/3/2026 09:00:00');   // 3 October (read day first it would be 10 March)
  try {
    await login(page, USERS.admin);
    await openPage(page, 'Marketing', 'Tasks Assigned');
    await searchTasks(page, project);
    await expect(page.getByRole('cell', { name: project, exact: true })).toHaveCount(2);
    await pickMonth(page, 'October 2026');
    await expect(page.getByRole('cell', { name: project, exact: true })).toHaveCount(1);
    await expect(page.getByRole('cell', { name: 'mkt oct', exact: true })).toBeVisible();
  } finally {
    await query('DELETE FROM marketing_tasks WHERE project_name = ?', [project]);
  }
});

test('entries whose Timestamp is written another way still land in their month (and none are lost)', async ({ page }) => {
  const project = uniqueMark('Month Odd');
  const add = (task: string, ts: string) => query(
    `INSERT INTO web_tasks (sheet_id, sheet_tab, project_name, task_name, task_daily_bucket, task_status_updation, pm_status, timestamp)
     VALUES (?, ?, ?, ?, 'No Action Taken', 'No Action Taken', 'No Action Taken', ?)`, [SHEET_IDS['1'], TAB_BANDWIDTH, project, task, ts]);
  await add('odd iso', '2026-10-15 10:00:00');   // a date straight from an Excel import
  await add('odd isodate', '2026-10-16');         // date only
  await add('odd mdy', '10/26/2026 08:00:00');   // month first in the day-first Web table (26 cannot be a month)
  await add('odd text', 'sometime in October');  // not a date at all
  try {
    await login(page, USERS.admin);
    await openPage(page, 'Web', 'Tasks Assigned');
    await searchTasks(page, project);
    await expect(page.getByRole('cell', { name: project, exact: true })).toHaveCount(4);

    await pickMonth(page, 'October 2026');
    await expect(page.getByRole('cell', { name: project, exact: true })).toHaveCount(3);
    await expect(page.getByRole('cell', { name: 'odd text', exact: true })).toHaveCount(0);

    // the one with no date is under "No date", not lost
    await page.getByRole('button', { name: /Clear all/ }).click();
    await pickMonth(page, 'No date');
    await expect(page.getByRole('cell', { name: project, exact: true })).toHaveCount(1);
    await expect(page.getByRole('cell', { name: 'odd text', exact: true })).toBeVisible();
  } finally {
    await query('DELETE FROM web_tasks WHERE project_name = ?', [project]);
  }
});
