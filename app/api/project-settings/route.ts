import { NextRequest } from 'next/server';
import { actorFrom, respond, readJson } from '@/lib/projects/store';
import { getSettings, saveAlwaysEditor } from '@/lib/projects/settings';

export const runtime = 'nodejs';

// Admin Portal → Projects (HM and Super Admin): the always editors (GET), and adding or removing one
// (POST { action: 'add' | 'remove', email }).
export async function GET(req: NextRequest) {
  return respond(req, async () => getSettings(await actorFrom(req, { allowNoAccess: true })));
}

export async function POST(req: NextRequest) {
  return respond(req, async () => {
    const actor = await actorFrom(req, { allowNoAccess: true });
    return saveAlwaysEditor(actor, await readJson(req));
  });
}
