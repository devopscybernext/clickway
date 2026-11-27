import { NextRequest } from 'next/server';
import { actorFrom, respond, readJson, positiveId } from '@/lib/projects/store';
import { getDocumentAccess, saveDocumentAccess } from '@/lib/projects/projects';

export const runtime = 'nodejs';

// Each project member's level on one "Project members only" document (GET), and changing them
// (PUT { permissions: [{ userId, level: 'none' | 'viewer' | 'editor' }] }).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return respond(req, async () => getDocumentAccess(await actorFrom(req), positiveId((await ctx.params).id, 'document')));
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return respond(req, async () => {
    const actor = await actorFrom(req);
    return saveDocumentAccess(actor, positiveId((await ctx.params).id, 'document'), await readJson(req));
  });
}
