import { test, expect } from '@playwright/test';
import { USERS, login } from './helpers';

// The sidebar is about a fifth of the screen wide and can be switched off: collapsed, it shows just the icons.
// The choice is remembered in the browser.

test('the sidebar collapses to icons, expands again, and remembers the choice', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, USERS.admin);
  const aside = page.locator('aside').filter({ has: page.getByTestId('sidebar-toggle') });
  const width = async () => (await aside.boundingBox())!.width;

  // expanded: wide, with the names
  expect(await width()).toBeGreaterThanOrEqual(270);
  await expect(aside.getByText('Cybernext InHouse', { exact: true })).toBeVisible();
  await expect(aside.getByText(USERS.admin.displayName)).toBeVisible();

  // collapsed: narrow, icons only (the buttons keep their names for screen readers and tooltips)
  await page.getByTestId('sidebar-toggle').click();
  await expect.poll(width).toBeLessThanOrEqual(80);
  await expect(aside.getByText('Cybernext InHouse', { exact: true })).toHaveCount(0);
  await expect(aside.getByText(USERS.admin.displayName)).toHaveCount(0);
  await expect(aside.getByRole('button', { name: 'Cybernext InHouse', exact: true })).toBeVisible();

  // a page can still be opened from the icons
  await aside.getByRole('button', { name: 'Leave Status', exact: true }).click();
  await expect(page.getByRole('banner').getByText('Leave Status')).toBeVisible();

  // it stays collapsed after a reload, then opens again
  await page.reload();
  await expect.poll(width).toBeLessThanOrEqual(80);
  await page.getByTestId('sidebar-toggle').click();
  await expect.poll(width).toBeGreaterThanOrEqual(270);
  await expect(aside.getByText('Cybernext InHouse', { exact: true })).toBeVisible();
});

test('the sidebar is about a fifth of the screen', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page, USERS.admin);
  const aside = page.locator('aside').filter({ has: page.getByTestId('sidebar-toggle') });
  const w = (await aside.boundingBox())!.width;
  expect(w).toBeGreaterThan(1600 * 0.18);
  expect(w).toBeLessThan(1600 * 0.22);
});
