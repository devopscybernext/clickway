import { NextRequest } from 'next/server';
import { actorFrom, respond, readJson, positiveId } from '@/lib/projects/store';
import { getProject, updateProject } from '@/lib/projects/projects';

export const runtime = 'nodejs';

// One project: its details, members and documents (GET); edit it or mark it completed (PATCH).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return respond(req, async () => getProject(await actorFrom(req), positiveId((await ctx.params).id, 'project')));
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return respond(req, async () => {
    const actor = await actorFrom(req);
    await updateProject(actor, positiveId((await ctx.params).id, 'project'), await readJson(req));
    return { message: 'Project saved.' };
  });
}
