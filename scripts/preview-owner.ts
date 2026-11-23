import { request } from '@playwright/test';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5173';
const vars = Object.fromEntries(
  (await readFile('.dev.vars', 'utf8'))
    .split('\n')
    .filter((x) => x.includes('='))
    .map((x) => {
      const i = x.indexOf('=');
      return [x.slice(0, i), x.slice(i + 1).replace(/^"|"$/g, '')];
    }),
);
const account = {
  username: 'owner' + Date.now().toString(36),
  name: 'Preview Administrator',
  email: 'preview-owner-' + Date.now() + '@example.invalid',
  password: randomBytes(24).toString('base64url'),
};
const api = await request.newContext({ baseURL: base, extraHTTPHeaders: { Origin: base } });
try {
  const start = performance.now();
  const registered = await api.post('/api/auth/sign-up/email', { data: account });
  if (!registered.ok())
    throw new Error(
      'Owner registration failed ' + registered.status() + ': ' + (await registered.text()),
    );
  console.log('Remote owner registration ' + Math.round(performance.now() - start) + 'ms');
  const promoted = await api.post('/api/admin/bootstrap', {
    data: { token: vars.ADMIN_BOOTSTRAP_TOKEN },
  });
  if (!promoted.ok()) throw new Error('Bootstrap failed ' + promoted.status());
  await writeFile(
    '.cloudflare/operator.json',
    JSON.stringify({ ...account, baseURL: base }, null, 2),
    { mode: 0o600 },
  );
  await api.storageState({ path: '.cloudflare/operator-state.json' });
  await chmod('.cloudflare/operator-state.json', 0o600);
  const page = await api.get('/admin/users');
  if (!page.ok()) throw new Error('Administrator access failed ' + page.status());
  console.log(
    'First administrator bootstrapped; private credentials and browser state saved under .cloudflare.',
  );
} finally {
  await api.dispose();
}
