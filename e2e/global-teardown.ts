import { assertLocal, query } from './helpers';

// Removes everything the tests created in the LOCAL database: the test
// users, the rows they submitted through the forms,
// and the change-log entries of their edits. Edits to real rows are reverted
// by the tests themselves.
export default async function globalTeardown() {
  assertLocal();
  await query("DELETE FROM users WHERE username LIKE 'e2e\\_%'");
  await query("DELETE FROM web_tasks WHERE email_address LIKE 'e2e-%@example.invalid' OR source_ref LIKE '%:e2e-%'");
  await query("DELETE FROM marketing_tasks WHERE email_address LIKE 'e2e-%@example.invalid' OR source_ref LIKE '%:e2e-%'");
  await query("DELETE FROM pm_projects WHERE email_address LIKE 'e2e-%@example.invalid' OR source_ref LIKE '%:e2e-%'");
  await query("DELETE FROM leaderboard_feedback WHERE email_address LIKE 'e2e-%@example.invalid' OR source_ref LIKE '%:e2e-%'");
  await query("DELETE FROM change_log WHERE changed_by LIKE 'e2e\\_%'");
}
