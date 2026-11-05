import { test, expect } from '@playwright/test';
import { USERS, login, openPage, query, searchTasks, uniqueMark, waitForDb } from './helpers';
import { SHEET_IDS, TAB_BANDWIDTH } from '../lib/config';

// Tasks Assigned (Web): the Today Bucket Set dropdown offers No Action Taken as well as P1-P7 and URGENT.

test('Web Today Bucket Set offers No Action Taken, and choosing it is saved', async ({ page }) => {
  const project = uniqueMark('Bucket Set');
  const id = (await query<{ insertId: number }>(
    `INSERT INTO web_tasks (sheet_id, sheet_tab, project_name, task_name, task_daily_bucket, task_status_updation, pm_status, today_bucket_set, timestamp)
     VALUES (?, ?, ?, 'set bucket', 'No Action Taken', 'No Action Taken', 'No Action Taken', 'P2', '01/01/2026 10:00:00')`,
    [SHEET_IDS['1'], TAB_BANDWIDTH, project])).insertId;
  try {
    await login(page, USERS.admin);
    await openPage(page, 'Web', 'Tasks Assigned');
    await searchTasks(page, project);
    await page.getByRole('button', { name: 'Edit Task' }).click();
    const bucketSet = page.locator(`tr[data-fdt-id$="::${id}"] select`).filter({ has: page.locator('option[value="P3"]') });
    await expect(bucketSet.locator('option')).toHaveText(['No Action Taken', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'URGENT']);
    await bucketSet.selectOption('No Action Taken');
    await waitForDb(async () => (await query<{ v: string }[]>('SELECT today_bucket_set AS v FROM web_tasks WHERE id = ?', [id]))[0]?.v === 'No Action Taken', 'bucket set saved');
  } finally {
    await query('DELETE FROM web_tasks WHERE id = ?', [id]);
  }
});
