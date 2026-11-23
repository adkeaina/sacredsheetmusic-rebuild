import type { Viewer, AppEnv } from './types.server';
import { first, type DbEnv } from './db.server';
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  if (origin !== new URL(request.url).origin)
    throw new Response('Please submit this form from the website.', {
      status: 403,
    });
}
export function assertOwns(viewer: Viewer, composerId: string) {
  if (!viewer || (viewer.role !== 'admin' && viewer.composerId !== composerId))
    throw new Response('You do not have permission to edit this music.', {
      status: 403,
    });
}
export async function consumeRateLimit(
  env: DbEnv,
  key: string,
  max = 30,
  windowMs = 600000,
  now = Date.now(),
) {
  const row = await first<{ count: number }>(
    env,
    'INSERT INTO rate_limits(key,count,window_end) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window_end<=? THEN 1 ELSE count+1 END,window_end=CASE WHEN window_end<=? THEN ? ELSE window_end END RETURNING count',
    [key, now + windowMs, now, now, now + windowMs],
  );
  if (!row || row.count > max)
    throw new Response('Too many requests. Please try again later.', {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(windowMs / 1000)) },
    });
}
export async function privateKey(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (x) => x.toString(16).padStart(2, '0')).join('');
}
export async function requestLimit(env: AppEnv, request: Request, scope: string, max = 30) {
  const key = await privateKey(
    env.HOUSEHOLD_SECRET,
    scope + ':' + (request.headers.get('CF-Connecting-IP') || 'local'),
  );
  await consumeRateLimit(env, key, max);
}
export function safeExternalUrl(value: string) {
  if (!value) return '';
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new Error('Please enter a complete https:// or http:// website address.');
  }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password)
    throw new Error('Please use an http or https website address without login credentials.');
  return u.href;
}
export function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}
