import { test, expect, type Page } from '@playwright/test';
import { USERS, login, openPage, query, uniqueMark } from './helpers';
import { INHOUSE_IMPORT } from '../lib/inhouseImport';
import { TOOLS_SHEET_ID, TAB_AI_TOOLS, TAB_HOLIDAY } from '../lib/config';

// Super Admin and HM can edit the entries of Websites, Case Studies, Brand Kit, Documentations, Holiday Calendar and
// AI Tools (a pencil on each entry opens a form); nobody else can, not even by calling the API. The entries are inserted
// straight into the local database and removed again at the end.

const ins = async (table: string, sheetId: string, tab: string, values: Record<string, string>) => {
  const cols = Object.keys(values);
  return (await query<{ insertId: number }>(
    `INSERT INTO ${table} (sheet_id, sheet_tab, ${cols.join(', ')}) VALUES (?, ?, ${cols.map(() => '?').join(', ')})`,
    [sheetId, tab, ...Object.values(values)])).insertId;
};
const cell = async (table: string, id: number, col: string) => (await query<Record<string, string>[]>(`SELECT ${col} AS v FROM ${table} WHERE id = ?`, [id]))[0].v;

async function editEntry(page: Page, name: string, changes: Record<string, string>) {
  // the pencils appear once the Edit button at the top is on (it stays on while moving between the tabs of a page)
  const pencil = page.getByRole('button', { name: `Edit ${name}`, exact: true });
  if ((await pencil.count()) === 0) await page.getByTestId('edit-toggle').click();
  await pencil.click();
  const dialog = page.getByRole('dialog');
  for (const [label, value] of Object.entries(changes)) {
    const field = dialog.getByLabel(label, { exact: false });
    if ((await field.evaluate(e => e.tagName)) === 'SELECT') await field.selectOption(value); else await field.fill(value);
  }
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
}

test('the HM edits a website, a case study, a brand kit item and a document', async ({ page }) => {
  const mark = uniqueMark('InH');
  const w = INHOUSE_IMPORT['websites'], c = INHOUSE_IMPORT['case-studies'], b = INHOUSE_IMPORT['brand-kit'], d = INHOUSE_IMPORT['documentations'];
  const ids = {
    w: await ins('inhouse_websites', w.sheetId, w.tab, { website_name: `${mark} site`, website_link: 'https://old.example.com', platform: 'Wordpress', status: 'Live', industry: 'Retail' }),
    c: await ins('inhouse_case_studies', c.sheetId, c.tab, { website_name: `${mark} case`, website_link: 'https://old.example.com', platform: 'Wordpress', category: 'Web', status: 'Live', url: 'https://old.example.com/case', industry: 'Retail' }),
    b: await ins('inhouse_brand_kit', b.sheetId, b.tab, { name: `${mark} kit`, destination: 'Drive', url: 'https://old.example.com/kit' }),
    d: await ins('inhouse_documentations', d.sheetId, d.tab, { name: `${mark} doc`, destination: 'Drive', url: 'https://old.example.com/doc' }),
  };
  try {
    await login(page, USERS.admin);
    await openPage(page, 'Cybernext InHouse', 'Internal');
    const search = async (text: string) => { await page.getByRole('textbox', { name: /^Search/ }).fill(text); };

    await search(`${mark} site`);
    await editEntry(page, `${mark} site`, { 'Website Name': `${mark} site renamed`, 'Status': 'Not working', 'Website Link': 'new.example.com' });
    await search(`${mark} site renamed`);
    await expect(page.getByRole('heading', { name: `${mark} site renamed` })).toBeVisible();
    expect(await cell('inhouse_websites', ids.w, 'website_name')).toBe(`${mark} site renamed`);
    expect(await cell('inhouse_websites', ids.w, 'status')).toBe('Not working');
    expect(await cell('inhouse_websites', ids.w, 'website_link')).toBe('https://new.example.com');   // a bare domain gets https://

    await page.getByRole('tab', { name: 'Case Studies', exact: true }).click();
    await search(`${mark} case`);
    await editEntry(page, `${mark} case`, { 'Category': 'Marketing', 'URL': 'https://new.example.com/case' });
    expect(await cell('inhouse_case_studies', ids.c, 'category')).toBe('Marketing');

    await page.getByRole('tab', { name: 'Brand Kit', exact: true }).click();
    await search(`${mark} kit`);
    await editEntry(page, `${mark} kit`, { 'Destination': 'Figma' });
    expect(await cell('inhouse_brand_kit', ids.b, 'destination')).toBe('Figma');

    await page.getByRole('tab', { name: 'Documentations', exact: true }).click();
    await search(`${mark} doc`);
    await editEntry(page, `${mark} doc`, { 'Name': `${mark} doc v2` });
    expect(await cell('inhouse_documentations', ids.d, 'name')).toBe(`${mark} doc v2`);

    // every change is in the change log
    const log = await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM change_log WHERE table_name = 'inhouse_websites' AND row_id = ?", [ids.w]);
    expect(Number(log[0].n)).toBeGreaterThanOrEqual(3);
  } finally {
    for (const t of ['inhouse_websites', 'inhouse_case_studies', 'inhouse_brand_kit', 'inhouse_documentations']) {
      await query(`DELETE FROM ${t} WHERE ${t === 'inhouse_websites' || t === 'inhouse_case_studies' ? 'website_name' : 'name'} LIKE ?`, [`${mark}%`]);
    }
  }
});

test('the HM edits an AI tool and a holiday', async ({ page }) => {
  const mark = uniqueMark('InH Tool');
  const year = new Date().getFullYear() + 1;
  const toolId = await ins('ai_tools', TOOLS_SHEET_ID, TAB_AI_TOOLS, { tool_name: mark, short_description: 'old words', price: 'Free', categories: 'Writing', url: 'https://old.example.com', pm_focus: 'No', resource_focus: 'No' });
  const holidayId = await ins('holidays', TOOLS_SHEET_ID, TAB_HOLIDAY, { name: `${mark} day`, date: `15/06/${year}`, day: 'Monday' });
  try {
    await login(page, USERS.admin);
    await openPage(page, 'Cybernext InHouse', 'Tools');
    await page.getByRole('tab', { name: 'AI Tools', exact: true }).click();
    await page.getByPlaceholder(/Search tools/).fill(mark);
    await editEntry(page, mark, { 'Short Description': 'new words', 'Price': 'Premium', 'PM Focus': 'Yes' });
    await expect(page.getByText('new words')).toBeVisible();
    expect(await cell('ai_tools', toolId, 'price')).toBe('Premium');
    expect(await cell('ai_tools', toolId, 'pm_focus')).toBe('Yes');

    await openPage(page, 'Cybernext InHouse', 'Internal');
    await page.getByRole('tab', { name: 'Holiday Calendar', exact: true }).click();
    await editEntry(page, `${mark} day`, { 'Name': `${mark} day renamed`, 'Day': 'Tuesday' });
    await expect(page.getByText(`${mark} day renamed`)).toBeVisible();
    expect(await cell('holidays', holidayId, 'day')).toBe('Tuesday');
  } finally {
    await query('DELETE FROM ai_tools WHERE tool_name = ?', [mark]);
    await query('DELETE FROM holidays WHERE name LIKE ?', [`${mark}%`]);
  }
});

test('the form refuses bad input, and only Super Admin and HM can edit', async ({ page, browser }) => {
  const mark = uniqueMark('InH Guard');
  const b = INHOUSE_IMPORT['brand-kit'];
  const id = await ins('inhouse_brand_kit', b.sheetId, b.tab, { name: mark, destination: 'Drive', url: 'https://old.example.com' });
  try {
    await login(page, USERS.admin);
    const post = (p: Page, values: Record<string, string>) => p.request.post('/api/inhouse/edit', { data: { kind: 'brand-kit', row: id, values }, headers: { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' } });
    // a link that is not a web address, and an empty name, are refused
    const bad = await post(page, { Name: mark, URL: 'javascript:alert(1)' });
    expect(bad.status()).toBe(422);
    expect((await bad.json()).errors.URL).toBeTruthy();
    expect((await post(page, { Name: '   ' })).status()).toBe(422);
    expect(await cell('inhouse_brand_kit', id, 'url')).toBe('https://old.example.com');
    // a team member has no edit buttons and the API says no
    const member = await (await browser.newContext()).newPage();
    await login(member, USERS.team);
    await openPage(member, 'Cybernext InHouse', 'Internal');
    await expect(member.getByTestId('edit-toggle')).toHaveCount(0);
    await expect(member.getByTestId('edit-entry')).toHaveCount(0);
    expect((await post(member, { Name: 'hacked' })).status()).toBe(403);
    expect(await cell('inhouse_brand_kit', id, 'name')).toBe(mark);
    await member.context().close();
  } finally {
    await query('DELETE FROM inhouse_brand_kit WHERE name LIKE ?', [`${mark}%`]);
  }
});

test('the pencils only show while the Edit button at the top is on', async ({ page }) => {
  await login(page, USERS.admin);
  await openPage(page, 'Cybernext InHouse', 'Internal');
  await expect(page.getByTestId('edit-toggle')).toBeVisible();
  await expect(page.getByTestId('edit-entry').first()).toHaveCount(0);        // off: no pencils
  await page.getByTestId('edit-toggle').click();
  await expect(page.getByTestId('edit-toggle')).toHaveText('Done');
  await expect(page.getByTestId('edit-entry').first()).toBeVisible();          // on: a pencil on each card
  await page.getByTestId('edit-toggle').click();
  await expect(page.getByTestId('edit-entry')).toHaveCount(0);
});

test('the HM deletes an entry after confirming; a team member cannot', async ({ page, browser }) => {
  const mark = uniqueMark('InH Del');
  const b = INHOUSE_IMPORT['brand-kit'];
  const keep = await ins('inhouse_brand_kit', b.sheetId, b.tab, { name: `${mark} keep`, destination: 'Drive', url: 'https://example.com/keep' });
  const gone = await ins('inhouse_brand_kit', b.sheetId, b.tab, { name: `${mark} gone`, destination: 'Drive', url: 'https://example.com/gone' });
  const count = async (id: number) => Number((await query<{ n: number }[]>('SELECT COUNT(*) AS n FROM inhouse_brand_kit WHERE id = ?', [id]))[0].n);
  try {
    await login(page, USERS.admin);
    await openPage(page, 'Cybernext InHouse', 'Internal');
    await page.getByRole('tab', { name: 'Brand Kit', exact: true }).click();
    await page.getByRole('textbox', { name: /^Search/ }).fill(mark);
    await page.getByTestId('edit-toggle').click();

    // asked first: cancelling deletes nothing
    await page.getByRole('button', { name: `Delete ${mark} gone`, exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText(`${mark} gone`);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await count(gone)).toBe(1);

    // confirmed: it goes, the other stays, and what it held is kept in the change log
    await page.getByRole('button', { name: `Delete ${mark} gone`, exact: true }).click();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { name: `${mark} gone` })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: `${mark} keep` })).toBeVisible();
    expect(await count(gone)).toBe(0);
    expect(await count(keep)).toBe(1);
    const log = await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM change_log WHERE table_name = 'inhouse_brand_kit' AND row_id = ? AND column_name = 'Row deleted'", [gone]);
    expect(Number(log[0].n)).toBe(1);

    // a team member: no buttons, and the API says no
    const member = await (await browser.newContext()).newPage();
    await login(member, USERS.team);
    await openPage(member, 'Cybernext InHouse', 'Internal');
    await expect(member.getByTestId('delete-entry')).toHaveCount(0);
    const res = await member.request.post('/api/inhouse/edit', { data: { kind: 'brand-kit', action: 'delete', row: keep }, headers: { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' } });
    expect(res.status()).toBe(403);
    expect(await count(keep)).toBe(1);
    await member.context().close();
  } finally {
    await query('DELETE FROM inhouse_brand_kit WHERE name LIKE ?', [`${mark}%`]);
  }
});

test('Export Excel downloads every entry of each list', async ({ page, browser }) => {
  await login(page, USERS.admin);
  const download = async () => {
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-excel').click()]);
    return file;
  };
  await openPage(page, 'Cybernext InHouse', 'Internal');
  for (const [tab, name] of [['Websites', 'websites'], ['Case Studies', 'case-studies'], ['Brand Kit', 'brand-kit'], ['Documentations', 'documentations'], ['Holiday Calendar', 'holidays']] as const) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    const file = await download();
    expect(file.suggestedFilename(), tab).toMatch(new RegExp(String.raw`^cybernext-${name}-\d{4}-\d{2}-\d{2}\.xlsx$`));
  }
  await openPage(page, 'Cybernext InHouse', 'Tools');
  await page.getByRole('tab', { name: 'AI Tools', exact: true }).click();
  expect((await download()).suggestedFilename()).toMatch(/^cybernext-ai-tools-\d{4}-\d{2}-\d{2}\.xlsx$/);

  // a team member has no export button
  const member = await (await browser.newContext()).newPage();
  await login(member, USERS.team);
  await openPage(member, 'Cybernext InHouse', 'Internal');
  await expect(member.getByTestId('export-excel')).toHaveCount(0);
  await member.context().close();
});
