import { test, expect } from '@playwright/test';
import { USERS, login, query, uniqueMark, waitForDb } from './helpers';

// The Help tab: anyone can send a request; the sender sees their own in My Queries
// and only the Super Admin can change a status.

type Row = Record<string, string | number>;

test('Help: a request is saved, its sender sees it, and only the Super Admin can change its status', async ({ page }) => {
  await login(page, USERS.team);
  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: 'Help', exact: true }).click();
  await nav.getByRole('button', { name: 'Apply', exact: true }).click();

  const subject = uniqueMark('Help');
  await page.getByLabel('Complaint', { exact: true }).check();
  await page.locator('#help-q1-input').fill(subject);
  await page.locator('#help-q2-input').selectOption('Tools');
  await page.locator('#help-q3-input').fill('Something is not right here.');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Submitted. Your response has been recorded.')).toBeVisible();

  const row = await waitForDb(async () => (await query<Row[]>('SELECT * FROM help_requests WHERE subject = ?', [subject]))[0], 'help request row');
  expect(row).toMatchObject({ type: 'Complaint', area: 'Tools', status: 'New', username: USERS.team.username, name: USERS.team.displayName });

  // The sender finds it under My Queries
  await nav.getByRole('button', { name: 'My Queries', exact: true }).click();
  await expect(page.getByRole('cell', { name: subject })).toBeVisible();

  // A team member can't change the status
  const patch = await page.request.patch('/api/help', { data: { id: row.id, status: 'Closed' } });
  expect(patch.status()).toBe(401);
});
