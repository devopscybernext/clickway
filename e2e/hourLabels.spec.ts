import { test, expect } from '@playwright/test';
import { USERS, login, openPage } from './helpers';
import { taskColumnLabel } from '../lib/columnLabels';

// The hour columns of Web and Marketing tasks have new names on screen (the columns themselves are unchanged):
//   Web        Total Time Est -> Billable Hours    Total Time -> Total Logged    Time Logged On AC -> Daily Logged
//   Marketing  Task Estimation -> Billable Hours   Total Hours -> Total Logged   Time Logged On AC -> Daily Logged

test('the label map', () => {
  expect(['Total Time Est', 'Total Time', 'Time Logged On Ac', 'Task Estimation', 'Total Hours', 'Time Estimation', 'Project Name'].map(taskColumnLabel))
    .toEqual(['Billable Hours', 'Total Logged', 'Daily Logged', 'Billable Hours', 'Total Logged', 'Daily Time', 'Project Name']);
});

for (const [team, oldNames] of [
  ['Web', ['Total Time Est', 'Total Time', 'Time Logged On Ac']],
  ['Marketing', ['Task Estimation', 'Total Hours', 'Time Logged On Ac']],
] as const) {
  test(`${team} Tasks Assigned shows the new hour column names`, async ({ page }) => {
    await login(page, USERS.admin);
    await openPage(page, team, 'Tasks Assigned');
    const headers = page.locator('th');
    await expect(headers.first()).toBeVisible();
    // Billable Hours is on by default; Total Logged and Daily Logged are in the Columns picker
    await expect(headers.filter({ hasText: /^Billable Hours$/i }).first()).toBeVisible();
    await page.locator('div.relative', { has: page.locator('label', { hasText: /^Columns$/ }) }).first().locator('button').first().click();
    for (const name of ['Billable Hours', 'Total Logged', 'Daily Logged']) await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    // and none of the old names is left anywhere in the headers or the picker
    for (const name of oldNames) {
      await expect(headers.filter({ hasText: new RegExp(`^${name}$`, 'i') })).toHaveCount(0);
      await expect(page.getByText(name, { exact: true })).toHaveCount(0);
    }
  });
}
