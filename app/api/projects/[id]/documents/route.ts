import { NextRequest } from 'next/server';
import { actorFrom, respond, positiveId, ProjectError } from '@/lib/projects/store';
import { addDocument } from '@/lib/projects/projects';

export const runtime = 'nodejs';

// A new document in the project, sent as a form (multipart, for the optional upload).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return respond(req, async () => {
    const actor = await actorFrom(req);
    const projectId = positiveId((await ctx.params).id, 'project');
    const form = await req.formData().catch(() => { throw new ProjectError('Invalid request. The file may be too large.'); });
    const str = (k: string) => { const v = form.get(k); return typeof v === 'string' ? v : ''; };
    const file = form.get('upload');
    const result = await addDocument(actor, projectId, {
      creationKey: str('creationKey'), title: str('title'), visibility: str('visibility'), source: str('source'),
      templateId: str('templateId'), url: str('url'), upload: file instanceof File ? file : null,
    });
    return { ...result, message: 'Document added.' };
  });
}
