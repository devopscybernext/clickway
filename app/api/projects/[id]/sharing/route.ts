import { NextRequest } from 'next/server';
import { actorFrom, respond, positiveId } from '@/lib/projects/store';
import { retrySharing } from '@/lib/projects/projects';

export const runtime = 'nodejs';

// Retry sharing: brings every restricted document's Google access in line with the project's members.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return respond(req, async () => retrySharing(await actorFrom(req), positiveId((await ctx.params).id, 'project')));
}
