import { NextRequest } from 'next/server';
import { actorFrom, respond, positiveId } from '@/lib/projects/store';
import { removeTemplate } from '@/lib/projects/projects';

export const runtime = 'nodejs';

// Remove a template from the list (Super Admin and HM). Documents made from it are not affected.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return respond(req, async () => {
    await removeTemplate(await actorFrom(req), positiveId((await ctx.params).id, 'template'));
    return { message: 'Template removed.' };
  });
}
