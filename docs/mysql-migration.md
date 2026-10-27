# MySQL data store

The dashboard stores all of its data in **MySQL**. Google Sheets is no longer connected. The data was copied from the 8 Google spreadsheets once, and Google Forms responses go straight into MySQL. Everything the dashboard does stays the same: the same screens, filters, edits, reports and logins.

Contents:

1. [How it works](#how-it-works)
2. [Tables](#tables)
3. [Settings](#settings)
4. [Local setup and verification](#local-setup-and-verification)
5. [Entry forms](#entry-forms)
6. [Going live on Cloudways](#going-live-on-cloudways)
7. [Day-to-day tasks](#day-to-day-tasks)
8. [Differences from Google Sheets](#differences-from-google-sheets)

---

## How it works

Every API route reads and writes through `lib/dataStore.ts`. Its functions keep the arguments the app was built around, a dataset key plus a tab or range, so the screens didn't need to change.

| File | Role |
|---|---|
| `lib/dataStore.ts` | The data store used by every route (MySQL) |
| `lib/data/mysql.ts` | MySQL access: reads, cell updates, form inserts, table creation |
| `lib/data/datasets.ts` | **Registry**: which dataset/tab maps to which table, and its columns in order |
| `lib/data/rows.ts` | Row conversion: numeric text becomes numbers, exactly as the screens expect |
| `lib/sheetAccess.ts` | Allowlist: which datasets the generic `/api/data` and `/api/update-status` routes may read and write |
| `app/api/intake/route.ts` | Receives Google Forms responses and stores them in MySQL |
| `scripts/db/*.ts` | Commands: create tables, import, verify, set passwords |
| `scripts/db/googleSheets.ts` | **Read-only** Google Sheets access, used only by the one-time `db:import` / `db:verify` |
| `vercel.json` | Sends visitors of the old Vercel deployment to the Cloudways site |

The spreadsheet ids in `lib/config.ts` are still used, as names for each dataset. Each row remembers which spreadsheet and tab it came from (`sheet_id`, `sheet_tab`). That keeps the "current month" and "archive" split, and lets edits go back to the right place.

Each row carries a **write-back handle** (`__row`), which is its permanent MySQL id. Edits send that handle back, and an edit only applies if the id, dataset and tab all match. Sorting or inserting rows can never make an edit land on the wrong row.

The app has no Google code at all: `googleapis` is a development-only package, used by the import scripts. The app needs no Google credentials to run.

## Tables

`npm run db:migrate` creates these tables from the registry:

| Table | Copied from (Google Sheets) | Rows at import (27 Oct 2026) |
|---|---|---|
| `web_tasks` | Web Team Sheet: *Current Month Tasks* and *All Web Tasks Tab* | 1,549 |
| `leaderboard_feedback` | Web Team Sheet: *Leaderboard* | 2 |
| `qa_tasks` | Web Team Sheet: *QATesting* | 48 |
| `marketing_tasks` | Marketing Team: *Current Month Tasks* and *All Marketing Tasks* | 40 |
| `pm_projects` | PM Sheet Bandwidth: *CurrentMonth*, and PM Sheet Bandwidth All Data: *All Data PM* | 112 |
| `users` | UserDetails: *UserDetails* (bcrypt password hashes only) | 26 |
| `leave_status` | Leave Status: *UserDetails* | 24 |
| `news`, `ai_tools`, `holidays` | Dashboard Tools | 10, 54, 12 |
| `inhouse_case_studies`, `inhouse_websites`, `inhouse_brand_kit`, `inhouse_documentations` | Cybernext InHouse | 23, 117, 7, 2 |
| `change_log` | New: one row per edit (who, when, table, row, column, old and new value) | n/a |

Every table also has:
- `id`: permanent row id
- `sheet_id` and `sheet_tab`: the dataset and tab the row belongs to
- `source_ref`: the Google Forms response id, for rows that came from a form
- `created_at` and `updated_at`

**Data columns are stored as text, exactly as Google Sheets displayed them.** The sheets mix date formats (`26/10/2026`, `10/26/2026`, `5/9/2026`) and store hours as text like `12.50 hrs`. The screens parse those strings, so storing the identical text keeps every screen, filter and report working unchanged. Converting columns to real `DATE` and number types can be a later improvement, done one column at a time.

**Not migrated:** the `Sheet2` and `Sheet3` tabs in UserDetails and Leave Status. `Sheet2` holds plain-text passwords. Delete those tabs from Google Sheets.

To add a column, add its header to the right dataset in `lib/data/datasets.ts`, then run `npm run db:migrate`. That adds the column and never drops anything.

## Settings

All settings go in `.env.local`, locally and on the server.

The app needs:

```env
SESSION_SECRET=...

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=...
MYSQL_PASSWORD=...
MYSQL_DATABASE=...

INTAKE_SECRET=...              # long random string; the Google Forms script sends it
FORM_TIMEZONE=Asia/Kolkata     # timezone used to format form timestamps
```

The one-time import only (`db:import` / `db:verify`) also needs:

```env
GOOGLE_CLIENT_EMAIL=...
GOOGLE_PRIVATE_KEY=...
```

Once the final import is done, these two can be removed. `DATA_SOURCE` and `GOOGLE_SHEET_ID_2` are no longer read, so they can be removed too.

To generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Local setup and verification

Any MySQL 5.7+ or MariaDB 10.3+ works. WAMP includes both: **MySQL 8.3 on port 3306** and MariaDB 11.3 on port 3307. The WAMP database service must be running; check that the WAMP tray icon is green.

1. In phpMyAdmin (http://localhost/phpmyadmin), create an empty database, for example `clickway_db`, with collation `utf8mb4_unicode_ci`. You don't need to create any tables; step 3 does that.

2. Add the settings to `.env.local`. For WAMP's MySQL with its default passwordless `root` user:

   ```env
   MYSQL_HOST=127.0.0.1
   MYSQL_PORT=3306
   MYSQL_USER=root
   MYSQL_PASSWORD=
   MYSQL_DATABASE=clickway_db
   ```

   Don't leave spaces after a value: `clickway_db ` with a trailing space is a different name. Passwordless `root` is fine on your own PC only. The server uses the Cloudways database user.

3. Create the tables and copy the data. This needs the two `GOOGLE_*` settings:

   ```bash
   npm run db:migrate            # create tables
   npm run db:import -- --yes    # copy all tabs from Google Sheets
   # wait about a minute (Google's read limit)
   npm run db:verify             # compare MySQL against Google Sheets, tab by tab
   ```

   `db:verify` must end with **"All tabs match."** It checks the tab lists, headers, row counts and every cell value. If something differs, it prints the location, never the values. If someone is editing a sheet while you run it, that tab can differ by the rows they just added; run both commands again once they're done.

4. Run `npm run dev` and open http://localhost:3000.

> **Google's read limit:** the service account may make about 60 Sheets reads per minute, and while the live site still runs the old code, that allowance is **shared with it**. `db:import` and `db:verify` each use about 35. Leave a minute between them. If you see "Quota exceeded", wait a minute and run the command again.

> **`db:import` empties the tables and reloads them from Google Sheets.** That's what you want before the switch. Run after the switch, it would wipe every edit and form response stored since then. That's why it needs `--yes`.

### Verification done on 27 Oct 2026 (localhost)

| Check | Result |
|---|---|
| `db:import` and `db:verify` (MySQL 8.3 locally; MariaDB on Cloudways) | All 17 tabs match |
| Every read route as admin (HM) and team member (WebTeam): row counts against the MySQL tables | All match; InHouse and Admin Portal correctly refused to team members |
| Inline edits (web current and archive, marketing, PM current and archive, QA, leave): edit, check, revert | Only the target row changes; every edit is in `change_log` with the editor's username |
| Edit with a mismatched tab, unknown column, users table, old password tab; data without login | Refused (404 / 400 / 403 / 403 / 401) |
| Admin Portal display-name edit | Works and reverts |
| Login from the MySQL `users` table | Right password 200, wrong password 401 |
| Form intake (web, marketing, PM, leaderboard) | Stored in each sheet's own date format; a resent response isn't duplicated; an unknown question is refused |
| `npm run build`, then `next start` **with the Google credentials removed**, running all of the above | All 45 checks pass; no Google code in the build output |
| Typecheck, and lint of the new files | Clean |

### Automated browser tests (Playwright)

`npm run test:e2e` runs 21 browser tests against the local dashboard and database: login, every page for each role, all three entry forms, assigning and editing tasks, Leave Status, the Admin Portal, and the server's access rules. They clean up after themselves. See [e2e/README.md](../e2e/README.md). Run them before every deploy.

### Manual checklist (in the browser)

- [ ] Log in as an admin, as a PM and as a team member (your normal passwords work, because the hashes were imported).
- [ ] Bandwidth / Tasks Overview, Team Bandwidth, Employee Gallery: same counts as before.
- [ ] Change a task status, bucket and PM status, then refresh: the change persists.
- [ ] PM Projects: Year and Month filters reach archive months; My Projects popup edit saves.
- [ ] Marketing team: edit a status, refresh.
- [ ] QA Testing, Leave Status: edit, refresh.
- [ ] Leaderboard, News ticker, Holiday calendar, AI Tools, InHouse (admin and PM).
- [ ] Admin Portal: change a role, refresh.
- [ ] Reports: download a PDF and an Excel file.

## Entry forms

### Dashboard forms (replace the Google Forms)

"Add Task" (Web and Marketing) and "Add New Project" are the dashboard's own forms. They save straight to MySQL through `/api/forms`, under the logged-in user's email. The questions, options, "Other" choices and required flags were copied from the Google Forms (`lib/forms.ts`). Each answer is stored in the column, and the date format, the Google Form's linked sheet used, so every screen reads the rows exactly as before.

| Form | Who can use it | Stored in |
|---|---|---|
| Web "Add Task" | Users whose menu has Web → Add Task | `web_tasks`, tab *Current Month Tasks* |
| Marketing "Add Task" | Users whose menu has Marketing → Add Task | `marketing_tasks`, tab *Current Month Tasks* |
| "Add New Project" (PM Projects) | PMs | `pm_projects`, tab *CurrentMonth* |

The server checks the same permissions as the menu, rejects missing required answers and values outside a dropdown's options, and stores a submission once even if the button is clicked twice.

**New tasks and assigning them.** With Google Sheets, someone filled in a new task's Assigned Person, status and buckets by hand in the sheet. Now:
- A new web or marketing task starts with Task Status, Daily Bucket, PM Status and Today Bucket Set set to **"No Action Taken"**, so it passes Tasks Assigned's default filters and shows up straight away.
- **Web → Tasks Assigned also lists unassigned tasks.** Admins, PMs and team admins click **Edit Task**, then **Assign…** in the Assigned Person column, and pick a name. The Web team list is always offered. Marketing tasks are assigned in the form itself, as before.

**To change a form's questions or options** (for example, a new project name), edit that form in `lib/forms.ts`. The question title must stay equal to the table column's header. A new question needs its column added in `lib/data/datasets.ts`, then `npm run db:migrate`.

Once these forms are live, the three Google Forms below (web, marketing, PM) are no longer used and can be deleted.

### Google Forms still in use: Leaderboard feedback

The Leaderboard feedback form has no dashboard version yet. Until it does, it sends responses to MySQL through a small Apps Script that posts to `/api/intake`. The script also works for the other three forms while they're still in use. The response is stored exactly as the form's linked sheet would have shown it: same columns, the sheet's own timestamp and date format, checkbox answers joined with `, `, and grid questions as `Question [Row]`.

| Form | Form ID | `FORM_KEY` | Stored in |
|---|---|---|---|
| Leaderboard feedback | not linked in the code: open the Web Team Sheet → **Form → Go to live form** | `leaderboard` | `leaderboard_feedback` |
| Web team "Add task" (being replaced) | `1FAIpQLSfBDYMZ6trWVeDVRhqz2AGUpcAfzlItvHTQLhUu8Ooly9h7YA` | `web-task` | `web_tasks`, tab *Current Month Tasks* |
| Marketing "Add task" (being replaced) | `1FAIpQLSdja_uZyhdM9hBSyjQjQ_ZB0ahKzF3JwRdXIAEofxM9RTnFeA` | `marketing-task` | `marketing_tasks`, tab *Current Month Tasks* |
| PM "Add New Project" (being replaced) | `1FAIpQLSfPmN8478aHnHljROGhnmgwg5PoEcCozIWi0jHir5Lyp99xKQ` | `pm-project` | `pm_projects`, tab *CurrentMonth* |

Safety:
- The endpoint requires `INTAKE_SECRET`.
- It **refuses** a response containing a question with no matching column, rather than dropping that answer. A renamed form question therefore shows up as a failed script run, which Google emails to the script owner. The response stays in the form, and can be resent after the column is added to `lib/data/datasets.ts` and `npm run db:migrate` has run.
- A response id is stored once. Resending the same response is reported as a duplicate and not stored again.
- The forms may stay linked to their spreadsheets. The dashboard doesn't read them, so the linked sheet just keeps a spare copy of the responses.

### Install on each form (once per form)

1. Open the form in edit mode, then **⋮ → Apps Script**.
2. Replace the contents of `Code.gs` with the script below, and set `FORM_KEY` for this form.
3. Go to **Project Settings → Script properties** and add:
   - `INTAKE_ENDPOINT`: `https://phpstack-994179-6749812.cloudwaysapps.com/api/intake` (or your custom domain)
   - `INTAKE_SECRET`: the same value as the server's `INTAKE_SECRET`
4. **Don't add the trigger yet.** That happens during the switch, below.

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

Already done on the server: `MYSQL_*` settings, `db:migrate` and a trial import.

1. Check that the server's `.env.local` has a non-empty `INTAKE_SECRET`, and keep `GOOGLE_PRIVATE_KEY` there until step B.2 is done.
2. Install the Apps Script on all 4 forms (see [Google Forms still in use](#google-forms-still-in-use-leaderboard-feedback)), without the trigger.

### B. Switch (pick a quiet time, about 15 minutes)

1. In each Google Form, turn **off** *Accepting responses*. Ask the team to stop editing in the dashboard.
2. Load the latest data and verify it, over SSH:

   ```bash
   cd ~/applications/nhnrkfejab/private_html/dashboard
   npm run db:import -- --yes
   sleep 60
   npm run db:verify          # must say "All tabs match."
   ```

3. **Merge the "Disconnect Google Sheets" pull request into `main`.** GitHub Actions deploys it to Cloudways in about 2 minutes. From then on, the dashboard reads and writes only MySQL. Vercel deploys the redirect at the same time, so the Vercel link opens the Cloudways site.
4. Check that the **Deploy to Cloudways** run in GitHub's **Actions** tab is green. Then log in on the live site and check a few screens.
5. In each form's Apps Script, go to **Triggers → Add trigger**: function `onFormSubmit`, event source *From form*, event type *On form submit*.
6. Turn *Accepting responses* back **on**. Submit one test response per form, check it appears in the dashboard, then delete the test row in phpMyAdmin.
7. Make the Google Sheets **view-only** for everyone. They're now a snapshot from the switch.

### C. Afterwards (in the following days)

- Remove `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `DATA_SOURCE` and `GOOGLE_SHEET_ID_2` from the server's `.env.local`, then run `pm2 restart dashboard`. Do the same in Vercel's environment variables.
- Remove the service account's access: in each of the 8 spreadsheets, open **Share** and remove the service account's email (`GOOGLE_CLIENT_EMAIL`). Then, in Google Cloud Console, delete the service account's key.
- Delete the `Sheet2` / `Sheet3` password tabs, and ask everyone to change their dashboard password.
- Turn on a daily backup schedule in Cloudways (**Backup and Restore**); it includes the database.

### D. Deleting the Google Sheets and Google Forms

Nothing in the dashboard reads Google Sheets, and the dashboard's own forms replace the web, marketing and PM Google Forms. Before deleting:

1. **Download a backup** of each of the 8 spreadsheets (**File → Download → Microsoft Excel**), and of each form's responses. Keep them somewhere safe; once Google's trash is emptied they can't be recovered.
2. **Keep the Leaderboard feedback form**, and the *Leaderboard* tab its responses also go to, until that form has a dashboard version. Deleting it now would stop new feedback.
3. Delete the spreadsheets and the web, marketing and PM forms in Google Drive. Leave them in the trash for about 30 days.
4. Delete the Google service account in Google Cloud Console, and remove `GOOGLE_*` from the server and Vercel settings. After that, `npm run db:import` and `db:verify` no longer work, which is expected; they were only for the move.

### Rollback

On GitHub, open the merged "Disconnect Google Sheets" pull request and click **Revert**, then merge the revert. On the server, make sure `.env.local` has `DATA_SOURCE=sheets` and `GOOGLE_PRIVATE_KEY`. Remove the form triggers. Edits and form responses stored in MySQL after the switch are **not** in Google Sheets: re-enter them, or export them from the data tables and `change_log`.

### Deploys after the switch

Nothing changes: merge to `main`, and the existing GitHub Actions workflow deploys. If a deploy adds a column to `lib/data/datasets.ts`, run `npm run db:migrate` on the server afterwards.

## Day-to-day tasks

Use **Cloudways → Application → Access Details → Launch Database Manager** (phpMyAdmin) for table edits.

| Task | Before (Google Sheets) | Now |
|---|---|---|
| Add a news item, AI tool, holiday or InHouse entry | Type a row in the sheet | Insert a row into `news`, `ai_tools`, `holidays` or `inhouse_*` in phpMyAdmin. Fill the data columns, and copy `sheet_id` and `sheet_tab` from an existing row. |
| Add a user | Add a row with a bcrypt hash | `npm run db:set-password -- <username> --create --role <Role> --name "<Name>" --email <email>` |
| Reset a password | Edit the hash | `npm run db:set-password -- <username>` (asks for the new password twice, hidden) |
| Change role or display name | Sheet or Admin Portal | Admin Portal (unchanged) |
| Monthly move to archive | Cut and paste rows between tabs | SQL in phpMyAdmin, below |
| See who changed what | Sheet version history | `SELECT * FROM change_log ORDER BY id DESC LIMIT 100;` |
| Backups | Google Drive history | Cloudways **Backup and Restore** (includes the database) |

Monthly archive, with example month values shown in sheet format. Run the `SELECT` first to check what will move:

```sql
-- Web tasks: move rows from Current Month Tasks to All Web Tasks Tab
SELECT COUNT(*) FROM web_tasks WHERE sheet_tab = 'Current Month Tasks' AND `timestamp` LIKE '%/09/2026%';
UPDATE web_tasks SET sheet_tab = 'All Web Tasks Tab'
 WHERE sheet_tab = 'Current Month Tasks' AND `timestamp` LIKE '%/09/2026%';

-- Marketing: Current Month Tasks → All Marketing Tasks (US-style dates: 9/…/2026)
UPDATE marketing_tasks SET sheet_tab = 'All Marketing Tasks'
 WHERE sheet_tab = 'Current Month Tasks' AND `timestamp` LIKE '9/%/2026%';

-- PM projects: current month → All Data (different dataset and tab)
UPDATE pm_projects SET sheet_id = '1QjLPmyVrzWpWIYoKKSsntwYAYFNGDRUyowvz9N8U25s', sheet_tab = 'All Data PM'
 WHERE sheet_tab = 'CurrentMonth' AND `month` = 'September' AND `year` = '2026';
```

## Differences from Google Sheets

- **Empty "Column 20–24" headers** on Web *Current Month Tasks* aren't stored. They held no data, and the task table already hid them. Exports that listed every column no longer include these five empty columns.
- **Range limits are ignored.** A request for `'Tab'!A1:Z10000` returns the whole dataset. All the app's ranges already covered all rows and columns.
- **No 60-second cache.** MySQL reads are fast, so every refresh shows the latest data, including other people's edits.
- **Editing in Google Sheets has no effect.** Make the sheets view-only, so nobody edits the wrong place.
- **Security:** `/api/data` and `/api/update-status` only serve the datasets the dashboard itself uses. Previously any logged-in user could read the `Sheet2` plain-text password tabs through them.
