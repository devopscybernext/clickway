import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/session';
import { fetchSheetData } from '@/lib/dataStore';
import { HELP_SHEET_ID, TAB_HELP } from '@/lib/config';
import { canManageHelp } from '@/lib/auth';
import { addAttachment, countAttachments, getAttachment, sniffImage, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from '@/lib/data/helpAttachments';

export const runtime = 'nodejs';

// Screenshots on Help requests.
//   POST (multipart: helpId, file) — the person who sent the request adds a screenshot to it
//                                    (at most 3, each a PNG / JPEG / GIF / WebP up to 2 MB)
//   GET  ?id=<attachment id>       — the image itself, for the person who sent the request and the Super Admin
const RANGE = `'${TAB_HELP}'!A1:Z10000`;

async function requestOwner(helpId: number): Promise<string | null> {
  const { data } = await fetchSheetData(HELP_SHEET_ID, RANGE);
  const row = data.find(r => Number(r.__row) === helpId);
  return row ? String(row['Username'] ?? '').trim().toLowerCase() : null;
}

export async function POST(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const helpId = Number(form?.get('helpId'));
  const file = form?.get('file');
  if (!form || !helpId || helpId < 1 || !(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'Missing request or file' }, { status: 400 });
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ success: false, error: 'A screenshot can be 2 MB at most' }, { status: 413 });
  }

  const owner = await requestOwner(helpId);
  if (owner === null || owner !== user.username.trim().toLowerCase()) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  if ((await countAttachments(helpId)) >= MAX_ATTACHMENTS) {
    return NextResponse.json({ success: false, error: `At most ${MAX_ATTACHMENTS} screenshots per request` }, { status: 409 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return NextResponse.json({ success: false, error: 'Only PNG, JPEG, GIF or WebP images' }, { status: 415 });

  // a plain name — no paths, no markup — with the extension that matches the real type
  const base = (file.name || 'screenshot').replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 60) || 'screenshot';
  const id = await addAttachment(helpId, `${base}.${kind.ext}`, kind.mime, bytes);
  return NextResponse.json({ success: true, id });
}

export async function GET(req: NextRequest) {
  const user = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const id = Number(req.nextUrl.searchParams.get('id'));
  const shot = id > 0 ? await getAttachment(id) : null;
  if (!shot) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  if (!canManageHelp(user.role)) {
    const owner = await requestOwner(shot.helpId);
    if (owner === null || owner !== user.username.trim().toLowerCase()) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
  }
  return new NextResponse(new Uint8Array(shot.data), {
    headers: {
      'Content-Type': shot.mime,
      'Content-Disposition': `inline; filename="${shot.name.replace(/"/g, '')}"`,
      'X-Content-Type-Options': 'nosniff',
      // never cached: the same URL must be re-checked for whoever is logged in now (shared computers)
      'Cache-Control': 'no-store',
    },
  });
}
