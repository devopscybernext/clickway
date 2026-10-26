import {
  SHEET_IDS, TOOLS_SHEET_ID, LEAVE_SHEET_ID, PM_BANDWIDTH_SHEET_ID, PM_BANDWIDTH_ALL_DATA_SHEET_ID,
  MARKETING_TEAM_SHEET_ID, RANGE_LEAVE, RANGE_LEADERBOARD, RANGE_NEWS, RANGE_HOLIDAY, RANGE_AI_TOOLS,
  RANGE_QA_TESTING, TAB_LEAVE, TAB_LEADERBOARD, TAB_AVAILABILITY,
} from './config';

// The generic /api/data proxy and /api/update-status take a spreadsheet id
// and range/tab straight from the client, so without a server-side list any
// logged-in user could read or write any tab the service account can reach
// (e.g. the Sheet2 tabs in UserDetails / Leave Status, which hold plain-text
// passwords). Only what the dashboard itself asks for gets through.

// Exactly the (spreadsheet, range) pairs Dashboard.tsx's fetchSheet() requests.
const READABLE = new Set([
  `${LEAVE_SHEET_ID}|${RANGE_LEAVE}`,
  `${SHEET_IDS['1']}|${RANGE_LEADERBOARD}`,
  `${SHEET_IDS['1']}|${RANGE_QA_TESTING}`,
  `${TOOLS_SHEET_ID}|${RANGE_NEWS}`,
  `${TOOLS_SHEET_ID}|${RANGE_HOLIDAY}`,
  `${TOOLS_SHEET_ID}|${RANGE_AI_TOOLS}`,
]);

export function isReadableRange(sheetId: string, range: string): boolean {
  return READABLE.has(`${sheetId}|${range}`);
}

// Task tabs in Sheet 1 and the Marketing / PM spreadsheets are discovered
// dynamically (new archive tabs need no code change), so writes are scoped
// per spreadsheet rather than to a fixed tab list. The UserDetails
// spreadsheet is never writable here — /api/admin-users is its only writer.
export function isWritableTab(sheetId: string, tab: string): boolean {
  const t = tab.trim();
  if (!t || t === 'Sheet2' || t === 'Sheet3') return false;
  switch (sheetId) {
    case SHEET_IDS['1']:
      return t !== TAB_LEADERBOARD && t !== TAB_AVAILABILITY;
    case LEAVE_SHEET_ID:
      return t === TAB_LEAVE;
    case MARKETING_TEAM_SHEET_ID:
    case PM_BANDWIDTH_SHEET_ID:
    case PM_BANDWIDTH_ALL_DATA_SHEET_ID:
      return true;
    default:
      return false;
  }
}
