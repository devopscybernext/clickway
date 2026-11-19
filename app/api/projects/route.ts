import { NextRequest } from 'next/server';
import { actorFrom, respond, readJson } from '@/lib/projects/store';
import { listProjects, createProject } from '@/lib/projects/projects';

export const runtime = 'nodejs';

// Projects: the list the person can see (GET), and a new project (POST).
export async function GET(req: NextRequest) {
  return respond(req, async () => listProjects(await actorFrom(req)));
}

export async function POST(req: NextRequest) {
  return respond(req, async () => {
    const actor = await actorFrom(req);
    const id = await createProject(actor, await readJson(req));
    return { id, message: 'Project created.' };
  });
}
