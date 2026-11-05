import { test, expect } from '@playwright/test';
import { USERS, login, openPage, query, uniqueMark } from './helpers';
import { SHEET_IDS, TAB_BANDWIDTH } from '../lib/config';

// Tasks Overview: the "N Tasks · HH:MMh" pill on a person's card uses the same load as the bandwidth
// in Tasks Assigned - every Today / Everyday task that is not closed (submitted ones too), each as the
// larger of its Daily Time and the Time Logged On AC.

test('the card pill counts the same hours as the bandwidth in Tasks Assigned', async ({ page }) => {
  const project = uniqueMark('Load');
  const add = (task: string, bucket: string, status: string, est: string, logged: string) => query(
    `INSERT INTO web_tasks (sheet_id, sheet_tab, project_name, task_name, assigned_person, task_daily_bucket, task_status_updation, pm_status, time_estimation, time_logged_on_ac, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'No Action Taken', ?, ?, '01/01/2026 10:00:00')`,
    [SHEET_IDS['1'], TAB_BANDWIDTH, project, task, USERS.team.displayName, bucket, status, est, logged]);
  // added out of order on purpose: the card lists them Today, Everyday, To Be Expected, Tomorrow, Day After Tomorrow, Submitted
  await add('in submitted', 'Submitted', 'In Progress', '00.30 Hours', '');
  await add('in day after', 'Day After Tomorrow', 'In Progress', '00.30 Hours', '');
  await add('in expected', 'To Be Expected', 'In Progress', '00.30 Hours', '');
  await add('ran over', 'Today', 'In Progress', '02.00 Hours', '03.00 Hours');          // counts 3:00 (logged is more than the estimate)
  await add('handed on', 'Everyday', 'Submitted To PM', '01.00 Hours', '');             // counts 1:00 (submitted tasks still count)
  await add('closed', 'Today', 'Task Closed', '05.00 Hours', '');                       // not counted
  await add('tomorrow', 'Tomorrow', 'In Progress', '06.00 Hours', '');                  // not counted
  const before = (await query<{ d: string | null }[]>('SELECT department AS d FROM users WHERE username = ?', [USERS.team.username]))[0]?.d ?? null;
  await query("UPDATE users SET department = 'Web' WHERE username = ?", [USERS.team.username]);
  try {
    await login(page, USERS.team);
    await openPage(page, 'Web', 'Tasks Overview');
    // 2 tasks, 3:00 + 1:00 = 4:00 (not 1:00 from the unsubmitted estimate alone, nor 2:00 + 1:00)
    await expect(page.getByText('2 Tasks · 04:00h')).toBeVisible();
    // The Everyday badge is green like Today's (Tomorrow's is not)
    // (the badge text is the bucket as stored, lower case, shown capitalised)
    const colourOf = (word: string) => page.evaluate(w => {
      const badge = [...document.querySelectorAll('td span')].find(e => e.textContent?.trim().toLowerCase() === w);
      return badge ? getComputedStyle(badge).color : 'not found';
    }, word);
    const today = await colourOf('today');
    expect(today).not.toBe('not found');
    expect(await colourOf('everyday')).toBe(today);
    expect(await colourOf('tomorrow')).not.toBe(today);
    expect(await colourOf('tomorrow')).not.toBe('not found');

    // The tasks are listed by bucket: Today, Everyday, To Be Expected, Tomorrow, Day After Tomorrow, Submitted
    const names = ['ran over', 'handed on', 'in expected', 'tomorrow', 'in day after', 'in submitted'];
    const listed = await page.evaluate(all => [...document.querySelectorAll('tr[data-task-id]')]
      .map(r => all.find(n => (r as HTMLElement).innerText.includes(n)) ?? ''), names);
    expect(listed).toEqual(names);
  } finally {
    await query('UPDATE users SET department = ? WHERE username = ?', [before, USERS.team.username]);
    await query('DELETE FROM web_tasks WHERE project_name = ?', [project]);
  }
});
