import { NextRequest } from 'next/server';
import { actorFrom, respond, positiveId } from '@/lib/projects/store';
import { getProjectOverview } from '@/lib/projects/projects';

export const runtime = 'nodejs';

// A read-only overview of any project (opened from All Projects), without its documents.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return respond(req, async () => getProjectOverview(await actorFrom(req, { allowNoAccess: true }), positiveId((await ctx.params).id, 'project')));
}
