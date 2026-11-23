import type { ActionFunctionArgs } from 'react-router';
import { cloudflareContext } from '../lib/context.server';
import { requireViewer } from '../lib/auth.server';
import { requireSameOrigin, privateKey, requestLimit } from '../lib/security.server';
import { audit } from '../lib/db.server';
export async function action({ request, context }: ActionFunctionArgs) {
  const { env, authState } = context.get(cloudflareContext);
  requireSameOrigin(request);
  await requestLimit(env, request, 'bootstrap', 5);
  const viewer = await requireViewer(request, env, authState);
  const body = (await request.json()) as { token?: string };
  if (
    !body.token ||
    (await privateKey(env.AUTH_SECRET, body.token)) !==
      (await privateKey(env.AUTH_SECRET, env.ADMIN_BOOTSTRAP_TOKEN))
  )
    throw new Response('Bootstrap token rejected', { status: 403 });
  const result = await env.DB.prepare(
    "UPDATE users SET role='admin' WHERE id=? AND NOT EXISTS(SELECT 1 FROM users WHERE role='admin')",
  )
    .bind(viewer.userId)
    .run();
  if (!result.meta.changes)
    return Response.json({ error: 'An administrator already exists.' }, { status: 409 });
  await audit(env, viewer.userId, 'admin.bootstrap', viewer.userId);
  return Response.json({ ok: true });
}
