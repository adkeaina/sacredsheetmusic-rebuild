import type { LoaderFunctionArgs } from 'react-router';
import { cloudflareContext } from '../lib/context.server';
import { queryCatalog } from '../lib/search.server';
export async function loader({ request, context }: LoaderFunctionArgs) {
  const u = new URL(request.url);
  const { env } = context.get(cloudflareContext);
  return Response.json(
    await queryCatalog(env, {
      q: u.searchParams.get('q') || '',
      tag: u.searchParams.get('tag') || undefined,
      type: u.searchParams.get('type') || undefined,
      page: Number(u.searchParams.get('page') || 1),
      seed: u.searchParams.get('seed') || 'browse',
    }),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
