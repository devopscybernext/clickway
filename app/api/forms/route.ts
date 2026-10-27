import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { insertRow } from '@/lib/data/mysql';
import { AuthUser, getNavItems, isNavParent, isPmTierRole, isIndividualTierRole } from '@/lib/auth';
import { ENTRY_FORMS, FormKey, Answers, validateAnswers, answersToValues, formatTimestamp } from '@/lib/forms';

export const runtime = 'nodejs';

// Saves a submission from one of the dashboard's entry forms (lib/forms.ts)
// straight into MySQL, as a row shaped exactly like the Google Form's linked
// sheet produced: timestamp in the sheet's format, the submitter's email.

// Same rule as the sidebar: "Add Task" for a team only for users who have
// that team's Add Task page; "Add New Project" only for PMs; Leaderboard
// feedback for users who see the Leaderboard, except individual team members
// (so nobody awards themselves points).
function canUseForm(user: AuthUser, key: FormKey): boolean {
  if (key === 'pm-project') return isPmTierRole(user.role);
  const leaves = getNavItems(user).flatMap(item => (isNavParent(item) ? item.children : [item]));
  if (key === 'leaderboard') return !isIndividualTierRole(user.role) && leaves.some(leaf => leaf.id === '7');
  const team = key === 'web-task' ? 'web' : 'marketing';
  return leaves.some(leaf => leaf.id === '6' && leaf.team === team);
}

export async function POST(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: { form?: string; submissionId?: string; answers?: Answers };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Body must be JSON' }, { status: 400 });
  }

  const def = body.form && body.form in ENTRY_FORMS ? ENTRY_FORMS[body.form as FormKey] : undefined;
  if (!def) {
    return NextResponse.json({ success: false, error: 'Unknown form' }, { status: 400 });
  }
  if (!canUseForm(user, def.key)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  // A fresh id per filled-in form, so a double click or a retry after a
  // network hiccup stores the submission once.
  if (!body.submissionId || !/^[A-Za-z0-9-]{8,64}$/.test(body.submissionId)) {
    return NextResponse.json({ success: false, error: 'submissionId is required' }, { status: 400 });
  }
  const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
  const errors = validateAnswers(def, answers);
  if (Object.keys(errors).length) {
    return NextResponse.json({ success: false, error: 'Some answers need fixing', errors }, { status: 422 });
  }

  const values = { ...def.initialValues, ...answersToValues(def, answers) };
  values['Timestamp'] = formatTimestamp(new Date(), def.order, process.env.FORM_TIMEZONE || 'Asia/Kolkata');
  values[def.emailHeader] = user.email ?? '';

  try {
    const { id, duplicate } = await insertRow(def.sheetId, def.tab, values, `dashboard:${def.key}:${body.submissionId}`);
    return NextResponse.json({ success: true, id, duplicate });
  } catch (err: unknown) {
    console.error('[forms]', err);
    return NextResponse.json({ success: false, error: 'Could not save the form. Please try again.' }, { status: 500 });
  }
}
