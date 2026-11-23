import type { LoaderFunctionArgs } from 'react-router';
import { cloudflareContext } from '../lib/context.server';
import { getTags } from '../lib/db.server';
import { queryCatalog } from '../lib/search.server';
export async function loader({ request, context }: LoaderFunctionArgs) {
  const u = new URL(request.url);
  const { env, authState } = context.get(cloudflareContext);
  let remembered = '';
  try {
    remembered = decodeURIComponent(
      (request.headers.get('Cookie') || '').match(/ssm_type=([^;]*)/)?.[1] || '',
    );
  } catch {}
  const type = u.searchParams.get('type') ?? remembered;
  const [result, tags] = await Promise.all([
    queryCatalog(env, {
      q: u.searchParams.get('q') || '',
      tag: u.searchParams.get('tag') || undefined,
      type,
      page: Number(u.searchParams.get('page') || 1),
      seed: u.searchParams.get('seed') || 'browse',
    }),
    getTags(env),
  ]);
  return Response.json(
    { ...result, tags, type },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
