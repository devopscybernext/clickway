import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { dataSource } from '@/lib/googleSheets';
import { insertRow } from '@/lib/data/mysql';
import { findDataset } from '@/lib/data/datasets';
import {
  SHEET_IDS, MARKETING_TEAM_SHEET_ID, PM_BANDWIDTH_SHEET_ID, TAB_BANDWIDTH, TAB_MARKETING_TASKS, TAB_LEADERBOARD,
} from '@/lib/config';

export const runtime = 'nodejs';

// Google Forms → MySQL. With DATA_SOURCE=mysql the forms no longer write to a
// spreadsheet the dashboard reads, so an Apps Script on each form posts every
// new response here (docs/mysql-migration.md has the script). The row is
// stored exactly as the form's linked sheet would have shown it: same
// columns, same timestamp/date format, checkbox answers joined with ", ".

type DateOrder = 'dmy' | 'mdy';

// The PM spreadsheet's current-month tab (single tab, see lib/config.ts).
const TAB_PM_CURRENT = 'CurrentMonth';

const FORMS: Record<string, { sheetId: string; tab: string; order: DateOrder; emailHeader: string }> = {
  'web-task':       { sheetId: SHEET_IDS['1'],          tab: TAB_BANDWIDTH,       order: 'dmy', emailHeader: 'Email address' },
  'leaderboard':    { sheetId: SHEET_IDS['1'],          tab: TAB_LEADERBOARD,     order: 'dmy', emailHeader: 'Email address' },
  'marketing-task': { sheetId: MARKETING_TEAM_SHEET_ID, tab: TAB_MARKETING_TASKS, order: 'mdy', emailHeader: 'Email Address' },
  'pm-project':     { sheetId: PM_BANDWIDTH_SHEET_ID,   tab: TAB_PM_CURRENT,      order: 'mdy', emailHeader: 'Email Address' },
};

// The format each linked sheet used: Web Team Sheet is day-first with padded
// fields ("26/10/2026 14:05:09"), the Marketing and PM sheets are US style
// ("10/26/2026 14:05:09").
function parts(date: Date) {
  const timeZone = process.env.FORM_TIMEZONE || 'Asia/Kolkata';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(x => [x.type, x.value]));
  return { y: p.year, m: Number(p.month), d: Number(p.day), h: Number(p.hour), mi: p.minute, s: p.second };
}
const pad = (n: number) => String(n).padStart(2, '0');

function formatTimestamp(date: Date, order: DateOrder): string {
  const { y, m, d, h, mi, s } = parts(date);
  return order === 'dmy' ? `${pad(d)}/${pad(m)}/${y} ${pad(h)}:${mi}:${s}` : `${m}/${d}/${y} ${h}:${mi}:${s}`;
}

// Forms sends date questions as 2026-10-26; the sheets showed them in their own order.
function formatAnswer(value: string, order: DateOrder): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return value;
  const [, y, mo, d] = m;
  return order === 'dmy' ? `${d}/${mo}/${y}` : `${Number(mo)}/${Number(d)}/${y}`;
}

function secretMatches(header: string | null): boolean {
  const secret = process.env.INTAKE_SECRET;
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get('authorization'))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (dataSource() !== 'mysql') {
    return NextResponse.json({ success: false, error: 'Form intake is only used with DATA_SOURCE=mysql' }, { status: 409 });
  }

  let body: { form?: string; responseId?: string; submittedAt?: string; email?: string; answers?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Body must be JSON' }, { status: 400 });
  }

  const form = body.form ? FORMS[body.form] : undefined;
  if (!form) {
    return NextResponse.json({ success: false, error: `Unknown form "${body.form}". Expected one of: ${Object.keys(FORMS).join(', ')}` }, { status: 400 });
  }
  const submittedAt = new Date(body.submittedAt ?? '');
  if (isNaN(submittedAt.getTime()) || !body.responseId || !body.answers || typeof body.answers !== 'object') {
    return NextResponse.json({ success: false, error: 'responseId, submittedAt and answers are required' }, { status: 400 });
  }

  const ds = findDataset(form.sheetId, form.tab);
  if (!ds) {
    return NextResponse.json({ success: false, error: 'Form target is not configured' }, { status: 500 });
  }

  // Question titles match the sheet's column headers (that's how Forms names
  // linked-sheet columns). An unknown question is refused rather than dropped,
  // so a renamed question shows up as a failed Apps Script run — the response
  // stays in the form and can be resent once the column exists.
  const byHeader = new Map(ds.headers.map(h => [h.trim().toLowerCase(), h]));
  const values: Record<string, string> = {};
  const unknown: string[] = [];
  for (const [question, raw] of Object.entries(body.answers)) {
    const header = byHeader.get(question.trim().toLowerCase());
    if (!header) { unknown.push(question); continue; }
    const text = Array.isArray(raw) ? raw.join(', ') : String(raw ?? '');
    values[header] = formatAnswer(text, form.order);
  }
  if (unknown.length) {
    return NextResponse.json({ success: false, error: `No column for: ${unknown.join(' | ')}` }, { status: 422 });
  }

  values['Timestamp'] = formatTimestamp(submittedAt, form.order);
  if (body.email) values[form.emailHeader] = String(body.email);

  try {
    const { id, duplicate } = await insertRow(form.sheetId, form.tab, values, `${body.form}:${body.responseId}`);
    return NextResponse.json({ success: true, id, duplicate });
  } catch (err: unknown) {
    console.error('[intake]', err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
