import { redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from 'react-router';
import { cloudflareContext } from '../lib/context.server';
import { requireAdmin } from '../lib/auth.server';
import { requireSameOrigin, consumeRateLimit } from '../lib/security.server';
import { first, run, audit } from '../lib/db.server';
import { validateImportUrl } from '../lib/admin.server';
import {
  reserveUpload,
  uploadPart,
  finalizeUpload,
  cancelUpload,
  PART_SIZE,
} from '../lib/storage.server';
function publicAddress(value: string) {
  if (value.includes(':'))
    return (
      /^[23][a-f\d]{3}:/i.test(value) &&
      !value.toLowerCase().startsWith('2001:db8:') &&
      !value.toLowerCase().startsWith('2002:')
    );
  const n = value.split('.').map(Number);
  return (
    n.length === 4 &&
    n.every((x) => Number.isInteger(x) && x >= 0 && x <= 255) &&
    n[0] > 0 &&
    n[0] < 224 &&
    ![10, 127].includes(n[0]) &&
    !(n[0] === 100 && n[1] >= 64 && n[1] <= 127) &&
    !(n[0] === 169 && n[1] === 254) &&
    !(n[0] === 172 && n[1] >= 16 && n[1] <= 31) &&
    !(n[0] === 192 && (n[1] === 168 || n[1] === 0 || n[1] === 2)) &&
    !(n[0] === 198 && (n[1] === 18 || n[1] === 19 || n[1] === 51)) &&
    !(n[0] === 203 && n[1] === 0 && n[2] === 113)
  );
}
async function checkedFetch(value: string, signal: AbortSignal) {
  let url = validateImportUrl(value);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const records = await Promise.all(
      ['A', 'AAAA'].map(async (type) => {
        const response = await fetch(
          'https://cloudflare-dns.com/dns-query?name=' +
            encodeURIComponent(url.hostname) +
            '&type=' +
            type,
          { headers: { Accept: 'application/dns-json' }, signal },
        );
        if (!response.ok) throw new Error('Could not validate this hostname.');
        const dns = (await response.json()) as {
          Status: number;
          Answer?: { type: number; data: string }[];
        };
        if (dns.Status !== 0) throw new Error('This hostname did not resolve.');
        return (dns.Answer || []).filter((a) => [1, 28].includes(a.type)).map((a) => a.data);
      }),
    );
    const addresses = records.flat();
    if (!addresses.length || addresses.some((a) => !publicAddress(a)))
      throw new Error('Private or reserved network addresses cannot be imported.');
    const response = await fetch(url, {
      redirect: 'manual',
      signal,
      headers: { Accept: 'application/pdf,audio/*' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      if (redirects === 3) throw new Error('Too many redirects.');
      url = validateImportUrl(new URL(response.headers.get('Location') || '', url).href);
      continue;
    }
    if (!response.ok) throw new Error('The remote server returned ' + response.status + '.');
    return { response, url };
  }
  throw new Error('Import failed.');
}
export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(request, env);
  const id = new URL(request.url).searchParams.get('id') || '';
  const file = await first<{ id: string }>(
    env,
    "SELECT id FROM files WHERE arrangement_id=? AND content_type='application/pdf' AND state='published' ORDER BY rank LIMIT 1",
    [id],
  );
  if (!file) return Response.json({ error: 'No PDF is available for this song.' }, { status: 404 });
  return Response.json({ fileId: file.id }, { headers: { 'Cache-Control': 'private,no-store' } });
}
export async function action({ request, context }: ActionFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  requireSameOrigin(request);
  const viewer = await requireAdmin(request, env);
  await consumeRateLimit(env, 'import:' + viewer.userId, 10);
  const form = await request.formData();
  let ticketId = '';
  try {
    if (form.get('rights') !== 'on' || String(form.get('provenance') || '').trim().length < 5)
      throw new Error('Permission and attribution are required.');
    const signal = AbortSignal.timeout(60000);
    const { response, url } = await checkedFetch(String(form.get('url') || ''), signal);
    const size = Number(response.headers.get('Content-Length'));
    if (!size || size > 120 * 1024 * 1024 || !response.body)
      throw new Error(
        'The remote server must declare a file size no larger than 120 MiB. Download it yourself and use the regular uploader otherwise.',
      );
    const filename = decodeURIComponent(url.pathname.split('/').at(-1) || 'import.pdf');
    const extension = filename.toLowerCase().split('.').at(-1);
    const type =
      extension === 'pdf'
        ? 'application/pdf'
        : extension === 'mp3'
          ? 'audio/mpeg'
          : extension === 'wav'
            ? 'audio/wav'
            : extension === 'aac'
              ? 'audio/aac'
              : extension === 'm4a'
                ? 'audio/mp4'
                : '';
    if (!type) throw new Error('Remote import supports PDF, MP3, WAV, AAC, and M4A files.');
    const ticket = await reserveUpload(env, viewer, {
      arrangementId: String(form.get('arrangementId') || ''),
      filename,
      contentType: type,
      kind: type === 'application/pdf' ? 'score' : 'audio',
      size,
    });
    ticketId = ticket.id;
    const reader = response.body.getReader();
    let buffer = new Uint8Array(Math.min(PART_SIZE, size));
    let used = 0,
      total = 0,
      part = 1;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.length;
      if (total > size) {
        await reader.cancel();
        throw new Error('The remote response exceeded its declared size.');
      }
      let offset = 0;
      while (offset < next.value.length) {
        const count = Math.min(buffer.length - used, next.value.length - offset);
        buffer.set(next.value.subarray(offset, offset + count), used);
        used += count;
        offset += count;
        if (used === buffer.length) {
          await uploadPart(
            env,
            viewer,
            ticket.id,
            part++,
            new Request(request.url, { method: 'POST', body: buffer }),
          );
          buffer = new Uint8Array(Math.min(PART_SIZE, size - (part - 1) * PART_SIZE));
          used = 0;
        }
      }
    }
    if (total !== size) throw new Error('The transfer was interrupted. Please retry.');
    const file = await finalizeUpload(env, viewer, ticket.id);
    await run(env, 'UPDATE files SET provenance=? WHERE id=?', [
      String(form.get('provenance')).slice(0, 2000) + '\nSource: ' + url.href,
      file.id,
    ]);
    await audit(env, viewer.userId, 'files.remote-import', file.id);
    return redirect('/admin/products/edit_song_easy/' + String(form.get('arrangementId')));
  } catch (error) {
    if (ticketId) await cancelUpload(env, viewer, ticketId).catch(() => undefined);
    if (error instanceof Response) throw error;
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Import failed. Your existing song is unchanged.',
      },
      { status: 400 },
    );
  }
}
