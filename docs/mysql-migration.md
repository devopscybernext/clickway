# MySQL data store

The dashboard stores all of its data in **MySQL**: on Cloudways in production, and in any local MySQL 5.7+ / MariaDB 10.3+ for development. Tasks, projects and Leaderboard points are added through the dashboard's own forms. Google Sheets and Google Forms are no longer used. The [record of the move](#record-of-the-move-from-google-sheets) is at the end.

Contents:

1. [How it works](#how-it-works)
2. [Tables](#tables)
3. [Settings](#settings)
4. [Local setup](#local-setup)
5. [Entry forms](#entry-forms)
6. [Testing and deploying](#testing-and-deploying)
7. [Day-to-day tasks](#day-to-day-tasks)
8. [Record of the move from Google Sheets](#record-of-the-move-from-google-sheets)

---

## How it works

Every API route reads and writes through `lib/dataStore.ts`. Its functions keep the arguments the app was originally built around, a dataset key plus a tab, so the screens didn't need to change when the data moved from Google Sheets to MySQL.

| File | Role |
|---|---|
| `lib/dataStore.ts` | Data access used by every route |
| `lib/data/mysql.ts` | MySQL access: reads, cell updates, inserts, table creation |
| `lib/data/datasets.ts` | **Registry**: which dataset/tab maps to which table, and its columns in order |
| `lib/data/rows.ts` | Row conversion: numeric text becomes numbers, as the screens expect |
| `lib/sheetAccess.ts` | Allowlist: what the generic `/api/data` and `/api/update-status` routes may read and write |
| `lib/forms.ts`, `components/EntryForm.tsx`, `app/api/forms/route.ts` | The entry forms |
| `scripts/db/migrate.ts`, `scripts/db/set-password.ts` | `db:migrate`, `db:set-password` |
| `vercel.json` | Sends visitors of the old Vercel deployment to the Cloudways site |

The dataset ids in `lib/config.ts` are the old Google spreadsheet ids, kept as names. Each row remembers its dataset and tab (`sheet_id`, `sheet_tab`). That keeps the "current month" and "archive" split, and lets edits go back to the right place.

Each row carries a **write-back handle** (`__row`), which is its permanent MySQL id. An edit only applies if the id, dataset and tab all match, so sorting or inserting rows can never make an edit land on the wrong row. Every edit is recorded in `change_log`.

## Tables

`npm run db:migrate` creates these tables from the registry:

| Table | Holds | Rows when copied from Google Sheets (27 Oct 2026) |
|---|---|---|
| `web_tasks` | Web tasks: tabs *Current Month Tasks* and *All Web Tasks Tab* | 1,550 |
| `leaderboard_feedback` | Leaderboard points ("Web Special Points") | 2 |
| `qa_tasks` | QA Testing | 48 |
| `marketing_tasks` | Marketing tasks: *Current Month Tasks* and *All Marketing Tasks* | 40 |
| `pm_projects` | PM projects: *CurrentMonth* (current) and *All Data PM* (previous months) | 112 |
| `users` | Logins (bcrypt password hashes only) | 26 |
| `leave_status` | Leave Status | 24 |
| `news`, `ai_tools`, `holidays` | News ticker, AI Tools, Holiday calendar | 10, 54, 12 |
| `inhouse_case_studies`, `inhouse_websites`, `inhouse_brand_kit`, `inhouse_documentations` | Cybernext InHouse | 23, 117, 7, 2 |
| `change_log` | One row per edit: who, when, table, row, column, old and new value | n/a |

Every table also has `id` (permanent row id), `sheet_id` and `sheet_tab` (dataset and tab), `source_ref` (submission id for form rows, so a double submit is stored once), and `created_at` / `updated_at`.

**Data columns are text, in the same format the sheets used.** Dates are mixed (`26/10/2026` for Web, `10/26/2026` for Marketing and PM), and hours are text like `12.50 hrs`. The screens parse these strings, and the entry forms write new rows in the same format. Converting columns to real `DATE` and number types can be a later improvement, one column at a time.

To add a column, add its header to the right dataset in `lib/data/datasets.ts`, then run `npm run db:migrate`. That adds the column and never drops anything.

## Settings

`.env.local`, locally and on the server:

```env
SESSION_SECRET=...             # long random string; signs login sessions
MYSQL_HOST=127.0.0.1           # Cloudways: localhost
MYSQL_PORT=3306
MYSQL_USER=...                 # Cloudways: the application's database user
MYSQL_PASSWORD=...
MYSQL_DATABASE=...             # Cloudways: nhnrkfejab
FORM_TIMEZONE=Asia/Kolkata     # timezone of form timestamps
```

These are no longer read, and can be deleted wherever they still exist: `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID_2`, `DATA_SOURCE`, `INTAKE_SECRET`.

To generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Local setup

WAMP includes **MySQL 8.3 on port 3306** and MariaDB 11.3 on port 3307; either works. The WAMP tray icon must be green.

1. In phpMyAdmin (http://localhost/phpmyadmin), create an empty database, for example `clickway_db`, with collation `utf8mb4_unicode_ci`.
2. Fill in `.env.local` (see [Settings](#settings)). For WAMP's MySQL: `MYSQL_USER=root`, empty `MYSQL_PASSWORD`, `MYSQL_DATABASE=clickway_db`. Don't leave a space after a value. Passwordless `root` is fine on your own PC only.
3. Create the tables:

   ```bash
   npm run db:migrate
   ```

4. Load data. Choose one:
   - **A copy of the live data:** in Cloudways, go to **Launch Database Manager** (phpMyAdmin) → **Export**, and download the SQL file. Then **Import** it into your local database. Or, over SSH:

     ```bash
     mysqldump -u nhnrkfejab -p nhnrkfejab > ~/clickway.sql   # on the server; then download it
     mysql -u root clickway_db < clickway.sql                  # on your PC
     ```

     The copy contains real names, emails and password hashes. Keep it on your machine and delete it when done.
   - **An empty start:** create a login and add data through the dashboard:

     ```bash
     npm run db:set-password -- admin --create --role HM --name "Admin"
     ```

5. Run `npm run dev` and open http://localhost:3000.

## Entry forms

All four entry forms are the dashboard's own. They save straight to MySQL through `/api/forms`, under the logged-in user's email. Their questions, options, "Other" choices, grids and required flags were copied from the Google Forms they replaced (`lib/forms.ts`). Rows are stored in the columns and date formats the screens expect.

| Form | Who can use it | Stored in |
|---|---|---|
| Web "Add Task" | Users whose menu has Web → Add Task | `web_tasks`, tab *Current Month Tasks* |
| Marketing "Add Task" | Users whose menu has Marketing → Add Task | `marketing_tasks`, tab *Current Month Tasks* |
| PM Projects "+ Add New Project" | PMs | `pm_projects`, tab *CurrentMonth* |
| Leaderboard "+ Add Feedback" | Users who see the Leaderboard, except individual team members (no self-awarded points) | `leaderboard_feedback`; each grid row (e.g. *Positive Feedback [Delivered before the deadline]*) is its own column |

The server checks the same permissions as the menu, rejects missing required answers and values outside a dropdown's options, and stores a submission once even if Submit is clicked twice.

**New tasks and assigning them.**
- A new web or marketing task starts with Task Status, Daily Bucket, PM Status and Today Bucket Set at **"No Action Taken"**, so it shows in Tasks Assigned straight away.
- **Web → Tasks Assigned lists unassigned tasks too.** Admins, PMs and team admins click **Edit Task**, then **Assign…** in the Assigned Person column, and pick a name. Marketing tasks are assigned in the form itself.

**To change a form** (for example, add a project name or a team member), edit it in `lib/forms.ts`. A question's title must stay equal to its table column's header; a new question needs its column added in `lib/data/datasets.ts`, then `npm run db:migrate`. The Leaderboard form's resource list is the current Web team. The team lists used elsewhere live in `lib/config.ts` (`WEB_TEAM`, `MARKETING_ASSIGNED_PERSONS`).

## Testing and deploying

`npm run test:e2e` runs 22 Playwright browser tests against the **local** dashboard and database, and refuses to run against anything else. They cover login, every page for each role, all four entry forms, assigning and editing tasks, Leave Status, the Admin Portal, and the server's access rules, and they clean up after themselves. See [e2e/README.md](../e2e/README.md).

**Deploy:** run the tests locally, then merge to `main`. GitHub Actions deploys to Cloudways in about 2 minutes (`.github/workflows/deploy.yml`, which runs `~/deploy-dashboard.sh` on the server). If the change adds a column to `lib/data/datasets.ts`, run `npm run db:migrate` on the server afterwards. Over SSH, load Node first with `source ~/.bash_profile` if `npm` or `pm2` isn't found.

## Day-to-day tasks

Use **Cloudways → Application → Access Details → Launch Database Manager** (phpMyAdmin) for direct table edits.

| Task | How |
|---|---|
| Add a task, project or Leaderboard points | The dashboard's forms (see [Entry forms](#entry-forms)) |
| Add a news item, AI tool, holiday or InHouse entry | Insert a row into `news`, `ai_tools`, `holidays` or `inhouse_*` in phpMyAdmin. Fill the data columns, and copy `sheet_id` and `sheet_tab` from an existing row |
| Add a user | `npm run db:set-password -- <username> --create --role <Role> --name "<Name>" --email <email>` (over SSH on the server) |
| Reset a password | `npm run db:set-password -- <username>` (asks for the new password twice, hidden) |
| Change role or display name | Admin Portal |
| See who changed what | `SELECT * FROM change_log ORDER BY id DESC LIMIT 100;` |
| Backups | Cloudways **Backup and Restore** (includes the database); keep a daily schedule on |
| Monthly move to the archive | SQL below |

Monthly archive, with example month values. Run the `SELECT` first to check what will move:

```sql
-- Web tasks: Current Month Tasks → All Web Tasks Tab (day-first dates)
SELECT COUNT(*) FROM web_tasks WHERE sheet_tab = 'Current Month Tasks' AND `timestamp` LIKE '%/09/2026%';
UPDATE web_tasks SET sheet_tab = 'All Web Tasks Tab'
 WHERE sheet_tab = 'Current Month Tasks' AND `timestamp` LIKE '%/09/2026%';

-- Marketing: Current Month Tasks → All Marketing Tasks (US-style dates: 9/…/2026)
UPDATE marketing_tasks SET sheet_tab = 'All Marketing Tasks'
 WHERE sheet_tab = 'Current Month Tasks' AND `timestamp` LIKE '9/%/2026%';

-- PM projects: current month → previous months (a different dataset and tab)
UPDATE pm_projects SET sheet_id = '1QjLPmyVrzWpWIYoKKSsntwYAYFNGDRUyowvz9N8U25s', sheet_tab = 'All Data PM'
 WHERE sheet_tab = 'CurrentMonth' AND `month` = 'September' AND `year` = '2026';
```

## Record of the move from Google Sheets

| Date | Step |
|---|---|
| 26 Oct 2026 | Hosting moved from Vercel to Cloudways; MySQL support added next to Google Sheets; access fix for `/api/data` and `/api/update-status` (any logged-in user could read the `Sheet2` plain-text password tabs) |
| 27 Oct 2026 | Final copy of the 8 spreadsheets (17 tabs, 2,027 rows) into MySQL, verified cell by cell; the app switched to MySQL only; Vercel redirected to Cloudways |
| 27 Oct 2026 | The 4 Google Forms replaced by the dashboard's own forms; new tasks made visible and assignable in Tasks Assigned; Playwright tests added |
| 27 Oct 2026 | The one-time import scripts, the `googleapis` package and the temporary Google Forms endpoint (`/api/intake`) removed |

What changed for users compared with Google Sheets:
- Every refresh shows the latest data, with no 60-second cache.
- Edits are recorded with the editor's name in `change_log`.
- The five empty "Column 20–24" headers on Web *Current Month Tasks* are gone; they held no data and the task table already hid them.
- The Leaderboard form lists Dhruv correctly. The Google Form had "Dhurv", so points given to "Dhurv" never counted.

**Retiring the Google files (done in Google, not in code):**
1. Turn off *Accepting responses* on the 4 Google Forms. Re-enter through the dashboard anything submitted after the final copy (27 Oct 2026, morning).
2. Download Excel backups of the 8 spreadsheets and the form responses, and keep them safe.
3. Delete the 8 spreadsheets and 4 forms in Google Drive. Leave them in the trash for about 30 days.
4. Delete the service account in Google Cloud Console, and remove any `GOOGLE_*` lines from the server's `.env.local` and Vercel's settings. Remove any Apps Script triggers added to the forms.
5. Make sure no copy of the `Sheet2` / `Sheet3` plain-text password tabs remains, and ask everyone to change their dashboard password.
