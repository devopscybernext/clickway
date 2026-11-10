import { test, expect } from '@playwright/test';
import { USERS, login, openPage, query, uniqueMark } from './helpers';
import { PM_BANDWIDTH_SHEET_ID, TAB_PM_PROJECTS } from '../lib/config';

// PM Projects > Dashboard: this month's projects, charted. The projects are inserted straight into the local
// database for the E2E PM (their e-mail decides whose they are) and removed again at the end.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const add = (project: string, status: string, phase: string, payment: string, total: string, followUp: string) => {
  const now = new Date();
  return query(
    `INSERT INTO pm_projects (sheet_id, sheet_tab, timestamp, email_address, department, year, month, project_name, client_name, status, phase, payment_status, total_hours, ac_hours, last_project_follow_up_date)
     VALUES (?, ?, '1/1/2026 10:00:00', ?, 'Web', ?, ?, ?, 'E2E Client', ?, ?, ?, ?, '02.00 Hours', ?)`,
    [PM_BANDWIDTH_SHEET_ID, TAB_PM_PROJECTS, USERS.pm.email, String(now.getFullYear()), MONTHS[now.getMonth()], project, status, phase, payment, total, followUp]);
};

test('a PM sees their own projects charted, and the admin can pick that PM', async ({ browser }) => {
  const mark = uniqueMark('PM Dash');
  const recent = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await add(`${mark} stale`, 'In Progress', 'Development', 'Pending', '10.00 Hours', '');         // never followed up
  await add(`${mark} fresh`, 'On Going', 'Design', 'Done', '05.00 Hours', recent);                // followed up yesterday
  try {
    // the PM: their own projects, no PM picker
    const pm = await (await browser.newContext()).newPage();
    await login(pm, USERS.pm);
    await openPage(pm, 'PM Projects', 'Dashboard');
    await expect(pm.getByRole('heading', { name: 'PM Dashboard' })).toBeVisible();
    await expect(pm.getByText('My projects — this month')).toBeVisible();
    await expect(pm.getByText('PM Summary', { exact: true })).toHaveCount(0);
    await expect(pm.getByTestId('rank-label').filter({ hasText: /^In Progress$/ })).toBeVisible();
    await expect(pm.getByTestId('rank-label').filter({ hasText: /^Development$/ })).toBeVisible();
    // the stale one is in the follow-up list, the fresh one is not
    await expect(pm.getByTestId('follow-up-row').filter({ hasText: `${mark} stale` })).toContainText('never followed up');
    await expect(pm.getByTestId('follow-up-row').filter({ hasText: `${mark} fresh` })).toHaveCount(0);
    // the scope switch shows everyone's projects
    await pm.getByRole('tab', { name: 'All projects' }).click();
    await expect(pm.getByText('All projects — this month')).toBeVisible();
    await expect(pm.getByText('PM Summary', { exact: true })).toBeVisible();
    await pm.context().close();

    // the admin sees every PM, and picking one narrows the page to them
    const admin = await (await browser.newContext()).newPage();
    await login(admin, USERS.admin);
    await openPage(admin, 'PM Projects', 'Dashboard');
    await expect(admin.getByText('All projects — this month')).toBeVisible();
    await admin.getByRole('button', { name: new RegExp(USERS.pm.displayName) }).first().click();
    await expect(admin.getByText(`${USERS.pm.displayName} — this month`)).toBeVisible();
    await expect(admin.getByTestId('follow-up-row').filter({ hasText: `${mark} stale` })).toBeVisible();
    await admin.getByRole('button', { name: 'Show everyone' }).click();
    await expect(admin.getByText('All projects — this month')).toBeVisible();
    await admin.context().close();
  } finally {
    await query('DELETE FROM pm_projects WHERE project_name LIKE ?', [`${mark}%`]);
  }
});
