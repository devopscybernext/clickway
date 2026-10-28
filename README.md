# Clickway — Cybernext Bandwidth Dashboard

Cybernext's internal dashboard for tasks, team workload, PM projects, leave, the Leaderboard and the in-house portfolio, for the Web and Marketing teams.

All data lives in **MySQL**. Google Sheets and Google Forms are no longer used: tasks, projects and Leaderboard points are added through the dashboard's own forms.

## Tech stack

| Tool | Purpose |
|---|---|
| Next.js 16 (App Router) + React 19 | App and API routes |
| MySQL / MariaDB (`mysql2`) | Data store |
| Tailwind CSS v4, Lucide | Styling, icons |
| Recharts, jsPDF, write-excel-file | Charts, PDF and Excel reports |
| Playwright | End-to-end tests |

## Run locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local`:

   ```env
   SESSION_SECRET=<long random string>
   MYSQL_HOST=127.0.0.1
   MYSQL_PORT=3306
   MYSQL_USER=root
   MYSQL_PASSWORD=
   MYSQL_DATABASE=clickway_db
   FORM_TIMEZONE=Asia/Kolkata
   ```

3. Create the tables, then load data: a copy of the live database (see [docs/mysql-migration.md](docs/mysql-migration.md#local-setup)), or just a user to log in with:

   ```bash
   npm run db:migrate
   npm run db:set-password -- admin --create --role HM --name "Admin"
   ```

4. Start the app and open http://localhost:3000:

   ```bash
   npm run dev
   ```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Playwright end-to-end tests against the local app and database ([e2e/README.md](e2e/README.md)) |
| `npm run db:migrate` | Create the MySQL tables, or add new columns |
| `npm run db:set-password -- <user>` | Reset a password, or create a user with `--create --role … --name … --email …` |

## Project structure

```
app/api/            API routes (login, data, update-status, forms, admin-users, …)
components/         Dashboard UI (Dashboard.tsx is the main page)
lib/dataStore.ts    Data access used by every route
lib/data/           MySQL access, dataset → table registry, row conversion
lib/forms.ts        The entry forms: questions, validation, formatting
lib/config.ts       Dataset ids, tab names, team lists, dropdown options
scripts/db/         db:migrate and db:set-password
e2e/                Playwright tests
docs/               mysql-migration.md: data store, forms, deploys, day-to-day tasks
```

## Deploying

Merging to `main` deploys to Cloudways automatically through GitHub Actions (`.github/workflows/deploy.yml`). Run `npm run test:e2e` locally first. The server's deploy script (`~/deploy-dashboard.sh`) installs, builds, runs `npm run db:migrate` (so new columns are added automatically) and restarts the app; if any step fails, the old version keeps running.
