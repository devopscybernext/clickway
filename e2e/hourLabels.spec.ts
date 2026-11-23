import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { USERS, login, openPage } from './helpers';
import { taskColumnLabel } from '../lib/columnLabels';
import { timeHeading } from '../lib/productivity';

// The hour columns of Web and Marketing tasks have new names on screen (the columns themselves are unchanged):
//   Web        Total Time Est -> Billable Hours    Total Time -> Total Logged    Time Logged On AC -> Daily Logged
//   Marketing  Task Estimation -> Billable Hours   Total Hours -> Total Logged   Time Logged On AC -> Daily Logged

test('the label map', () => {
  expect(['Total Time Est', 'Total Time', 'Time Logged On Ac', 'Task Estimation', 'Total Hours', 'Time Estimation', 'Project Name'].map(taskColumnLabel))
    .toEqual(['Billable Hours', 'Total Logged', 'Daily Logged', 'Billable Hours', 'Total Logged', 'Daily Time', 'Project Name']);
});

// The Productivity Meter report (PDF and Excel) heads its two time columns with the same names
test('the Productivity Meter report headings', () => {
  expect([timeHeading('web', 'est'), timeHeading('web', 'total'), timeHeading('marketing', 'est'), timeHeading('marketing', 'total')])
    .toEqual(['BILLABLE HOURS', 'TOTAL LOGGED', 'BILLABLE HOURS', 'TOTAL LOGGED']);
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

// The downloaded Productivity Meter Excel: its task tables are headed with the new names
for (const team of ['Web', 'Marketing'] as const) {
  test(`${team} Report: the Productivity Meter Excel uses the new hour headings`, async ({ page }) => {
    await login(page, USERS.admin);
    await openPage(page, team, 'Report');
    await page.getByRole('button', { name: 'Generate Excel' }).click();
    await page.getByRole('button', { name: 'All time', exact: true }).click();
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog').getByRole('button', { name: 'Generate Excel' }).click()]);
    const path = await file.path();
    const files = unzipSync(new Uint8Array(readFileSync(path)));
    const text = Object.entries(files).filter(([name]) => name.endsWith('.xml')).map(([, data]) => strFromU8(data)).join('\n');
    expect(text).toContain('BILLABLE HOURS');
    expect(text).toContain('TOTAL LOGGED');
    for (const old of ['TOTAL TIME EST', 'TASK ESTIMATION', 'TOTAL TIME<', 'TOTAL HOURS']) expect(text, old).not.toContain(old);
    // the summary table and the flags say billable too
    for (const word of ['BILLABLE HOURS', 'TOTAL LOGGED', 'WITHIN BILLABLE', 'OVER BILLABLE']) expect(text, word).toContain(word);
    for (const old of ['TIME ESTIMATED', 'TIME TAKEN', 'WITHIN ESTIMATE', 'OVER ESTIMATE']) expect(text, old).not.toContain(old);
    expect(text).not.toMatch(/the estimate|over estimate|under estimate/i);
  });
}
