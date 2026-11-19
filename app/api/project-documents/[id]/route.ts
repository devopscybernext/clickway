import { NextRequest } from 'next/server';
import { actorFrom, respond, positiveId } from '@/lib/projects/store';
import { deleteDocument } from '@/lib/projects/projects';

export const runtime = 'nodejs';

// Delete a document: everyone's Google access is removed and the file goes to Drive Trash.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return respond(req, async () => {
    await deleteDocument(await actorFrom(req), positiveId((await ctx.params).id, 'document'));
    return { message: 'Document deleted.' };
  });
}
