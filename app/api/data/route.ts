import { NextRequest, NextResponse } from 'next/server';
import { fetchSheetData } from '@/lib/dataStore';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { isReadableRange } from '@/lib/sheetAccess';
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

  // Only the exact ranges the dashboard reads — credentials (the UserDetails
  // spreadsheet, and the Sheet2 password tabs) never go through this proxy.
  if (!isReadableRange(sheetId, range)) {
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
