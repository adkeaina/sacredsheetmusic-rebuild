import { indexSourceSql, indexValues, type IndexSource } from '../app/lib/index-document';
import { readFile, readdir } from 'node:fs/promises';
import { seedStatements } from './seed-data';
const account = 'd41631b94b54950fb1303d15d52f11fe',
  database = '9dfd38b2-ffb0-4e63-b509-dd3558e88ace',
  bucket = 'sacred-music-preview-files';
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('Set a scoped CLOUDFLARE_API_TOKEN.');
async function query(sql: string, params: (string | number | null)[] = []) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    },
  );
  const body = (await response.json()) as any;
  if (!response.ok || !body.success || body.result.some((r: any) => !r.success))
    throw new Error('D1 operation failed: ' + JSON.stringify(body.errors || body.result));
  return body.result;
}
await query(
  'CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY,applied_at INTEGER NOT NULL)',
);
for (const name of (await readdir('migrations')).filter((x) => x.endsWith('.sql')).sort()) {
  const result = await query('SELECT name FROM schema_migrations WHERE name=?', [name]);
  if (result[0].results.length) continue;
  await query(await readFile('migrations/' + name, 'utf8'));
  await query('INSERT INTO schema_migrations VALUES(?,?)', [name, Date.now()]);
  console.log('Applied ' + name);
}
for (const s of seedStatements()) await query(s.sql, s.params);
await query('DELETE FROM arrangement_search');
const source = (await query(indexSourceSql + ' GROUP BY a.id'))[0].results as IndexSource[];
for (const a of source)
  await query(
    'INSERT INTO arrangement_search(arrangement_id,title,composer,tags,description,code) VALUES(?,?,?,?,?,?)',
    indexValues(a),
  );
for (const name of ['sample.pdf', 'sample.mp3', 'sample.mid', 'score.svg', 'ffmpeg-core.wasm']) {
  const runtime = name.endsWith('.wasm');
  const bytes = await readFile(
    runtime ? 'node_modules/@ffmpeg/core/dist/esm/' + name : 'public/fixtures/' + name,
  );
  const key = (runtime ? 'runtime/' : 'fixtures/') + name;
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${bucket}/objects/${key}`,
    {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/octet-stream',
      },
      body: bytes,
    },
  );
  if (!response.ok) throw new Error('R2 object provisioning failed: ' + response.status);
  if (!runtime) await query('UPDATE files SET size=? WHERE storage_key=?', [bytes.length, key]);
  console.log('Provisioned ' + key);
}
console.log('Preview data is current.');
