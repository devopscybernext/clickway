import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData, fetchSheetTabNames, SheetData } from '@/lib/dataStore';
import { PM_BANDWIDTH_SHEET_ID, USER_DETAILS_SHEET_ID, RANGE_USERS } from '@/lib/config';

export const runtime = 'nodejs';

// Every PM project of every month is one table (PM_BANDWIDTH_SHEET_ID, one tab). Each row is
// tagged with __period — 'current' when its Year/Month is this month (or later, or can't be read,
// so nothing is hidden), 'previous' for earlier months — which is what the Current Month and
// Previous Months tabs filter on. __pm is resolved from the row's own "Email Address" against
// the UserDetails roster; __sheetTab / __sheetId say where the row is stored for write-back
// (Dashboard.tsx's handlePmBandwidthChange).
const SOURCES = [{ sheetId: PM_BANDWIDTH_SHEET_ID, tag: 'pm' }];

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function thisMonth(): { year: number; month: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: process.env.FORM_TIMEZONE || 'Asia/Kolkata', year: 'numeric', month: 'numeric',
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return { year: Number(parts.year), month: Number(parts.month) - 1 };
}

function periodOf(year: string, month: string, now: { year: number; month: number }): 'current' | 'previous' {
  const y = parseInt(year, 10);
  const m = MONTHS.indexOf(month.trim().toLowerCase());
  if (!y || m === -1) return 'current';
  return y * 12 + m >= now.year * 12 + now.month ? 'current' : 'previous';
}

export async function GET(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: userRows } = await fetchSheetData(USER_DETAILS_SHEET_ID, RANGE_USERS);
    const emailToName = new Map<string, string>();
    userRows.forEach(r => {
      const email = String(r['Email'] ?? '').trim().toLowerCase();
      const name = String(r['Display Name'] ?? '').trim();
      if (email && name) emailToName.set(email, name);
    });

    let headers: string[] = [];
    const data: SheetData[] = [];
    const now = thisMonth();

    for (const { sheetId, tag } of SOURCES) {
      const tabs = await fetchSheetTabNames(sheetId);
      const results = await Promise.all(
        // A:AZ rather than A:Z — the sheets grew past column Z (Project
        // Progress Update, Upsell, Escalation, Client/Resource Feedback,
        // Problems - Next Month Needs) and a Z-capped range silently drops them.
        tabs.map(tab => fetchSheetData(sheetId, `'${tab}'!A1:AZ10000`, { renameDuplicateHeaders: true }))
      );
      tabs.forEach((tab, i) => {
        const { data: tabData, headers: tabHeaders } = results[i];
        if (tabHeaders.length > headers.length) headers = tabHeaders;
        const emailCol = tabHeaders.find(h => h.toLowerCase().includes('email'));
        const yearCol = tabHeaders.find(h => h.trim().toLowerCase() === 'year');
        const monthCol = tabHeaders.find(h => h.trim().toLowerCase() === 'month');
        tabData.forEach((row, idx) => {
          const email = emailCol ? String(row[emailCol] ?? '').trim().toLowerCase() : '';
          const pm = emailToName.get(email) ?? (email || '');
          // __row (write-back handle) comes from the data source
          const __period = periodOf(yearCol ? String(row[yearCol] ?? '') : '', monthCol ? String(row[monthCol] ?? '') : '', now);
          data.push({ ...row, __pm: pm, __sheetTab: tab, __sheetId: sheetId, __period, __id: `${tag}:${tab}:${idx}` });
        });
      });
    }

    return NextResponse.json({ success: true, data, headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
