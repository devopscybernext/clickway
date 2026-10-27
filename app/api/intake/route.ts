import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { insertRow } from '@/lib/data/mysql';
import { findDataset } from '@/lib/data/datasets';
import { INTAKE_TARGETS, formatAnswer, formatTimestamp } from '@/lib/forms';

export const runtime = 'nodejs';

// Google Forms → MySQL. For forms that are still Google Forms, an Apps Script
// on the form posts every new response here (docs/mysql-migration.md has the
// script). The dashboard's own entry forms post to /api/forms instead. The
// row is stored exactly as the form's linked sheet would have shown it: same
// columns, same timestamp/date format, checkbox answers joined with ", ".

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

  let body: { form?: string; responseId?: string; submittedAt?: string; email?: string; answers?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Body must be JSON' }, { status: 400 });
  }

  const form = body.form ? INTAKE_TARGETS[body.form] : undefined;
  if (!form) {
    return NextResponse.json({ success: false, error: `Unknown form "${body.form}". Expected one of: ${Object.keys(INTAKE_TARGETS).join(', ')}` }, { status: 400 });
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

  values['Timestamp'] = formatTimestamp(submittedAt, form.order, process.env.FORM_TIMEZONE || 'Asia/Kolkata');
  if (body.email) values[form.emailHeader] = String(body.email);

  try {
    const { id, duplicate } = await insertRow(form.sheetId, form.tab, values, `${body.form}:${body.responseId}`);
    return NextResponse.json({ success: true, id, duplicate });
  } catch (err: unknown) {
    console.error('[intake]', err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
