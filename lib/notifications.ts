// Notifications (the bell in the top bar, and the log in the Admin Portal).
// Shared by the server (lib/data/notifications.ts) and the screens.

export type NotificationType = 'task-added' | 'pm-status' | 'task-status' | 'access-request' | 'access-granted';
export type NotificationTeam = 'web' | 'marketing';
// Where a notification came from: a task team, or Projects (Cybernext InHouse → Documents)
export type NotificationSource = NotificationTeam | 'projects';
export const notificationSourceName = (t: string) => (t === 'web' ? 'Web' : t === 'projects' ? 'Projects' : 'Marketing');

// The bell keeps three days, then everyone starts fresh. The Admin Portal log keeps thirty.
export const BELL_DAYS = 3;
export const LOG_DAYS = 30;

// What the PM sets in the PM Status column that tells the assignee something happened
export const PM_STATUS_EVENTS = ['Changes', 'Approved', 'Submitted To Client', 'TicketClosed'];
// What a resource sets in Task Status Updation to hand work on. "Submitted To Akash" was renamed
// "Submitted To Web Admin"; the old spelling still counts for rows not yet migrated.
export const SUBMITTED_TO_PM = 'Submitted To PM';
export const SUBMITTED_TO_WEB_ADMIN = 'Submitted To Web Admin';
export const isSubmittedToWebAdmin = (v: string) => ['submitted to web admin', 'submitted to akash'].includes(v.trim().toLowerCase());

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  'task-added': 'Task Added',
  'pm-status': 'PM Status',
  'task-status': 'Task Status',
  'access-request': 'Access Request',
  'access-granted': 'Access Granted',
};

// One notification as the bell shows it
export interface NotificationItem {
  id: number;
  type: NotificationType;
  team: NotificationSource;
  title: string;
  body: string;
  taskRef: string;   // the task's __id ("<tab>::<row>"), or "project::<id>", so a click can jump to it
  actor: string;
  createdAt: string; // ISO
  read: boolean;
}

// One event as the Admin Portal log shows it (who was told is in `recipients`)
export interface NotificationLogRow {
  id: number;
  createdAt: string; // ISO
  type: NotificationType;
  team: NotificationSource;
  project: string;
  task: string;
  assignee: string;
  detail: string;    // the new status, or "" for Task Added
  actor: string;
  recipients: string;
}
