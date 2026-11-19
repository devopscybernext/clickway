import { NextRequest } from 'next/server';
import { actorFrom, respond, ProjectError } from '@/lib/projects/store';
import { listTemplates, addTemplate } from '@/lib/projects/projects';

export const runtime = 'nodejs';

// Document templates: the list (GET), and a new one (POST, Super Admin and HM; multipart for the upload).
export async function GET(req: NextRequest) {
  return respond(req, async () => listTemplates(await actorFrom(req)));
}

export async function POST(req: NextRequest) {
  return respond(req, async () => {
    const actor = await actorFrom(req);
    const form = await req.formData().catch(() => { throw new ProjectError('Invalid request. The file may be too large.'); });
    const str = (k: string) => { const v = form.get(k); return typeof v === 'string' ? v : ''; };
    const file = form.get('upload');
    await addTemplate(actor, {
      creationKey: str('creationKey'), name: str('name'), category: str('category'), platform: str('platform'),
      description: str('description'), source: str('source'), url: str('url'), upload: file instanceof File ? file : null,
    });
    return { message: 'Template added.' };
  });
}
