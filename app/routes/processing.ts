import type { LoaderFunctionArgs } from 'react-router';
import { cloudflareContext } from '../lib/context.server';
export async function loader({ params, context }: LoaderFunctionArgs) {
  if (params.name !== 'ffmpeg-core.wasm') throw new Response('Not found', { status: 404 });
  const { env } = context.get(cloudflareContext);
  const object = await env.FILES.get('runtime/ffmpeg-core.wasm');
  if (!object)
    throw new Response('Audio conversion is unavailable. Upload the original recording instead.', {
      status: 503,
    });
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/wasm',
      'Cache-Control': 'public,max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
