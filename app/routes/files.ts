import type { LoaderFunctionArgs } from 'react-router';
import { cloudflareContext } from '../lib/context.server';
import { visitorSession } from '../lib/visitor.server';
import { recordEvent } from '../lib/community.server';
import { getViewer } from '../lib/auth.server';
import { filePolicy } from '../lib/file-policy.server';
import { first } from '../lib/db.server';
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const { env, authState } = context.get(cloudflareContext);

  const file = await first<{
    storage_key: string;
    filename: string;
    content_type: string;
    size: number;
    published: number;
    available_at: number;
    composer_id: string;
    arrangement_id: string;
  }>(
    env,
    "SELECT f.storage_key,f.filename,f.content_type,f.size,a.published,a.available_at,a.composer_id,f.arrangement_id FROM files f JOIN arrangements a ON a.id=f.arrangement_id WHERE f.id=? AND f.state='published'",
    [params.id || ''],
  );
  if (!file) throw new Response('File not found', { status: 404 });
  const publicFile = file.published === 1 && file.available_at <= Date.now();
  if (!publicFile) {
    const viewer = await getViewer(request, env, authState);
    if (viewer?.role !== 'admin' && viewer?.composerId !== file.composer_id)
      throw new Response('File not found', { status: 404 });
  }
  const range = request.headers.get('Range');
  if (
    range &&
    (!/^bytes=(\d+)-(\d*)$/.test(range) || Number(range.match(/bytes=(\d+)/)?.[1]) >= file.size)
  )
    return new Response('Unsupported range', { status: 416 });
  const object = await env.FILES.get(
    file.storage_key,
    range ? { range: request.headers } : undefined,
  );
  if (!object)
    throw new Response('The file is unavailable. Please try again later.', {
      status: 404,
    });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', file.content_type);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('ETag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');

  const download =
    new URL(request.url).searchParams.has('download') ||
    new URL(request.url).pathname.includes('/download_file/');
  const policy = filePolicy(file.content_type, file.published, file.available_at, download);
  headers.set('Cache-Control', policy.cache);
  headers.set(
    'Content-Disposition',
    policy.disposition + "; filename*=UTF-8''" + encodeURIComponent(file.filename),
  );
  if (download && !range && publicFile) {
    const visitor = await visitorSession(request, env);
    await recordEvent(env, file.arrangement_id, 'download', visitor.id);
    if (visitor.header) headers.set('Set-Cookie', visitor.header);
    headers.set('Cache-Control', 'private,no-store');
  }
  let status = 200;
  if (range && object.range && 'offset' in object.range && object.range.offset !== undefined) {
    const start = object.range.offset;
    const length = object.range.length ?? object.size - start;
    headers.set('Content-Range', `bytes ${start}-${start + length - 1}/${object.size}`);
    headers.set('Content-Length', String(length));
    status = 206;
  } else headers.set('Content-Length', String(object.size));
  return new Response(object.body, { status, headers });
}
