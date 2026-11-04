import mysql from 'mysql2/promise';
import { getPool, fetchSheetData } from './mysql';
import { DATASETS, columnName } from './datasets';
import { USER_DETAILS_SHEET_ID, RANGE_USERS } from '../config';
import {
  BELL_DAYS, LOG_DAYS, PM_STATUS_EVENTS, SUBMITTED_TO_PM, isSubmittedToWebAdmin,
  type NotificationItem, type NotificationLogRow, type NotificationTeam, type NotificationType,
} from '../notifications';

// Notifications, written where the events happen: a task is added (/api/forms), or its PM Status /
// Task Status Updation changes (/api/update-status). Each event is stored once in notification_log
// (Admin Portal, thirty days) and once per person who should see it in notifications (the bell,
// three days). Who sees what comes from the task itself:
//   Task Added                   the assignee, the people who assign that team's tasks (WebAdmin and PMWebAdmin for
//                                Web, MarketingAdmin and PMMarketingAdmin for Marketing), Super Admin
//   PM Status                    the assignee, that team's admin (WebAdmin / MarketingAdmin), Super Admin
//   Submitted To PM              the PM who added the task (matched on the task's email), Super Admin
//   Submitted To Web Admin       WebAdmin and PMWebAdmin (Web tasks), Super Admin
// The person who made the change is never told about their own change.
// Nothing here may break the save that caused it: callers catch and log.

interface Account { username: string; role: string; displayName: string; email: string }

const TABLE_TEAM: Record<string, NotificationTeam> = { web_tasks: 'web', marketing_tasks: 'marketing' };
export const isTaskTable = (table: string) => table in TABLE_TEAM;

const lc = (s: string) => s.trim().toLowerCase();
const SUPER_ADMIN_ROLES = ['admin'];  // lowercased: Admin and the legacy "admin"
const TEAM_ADMIN_ROLE: Record<NotificationTeam, string> = { web: 'webadmin', marketing: 'marketingadmin' };
// Whoever assigns a team's new tasks (they work from Tasks Assigned)
const ASSIGNER_ROLES: Record<NotificationTeam, string[]> = { web: ['webadmin', 'pmwebadmin'], marketing: ['marketingadmin', 'pmmarketingadmin'] };

async function loadAccounts(): Promise<Account[]> {
  const { data } = await fetchSheetData(USER_DETAILS_SHEET_ID, RANGE_USERS);
  const s = (r: Record<string, unknown>, k: string) => String(r[k] ?? '').trim();
  return data
    .map(r => ({ username: s(r, 'Username'), role: s(r, 'Role'), displayName: s(r, 'Display Name'), email: s(r, 'Email') }))
    .filter(a => a.username);
}

interface TaskInfo { team: NotificationTeam; taskRef: string; project: string; task: string; assignee: string; email: string }

async function readTask(table: string, id: number): Promise<TaskInfo | null> {
  const ds = DATASETS.find(d => d.table === table);
  const team = TABLE_TEAM[table];
  if (!ds || !team) return null;
  const emailHeader = ds.headers.find(h => h.toLowerCase().startsWith('email'));
  const wanted = ['Project Name', 'Task Name', 'Assigned Person', emailHeader].filter((h): h is string => !!h);
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `SELECT sheet_tab, ${wanted.map(h => '`' + columnName(h) + '`').join(', ')} FROM \`${table}\` WHERE id = ?`, [id]
  );
  const r = rows[0];
  if (!r) return null;
  const get = (h?: string) => (h ? String(r[columnName(h)] ?? '').trim() : '');
  return {
    team, taskRef: `${r.sheet_tab}::${id}`,
    project: get('Project Name'), task: get('Task Name'), assignee: get('Assigned Person'), email: get(emailHeader),
  };
}

// ─── Who is told ────────────────────────────────────────────────────────────
const superAdmins = (a: Account[]) => a.filter(x => SUPER_ADMIN_ROLES.includes(lc(x.role)));
const teamAdmins = (a: Account[], team: NotificationTeam) => a.filter(x => lc(x.role) === TEAM_ADMIN_ROLE[team]);
const assigners = (a: Account[], team: NotificationTeam) => a.filter(x => ASSIGNER_ROLES[team].includes(lc(x.role)));
const assigneesOf = (a: Account[], assignee: string) => {
  const names = assignee.split(',').map(lc).filter(Boolean);
  return a.filter(x => names.includes(lc(x.displayName)));
};
const creatorOf = (a: Account[], email: string) => (email ? a.filter(x => lc(x.email) === lc(email)) : []);

async function emit(type: NotificationType, info: TaskInfo, detail: string, title: string, actor: string, accounts: Account[], recipients: Account[]): Promise<void> {
  // shown by display name; the username is only used to leave the person out of their own notification
  const actorName = accounts.find(a => lc(a.username) === lc(actor))?.displayName || actor;
  const unique = new Map<string, Account>();
  for (const r of recipients) if (lc(r.username) !== lc(actor)) unique.set(lc(r.username), r);
  const who = [...unique.values()];
  const body = `${[info.project, info.task].filter(Boolean).join(' — ') || 'A task'}${info.assignee ? ` · ${info.assignee}` : ' · not assigned yet'}`;
  const pool = getPool();
  await pool.query(
    'INSERT INTO notification_log (type, team, project, task, assignee, detail, actor, recipients) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [type, info.team, info.project.slice(0, 255), info.task.slice(0, 255), info.assignee.slice(0, 191), detail.slice(0, 100), actorName.slice(0, 191),
      who.map(w => w.displayName || w.username).join(', ') || '—']
  );
  if (who.length) {
    await pool.query(
      'INSERT INTO notifications (recipient, type, team, title, body, task_ref, actor) VALUES ?',
      [who.map(w => [w.username, type, info.team, title.slice(0, 191), body.slice(0, 500), info.taskRef.slice(0, 191), actorName.slice(0, 191)])]
    );
  }
  await purgeExpired();
}

// A task was added through the form (row = its MySQL id)
export async function notifyTaskAdded(table: string, row: number, actor: string): Promise<void> {
  const info = await readTask(table, row);
  if (!info) return;
  const accounts = await loadAccounts();
  await emit('task-added', info, '', 'New task added', actor, accounts,
    [...assigneesOf(accounts, info.assignee), ...assigners(accounts, info.team), ...superAdmins(accounts)]);
}

// A cell of a task changed (header = its column name). Only PM Status and Task Status Updation count.
export async function notifyCellChange(table: string, row: number, header: string, oldValue: string | null, newValue: string, actor: string): Promise<void> {
  if (!isTaskTable(table)) return;
  const col = lc(header);
  const now = newValue.trim();
  if (!now || lc(oldValue ?? '') === lc(now)) return;
  const isPmStatus = col === 'pm status' && PM_STATUS_EVENTS.some(v => lc(v) === lc(now));
  const toPm = col === 'task status updation' && lc(now) === lc(SUBMITTED_TO_PM);
  const toWebAdmin = col === 'task status updation' && isSubmittedToWebAdmin(now);
  if (!isPmStatus && !toPm && !toWebAdmin) return;

  const info = await readTask(table, row);
  if (!info) return;
  const accounts = await loadAccounts();
  if (isPmStatus) {
    await emit('pm-status', info, now, `PM Status: ${now}`, actor, accounts,
      [...assigneesOf(accounts, info.assignee), ...teamAdmins(accounts, info.team), ...superAdmins(accounts)]);
  } else if (toPm) {
    await emit('task-status', info, SUBMITTED_TO_PM, `Task Status: ${SUBMITTED_TO_PM}`, actor, accounts,
      [...creatorOf(accounts, info.email), ...superAdmins(accounts)]);
  } else if (info.team === 'web') {
    await emit('task-status', info, 'Submitted To Web Admin', 'Task Status: Submitted To Web Admin', actor, accounts,
      [...accounts.filter(a => ['webadmin', 'pmwebadmin'].includes(lc(a.role))), ...superAdmins(accounts)]);
  }
}

// ─── Reading and clearing ───────────────────────────────────────────────────
let lastPurge = 0;
// Old notifications go on their own: the bell's after three days, the log's after thirty.
// Runs at most once a minute; there is no scheduler, any activity does it.
export async function purgeExpired(force = false): Promise<void> {
  if (!force && Date.now() - lastPurge < 60_000) return;
  lastPurge = Date.now();
  const pool = getPool();
  await pool.query('DELETE FROM notifications WHERE created_at < NOW() - INTERVAL ? DAY', [BELL_DAYS]);
  await pool.query('DELETE FROM notification_log WHERE created_at < NOW() - INTERVAL ? DAY', [LOG_DAYS]);
}

export async function listFor(username: string): Promise<{ items: NotificationItem[]; unread: number }> {
  await purgeExpired();
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `SELECT id, type, team, title, body, task_ref, actor, created_at, read_at FROM notifications
     WHERE recipient = ? AND created_at >= NOW() - INTERVAL ? DAY ORDER BY id DESC LIMIT 100`, [username, BELL_DAYS]
  );
  const items: NotificationItem[] = rows.map(r => ({
    id: Number(r.id), type: r.type, team: r.team, title: r.title, body: r.body, taskRef: r.task_ref, actor: r.actor,
    createdAt: new Date(r.created_at).toISOString(), read: r.read_at !== null,
  }));
  return { items, unread: items.filter(i => !i.read).length };
}

export async function markRead(username: string, ids: number[] | 'all'): Promise<void> {
  if (ids === 'all') {
    await getPool().query('UPDATE notifications SET read_at = NOW() WHERE recipient = ? AND read_at IS NULL', [username]);
  } else if (ids.length) {
    await getPool().query('UPDATE notifications SET read_at = NOW() WHERE recipient = ? AND read_at IS NULL AND id IN (?)', [username, ids]);
  }
}

export async function listLog(): Promise<NotificationLogRow[]> {
  await purgeExpired();
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `SELECT id, created_at, type, team, project, task, assignee, detail, actor, recipients FROM notification_log
     WHERE created_at >= NOW() - INTERVAL ? DAY ORDER BY id DESC LIMIT 5000`, [LOG_DAYS]
  );
  return rows.map(r => ({
    id: Number(r.id), createdAt: new Date(r.created_at).toISOString(), type: r.type, team: r.team, project: r.project, task: r.task,
    assignee: r.assignee, detail: r.detail, actor: r.actor, recipients: r.recipients,
  }));
}

// Clears everything: every bell and the Admin Portal log
export async function clearAll(): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM notifications');
  await pool.query('DELETE FROM notification_log');
}
