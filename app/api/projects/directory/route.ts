import { NextRequest } from 'next/server';
import { actorFrom, respond } from '@/lib/projects/store';
import { listAllProjects } from '@/lib/projects/projects';

export const runtime = 'nodejs';

// All Projects: every project, for everyone signed in, without documents or Drive links.
export async function GET(req: NextRequest) {
  return respond(req, async () => listAllProjects(await actorFrom(req, { allowNoAccess: true })));
}
