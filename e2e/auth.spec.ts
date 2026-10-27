import { test, expect } from '@playwright/test';
import { PASSWORD, USERS, login } from './helpers';

test.describe('Login and logout', () => {
  test('a wrong password is refused', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Enter email or username').fill(USERS.admin.username);
    await page.getByPlaceholder('Enter password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByText('Invalid credentials.')).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);
  });

  test('an unknown user is refused with the same message', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Enter email or username').fill('nobody@example.invalid');
    await page.getByPlaceholder('Enter password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByText('Invalid credentials.')).toBeVisible();
  });

  test('admins log in with their username, stay logged in on reload, and can sign out', async ({ page }) => {
    await login(page, USERS.admin);
    await expect(page.getByRole('button', { name: USERS.admin.displayName }).first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole('navigation')).toBeVisible();

    await page.getByRole('button', { name: USERS.admin.displayName }).first().click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('team members log in with their email', async ({ page }) => {
    await login(page, USERS.team);
    await expect(page.getByRole('navigation').getByRole('button', { name: 'Web', exact: true })).toBeVisible();
  });
});
