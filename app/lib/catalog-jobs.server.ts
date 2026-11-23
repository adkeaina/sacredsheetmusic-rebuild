import { first, rows, run, type DbEnv } from './db.server';
import { reindexArrangement } from './search.server';
export async function enqueueCatalogJob(env: DbEnv) {
  const id = crypto.randomUUID();
  await run(
    env,
    "INSERT INTO processing_jobs(id,type,status,detail,created_at,updated_at) VALUES(?,'catalog-sync','pending',?, ?,?)",
    [id, JSON.stringify({ cursor: '' }), Date.now(), Date.now()],
  );
  return id;
}
export async function reconcileTags(env: DbEnv, id: string) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM arrangement_tags WHERE arrangement_id=?').bind(id),
    env.DB.prepare(
      'WITH RECURSIVE ancestors(id,parent_id) AS (SELECT t.id,t.parent_id FROM tags t JOIN arrangement_tag_selections s ON s.tag_id=t.id WHERE s.arrangement_id=? UNION SELECT t.id,t.parent_id FROM tags t JOIN ancestors a ON a.parent_id=t.id) INSERT OR IGNORE INTO arrangement_tags(arrangement_id,tag_id) SELECT ?,id FROM ancestors',
    ).bind(id, id),
  ]);
}
export async function processCatalogJob(env: DbEnv, id: string) {
  const job = await first<{ status: string; detail: string; updated_at: number }>(
    env,
    "SELECT status,detail,updated_at FROM processing_jobs WHERE id=? AND type='catalog-sync'",
    [id],
  );
  if (!job) throw new Error('Catalog job not found.');
  if (job.status === 'complete') return { done: true, cursor: '' };
  const now = Date.now();
  if (job.status === 'running' && job.updated_at > now - 60000) return { done: false, busy: true };
  const claim = await run(
    env,
    "UPDATE processing_jobs SET status='running',updated_at=? WHERE id=? AND updated_at=?",
    [now, id, job.updated_at],
  );
  if (!claim.meta.changes) return { done: false, busy: true };
  const cursor = (JSON.parse(job.detail || '{}') as { cursor?: string }).cursor || '';
  const items = await rows<{ id: string }>(
    env,
    'SELECT id FROM arrangements WHERE id>? ORDER BY id LIMIT 10',
    [cursor],
  );
  for (const item of items) {
    await reconcileTags(env, item.id);
    await reindexArrangement(env, item.id);
  }
  const done = items.length < 10;
  const next = items.at(-1)?.id || cursor;
  await run(env, 'UPDATE processing_jobs SET status=?,detail=?,updated_at=? WHERE id=?', [
    done ? 'complete' : 'pending',
    JSON.stringify({ cursor: next }),
    Date.now(),
    id,
  ]);
  return { done, cursor: next };
}
