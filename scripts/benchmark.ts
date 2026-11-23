import { readFile, readdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { seedStatements } from './seed-data';
const prepared = JSON.parse(await readFile('.cloudflare/deploy/prepared.json', 'utf8'));
const scratch = await mkdtemp(join(tmpdir(), 'sacred-benchmark-'));
const modules = Object.fromEntries(
  prepared.modules.map((m: any) => [
    m.name,
    {
      type: m.type === 'application/wasm' ? 'compiled-wasm' : 'esm',
      contents:
        m.type === 'application/wasm'
          ? Buffer.from(m.content, 'base64')
          : Buffer.from(m.content, 'base64').toString(),
    },
  ]),
);
const mf = new Miniflare({
  resourcePersistencePath: scratch,
  workers: [
    {
      config: {
        name: 'benchmark',
        compatibilityDate: '2026-11-22',
        compatibilityFlags: ['nodejs_compat'],
        env: {
          DB: { type: 'd1', id: 'benchmark-only' },
          FILES: { type: 'r2', name: 'benchmark-only' },
          AUTH_SECRET: {
            type: 'text',
            value: 'benchmark-only-secret-not-a-live-credential',
          },
          HOUSEHOLD_SECRET: {
            type: 'text',
            value: 'benchmark-household-secret',
          },
          ADMIN_BOOTSTRAP_TOKEN: {
            type: 'text',
            value: 'benchmark-bootstrap-secret',
          },
          PREVIEW_MODE: { type: 'text', value: 'true' },
        },
        manifest: { mainModule: 'index.js', modules },
      },
    },
  ],
});
try {
  const db = await mf.getD1Database('DB', 'benchmark');
  for (const name of (await readdir('migrations')).filter((n) => n.endsWith('.sql')).sort())
    await db.exec(await readFile('migrations/' + name, 'utf8'));
  const statements = seedStatements(Date.now(), 10000);
  for (let i = 0; i < statements.length; i += 80)
    await db.batch(statements.slice(i, i + 80).map((s) => db.prepare(s.sql).bind(...s.params)));
  await db
    .prepare(
      `INSERT INTO arrangement_search(arrangement_id,title,composer,tags,description,code) SELECT a.id,lower(a.title),lower(c.name),lower(a.voicing||' '||COALESCE(group_concat(t.name,' '),'')),lower(a.description),lower(a.code) FROM arrangements a JOIN composers c ON c.id=a.composer_id LEFT JOIN arrangement_tags at ON at.arrangement_id=a.id LEFT JOIN tags t ON t.id=at.tag_id GROUP BY a.id`,
    )
    .run();
  const samples: number[] = [];
  for (let wave = 0; wave < 10; wave++)
    await Promise.all(
      Array.from({ length: 10 }, async (_, i) => {
        const start = performance.now();
        const response = await mf.dispatchFetch(
          'https://benchmark.invalid/api/search?q=' +
            ['prayer', 'light', 'faith', 'peace', 'Christmas'][i % 5],
        );
        if (!response.ok) throw new Error('Benchmark request failed: ' + response.status);
        await response.arrayBuffer();
        samples.push(performance.now() - start);
      }),
    );
  samples.sort((a, b) => a - b);
  const report = {
    environment: 'Local production Worker in workerd + isolated D1; not public network latency',
    catalogRows: 10000,
    concurrentReaders: 10,
    requests: samples.length,
    p50_ms: Math.round(samples[49]),
    p95_ms: Math.round(samples[94]),
    target_p95_ms: 500,
  };
  await writeFile('.cloudflare/benchmark.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await mf.dispose();
  await rm(scratch, { recursive: true, force: true });
}
