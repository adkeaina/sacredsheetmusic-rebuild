export {};
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5173';
for (const path of [
  '/health',
  '/ready',
  '/',
  '/all',
  '/search?q=prayer&live=1',
  '/composers',
  '/competition',
  '/competition/results',
  '/accounts/login',
  '/about/about',
  '/youtube_skips',
]) {
  const start = performance.now();
  const response = await fetch(base + path);
  if (!response.ok) throw new Error(path + ' returned ' + response.status);
  if (
    !['/health', '/ready'].includes(path) &&
    !response.headers.get('X-Robots-Tag')?.includes('noindex')
  )
    throw new Error('Missing noindex: ' + path);
  console.log(path + ' ' + response.status + ' ' + Math.round(performance.now() - start) + 'ms');
}
const search = (await fetch(base + '/api/search?q=prayer').then((r) => r.json())) as any;
if (!search.items?.length) throw new Error('Search returned no arrangements.');
if (JSON.stringify(search).includes('private_email'))
  throw new Error('Search exposed private fields.');
for (const path of ['/admin/users', '/admin/outbox']) {
  const response = await fetch(base + path);
  if (![401, 403].includes(response.status))
    throw new Error('Private route was not protected: ' + path);
}
console.log('Public smoke and privacy checks passed.');
