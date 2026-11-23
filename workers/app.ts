import { collectFiles } from '../app/lib/maintenance.server';
import { processCatalogJob } from '../app/lib/catalog-jobs.server';
import { first } from '../app/lib/db.server';
import { createRequestHandler, RouterContextProvider } from 'react-router';
import { cloudflareContext } from '../app/lib/context.server';
import type { AppEnv } from '../app/lib/types.server';
const handler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
);
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        if (event.cron === '0 * * * *') {
          await collectFiles(env);
          return;
        }
        const job = await first<{ id: string }>(
          env,
          "SELECT id FROM processing_jobs WHERE type='catalog-sync' AND status!='complete' ORDER BY created_at LIMIT 1",
        );
        if (job) await processCatalogJob(env, job.id);
      })(),
    );
  },
  async fetch(request: Request, env: AppEnv, ctx: ExecutionContext) {
    const path = new URL(request.url).pathname;
    if (path === '/health')
      return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
    if (path === '/ready') {
      try {
        await env.DB.prepare('SELECT 1').first();
        return Response.json({ status: 'ready' });
      } catch {
        return Response.json({ status: 'unavailable' }, { status: 503 });
      }
    }
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx, authState: {} });
    const response = await handler(request, context);
    if (!response.headers.has('Cache-Control'))
      response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (new URL(request.url).protocol === 'https:')
      response.headers.set('Strict-Transport-Security', 'max-age=31536000');
    return response;
  },
} satisfies ExportedHandler<AppEnv>;
