import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { USERS, login, openPage, query, searchTasks, uniqueMark, waitForDb } from './helpers';

// Inline edits must be saved to MySQL and recorded in change_log with the
// editor's username. Real rows are put back exactly as they were.

type Row = Record<string, string | number>;

test('Tasks Assigned: a new task can be assigned and its status changed', async ({ page }) => {
  await login(page, USERS.admin);

  // A task of our own to edit (removed again in global teardown).
  const project = uniqueMark('Edit Project');
  const created = await page.request.post('/api/forms', {
    data: {
      form: 'web-task', submissionId: randomUUID(),
      answers: { 'Project Name': project, 'Task Name': 'QA Testing', 'Task URL': 'https://example.invalid/e2e-edit', 'Task Priority': 'Low', 'Team Required': 'QA' },
    },
  });
  expect(created.status()).toBe(200);
  const { id } = await created.json();
  const dbRow = async () => (await query<Row[]>('SELECT * FROM web_tasks WHERE id = ?', [id]))[0];

  await page.getByRole('button', { name: 'Refresh' }).click();
  await openPage(page, 'Web', 'Tasks Assigned');
  await searchTasks(page, project);
  const row = page.getByRole('row', { name: project });
  await expect(row).toBeVisible();

  await page.getByRole('button', { name: 'Edit Task' }).click();

  // Assign it (this used to be done in the Google Sheet)
  await expect(row.locator('span', { hasText: 'Assign…' })).toBeVisible();
  await row.getByRole('combobox', { name: 'Click to change' }).selectOption('Pawan');
  await waitForDb(async () => (await dbRow())?.assigned_person === 'Pawan', 'assigned person saved');

  // Change its status
  const status = row.locator('select').filter({ has: page.locator('option', { hasText: 'To Be Started' }) });
  await status.selectOption('In Progress');
  await waitForDb(async () => (await dbRow())?.task_status_updation === 'In Progress', 'status saved');

  const log = await query<Row[]>("SELECT column_name, new_value, changed_by FROM change_log WHERE table_name = 'web_tasks' AND row_id = ? ORDER BY id", [id]);
  expect(log).toEqual([
    { column_name: 'Assigned Person', new_value: 'Pawan', changed_by: USERS.admin.username },
    { column_name: 'Task Status Updation', new_value: 'In Progress', changed_by: USERS.admin.username },
  ]);

  // Both survive a full reload
  await page.reload();
  await openPage(page, 'Web', 'Tasks Assigned');
  await searchTasks(page, project);
  const after = page.getByRole('row', { name: project });
  await expect(after).toContainText('In Progress');
  await expect(after).toContainText('Pawan');
});

test("Leave Status: changing a person's leave is saved, then put back", async ({ page }) => {
  await login(page, USERS.admin);
  await openPage(page, 'Leave Status');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  // Columns: photo, Name, (Department), Leave Status
  const tr = page.locator('tbody tr').filter({ has: page.locator('select') }).first();
  const person = (await tr.locator('td').nth(1).innerText()).trim();
  expect(person, 'person name read from the Name column').not.toBe('');
  expect(person).not.toBe('—');

  const [target] = await query<Row[]>('SELECT id, `leave` AS l FROM leave_status WHERE TRIM(team) = ? ORDER BY id LIMIT 1', [person]);
  expect(target, `${person} exists in leave_status`).toBeTruthy();
  const original = String(target.l ?? '');
  const select = tr.locator('select');
  const options = await select.locator('option').allInnerTexts();
  const newValue = options.map(o => o.trim()).find(o => o !== (original.trim() || 'No Action Taken'))!;

  try {
    await select.selectOption(newValue);
    await waitForDb(async () => (await query<Row[]>('SELECT `leave` AS l FROM leave_status WHERE id = ?', [target.id]))[0]?.l === newValue, `leave for ${person} saved`);
    const log = await query<Row[]>("SELECT changed_by, new_value FROM change_log WHERE table_name = 'leave_status' AND row_id = ? ORDER BY id DESC LIMIT 1", [target.id]);
    expect(log[0]).toEqual({ changed_by: USERS.admin.username, new_value: newValue });
  } finally {
    // Put the real value back exactly as it was
    await query('UPDATE leave_status SET `leave` = ? WHERE id = ?', [original, target.id]);
  }
  const [restored] = await query<Row[]>('SELECT `leave` AS l FROM leave_status WHERE id = ?', [target.id]);
  expect(String(restored.l ?? '')).toBe(original);
});

test('Admin Portal: display name and role edits are saved', async ({ page }) => {
  await login(page, USERS.admin);
  await page.getByRole('button', { name: USERS.admin.displayName }).first().click();
  await page.getByRole('button', { name: 'Admin Portal' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  try {
    // Only the temporary test user is edited
    const row = page.getByRole('row').filter({ hasText: USERS.team.displayName });
    await row.getByRole('button', { name: USERS.team.displayName }).click();
    const nameInput = page.locator('tbody input:focus');
    await nameInput.fill('E2E Team Renamed');
    await nameInput.press('Enter');
    await waitForDb(async () => (await query<Row[]>('SELECT display_name AS n FROM users WHERE username = ?', [USERS.team.username]))[0]?.n === 'E2E Team Renamed', 'display name saved');

    const renamed = page.getByRole('row').filter({ hasText: 'E2E Team Renamed' });
    await renamed.getByLabel('Role').selectOption('MarketingTeam');
    await waitForDb(async () => (await query<Row[]>('SELECT role AS r FROM users WHERE username = ?', [USERS.team.username]))[0]?.r === 'MarketingTeam', 'role saved');
  } finally {
    // Restore for the remaining tests
    await query('UPDATE users SET display_name = ?, role = ? WHERE username = ?', [USERS.team.displayName, USERS.team.role, USERS.team.username]);
  }
});

test('Admin Portal: a user added to a department shows in that team\'s form, and can be removed', async ({ page }) => {
  await login(page, USERS.admin);
  const name = uniqueMark('Hire').replace(/ /g, '');
  const username = `e2e_added_${Date.now().toString(36)}`;
  const openPortal = async () => {
    await page.getByRole('button', { name: USERS.admin.displayName }).first().click();
    await page.getByRole('button', { name: 'Admin Portal' }).click();
  };

  await openPortal();
  await page.getByRole('button', { name: 'Add User' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add user' });
  await dialog.locator('#new-name').fill(name);
  await dialog.locator('#new-email').fill(`${username}@example.invalid`);
  await dialog.locator('#new-username').fill(username);
  await dialog.locator('#new-password').fill('E2E-added-Passw0rd!');
  await dialog.locator('#new-department').selectOption('Web');
  await dialog.getByRole('button', { name: 'Back End' }).click();
  await dialog.getByRole('button', { name: 'Add User' }).click();
  await expect(page.getByText(`${name} was added to Web`)).toBeVisible();

  const row = await waitForDb(async () => (await query<Row[]>('SELECT * FROM users WHERE username = ?', [username]))[0], 'added user row');
  expect(row).toMatchObject({ role: 'WebTeam', department: 'Web', sub_department: 'backend', display_name: name, email: `${username}@example.invalid` });
  expect(row.password_hash).toMatch(/^\$2[aby]\$/);

  // They are now offered in the Web Add Task form
  await openPage(page, 'Web', 'Add Task');
  await expect(page.locator('#web-task-q6-input option', { hasText: name })).toHaveCount(1);

  // ...and can be removed again
  await openPortal();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: `Remove ${name}` }).click();
  await page.getByRole('dialog', { name: 'Remove account' }).getByRole('button', { name: 'Remove' }).click();
  await waitForDb(async () => (await query<Row[]>('SELECT id FROM users WHERE username = ?', [username])).length === 0, 'user removed');
});

test('Tasks Assigned: a row can be duplicated and deleted, and a team member is refused', async ({ page }) => {
  await login(page, USERS.admin);
  const project = uniqueMark('Row Project');
  const created = await page.request.post('/api/forms', {
    data: {
      form: 'web-task', submissionId: randomUUID(),
      answers: { 'Project Name': project, 'Task Name': 'QA Testing', 'Task URL': 'https://example.invalid/e2e-rows', 'Task Priority': 'Low', 'Team Required': 'QA' },
    },
  });
  expect(created.status()).toBe(200);
  const { id } = await created.json();

  const sheet = (await query<Row[]>('SELECT sheet_id FROM web_tasks WHERE id = ?', [id]))[0].sheet_id as string;
  const call = (action: string, row: number) => page.request.post('/api/rows', { data: { action, spreadsheetId: sheet, sheetName: 'Current Month Tasks', row } });

  const dup = await call('duplicate', id);
  expect(dup.status()).toBe(200);
  const copyId = (await dup.json()).id as number;
  const rows = await query<Row[]>('SELECT * FROM web_tasks WHERE project_name = ?', [project]);
  expect(rows).toHaveLength(2);
  expect(rows.find(r => r.id === copyId)?.task_name).toBe('QA Testing');

  expect((await call('delete', copyId)).status()).toBe(200);
  expect(await query<Row[]>('SELECT id FROM web_tasks WHERE project_name = ?', [project])).toHaveLength(1);

  // A team member may not change rows
  await login(page, USERS.team);
  expect((await call('delete', id)).status()).toBe(403);
  expect(await query<Row[]>('SELECT id FROM web_tasks WHERE id = ?', [id])).toHaveLength(1);
});
