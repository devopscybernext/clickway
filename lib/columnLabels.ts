// What the hour columns of Web and Marketing tasks are called on screen. Only the label changes: the column names in the
// database, the Excel import and the forms' answers stay as they are.
//   Web        Total Time Est -> Billable Hours     Total Time -> Total Logged     Time Logged On AC -> Daily Logged
//   Marketing  Task Estimation -> Billable Hours    Total Hours -> Total Logged    Time Logged On AC -> Daily Logged
// (Web's Time Estimation has been called Daily Time for a while.) PM Projects has a Total Hours column of its own: it
// does not use this and keeps its name.
const LABELS: Record<string, string> = {
  'time estimation': 'Daily Time',
  'total time est': 'Billable Hours',
  'task estimation': 'Billable Hours',
  'total time': 'Total Logged',
  'total hours': 'Total Logged',
  'time logged on ac': 'Daily Logged',
};

export const taskColumnLabel = (header: string): string => LABELS[header.trim().toLowerCase()] ?? header;
