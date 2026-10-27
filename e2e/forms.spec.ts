import { test, expect, type Page } from '@playwright/test';
import { USERS, login, openPage, query, searchTasks, uniqueMark, waitForDb } from './helpers';

// The dashboard's own entry forms (they replaced the Google Forms): each
// submission must land in MySQL in the format the screens expect, and show up
// in the dashboard.

type Row = Record<string, string>;
const DMY_TS = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/;  // Web Team Sheet style
const MDY_TS = /^\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2}$/;  // Marketing / PM style
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const field = (page: Page, form: string, i: number) => page.locator(`#${form}-q${i}`);
const input = (page: Page, form: string, i: number) => page.locator(`#${form}-q${i}-input`);
const other = (page: Page, form: string, i: number) => page.locator(`#${form}-q${i}-other`);
const pick = (page: Page, form: string, i: number, option: string) =>
  field(page, form, i).getByLabel(option, { exact: true }).check();

test('Web "Add Task": required questions are enforced, then the task is saved and listed', async ({ page }) => {
  await login(page, USERS.admin);
  await openPage(page, 'Web', 'Add Task');

  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Please fix the highlighted questions.')).toBeVisible();
  await expect(page.getByText('This question is required')).toHaveCount(5);

  const project = uniqueMark('Web Project');
  await pick(page, 'web-task', 0, 'Other:');
  await other(page, 'web-task', 0).fill(project);
  await pick(page, 'web-task', 1, 'Video Editing');
  await input(page, 'web-task', 2).fill('https://example.invalid/e2e-task');
  await input(page, 'web-task', 3).selectOption('High');
  await input(page, 'web-task', 4).selectOption('FrontEnd');
  await input(page, 'web-task', 6).selectOption('Pawan');
  await input(page, 'web-task', 7).fill('02.00 Hours');
  await input(page, 'web-task', 8).fill('2026-11-03');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Task submitted successfully')).toBeVisible();

  const row = await waitForDb(async () => (await query<Row[]>('SELECT * FROM web_tasks WHERE project_name = ?', [project]))[0], 'web task row');
  expect(row.sheet_tab).toBe('Current Month Tasks');
  expect(row.email_address).toBe(USERS.admin.email);
  expect(row.timestamp).toMatch(DMY_TS);
  expect(row.deadline).toBe('03/11/2026');
  expect(row.task_name).toBe('Video Editing');
  expect(row.task_priority).toBe('High');
  expect(row.preferred_resource).toBe('Pawan');
  // New tasks start as "No Action Taken", unassigned
  expect(row).toMatchObject({ task_status_updation: 'No Action Taken', task_daily_bucket: 'No Action Taken', pm_status: 'No Action Taken', today_bucket_set: 'No Action Taken', assigned_person: '' });

  // Listed in Tasks Assigned with the default filters on, ready to be assigned
  await openPage(page, 'Web', 'Tasks Assigned');
  await searchTasks(page, project);
  await expect(page.getByRole('cell', { name: project })).toBeVisible();
});

test('Marketing "Add Task": the task is saved in the marketing format and listed', async ({ page }) => {
  await login(page, USERS.admin);
  await openPage(page, 'Marketing', 'Add Task');

  const task = uniqueMark('Mkt Task');
  await pick(page, 'marketing-task', 0, 'YDB');
  await pick(page, 'marketing-task', 1, 'Other:');
  await other(page, 'marketing-task', 1).fill(task);
  await input(page, 'marketing-task', 2).fill('https://example.invalid/e2e-mkt');
  await input(page, 'marketing-task', 3).selectOption('PPC');
  await input(page, 'marketing-task', 4).selectOption('Atul');
  await input(page, 'marketing-task', 5).fill('3 hrs');
  await input(page, 'marketing-task', 6).fill('2026-11-03');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Task submitted successfully')).toBeVisible();

  const row = await waitForDb(async () => (await query<Row[]>('SELECT * FROM marketing_tasks WHERE task_name = ?', [task]))[0], 'marketing task row');
  expect(row.sheet_tab).toBe('Current Month Tasks');
  expect(row.email_address).toBe(USERS.admin.email);
  expect(row.timestamp).toMatch(MDY_TS);
  expect(row.deadline).toBe('11/3/2026');
  expect(row.department).toBe('PPC');
  expect(row.assigned_person).toBe('Atul');
  expect(row).toMatchObject({ task_status_updation: 'No Action Taken', task_daily_bucket: 'No Action Taken' });

  await openPage(page, 'Marketing', 'Tasks Assigned');
  await searchTasks(page, task);
  await expect(page.getByRole('cell', { name: task })).toBeVisible();
});

test('PM "Add New Project": the project is saved and appears in My Projects', async ({ page }) => {
  const now = new Date();
  await login(page, USERS.pm);
  await openPage(page, 'PM Projects', 'Current Month');
  await page.getByRole('button', { name: '+ Add New Project' }).click();
  await expect(page.getByRole('heading', { name: 'Add New Project' })).toBeVisible();

  const project = uniqueMark('PM Project');
  const f = 'pm-project';
  await input(page, f, 0).selectOption('Web');
  await input(page, f, 1).selectOption(String(now.getFullYear()));
  await input(page, f, 2).selectOption(MONTHS[now.getMonth()]);
  await pick(page, f, 3, 'Other:'); await other(page, f, 3).fill(project);
  await pick(page, f, 4, 'Other:'); await other(page, f, 4).fill('E2E Client');
  await pick(page, f, 5, 'Other:'); await other(page, f, 5).fill('Slack');
  await pick(page, f, 6, 'Shopify');
  await input(page, f, 7).fill('40');
  await input(page, f, 8).fill('10');
  await pick(page, f, 9, 'Upwork');
  await pick(page, f, 10, 'Akash');
  await pick(page, f, 10, 'Pawan');
  await input(page, f, 11).selectOption('In Progress');
  await input(page, f, 12).selectOption('Development');
  await pick(page, f, 13, 'M1');
  await input(page, f, 14).fill('12.50 hrs');
  await input(page, f, 15).fill('0 hrs');
  await pick(page, f, 16, 'Other:'); await other(page, f, 16).fill('M2 next week');
  await pick(page, f, 17, 'Upsell');
  await input(page, f, 18).fill('2026-10-01');
  await input(page, f, 19).fill('2026-12-15');
  await input(page, f, 20).selectOption('Pending');
  await input(page, f, 21).fill('2026-10-27');
  await input(page, f, 22).fill('Created by the end-to-end test');
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page.getByRole('heading', { name: 'Add New Project' })).toBeHidden();
  const row = await waitForDb(async () => (await query<Row[]>('SELECT * FROM pm_projects WHERE project_name = ?', [project]))[0], 'pm project row');
  expect(row.sheet_tab).toBe('CurrentMonth');
  expect(row.email_address).toBe(USERS.pm.email);
  expect(row.timestamp).toMatch(MDY_TS);
  expect(row.assigned).toBe('Akash, Pawan');
  expect(row.project_start_date).toBe('10/1/2026');
  expect(row.target_end_date).toBe('12/15/2026');
  expect(row.upsell_cross_sell).toBe('Upsell');

  await openPage(page, 'PM Projects', 'My Projects');
  await expect(page.getByText(project).first()).toBeVisible();
});

test('"Other" picked but left empty is flagged', async ({ page }) => {
  await login(page, USERS.admin);
  await openPage(page, 'Web', 'Add Task');
  await pick(page, 'web-task', 0, 'Other:');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(field(page, 'web-task', 0).getByText('Type your answer for "Other"')).toBeVisible();
});
