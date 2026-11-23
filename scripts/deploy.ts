/** Token-based, replayable deployment; the connected Cloudflare app can perform the same API calls. */
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { hash } from 'blake3-wasm';
const account = 'd41631b94b54950fb1303d15d52f11fe',
  worker = 'sacred-sheet-music-preview',
  database = '9dfd38b2-ffb0-4e63-b509-dd3558e88ace';
const base = 'https://api.cloudflare.com/client/v4';
const root = '.cloudflare/output/v1/workers/default';
async function files(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const d of await readdir(dir, { withFileTypes: true }))
    d.isDirectory() ? out.push(...(await files(join(dir, d.name)))) : out.push(join(dir, d.name));
  return out;
}
const mime = (path: string) =>
  ({
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mid': 'audio/midi',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
  })[extname(path)] || 'application/octet-stream';
async function api(
  path: string,
  body: unknown,
  token = process.env.CLOUDFLARE_API_TOKEN!,
  method = 'POST',
) {
  if (!token) throw new Error('Set CLOUDFLARE_API_TOKEN with Workers, D1 and R2 edit access.');
  const response = await fetch(base + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  const json = (await response.json()) as any;
  if (!response.ok || json.success === false)
    throw new Error('Cloudflare request failed: ' + JSON.stringify(json.errors || response.status));
  return json.result;
}
await mkdir('.cloudflare/deploy', { recursive: true });
const mode = process.argv[2] || 'deploy';
if (mode === 'prepare' || mode === 'deploy') {
  const assetsDir = join(root, 'assets');
  const manifest: Record<string, { hash: string; size: number }> = {};
  const paths: Record<string, string> = {};
  for (const path of await files(assetsDir)) {
    const bytes = await readFile(path);
    const digest = hash(bytes.toString('base64') + extname(path).slice(1))
      .toString('hex')
      .slice(0, 32);
    manifest['/' + relative(assetsDir, path)] = {
      hash: digest,
      size: bytes.length,
    };
    paths[digest] = path;
  }
  const modules = [];
  for (const path of await files(join(root, 'bundle'))) {
    if (path.endsWith('.map')) continue;
    modules.push({
      name: relative(join(root, 'bundle'), path),
      type: path.endsWith('.wasm') ? 'application/wasm' : 'application/javascript+module',
      content: (await readFile(path)).toString('base64'),
    });
  }
  await writeFile(
    '.cloudflare/deploy/prepared.json',
    JSON.stringify({ manifest, paths, modules }),
    { mode: 0o600 },
  );
  console.log(
    'Prepared ' +
      Object.keys(manifest).length +
      ' assets and ' +
      modules.length +
      ' Worker modules.',
  );
}
const prepared = JSON.parse(await readFile('.cloudflare/deploy/prepared.json', 'utf8'));
if (mode === 'deploy') {
  const session = await api(
    `/accounts/${account}/workers/scripts/${worker}/assets-upload-session`,
    { manifest: prepared.manifest },
  );
  await writeFile('.cloudflare/deploy/session.json', JSON.stringify(session), {
    mode: 0o600,
  });
}
if (mode === 'assets' || mode === 'deploy') {
  const session = JSON.parse(await readFile('.cloudflare/deploy/session.json', 'utf8'));
  let completion = session.jwt;
  for (const bucket of session.buckets) {
    const form = new FormData();
    for (const digest of bucket) {
      const path = prepared.paths[digest];
      form.append(
        digest,
        new Blob([(await readFile(path)).toString('base64')], {
          type: mime(path),
        }),
        digest,
      );
    }
    const response = await fetch(base + `/accounts/${account}/workers/assets/upload?base64=true`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + session.jwt },
      body: form,
    });
    const json = (await response.json()) as any;
    if (!response.ok || json.success === false)
      throw new Error('Asset upload failed: ' + JSON.stringify(json.errors));
    if (json.result?.jwt) completion = json.result.jwt;
    console.log('Uploaded asset batch (' + bucket.length + ' files).');
  }
  await writeFile('.cloudflare/deploy/completion.json', JSON.stringify({ jwt: completion }), {
    mode: 0o600,
  });
}
if (mode === 'deploy') {
  const secrets = Object.fromEntries(
    (await readFile('.dev.vars', 'utf8'))
      .split('\n')
      .filter((x) => x.includes('='))
      .map((x) => {
        const i = x.indexOf('=');
        return [x.slice(0, i), x.slice(i + 1).replace(/^"|"$/g, '')];
      }),
  );
  const completion = JSON.parse(await readFile('.cloudflare/deploy/completion.json', 'utf8'));
  const metadata = {
    main_module: 'index.js',
    compatibility_date: '2026-11-22',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    bindings: [
      { type: 'd1', name: 'DB', id: database },
      {
        type: 'r2_bucket',
        name: 'FILES',
        bucket_name: 'sacred-music-preview-files',
      },
      { type: 'plain_text', name: 'PREVIEW_MODE', text: 'true' },
      ...Object.entries(secrets).map(([name, text]) => ({
        type: 'secret_text',
        name,
        text,
      })),
    ],
    assets: {
      jwt: completion.jwt,
      config: { html_handling: 'none', not_found_handling: 'none' },
    },
    observability: {
      enabled: true,
      redact_query_string: true,
      logs: { enabled: true, invocation_logs: false },
    },
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  for (const m of prepared.modules)
    form.append(m.name, new Blob([Buffer.from(m.content, 'base64')], { type: m.type }), m.name);
  const result = await api(
    `/accounts/${account}/workers/scripts/${worker}`,
    form,
    undefined,
    'PUT',
  );
  await api(`/accounts/${account}/workers/scripts/${worker}/subdomain`, {
    enabled: true,
    previews_enabled: false,
  });
  await api(
    `/accounts/${account}/workers/scripts/${worker}/schedules`,
    [{ cron: '0 * * * *' }, { cron: '*/15 * * * *' }],
    undefined,
    'PUT',
  );
  console.log('Deployed version ' + result.id + ' to https://' + worker + '.adkeaina.workers.dev');
}
