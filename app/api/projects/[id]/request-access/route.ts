import { NextRequest } from 'next/server';
import { actorFrom, respond, positiveId } from '@/lib/projects/store';
import { requestAccess } from '@/lib/projects/projects';

export const runtime = 'nodejs';

// All Projects → Request Access: asks the project's creator to add the signed-in person.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return respond(req, async () => {
    const actor = await actorFrom(req, { allowNoAccess: true });
    return requestAccess(actor, positiveId((await ctx.params).id, 'project'));
  });
}
