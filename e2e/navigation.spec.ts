import { test, expect } from '@playwright/test';
import { USERS, login, openPage } from './helpers';

// Every page an admin can reach must load with no failed data request and
// no script error.
const ADMIN_PAGES: [string, string?][] = [
  ['Web', 'Team Bandwidth'], ['Web', 'Tasks Assigned'], ['Web', 'Tasks Overview'], ['Web', 'Leaderboard'],
  ['Web', 'Add Task'], ['Web', 'Report'],
  ['Marketing', 'Team Bandwidth'], ['Marketing', 'Tasks Assigned'], ['Marketing', 'Tasks Overview'], ['Marketing', 'Add Task'],
  ['PM Projects', 'Current Month'], ['PM Projects', 'Previous Months'], ['PM Projects', 'Closed Project'],
  ['Leave Status'],
  ['Cybernext InHouse', 'Websites'], ['Cybernext InHouse', 'Case Studies'], ['Cybernext InHouse', 'Brand Kit'],
  ['Cybernext InHouse', 'Documentations'],
  ['Tools', 'Clock Room'], ['Tools', 'Holiday Calendar'], ['Tools', 'AI Tools'],
];

test('every admin page loads without errors', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', err => failures.push(`script error: ${err.message}`));
  // React reports hydration and markup problems through console.error.
  // Failed requests are already caught below.
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) failures.push(`console error: ${msg.text()}`);
  });
  page.on('response', res => {
    if (res.url().includes('/api/') && res.status() >= 400) failures.push(`${res.status()} ${new URL(res.url()).pathname}`);
  });

  await login(page, USERS.admin);
  for (const [section, leaf] of ADMIN_PAGES) {
    await test.step(`${section}${leaf ? ` → ${leaf}` : ''}`, async () => {
      await openPage(page, section, leaf);
      await page.waitForLoadState('networkidle');
      expect(failures, `problems while opening ${section} ${leaf ?? ''}`).toEqual([]);
    });
  }

  await test.step('Admin Portal (profile menu)', async () => {
    await page.getByRole('button', { name: USERS.admin.displayName }).first().click();
    await page.getByRole('button', { name: 'Admin Portal' }).click();
    await expect(page.getByRole('heading', { name: 'User Details' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(failures).toEqual([]);
  });
});

test('the main lists show data from the database', async ({ page }) => {
  await login(page, USERS.admin);

  await openPage(page, 'Web', 'Tasks Assigned');
  await expect(page.getByText(/\b\d{3,} records\b/).first()).toBeVisible();

  await openPage(page, 'Marketing', 'Tasks Assigned');
  await expect(page.getByText(/\b\d+ records\b/).first()).toBeVisible();

  await openPage(page, 'Leave Status');
  await expect(page.getByRole('table').first()).toBeVisible();
  expect(await page.getByRole('row').count()).toBeGreaterThan(5);
});

test('Refresh reloads the data without errors', async ({ page }) => {
  const failures: string[] = [];
  page.on('response', res => {
    if (res.url().includes('/api/') && res.status() >= 400) failures.push(`${res.status()} ${new URL(res.url()).pathname}`);
  });
  await login(page, USERS.admin);
  const reload = page.waitForResponse(r => r.url().includes('/api/bandwidth-tasks') && r.status() === 200);
  await page.getByRole('button', { name: 'Refresh' }).click();
  await reload;
  expect(failures).toEqual([]);
});
