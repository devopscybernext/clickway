import { NextRequest } from 'next/server';
import { actorFrom, respond, readJson, positiveId } from '@/lib/projects/store';
import { saveMember } from '@/lib/projects/projects';

export const runtime = 'nodejs';

// Add a member, change their access (viewer / editor / manager = Creator) or remove them.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return respond(req, async () => {
    const actor = await actorFrom(req);
    return saveMember(actor, positiveId((await ctx.params).id, 'project'), await readJson(req));
  });
}
