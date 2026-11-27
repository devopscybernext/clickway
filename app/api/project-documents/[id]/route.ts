import { NextRequest } from 'next/server';
import { actorFrom, respond, positiveId, readJson } from '@/lib/projects/store';
import { deleteDocument, updateDocument } from '@/lib/projects/projects';

export const runtime = 'nodejs';

// Delete a document: everyone's Google access is removed and the file goes to Drive Trash.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return respond(req, async () => {
    await deleteDocument(await actorFrom(req), positiveId((await ctx.params).id, 'document'));
    return { message: 'Document deleted.' };
  });
}

// Edit a document (PATCH { title, visibility: 'public' | 'invite', linkRole: 'reader' | 'writer' }):
// the person who added it, Super Admin, HM and Mod.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return respond(req, async () => {
    const actor = await actorFrom(req);
    return updateDocument(actor, positiveId((await ctx.params).id, 'document'), await readJson(req));
  });
}
