import { NextRequest } from 'next/server';
import { actorFrom, respond, readJson } from '@/lib/projects/store';
import { getSettings, saveSetting } from '@/lib/projects/settings';

export const runtime = 'nodejs';

// Admin Portal → Projects (HM and Super Admin): the settings per department and per person (GET),
// and saving one department's or one person's settings (PUT).
export async function GET(req: NextRequest) {
  return respond(req, async () => getSettings(await actorFrom(req, { allowNoAccess: true })));
}

export async function PUT(req: NextRequest) {
  return respond(req, async () => {
    const actor = await actorFrom(req, { allowNoAccess: true });
    return saveSetting(actor, await readJson(req));
  });
}
