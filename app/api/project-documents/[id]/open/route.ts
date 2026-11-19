import { NextRequest } from 'next/server';
import { actorFrom, respond, positiveId, withConnection, withLock, SHARING_LOCK } from '@/lib/projects/store';
import { openDocument } from '@/lib/projects/sharing';

export const runtime = 'nodejs';

// Opening a document: gives the person's Google account the right access if needed, and answers
// with the document's link. The page opens that link in a new tab.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return respond(req, async () => {
    const actor = await actorFrom(req);
    const id = positiveId((await ctx.params).id, 'document');
    const url = await withConnection(c => withLock(c, SHARING_LOCK, () => openDocument(c, actor, id)));
    return { url };
  });
}
