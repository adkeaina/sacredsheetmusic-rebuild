import type { ActionFunctionArgs } from 'react-router';
import { cloudflareContext } from '../lib/context.server';
import { requireViewer } from '../lib/auth.server';
import { requireSameOrigin, consumeRateLimit } from '../lib/security.server';
import {
  saveArrangement,
  publishArrangement,
  deleteArrangement,
  removeFile,
  ownedArrangement,
} from '../lib/storage.server';
export async function action({ request, context }: ActionFunctionArgs) {
  const { env, authState } = context.get(cloudflareContext);
  requireSameOrigin(request);
  const viewer = await requireViewer(request, env, authState);
  await consumeRateLimit(env, 'editor:' + viewer.userId, 100);
  try {
    const body = (await request.json()) as Record<string, any>;
    if (body.intent === 'delete') {
      await deleteArrangement(env, viewer, String(body.id));
      return Response.json({ ok: true });
    }
    if (body.intent === 'remove-file') {
      await removeFile(env, viewer, String(body.id));
      return Response.json({ ok: true });
    }
    if (body.intent === 'order') {
      await ownedArrangement(env, viewer, String(body.id));
      const ids = Array.isArray(body.files) ? body.files.slice(0, 100).map(String) : [];
      await env.DB.batch(
        ids.map((id: string, i: number) =>
          env.DB.prepare('UPDATE files SET rank=? WHERE id=? AND arrangement_id=?').bind(
            i,
            id,
            body.id,
          ),
        ),
      );
      return Response.json({ ok: true });
    }
    if (body.intent === 'processing') {
      await ownedArrangement(env, viewer, String(body.id));
      const file = await env.DB.prepare(
        "SELECT id FROM files WHERE id=? AND arrangement_id=? AND content_type='application/pdf' AND state='published'",
      )
        .bind(String(body.fileId), String(body.id))
        .first();
      if (!file) throw new Error('The PDF is unavailable.');
      if (!['complete', 'failed'].includes(body.status))
        throw new Error('Invalid processing status.');
      await env.DB.prepare(
        "INSERT INTO processing_jobs(id,arrangement_id,file_id,type,status,detail,created_at,updated_at) VALUES(?,?,?,'pdf-preview',?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,detail=excluded.detail,updated_at=excluded.updated_at",
      )
        .bind(
          'pdf-' + body.fileId,
          String(body.id),
          String(body.fileId),
          body.status,
          String(body.detail || '').slice(0, 1000),
          Date.now(),
          Date.now(),
        )
        .run();
      return Response.json({ ok: true });
    }
    if (body.intent === 'publish') {
      await publishArrangement(env, viewer, String(body.id), body.publish === true);
      return Response.json({ ok: true });
    }
    return Response.json(await saveArrangement(env, viewer, body as any));
  } catch (error) {
    if (error instanceof Response) throw error;
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Unable to save this song.',
      },
      { status: 400 },
    );
  }
}
