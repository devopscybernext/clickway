import { NextRequest } from 'next/server';
import { actorFrom, respond, readJson } from '@/lib/projects/store';
import { setPin } from '@/lib/projects/projects';

export const runtime = 'nodejs';

// Pin or unpin a project or a document, for the signed-in person only: { kind, id, pinned }.
export async function POST(req: NextRequest) {
  return respond(req, async () => {
    await setPin(await actorFrom(req), await readJson(req));
    return {};
  });
}
