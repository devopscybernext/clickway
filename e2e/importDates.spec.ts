import { test, expect } from '@playwright/test';
import { PASSWORD, USERS, login, openPage, query, searchTasks, uniqueMark } from './helpers';

// Import Data: dates from an Excel sheet (they arrive as 2026-10-01) are stored the way each team writes
// dates, so the tables, the Month filter and the date-based stats all read them.

const FETCH = { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' };

test('imported dates are stored in each team\'s format, unreadable ones are reported, and the rows show up', async ({ page, playwright, baseURL }) => {
  const project = uniqueMark('Import Dates');
  const admin = await playwright.request.newContext({ baseURL });
  expect((await admin.post('/api/login', { data: { identifier: USERS.admin.username, password: PASSWORD } })).status()).toBe(200);
  const post = (team: string, mode: string, rows: string[][]) => admin.post('/api/import', { data: { team, mode, rows }, headers: FETCH });
  const webRows = [
    ['Timestamp', 'Project Name', 'Task Name', 'Deadline', 'Task Daily Bucket', 'Task Status Updation', 'PM Status'],
    ['2026-10-01', project, 'web iso', '2026-12-31', 'No Action Taken', 'No Action Taken', 'No Action Taken'],
    ['10/26/2026 08:00:00', project, 'web mdy', '', 'No Action Taken', 'No Action Taken', 'No Action Taken'],
    ['not a date', project, 'web bad', 'soon', 'No Action Taken', 'No Action Taken', 'No Action Taken'],
  ];
  try {
    // The preview warns about the two cells that are not dates
    const preview = await (await post('web', 'preview', webRows)).json();
    expect(preview.summary.newRows).toBe(3);
    expect(preview.summary.badDates.map((b: { column: string; value: string }) => `${b.column}:${b.value}`)).toEqual(['Timestamp:not a date', 'Deadline:soon']);

    expect((await post('web', 'import', webRows)).status()).toBe(200);
    const stored = await query<{ task_name: string; timestamp: string; deadline: string }[]>('SELECT task_name, `timestamp`, deadline FROM web_tasks WHERE project_name = ? ORDER BY id', [project]);
    expect(stored).toEqual([
      { task_name: 'web iso', timestamp: '01/10/2026', deadline: '31/12/2026' },       // Web: day first
      { task_name: 'web mdy', timestamp: '26/10/2026 08:00:00', deadline: '' },        // turned round (26 is not a month)
      { task_name: 'web bad', timestamp: 'not a date', deadline: 'soon' },               // kept as typed
    ]);

    // Marketing writes month first
    await post('marketing', 'import', [['Timestamp', 'Project Name', 'Task Name', 'Deadline'], ['2026-10-01 14:05:09', project, 'mkt iso', '2026-12-31']]);
    const mkt = await query<{ timestamp: string; deadline: string }[]>('SELECT `timestamp`, deadline FROM marketing_tasks WHERE project_name = ?', [project]);
    expect(mkt).toEqual([{ timestamp: '10/1/2026 14:05:09', deadline: '12/31/2026' }]);

    // They are in Tasks Assigned, and the Month filter finds the October ones
    await login(page, USERS.admin);
    await openPage(page, 'Web', 'Tasks Assigned');
    await searchTasks(page, project);
    await expect(page.getByRole('cell', { name: project, exact: true })).toHaveCount(3);
    const month = page.locator('div.relative', { has: page.locator('label', { hasText: /^Month$/ }) });
    await month.getByRole('button').click();
    await page.getByRole('checkbox', { name: 'October 2026' }).check();
    await page.locator('h1').click();
    await expect(page.getByRole('cell', { name: project, exact: true })).toHaveCount(2);
  } finally {
    await query('DELETE FROM web_tasks WHERE project_name = ?', [project]);
    await query('DELETE FROM marketing_tasks WHERE project_name = ?', [project]);
    await admin.dispose();
  }
});
