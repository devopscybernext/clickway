import { test, expect, type Page } from '@playwright/test';
import { USERS, login, openPage, query, uniqueMark } from './helpers';
import { MARKETING_TEAM_SHEET_ID, TAB_MARKETING_TASKS } from '../lib/config';

// The Resource Bandwidth chips above Marketing's Tasks Assigned:
//   SMM (Web style)   a Today / Everyday task counts the larger of its estimate and the time logged on it
//   SEO and PPC       a task counts its estimate minus its Total Hours (never below zero); handed-off tasks do not count
// The local database already holds real tasks, so each check compares the chip before and after adding tasks.

const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

async function chipLoad(page: Page, name: string): Promise<number> {
  const text = await page.evaluate(n => {
    const el = [...document.querySelectorAll('span.truncate')].find(e => e.textContent?.trim() === n);
    return el?.nextElementSibling?.textContent ?? '';
  }, name);
  const m = /(\d+:\d{2})h/.exec(text);
  if (!m) throw new Error(`no bandwidth chip for ${name}: "${text}"`);
  return minutes(m[1]);
}

async function open(page: Page) {
  await openPage(page, 'Marketing', 'Tasks Assigned');
  await expect(page.getByText('Resource Bandwidth')).toBeVisible();
}

test('SEO / PPC count estimate minus Total Hours; SMM counts the larger of estimate and logged', async ({ page }) => {
  const project = uniqueMark('Mkt Load');
  const add = (who: string, task: string, bucket: string, status: string, est: string, logged: string, total: string) => query(
    `INSERT INTO marketing_tasks (sheet_id, sheet_tab, project_name, task_name, assigned_person, task_daily_bucket, task_status_updation, pm_status, task_estimation, time_logged_on_ac, total_hours, department, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'No Action Taken', ?, ?, ?, 'SEO', '1/1/2026 10:00:00')`,
    [MARKETING_TEAM_SHEET_ID, TAB_MARKETING_TASKS, project, task, who, bucket, status, est, logged, total]);
  try {
    await login(page, USERS.admin);
    await open(page);
    const seoBefore = await chipLoad(page, 'Bhavya');
    const smmBefore = await chipLoad(page, 'Payal');

    // SEO: 20:00 with 06:00 spent = 14:00; 10:00 with 12:00 spent = 0 (never below zero);
    //      5:00 Submitted To PM is handed on, so it is not counted
    await add('Bhavya', 'seo a', 'Everyday', 'In Progress', '20.00 Hours', '', '06.00 Hours');
    await add('Bhavya', 'seo b', 'Today', 'In Progress', '10.00 Hours', '', '12.00 Hours');
    await add('Bhavya', 'seo c', 'Everyday', 'Submitted To PM', '05.00 Hours', '', '');
    // SMM: estimate 2:00 with 3:00 logged = 3:00; 1:00 Submitted To PM still counts = 1:00
    await add('Payal', 'smm a', 'Today', 'In Progress', '02.00 Hours', '03.00 Hours', '');
    await add('Payal', 'smm b', 'Everyday', 'Submitted To PM', '01.00 Hours', '', '');

    await page.reload();
    await open(page);
    expect(await chipLoad(page, 'Bhavya') - seoBefore).toBe(minutes('14:00'));
    expect(await chipLoad(page, 'Payal') - smmBefore).toBe(minutes('04:00'));
  } finally {
    await query('DELETE FROM marketing_tasks WHERE project_name = ?', [project]);
  }
});
