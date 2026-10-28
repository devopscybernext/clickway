import { fetchSheetData } from './dataStore';
import { USER_DETAILS_SHEET_ID, RANGE_USERS } from './config';
import { buildRoster, RosterMember } from './roster';

// The roster as the server sees it — straight from the accounts table. Used by
// /api/team-roster and by /api/forms to check a "who is it for" answer against the
// people who are on the team right now.
export async function loadRoster(): Promise<RosterMember[]> {
  const { data } = await fetchSheetData(USER_DETAILS_SHEET_ID, RANGE_USERS);
  const s = (r: Record<string, unknown>, k: string) => String(r[k] ?? '').trim();
  return buildRoster(data.map(r => ({
    name: s(r, 'Display Name'), role: s(r, 'Role'), department: s(r, 'Department'), subDepartment: s(r, 'Sub Department'),
  })));
}
