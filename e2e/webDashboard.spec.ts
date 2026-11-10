import { test, expect, type Page } from '@playwright/test';
import { USERS, login, openPage, query, uniqueMark } from './helpers';
import { SHEET_IDS, TAB_BANDWIDTH, MARKETING_TEAM_SHEET_ID, TAB_MARKETING_TASKS } from '../lib/config';

// Web > Dashboard: the Today / Weekly / Monthly switch at the top drives the Project State cards, the Team Workload
// cards and the charts (lib/period.ts), and picking a person in Team Workload narrows the charts to them.

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} 10:00:00`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const lastMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); d.setDate(15); return d; };

const add = (project: string, task: string, who: string, ts: string, bucket: string, status: string, pm: string, est: string) => query(
  `INSERT INTO web_tasks (sheet_id, sheet_tab, project_name, task_name, assigned_person, timestamp, task_daily_bucket, task_status_updation, pm_status, time_estimation, team_required)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FrontEnd')`,
  [SHEET_IDS['1'], TAB_BANDWIDTH, project, task, who, ts, bucket, status, pm, est]);

const legend = (page: Page, text: string) => page.locator('.recharts-legend-item-text', { hasText: new RegExp(`^${text}$`) });
const period = (page: Page, name: 'Today' | 'Weekly' | 'Monthly') => page.getByRole('tablist', { name: 'Period' }).getByRole('tab', { name }).click();

// A: today, In Progress. B: everyday, Submitted To PM (approved). C: closed. D: tomorrow bucket, On Hold.
// E: added last month. F: added 9 days ago (only when that is still this month).
async function seed(project: string, who: string) {
  await add(project, 'A today', who, stamp(new Date()), 'Today', 'In Progress', 'No Action Taken', '02.00 Hours');
  await add(project, 'B everyday', who, stamp(new Date()), 'Everyday', 'Submitted To PM', 'Approved', '01.00 Hours');
  await add(project, 'C closed', who, stamp(new Date()), 'No Action Taken', 'Task Closed', 'TicketClosed', '01.00 Hours');
  await add(project, 'D tomorrow', who, stamp(new Date()), 'Tomorrow', 'On Hold', 'No Action Taken', '01.00 Hours');
  await add(project, 'E old', who, stamp(lastMonth()), 'No Action Taken', 'To Be Started', 'No Action Taken', '01.00 Hours');
  const hasF = new Date().getDate() >= 10;
  if (hasF) await add(project, 'F earlier', who, stamp(daysAgo(9)), 'No Action Taken', 'Testing', 'No Action Taken', '01.00 Hours');
  return hasF;
}

test('a team member: the charts follow Today / Weekly / Monthly', async ({ page }) => {
  const project = uniqueMark('Dash Mine');
  const hasF = await seed(project, USERS.team.displayName);
  const before = (await query<{ d: string | null }[]>('SELECT department AS d FROM users WHERE username = ?', [USERS.team.username]))[0]?.d ?? null;
  await query("UPDATE users SET department = 'Web' WHERE username = ?", [USERS.team.username]);
  try {
    await login(page, USERS.team);
    await openPage(page, 'Web', 'Dashboard');
    await expect(page.getByRole('heading', { name: 'Web Dashboard' })).toBeVisible();
    // the switch is at the top, above the greeting
    const tabTop = (await page.getByRole('tablist', { name: 'Period' }).boundingBox())!.y;
    const greetTop = (await page.getByRole('heading', { name: /^Good (morning|afternoon|evening), / }).boundingBox())!.y;
    expect(tabTop).toBeLessThan(greetTop);
    await expect(page.getByText('Hours by person')).toHaveCount(0);

    // Today: A and B only
    await expect(page.getByRole('heading', { name: /^My work — today/ })).toBeVisible();
    await expect(legend(page, 'In Progress')).toBeVisible();
    await expect(legend(page, 'Submitted')).toBeVisible();
    await expect(legend(page, 'Closed')).toHaveCount(0);
    await expect(legend(page, 'On Hold')).toHaveCount(0);

    // Weekly: tasks added this week (A, B, C, D)
    await period(page, 'Weekly');
    await expect(page.getByRole('heading', { name: /^My work — .*this week/ })).toBeVisible();
    for (const s of ['In Progress', 'Submitted', 'Closed', 'On Hold']) await expect(legend(page, s)).toBeVisible();
    await expect(legend(page, 'To Be Started')).toHaveCount(0);

    // Monthly: plus anything earlier this month, never last month's
    await period(page, 'Monthly');
    await expect(page.getByRole('heading', { name: /^My work — .*this month/ })).toBeVisible();
    if (hasF) await expect(legend(page, 'Testing')).toBeVisible();
    await expect(legend(page, 'To Be Started')).toHaveCount(0);
  } finally {
    await query('UPDATE users SET department = ? WHERE username = ?', [before, USERS.team.username]);
    await query('DELETE FROM web_tasks WHERE project_name = ?', [project]);
  }
});

test('picking a person in Team Workload narrows the charts to them', async ({ page }) => {
  const project = uniqueMark('Dash Pick');
  for (const who of ['Pawan', 'Dhruv']) await add(project, `pick ${who}`, who, stamp(new Date()), 'No Action Taken', 'In Progress', 'No Action Taken', '01.00 Hours');
  try {
    await login(page, USERS.admin);
    await openPage(page, 'Web', 'Dashboard');
    await period(page, 'Monthly');
    const axis = () => page.locator('.recharts-wrapper svg text').allTextContents();
    await expect.poll(async () => { const a = await axis(); return a.includes('Pawan') && a.includes('Dhruv'); }).toBe(true);
    await expect(page.getByRole('heading', { name: /^Web team — .*this month/ })).toBeVisible();

    await page.getByText('Pawan', { exact: true }).locator('visible=true').first().click();
    await expect(page.getByRole('heading', { name: /^Pawan — .*this month/ })).toBeVisible();
    await expect.poll(async () => (await axis()).filter(t => t === 'Pawan' || t === 'Dhruv')).toEqual(['Pawan']);

    await page.getByText('Pawan', { exact: true }).locator('visible=true').first().click();
    await expect.poll(async () => (await axis()).includes('Dhruv')).toBe(true);
  } finally {
    await query('DELETE FROM web_tasks WHERE project_name = ?', [project]);
  }
});

test('a PM sees the team dashboard, and Web has no Team Bandwidth page of its own', async ({ page }) => {
  await login(page, USERS.pm);
  await openPage(page, 'Web', 'Dashboard');
  await expect(page.getByRole('heading', { name: 'Web Dashboard' })).toBeVisible();
  await expect(page.getByText('Team Workload', { exact: true })).toBeVisible();
  const nav = page.getByRole('navigation');
  await expect(nav.getByRole('button', { name: 'Team Bandwidth', exact: true })).toHaveCount(0);
});

// Marketing > Dashboard: the same page for Marketing (dates are written month/day/year there)
test('Marketing Dashboard: no period switch, and picking a person narrows the charts', async ({ page }) => {
  const project = uniqueMark('Dash Mkt');
  const n = new Date();
  const ts = `${n.getMonth() + 1}/${n.getDate()}/${n.getFullYear()} 10:00:00`;
  for (const who of ['Bhavya', 'Payal']) await query(
    `INSERT INTO marketing_tasks (sheet_id, sheet_tab, project_name, task_name, assigned_person, task_daily_bucket, task_status_updation, pm_status, task_estimation, department, timestamp)
     VALUES (?, ?, ?, ?, ?, 'No Action Taken', 'In Progress', 'No Action Taken', '01.00 Hours', 'SMM', ?)`,
    [MARKETING_TEAM_SHEET_ID, TAB_MARKETING_TASKS, project, `mkt ${who}`, who, ts]);
  try {
    await login(page, USERS.admin);
    await openPage(page, 'Marketing', 'Dashboard');
    await expect(page.getByRole('heading', { name: 'Marketing Dashboard' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Marketing team — today/ })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Period' })).toHaveCount(0);
    const axis = () => page.locator('.recharts-wrapper svg text').allTextContents();
    await page.getByText('Bhavya', { exact: true }).locator('visible=true').first().click();
    await expect(page.getByRole('heading', { name: /^Bhavya — today/ })).toBeVisible();
    await expect.poll(async () => (await axis()).filter(t => t === 'Bhavya' || t === 'Payal')).toEqual(['Bhavya']);
  } finally {
    await query('DELETE FROM marketing_tasks WHERE project_name = ?', [project]);
  }
});
