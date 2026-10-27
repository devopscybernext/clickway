import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'crypto';
import { PASSWORD, USERS, query, type E2EUser } from './helpers';
import { SHEET_IDS, TOOLS_SHEET_ID, USER_DETAILS_SHEET_ID, LEAVE_SHEET_ID } from '../lib/config';

// Server-side rules, checked without the UI.

const FETCH = { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' };
const dataUrl = (sheetId: string, range: string) =>
  `/api/data?sheetId=${encodeURIComponent(sheetId)}&range=${encodeURIComponent(range)}`;

async function signIn(request: APIRequestContext, user: E2EUser) {
  const res = await request.post('/api/login', {
    data: { identifier: user.loginWith === 'username' ? user.username : user.email, password: PASSWORD },
  });
  expect(res.status()).toBe(200);
}

test('every data route refuses requests without a login', async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL });
  for (const path of ['/api/bandwidth-tasks', '/api/pm-bandwidth', '/api/marketing-team', '/api/inhouse', '/api/pm-users', '/api/admin-users', dataUrl(TOOLS_SHEET_ID, "'News'!A1:Z10000")]) {
    expect((await anon.get(path, { headers: FETCH })).status(), path).toBe(401);
  }
  expect((await anon.post('/api/update-status', { data: {} })).status()).toBe(401);
  expect((await anon.post('/api/forms', { data: {} })).status()).toBe(401);
  await anon.dispose();
});

test('the data routes only serve and edit the dashboard\'s own datasets', async ({ request }) => {
  await signIn(request, USERS.team);
  expect((await request.get(dataUrl(TOOLS_SHEET_ID, "'News'!A1:Z10000"), { headers: FETCH })).status()).toBe(200);
  expect((await request.get(dataUrl(USER_DETAILS_SHEET_ID, "'Sheet2'!A1:D200"), { headers: FETCH })).status()).toBe(403);
  expect((await request.get(dataUrl(LEAVE_SHEET_ID, "'Sheet2'!A1:D200"), { headers: FETCH })).status()).toBe(403);
  expect((await request.get(dataUrl(USER_DETAILS_SHEET_ID, "'UserDetails'!A1:Z200"), { headers: FETCH })).status()).toBe(403);
  const write = (spreadsheetId: string, sheetName: string) =>
    request.post('/api/update-status', { data: { spreadsheetId, sheetName, row: 1, colIndex: 0, value: 'x' } });
  expect((await write(USER_DETAILS_SHEET_ID, 'UserDetails')).status()).toBe(403);
  expect((await write(LEAVE_SHEET_ID, 'Sheet2')).status()).toBe(403);
  expect((await write(SHEET_IDS['1'], 'Leaderboard')).status()).toBe(403);
});

test('entry forms validate answers and store a submission only once', async ({ request }) => {
  await signIn(request, USERS.admin);
  const missing = await request.post('/api/forms', { data: { form: 'web-task', submissionId: randomUUID(), answers: { 'Project Name': 'YDB' } } });
  expect(missing.status()).toBe(422);
  expect(Object.keys((await missing.json()).errors)).toEqual(expect.arrayContaining(['Task Name', 'Task URL', 'Task Priority', 'Team Required']));

  const base = { 'Project Name': 'YDB', 'Task Name': 'Video Editing', 'Task URL': 'x', 'Team Required': 'QA' };
  const bad = await request.post('/api/forms', { data: { form: 'web-task', submissionId: randomUUID(), answers: { ...base, 'Task Priority': 'Whenever' } } });
  expect(bad.status()).toBe(422);
  const extra = await request.post('/api/forms', { data: { form: 'web-task', submissionId: randomUUID(), answers: { ...base, 'Task Priority': 'Low', 'PM Status': 'Approved' } } });
  expect(extra.status()).toBe(422);

  const submissionId = randomUUID();
  const project = `E2E Once ${submissionId.slice(0, 8)}`;
  const answers = { ...base, 'Project Name': project, 'Task Priority': 'Low' };
  const first = await (await request.post('/api/forms', { data: { form: 'web-task', submissionId, answers } })).json();
  const second = await (await request.post('/api/forms', { data: { form: 'web-task', submissionId, answers } })).json();
  expect(first).toMatchObject({ success: true, duplicate: false });
  expect(second).toMatchObject({ success: true, duplicate: true });
  const rows = await query<{ n: number }[]>('SELECT COUNT(*) AS n FROM web_tasks WHERE project_name = ?', [project]);
  expect(Number(rows[0].n)).toBe(1);
});

test('Google Forms intake (Leaderboard form) stores responses once, in the sheet format', async ({ request }) => {
  const secret = process.env.INTAKE_SECRET;
  test.skip(!secret, 'INTAKE_SECRET is not set in .env.local');
  const post = (body: object, key = secret) =>
    request.post('/api/intake', { data: body, headers: { authorization: `Bearer ${key}` } });

  expect((await post({}, 'wrong-secret')).status()).toBe(401);

  const responseId = `e2e-lb-${randomUUID().slice(0, 8)}`;
  const body = {
    form: 'leaderboard', responseId, submittedAt: '2026-10-27T09:05:07Z', email: 'e2e-intake@example.invalid',
    answers: { 'Select Resource': 'E2E Intake', 'Positive Feedback [Delivered before the deadline]': 'P10' },
  };
  expect(await (await post(body)).json()).toMatchObject({ success: true, duplicate: false });
  expect(await (await post(body)).json()).toMatchObject({ success: true, duplicate: true });
  const rows = await query<Record<string, string>[]>('SELECT * FROM leaderboard_feedback WHERE source_ref = ?', [`leaderboard:${responseId}`]);
  expect(rows).toHaveLength(1);
  expect(rows[0].timestamp).toBe('27/10/2026 14:35:07');
  expect(rows[0].positive_feedback_delivered_before_the_deadline).toBe('P10');

  const unknown = await post({ ...body, responseId: `${responseId}-x`, answers: { 'Renamed Question': 'x' } });
  expect(unknown.status()).toBe(422);
});
