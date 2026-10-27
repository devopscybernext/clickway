import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { USERS, login } from './helpers';

// Each role sees only its own pages, and the server refuses the rest even
// when asked directly.

test('a team member sees only their own pages, and is refused elsewhere', async ({ page }) => {
  await login(page, USERS.team);
  const nav = page.getByRole('navigation');
  for (const hidden of ['Marketing', 'PM Projects', 'Leave Status', 'Cybernext InHouse']) {
    await expect(nav.getByRole('button', { name: hidden, exact: true })).toHaveCount(0);
  }
  if (!(await nav.getByRole('button', { name: 'Team Bandwidth', exact: true }).isVisible())) {
    await nav.getByRole('button', { name: 'Web', exact: true }).click();
  }
  await expect(nav.getByRole('button', { name: 'Leaderboard', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'Leaderboard', exact: true }).click();
  await expect(page.getByRole('button', { name: '+ Add Feedback' })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'Add Task', exact: true })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'Tasks Assigned', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: USERS.team.displayName }).first().click();
  await expect(page.getByRole('button', { name: 'Admin Portal' })).toHaveCount(0);

  const api = page.request;
  const json = { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' };
  expect((await api.get('/api/inhouse', { headers: json })).status()).toBe(403);
  expect((await api.get('/api/admin-users', { headers: json })).status()).toBe(401);
  const form = await api.post('/api/forms', { data: { form: 'web-task', submissionId: randomUUID(), answers: {} } });
  expect(form.status()).toBe(403);
  const points = await api.post('/api/forms', { data: { form: 'leaderboard', submissionId: randomUUID(), answers: { 'Select Resource': 'Pawan', 'Project Name': 'x' } } });
  expect(points.status()).toBe(403);
});

test('a PM can add projects and has My Projects', async ({ page }) => {
  await login(page, USERS.pm);
  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: 'PM Projects', exact: true }).click();
  await expect(nav.getByRole('button', { name: 'My Projects', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Add New Project' })).toBeVisible();

  await nav.getByRole('button', { name: 'Web', exact: true }).click();
  await nav.getByRole('button', { name: 'Leaderboard', exact: true }).click();
  await expect(page.getByRole('button', { name: '+ Add Feedback' })).toBeVisible();
});

test('an admin has no My Projects or Add New Project, and is refused the PM form', async ({ page }) => {
  await login(page, USERS.admin);
  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: 'PM Projects', exact: true }).click();
  await expect(nav.getByRole('button', { name: 'Current Month', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'My Projects', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ Add New Project' })).toHaveCount(0);
  const form = await page.request.post('/api/forms', { data: { form: 'pm-project', submissionId: randomUUID(), answers: {} } });
  expect(form.status()).toBe(403);
});
