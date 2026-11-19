import { NextRequest } from 'next/server';
import { actorFrom, respond } from '@/lib/projects/store';

export const runtime = 'nodejs';

// What the signed-in person may do in Projects, for the menu: hidden without access, Templates
// shown with full access.
export async function GET(req: NextRequest) {
  return respond(req, async () => {
    const { policy } = await actorFrom(req, { allowNoAccess: true });
    return { access: policy.access, create: policy.create, full: policy.full };
  });
}
