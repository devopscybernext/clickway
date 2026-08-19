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

// PM Sheet Bandwidth All Data — same one-tab-per-PM layout and columns as
// PM_BANDWIDTH_SHEET_ID above, but holds prior months/years' rows instead of
// the current month's. /api/pm-bandwidth merges both spreadsheets into one
// dataset (tagging each row with __sheetId so edits route back to whichever
// spreadsheet it actually came from) so PM Projects' Year/Month filters can
// reach back into history while the current-month-pinned KPI/PM-summary
// cards keep working unchanged (they already filter to the real current
// month/year, which historical rows never match).
export const PM_BANDWIDTH_ALL_DATA_SHEET_ID = '1QjLPmyVrzWpWIYoKKSsntwYAYFNGDRUyowvz9N8U25s';

// "Add New Project" intake form — one Google Form per PM, matched against
// the logged-in user's display name (same name used for the __pm tab tag).
export const PM_PROJECT_FORM_URLS: Record<string, string> = {
  Kiran:  'https://forms.gle/KRGCcDvVooDnP8LE6',
  Muskan: 'https://forms.gle/hbu2jJdW3pkuWk7K6',
  Moon:   'https://forms.gle/Bwru5hhor9rCY6fK6',
  Yash:   'https://forms.gle/mey4kAfqDwcDqRvb7',
};

// Tab names inside the Sheet 1 spreadsheet
export const TAB_BANDWIDTH    = 'Bandwidth Allocation';
// No longer fetched directly (see LEAVE_SHEET_ID below) — kept only so
// /api/bandwidth-tasks' tab auto-discovery keeps excluding it by name for
// as long as the tab still exists in the spreadsheet.
export const TAB_AVAILABILITY = 'Resource Availability';

export const RANGE_BANDWIDTH = `'${TAB_BANDWIDTH}'!A1:Z10000`;

// Leave-status spreadsheet — a separate sheet an admin maintains directly,
// replacing the old in-spreadsheet "Resource Availability" tab. Its
// "UserDetails" tab is unrelated to the login-credentials UserDetails sheet
// (USER_DETAILS_SHEET_ID) — same tab name, different spreadsheet. Columns:
// Team (holds the person's name), Email ID, Leave
export const LEAVE_SHEET_ID = '1jfq6IC01IMfrvw4VjZLu3qnOwpC-opwz4qsIeExKItU';
export const TAB_LEAVE   = 'UserDetails';
export const RANGE_LEAVE = `'${TAB_LEAVE}'!A1:Z10000`;

// Leaderboard manual-points tab (inside Sheet 1 spreadsheet)
export const TAB_LEADERBOARD   = 'Leaderboard';
export const RANGE_LEADERBOARD = `'${TAB_LEADERBOARD}'!A1:Z10000`;

// AI News ticker tab (inside the Dashboard Tools spreadsheet) — columns: Company, Title, Description
export const TAB_NEWS   = 'News';
export const RANGE_NEWS = `'${TAB_NEWS}'!A1:Z10000`;

// Holiday Calendar tab (inside the Dashboard Tools spreadsheet) — columns: Name, Date, Day
export const TAB_HOLIDAY   = 'Holiday';
export const RANGE_HOLIDAY = `'${TAB_HOLIDAY}'!A1:Z10000`;

// AI Tools directory tab (inside the Dashboard Tools spreadsheet) — columns: Tool Name, Short Description, Price, Categories, URL, PM Focus, Resource Focus
export const TAB_AI_TOOLS   = 'AI Tools';
export const RANGE_AI_TOOLS = `'${TAB_AI_TOOLS}'!A1:Z10000`;

// User credentials tab (inside the separate UserDetails spreadsheet) — columns: Username, Password Hash, Role, Display Name, Email
// Server-only: never fetched through the generic /api/data proxy.
export const TAB_USERS   = 'UserDetails';
export const RANGE_USERS = `'${TAB_USERS}'!A1:Z200`;

// QA Testing tab (inside Sheet 1 spreadsheet) — Vinay's dedicated QA task list.
// Columns: Project Name, Task Name, Task URL, Time Logged On Ac, Task Status Updation, Today Bucket Set
export const TAB_QA_TESTING   = 'QATesting';
export const RANGE_QA_TESTING = `'${TAB_QA_TESTING}'!A1:Z10000`;

// Team rosters — used to split "Team Bandwidth" and "Tasks Overview" by team.
// Matched case-insensitively against the "Assigned Person" (Bandwidth
// Allocation) / "Name" (Resource Availability) columns.
export const WEB_TEAM = ['Akash', 'Dhruv', 'Shubham', 'Lovepreet', 'Pawan', 'Robin'];

// Marketing Team spreadsheet — a single "Marketing Tasks" tab covering every
// sub-team, distinguished by the Department column (SEO/PPC/SMM/...) rather
// than separate tabs. Columns: Timestamp, Email Address, Project Name, Task
// Name, Task URL, Department, Task Estimation, Deadline, Assigned Person,
// Task Daily Bucket, Action Taken Today, Performance Signal/Insights,
// Blocker, Next Steps, Time Logged On Ac, Task Status Updation, Today
// Bucket Set, Total Hours, PM Status
export const MARKETING_TEAM_SHEET_ID = '1TTfD6-EKMXucucAyI2iNJLd6-P6lbolgQe-QOC1GyXs';
export const TAB_MARKETING_TASKS = 'Marketing Tasks';

// Department options (matches the sheet's dropdown validation)
export const MARKETING_DEPARTMENT_OPTIONS = ['SEO', 'PPC', 'SMM'];

// Assigned Person — union of every department's roster (matches each
// department's own dropdown validation in the sheet)
export const MARKETING_ASSIGNED_PERSONS = [
  'Bhavya', 'Kshitij', 'Akshay', // SEO
  'Atul', 'Shiwangi', 'Anjali', 'Dheeraj', 'Anurag', 'Vansh', // PPC (Akshay shared with SEO)
  'Payal', 'Akanksha', // SMM
];

// Task Status Updation options for the Marketing Team sheet — differs from
// Bandwidth Allocation's list ("Submitted To Admin" instead of "Submitted To
// Akash", plus "Task Closed")
export const MARKETING_STATUS_OPTIONS = [
  'No Action Taken', 'To Be Started', 'In Progress', 'Testing', 'On Hold',
  'Submitted To Admin', 'Submitted To PM', 'Task Closed',
];
// Today Bucket Set for Marketing includes "No Action Taken" as an explicit option
export const MARKETING_TODAY_BUCKET_SET_OPTIONS = ['No Action Taken', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'URGENT'];
