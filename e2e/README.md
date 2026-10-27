# End-to-end tests (Playwright)

Browser tests that log in to the dashboard and use it the way people do, checking the results in MySQL.

**They only run against a local dashboard and a local database.** `global-setup.ts` stops the run if the app URL or `MYSQL_HOST` isn't `localhost` / `127.0.0.1`.

## Run

1. Start the local database (WAMP's MySQL; the WAMP tray icon must be green). `.env.local` must point at it, with `npm run db:migrate` and `npm run db:import -- --yes` done once.
2. Run the tests:

   ```bash
   npm run test:e2e
   ```

   This reuses `npm run dev` on http://localhost:3000 if it's running, or starts it.
3. On a failure, open the report with screenshots and a step-by-step trace:

   ```bash
   npx playwright show-report
   ```

Useful options: `npx playwright test e2e/forms.spec.ts` (one file), `-g "Leave Status"` (one test), `--headed` (watch the browser).

## What gets created and cleaned up

`global-setup.ts` creates three temporary users in the local database: `e2e_admin` (HM), `e2e_pm` (PMWebAdmin) and `e2e_team` (WebTeam). `global-teardown.ts` deletes them afterwards, along with every row they submitted and every `change_log` entry of their edits. The Leave Status test edits one real row and restores it by id. The Admin Portal test only edits the temporary users.

## What's covered

| File | Checks |
|---|---|
| `auth.spec.ts` | Wrong password and unknown user refused; admins log in by username, others by email; session survives reload; sign out |
| `navigation.spec.ts` | Every admin page (Web, Marketing, PM Projects, Leave Status, InHouse, Tools, Admin Portal) loads with no failed request and no script error; lists show database data; Refresh works |
| `forms.spec.ts` | Web and Marketing "Add Task", PM "Add New Project" and Leaderboard "Add Feedback": required questions enforced, "Other" answers and points grids, rows saved in each sheet's format, new tasks listed in Tasks Assigned, new projects in My Projects, feedback read back by the Leaderboard |
| `editing.spec.ts` | Assigning a new task and changing its status in Tasks Assigned; Leave Status edit; Admin Portal name and role edits; each saved, logged in `change_log` and kept after reload |
| `roles.spec.ts` | Team members, PMs and admins see only their own pages; the server refuses the rest |
| `api.spec.ts` | Logged-out requests refused; old password tabs and the users table unreachable; form validation and once-only saving; Google Forms intake (Leaderboard) |
