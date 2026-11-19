import { NextRequest } from 'next/server';
import { actorFrom, respond } from '@/lib/projects/store';
import { listDocuments } from '@/lib/projects/projects';

export const runtime = 'nodejs';

// Every document in the projects the person can see.
export async function GET(req: NextRequest) {
  return respond(req, async () => listDocuments(await actorFrom(req)));
}
