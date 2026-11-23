import type { ActionFunctionArgs } from 'react-router';
import { cloudflareContext } from '../lib/context.server';
import { requireViewer } from '../lib/auth.server';
import { requireSameOrigin, consumeRateLimit } from '../lib/security.server';
import { reserveUpload, uploadPart, finalizeUpload, cancelUpload } from '../lib/storage.server';
export async function action({ request, params, context }: ActionFunctionArgs) {
  const { env, authState } = context.get(cloudflareContext);
  requireSameOrigin(request);
  const viewer = await requireViewer(request, env, authState);
  await consumeRateLimit(env, 'uploads:' + viewer.userId, 300);
  try {
    const op = params.op;
    if (op === 'reserve')
      return Response.json(await reserveUpload(env, viewer, await request.json()));
    if (!params.id) throw new Error('Upload ID is required.');
    if (op === 'part')
      return Response.json(
        await uploadPart(
          env,
          viewer,
          params.id,
          Number(new URL(request.url).searchParams.get('part')),
          request,
        ),
      );
    if (op === 'complete') return Response.json(await finalizeUpload(env, viewer, params.id));
    if (op === 'cancel') {
      await cancelUpload(env, viewer, params.id);
      return Response.json({ ok: true });
    }
    throw new Error('Unknown upload operation.');
  } catch (error) {
    if (error instanceof Response) throw error;
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Upload failed. Your draft is saved; please retry.',
      },
      { status: 400 },
    );
  }
}
