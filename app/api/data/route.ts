import { NextRequest, NextResponse } from 'next/server';
import { fetchSheetData } from '@/lib/googleSheets';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { TAB_USERS } from '@/lib/config';
import { isDirectBrowserNavigation } from '@/lib/blockDirectAccess';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // Block opening this URL directly in a browser tab — only the dashboard's
  // own in-app fetch() calls are allowed through.
  if (isDirectBrowserNavigation(req)) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }

  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sheetId = searchParams.get('sheetId');
  const range = searchParams.get('range') ?? 'Sheet1!A1:Z10000';

  if (!sheetId) {
    return NextResponse.json({ success: false, error: 'sheetId is required' }, { status: 400 });
  }

  // The Users tab holds password hashes — never serve it through this generic
  // proxy, only through the narrow, server-only routes that strip it out.
  if (range.toLowerCase().includes(TAB_USERS.toLowerCase())) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { data, headers } = await fetchSheetData(sheetId, range);
    return NextResponse.json({
      success: true,
      data,
      headers,
      recordCount: data.length,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
