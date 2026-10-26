# MySQL migration

The dashboard can store its data in **MySQL** instead of Google Sheets. Everything the dashboard does stays the same: the same screens, filters, edits, reports and logins. Only where the data lives changes.

A single setting chooses the data source:

```env
DATA_SOURCE=sheets   # default — Google Sheets, exactly as before
DATA_SOURCE=mysql    # MySQL tables
```

This means the MySQL code can be deployed to the live site while the site keeps using Google Sheets. The site switches only when `DATA_SOURCE` is changed, and switching it back is the rollback.

Contents:

1. [How it works](#how-it-works)
2. [Tables](#tables)
3. [Settings](#settings)
4. [Local setup and verification](#local-setup-and-verification)
5. [Google Forms](#google-forms)
6. [Going live on Cloudways](#going-live-on-cloudways)
7. [After the switch: day-to-day tasks](#after-the-switch-day-to-day-tasks)
8. [Differences from Google Sheets](#differences-from-google-sheets)

---

## How it works

Every API route reads and writes through `lib/googleSheets.ts`. Its functions keep their original names and arguments, a spreadsheet id plus a tab or range, and send each call to the selected source:

| File | Role |
|---|---|
| `lib/googleSheets.ts` | Chooses the source from `DATA_SOURCE`; used by every route |
| `lib/data/sheets.ts` | Google Sheets source (the original code, moved) |
| `lib/data/mysql.ts` | MySQL source: reads, cell updates, form inserts, table creation |
| `lib/data/datasets.ts` | **Registry**: which spreadsheet tab maps to which table, and its columns in sheet order |
| `lib/data/rows.ts` | Row conversion shared by both sources, so both return identical data |
| `lib/sheetAccess.ts` | Allowlist: which sheets the generic `/api/data` and `/api/update-status` routes may read and write |
| `app/api/intake/route.ts` | Receives Google Forms responses and stores them in MySQL |
| `scripts/db/*.ts` | Commands: create tables, import, verify, set passwords |

The spreadsheet ids in `lib/config.ts` are still used in MySQL mode, as names for each dataset. Each row remembers which spreadsheet and tab it came from (`sheet_id`, `sheet_tab`). That keeps the "current month" and "archive" split, and lets edits go back to the right place, without any change to the screens.

Each row carries a **write-back handle** (`__row`): the sheet row number in Sheets mode, and the row's permanent id in MySQL mode. Edits send that handle back. In MySQL mode an edit only applies if the id, spreadsheet and tab all match, so sorting or inserting rows can no longer make an edit land on the wrong row.

## Tables

`npm run db:migrate` creates these tables from the registry:

| Table | Google Sheets source | Rows at import (26 Oct 2026) |
|---|---|---|
| `web_tasks` | Web Team Sheet: *Current Month Tasks* and *All Web Tasks Tab* (and any future archive tab) | 1,549 |
| `leaderboard_feedback` | Web Team Sheet: *Leaderboard* | 2 |
| `qa_tasks` | Web Team Sheet: *QATesting* | 48 |
| `marketing_tasks` | Marketing Team: *Current Month Tasks* and *All Marketing Tasks* | 40 |
| `pm_projects` | PM Sheet Bandwidth: *CurrentMonth*, and PM Sheet Bandwidth All Data: *All Data PM* | 112 |
| `users` | UserDetails: *UserDetails* (bcrypt password hashes only) | 26 |
| `leave_status` | Leave Status: *UserDetails* | 24 |
| `news`, `ai_tools`, `holidays` | Dashboard Tools | 10, 54, 12 |
| `inhouse_case_studies`, `inhouse_websites`, `inhouse_brand_kit`, `inhouse_documentations` | Cybernext InHouse | 23, 103, 7, 2 |
| `change_log` | New: one row per edit (who, when, table, row, column, old and new value) | n/a |

Every table also has:
- `id`: permanent row id
- `sheet_id` and `sheet_tab`: where the row came from
- `source_ref`: the Google Forms response id, for rows that came from a form
- `created_at` and `updated_at`

**Data columns are stored as text, exactly as Google Sheets displayed them.** The sheets mix date formats (`26/10/2026`, `10/26/2026`, `5/9/2026`) and store hours as text like `12.50 hrs`. The screens parse those strings today, so storing the identical text keeps every screen, filter and report working unchanged. Converting columns to real `DATE` and number types can be a later improvement, done one column at a time.

**Not migrated:** the `Sheet2` and `Sheet3` tabs in UserDetails and Leave Status. `Sheet2` holds plain-text passwords. Delete those tabs from Google Sheets as well.

To add a column, add its header to the right dataset in `lib/data/datasets.ts`, then run `npm run db:migrate`. That adds the column and never drops anything.

## Settings

All settings go in `.env.local`, locally and on the server:

```env
DATA_SOURCE=mysql              # or sheets (default)

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=...
MYSQL_PASSWORD=...
MYSQL_DATABASE=...

INTAKE_SECRET=...              # long random string; the Google Forms script sends it
FORM_TIMEZONE=Asia/Kolkata     # timezone used to format form timestamps

# Still needed: the import reads Google Sheets, and DATA_SOURCE=sheets uses them
GOOGLE_CLIENT_EMAIL=...
GOOGLE_PRIVATE_KEY=...
SESSION_SECRET=...
```

To generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Local setup and verification

Any MySQL 5.7+ or MariaDB 10.3+ works. WAMP includes both: **MySQL 8.3 on port 3306** and MariaDB 11.3 on port 3307.

1. In phpMyAdmin (http://localhost/phpmyadmin), create an empty database, for example `clickway_db`, with collation `utf8mb4_unicode_ci`. You don't need to create any tables; step 3 does that.

2. Add the settings to `.env.local`. For WAMP's MySQL with its default passwordless `root` user:

   ```env
   DATA_SOURCE=mysql
   MYSQL_HOST=127.0.0.1
   MYSQL_PORT=3306
   MYSQL_USER=root
   MYSQL_PASSWORD=
   MYSQL_DATABASE=clickway_db
   ```

   Don't leave spaces after a value: `clickway_db ` with a trailing space is a different name. Passwordless `root` is fine on your own PC only. The server uses the Cloudways database user.

3. Create the tables, copy the data and compare:

   ```bash
   npm run db:migrate            # create tables
   npm run db:import -- --yes    # copy all tabs from Google Sheets
   npm run db:verify             # compare MySQL against Google Sheets, tab by tab
   ```

   `db:verify` must end with **"All tabs match."** It checks the tab lists, headers, row counts and every cell value, as the dashboard's data layer returns them. If something differs, it prints the location, never the values.

4. Set `DATA_SOURCE=mysql` in `.env.local`, then run `npm run dev`. The dev server picks up `.env.local` changes on its own.

5. Click through the checklist below.

> **Google's read limit:** the service account may make about 60 Sheets reads per minute, and that allowance is **shared with the live site**. `db:import` and `db:verify` each use about 35. Leave a minute between them. If you see "Quota exceeded", wait a minute and run the command again.

> **`db:import` empties the tables and reloads them from Google Sheets.** That's what you want while testing and at cutover. Run after cutover, it would wipe every edit made in the dashboard since then. That's why it needs `--yes`.

### Verification done on 26 Oct 2026 (localhost, WAMP MariaDB 11.3.2)

| Check | Result |
|---|---|
| `db:import`: 17 tabs into 14 tables | 2,012 rows imported |
| `db:verify`: MySQL against Google Sheets, every tab | All 17 tabs match |
| Every API route, as admin (HM) and team member (WebTeam), Sheets mode against MySQL mode | Identical, apart from 5 empty "Column 20–24" columns (see [Differences](#differences-from-google-sheets)) |
| Inline edits (web current and archive, marketing, PM current and archive, QA, leave): edit, check, revert | Only the target row changes; every edit is in `change_log` with the editor's username |
| Edit with a mismatched tab, unknown column, users table, old password tab | Refused (404 / 400 / 403 / 403) |
| Admin Portal display-name edit | Works and reverts |
| Login from the MySQL `users` table | Right password 200, wrong password 401 |
| Form intake (web, marketing, PM, leaderboard) | Stored in each sheet's own date format; a resent response isn't duplicated; an unknown question is refused |
| `npm run build`, then `next start` in MySQL mode | Builds; routes serve MySQL data |
| Typecheck, and lint of the new files | Clean |

### Manual checklist (in the browser, with `DATA_SOURCE=mysql`)

- [ ] Log in as an admin, as a PM and as a team member (your normal passwords work, because the hashes were imported).
- [ ] Bandwidth / Tasks Overview, Team Bandwidth, Employee Gallery: same counts as the live site.
- [ ] Change a task status, bucket and PM status, then refresh: the change persists.
- [ ] PM Projects: Year and Month filters reach archive months; My Projects popup edit saves.
- [ ] Marketing team: edit a status, refresh.
- [ ] QA Testing, Leave Status: edit, refresh.
- [ ] Leaderboard, News ticker, Holiday calendar, AI Tools, InHouse (admin and PM).
- [ ] Admin Portal: change a role, refresh.
- [ ] Reports: download a PDF and an Excel file; compare with the live site.

## Google Forms

Google Forms keep working. Each form gets a small Apps Script that sends every new response to the dashboard's `/api/intake` endpoint, which stores it in MySQL. The response is stored exactly as the form's linked sheet would have shown it: same columns, the sheet's own timestamp and date format, checkbox answers joined with `, `, and grid questions as `Question [Row]`.

| Form | `FORM_KEY` | Stored in |
|---|---|---|
| Web team task form | `web-task` | `web_tasks`, tab *Current Month Tasks* |
| Marketing task form | `marketing-task` | `marketing_tasks`, tab *Current Month Tasks* |
| PM "Add New Project" form | `pm-project` | `pm_projects`, tab *CurrentMonth* |
| Leaderboard feedback form | `leaderboard` | `leaderboard_feedback` |

Safety:
- The endpoint requires `INTAKE_SECRET`.
- It only accepts responses while `DATA_SOURCE=mysql` (409 otherwise).
- It **refuses** a response containing a question with no matching column, rather than dropping that answer. A renamed form question therefore shows up as a failed script run, which Google emails to the script owner. The response stays in the form, and can be resent after the column is added to `lib/data/datasets.ts` and `npm run db:migrate` has run.
- A response id is stored once. Resending the same response is reported as a duplicate and not stored again.

### Install on each form (once per form)

1. Open the form in edit mode, then **⋮ → Apps Script**.
2. Replace the contents of `Code.gs` with the script below, and set `FORM_KEY` for this form.
3. Go to **Project Settings → Script properties** and add:
   - `INTAKE_ENDPOINT`: `https://<your-domain>/api/intake`
   - `INTAKE_SECRET`: the same value as the server's `INTAKE_SECRET`
4. **Don't add the trigger yet.** That happens during the cutover steps below.

```js
// Sends each new response to the dashboard (docs/mysql-migration.md).
const FORM_KEY = 'web-task'; // web-task | marketing-task | pm-project | leaderboard

function onFormSubmit(e) {
  send_(e.response);
}

// Re-sends responses submitted after a given time — e.g. ones that failed
// while a question was being renamed. Already-stored responses are skipped.
// Example: resendSince('2026-11-01T10:00:00+05:30')
function resendSince(isoTime) {
  const since = new Date(isoTime);
  FormApp.getActiveForm().getResponses(since).forEach(send_);
}

function send_(response) {
  const props = PropertiesService.getScriptProperties();
  const answers = {};
  response.getItemResponses().forEach(function (ir) {
    const item = ir.getItem();
    const title = item.getTitle().trim();
    const value = ir.getResponse();
    const type = item.getType();
    if (type === FormApp.ItemType.GRID || type === FormApp.ItemType.CHECKBOX_GRID) {
      const rows = type === FormApp.ItemType.GRID ? item.asGridItem().getRows() : item.asCheckboxGridItem().getRows();
      rows.forEach(function (row, i) {
        const v = value ? value[i] : '';
        answers[title + ' [' + row + ']'] = Array.isArray(v) ? v.join(', ') : (v || '');
      });
    } else {
      answers[title] = Array.isArray(value) ? value.join(', ') : String(value);
    }
  });
  const res = UrlFetchApp.fetch(props.getProperty('INTAKE_ENDPOINT'), {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + props.getProperty('INTAKE_SECRET') },
    payload: JSON.stringify({
      form: FORM_KEY,
      responseId: response.getId(),
      submittedAt: response.getTimestamp().toISOString(),
      email: response.getRespondentEmail(),
      answers: answers,
    }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Dashboard did not store response ' + response.getId() + ': ' + res.getContentText());
  }
}
```

## Going live on Cloudways

### A. Prepare (no impact on users)

1. **Check the database version** over SSH: `mysql --version`. It needs MySQL 5.7+ or MariaDB 10.3+.
2. **Get the database credentials** from Cloudways: **Application → Access Details → Database**. Note the DB name, username and password. On this app the name and user are `nhnrkfejab`.
3. **Add the settings** to the server's `.env.local`. **Keep `DATA_SOURCE=sheets` for now.**

   ```bash
   cd ~/applications/nhnrkfejab/private_html/dashboard
   nano .env.local
   ```

   ```env
   DATA_SOURCE=sheets
   MYSQL_HOST=localhost
   MYSQL_PORT=3306
   MYSQL_USER=nhnrkfejab
   MYSQL_PASSWORD=<from Access Details>
   MYSQL_DATABASE=nhnrkfejab
   INTAKE_SECRET=<new random string — not the local one>
   FORM_TIMEZONE=Asia/Kolkata
   ```

4. **Deploy the code**: merge to `main`, and GitHub Actions deploys it. The site keeps reading Google Sheets.
5. **Create the tables and do a trial import** over SSH:

   ```bash
   cd ~/applications/nhnrkfejab/private_html/dashboard
   npm run db:migrate
   npm run db:import -- --yes
   sleep 60
   npm run db:verify          # must say "All tabs match."
   ```

6. **Install the Apps Script** on each form (see [Google Forms](#google-forms)), without the trigger.

### B. Switch (pick a quiet time, about 10 minutes)

1. In each Google Form, turn **off** *Accepting responses*, so nothing new arrives in Sheets during the switch.
2. Ask the team not to edit in the dashboard for a few minutes.
3. Load the latest data and verify it, waiting a minute in between for Google's read limit:

   ```bash
   npm run db:import -- --yes
   sleep 60
   npm run db:verify          # must say "All tabs match."
   ```

4. Switch the source and restart:

   ```bash
   sed -i 's/^DATA_SOURCE=.*/DATA_SOURCE=mysql/' .env.local
   pm2 restart dashboard
   ```

5. In each form's Apps Script, go to **Triggers → Add trigger**: function `onFormSubmit`, event source *From form*, event type *On form submit*.
6. Turn *Accepting responses* back **on**. Submit one test response per form, check it appears in the dashboard, then delete the test row in phpMyAdmin.
7. Run through the manual checklist on the live site.
8. Make the Google Sheets **view-only** for everyone. They're now a snapshot from cutover time.

### Rollback

Set `DATA_SOURCE=sheets` in `.env.local`, then run `pm2 restart dashboard`, and remove the form triggers. Edits and form responses made while on MySQL are **not** in Google Sheets. Re-enter them, or export them from the `change_log` and data tables.

### Deploys after the switch

Nothing changes: merge to `main`, and the existing GitHub Actions workflow deploys. If a deploy adds a column to `lib/data/datasets.ts`, run `npm run db:migrate` on the server afterwards.

## After the switch: day-to-day tasks

With Google Sheets gone, these tasks move to MySQL. Use **Cloudways → Application → Access Details → Launch Database Manager** (phpMyAdmin) for table edits.

| Task | Before | Now |
|---|---|---|
| Add a news item, AI tool, holiday or InHouse entry | Type a row in the sheet | Insert a row into `news`, `ai_tools`, `holidays` or `inhouse_*` in phpMyAdmin. Fill the data columns, and copy `sheet_id` and `sheet_tab` from an existing row. |
| Add a user | Add a row with a bcrypt hash | `npm run db:set-password -- <username> --create --role <Role> --name "<Name>" --email <email>` |
| Reset a password | Edit the hash | `npm run db:set-password -- <username>` (asks for the new password twice, hidden) |
| Change role or display name | Sheet or Admin Portal | Admin Portal (unchanged) |
| Monthly move to archive | Cut and paste rows between tabs | SQL in phpMyAdmin, below |
| See who changed what | Sheet version history | `SELECT * FROM change_log ORDER BY id DESC LIMIT 100;` |
| Backups | Google Drive history | Cloudways **Backup and Restore** (includes the database); set a daily schedule |

Monthly archive, with example month values shown in sheet format. Run the `SELECT` first to check what will move:

```sql
-- Web tasks: move rows from Current Month Tasks to All Web Tasks Tab
SELECT COUNT(*) FROM web_tasks WHERE sheet_tab = 'Current Month Tasks' AND `timestamp` LIKE '%/09/2026%';
UPDATE web_tasks SET sheet_tab = 'All Web Tasks Tab'
 WHERE sheet_tab = 'Current Month Tasks' AND `timestamp` LIKE '%/09/2026%';

-- Marketing: Current Month Tasks → All Marketing Tasks (US-style dates: 9/…/2026)
UPDATE marketing_tasks SET sheet_tab = 'All Marketing Tasks'
 WHERE sheet_tab = 'Current Month Tasks' AND `timestamp` LIKE '9/%/2026%';

-- PM projects: current month → All Data (different "spreadsheet" and tab)
UPDATE pm_projects SET sheet_id = '1QjLPmyVrzWpWIYoKKSsntwYAYFNGDRUyowvz9N8U25s', sheet_tab = 'All Data PM'
 WHERE sheet_tab = 'CurrentMonth' AND `month` = 'September' AND `year` = '2026';
```

## Differences from Google Sheets

- **Empty "Column 20–24" headers** on Web *Current Month Tasks* aren't stored. They held no data, and the task table already hid them. Exports that listed every column no longer include these five empty columns.
- **Range limits are ignored in MySQL mode.** A request for `'Tab'!A1:Z10000` returns the whole dataset. All current ranges already cover all rows and columns.
- **No 60-second cache.** MySQL reads are fast, so every refresh shows the latest data, including other people's edits.
- **Editing in Google Sheets has no effect** once `DATA_SOURCE=mysql`. Make the sheets view-only, so nobody edits the wrong place.
- **Security** (both modes): `/api/data` and `/api/update-status` now only serve the sheets the dashboard itself uses. Previously any logged-in user could read the `Sheet2` plain-text password tabs through them.
