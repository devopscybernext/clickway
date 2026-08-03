export const SHEET_IDS = {
  '1': '14w9WOL3f29A9IweNJHGjZ-ohQrTbNnT0SOm22NZeHK0',
} as const;

// Dashboard Tools spreadsheet — houses News, AI Tools, Holiday tabs separately
// from the main Sheet 1 spreadsheet
export const TOOLS_SHEET_ID = '1LKlUqf6ZTqivv3Bf8iYqDzJO7B_fLT22ZO2oB0f-nRs';

// UserDetails spreadsheet — login credentials, kept separate from Sheet 1
export const USER_DETAILS_SHEET_ID = '1OFJyXJ89MTi7sFH4L0or-wGtrZi3a7zRFVtFMOCItI4';

// PM Sheet Bandwidth spreadsheet — one tab per PM (e.g. "Muskan"), discovered
// dynamically at fetch time rather than hardcoded, since more PM tabs get
// added over time. Columns: Timestamp, Email Address, Department, Year,
// Month, Project Name, Client Name, Communication Channel, Tech, Total
// Hours, Payment Details, Assigned, Status, Phase, Milestone, Current Month
// Hours, Upcoming Milestones, Upsell/Cross-Sell, Project Start Date, Target
// End Date, Payment Status, Last (Project) Follow-up Date, Comments
export const PM_BANDWIDTH_SHEET_ID = '1WBzXb7xfCtzlzeVzxYB6ZtkSCyN4FUzz1Eg9McgPbLM';

// Tab names inside the Sheet 1 spreadsheet
export const TAB_BANDWIDTH    = 'Bandwidth Allocation';
export const TAB_AVAILABILITY = 'Resource Availability';

// Ranges — Resource Availability has a title in row 1, so start from row 2
export const RANGE_BANDWIDTH    = `'${TAB_BANDWIDTH}'!A1:Z1000`;
export const RANGE_AVAILABILITY = `'${TAB_AVAILABILITY}'!A2:Z1000`;

// Leaderboard manual-points tab (inside Sheet 1 spreadsheet)
export const TAB_LEADERBOARD   = 'Leaderboard';
export const RANGE_LEADERBOARD = `'${TAB_LEADERBOARD}'!A1:Z1000`;

// AI News ticker tab (inside the Dashboard Tools spreadsheet) — columns: Company, Title, Description
export const TAB_NEWS   = 'News';
export const RANGE_NEWS = `'${TAB_NEWS}'!A1:Z1000`;

// Holiday Calendar tab (inside the Dashboard Tools spreadsheet) — columns: Name, Date, Day
export const TAB_HOLIDAY   = 'Holiday';
export const RANGE_HOLIDAY = `'${TAB_HOLIDAY}'!A1:Z1000`;

// AI Tools directory tab (inside the Dashboard Tools spreadsheet) — columns: Tool Name, Short Description, Price, Categories, URL, PM Focus, Resource Focus
export const TAB_AI_TOOLS   = 'AI Tools';
export const RANGE_AI_TOOLS = `'${TAB_AI_TOOLS}'!A1:Z1000`;

// User credentials tab (inside the separate UserDetails spreadsheet) — columns: Username, Password Hash, Role, Display Name, Email
// Server-only: never fetched through the generic /api/data proxy.
export const TAB_USERS   = 'UserDetails';
export const RANGE_USERS = `'${TAB_USERS}'!A1:Z200`;

// QA Testing tab (inside Sheet 1 spreadsheet) — Vinay's dedicated QA task list.
// Columns: Project Name, Task Name, Task URL, Time Logged On Ac, Task Status Updation, Today Bucket Set
export const TAB_QA_TESTING   = 'QATesting';
export const RANGE_QA_TESTING = `'${TAB_QA_TESTING}'!A1:Z1000`;
