import { test, expect } from '@playwright/test';
import { USERS, login, openPage, query, searchTasks, uniqueMark } from './helpers';
import { SHEET_IDS, TAB_BANDWIDTH, MARKETING_TEAM_SHEET_ID, TAB_MARKETING_TASKS } from '../lib/config';

// Tasks Assigned: a task's full details open in a popup (the same layout as a PM project's), Web and Marketing.

test('Web task: the eye icon opens its details popup, which Escape closes', async ({ page }) => {
  const project = uniqueMark('Detail Web');
  await query(
    `INSERT INTO web_tasks (sheet_id, sheet_tab, project_name, task_name, task_url, task_priority, assigned_person, task_daily_bucket, deadline, task_status_updation, team_required, task_information, email_address, total_time_est, pm_status, today_bucket_set, time_estimation, timestamp)
     VALUES (?, ?, ?, 'Detail task', 'https://example.invalid/detail', 'High', 'Pawan', 'Today', '12/31/2026', 'In Progress', 'FrontEnd', 'Running', ?, '04.30 Hours', 'Changes', 'P2', '02.15 Hours', '01/01/2026 10:00:00')`,
    [SHEET_IDS['1'], TAB_BANDWIDTH, project, USERS.admin.email]);
  try {
    await login(page, USERS.admin);
    await openPage(page, 'Web', 'Tasks Assigned');
    await searchTasks(page, project);
    await page.getByRole('button', { name: `View details of ${project} — Detail task` }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Detail task' })).toBeVisible();
    await expect(dialog.getByText('In Progress')).toBeVisible();          // the status pill
    await expect(dialog.getByText('Assigned to')).toBeVisible();
    await expect(dialog.getByText('Pawan', { exact: true })).toBeVisible();
    await expect(dialog.getByText(project)).toBeVisible();
    await expect(dialog.getByText('02:15')).toBeVisible();                // Daily Time, shown as HH:MM
    await expect(dialog.getByText('04:30')).toBeVisible();                // Total Time Est
    await expect(dialog.getByText('Changes', { exact: true })).toBeVisible(); // PM Status
    await expect(dialog.getByRole('link', { name: 'https://example.invalid/detail' })).toHaveAttribute('href', 'https://example.invalid/detail');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // Clicking the row opens it too; while editing there is no eye (cells are editable)
    await page.getByRole('cell', { name: 'Detail task', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).last().click();
    await page.getByRole('button', { name: 'Edit Task' }).click();
    await expect(page.getByRole('button', { name: /View details of/ })).toHaveCount(0);
  } finally {
    await query('DELETE FROM web_tasks WHERE project_name = ?', [project]);
  }
});

test('Marketing task: the popup also shows the marketing notes', async ({ page }) => {
  const project = uniqueMark('Detail Mkt');
  await query(
    `INSERT INTO marketing_tasks (sheet_id, sheet_tab, project_name, task_name, department, assigned_person, task_daily_bucket, task_status_updation, pm_status, blocker, next_steps, task_estimation, email_address, timestamp)
     VALUES (?, ?, ?, 'Mkt detail task', 'SEO', 'Bhavya', 'No Action Taken', 'No Action Taken', 'No Action Taken', 'Waiting for the client login', 'Send the report', '04.00 Hours', ?, '1/1/2026 10:00:00')`,
    [MARKETING_TEAM_SHEET_ID, TAB_MARKETING_TASKS, project, USERS.admin.email]);
  try {
    await login(page, USERS.admin);
    await openPage(page, 'Marketing', 'Tasks Assigned');
    await searchTasks(page, project);
    await page.getByRole('button', { name: `View details of ${project} — Mkt detail task` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Mkt detail task' })).toBeVisible();
    await expect(dialog.getByText('SEO', { exact: true })).toBeVisible();      // Department
    await expect(dialog.getByText('Waiting for the client login')).toBeVisible();
    await expect(dialog.getByText('Send the report')).toBeVisible();
    await expect(dialog.getByText('04:00')).toBeVisible();
  } finally {
    await query('DELETE FROM marketing_tasks WHERE project_name = ?', [project]);
  }
});
