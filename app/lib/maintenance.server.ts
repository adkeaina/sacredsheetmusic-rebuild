import type { AppEnv } from './types.server';
import { rows } from './db.server';
export async function collectFiles(env: Pick<AppEnv, 'DB' | 'FILES'>, now = Date.now()) {
  const expired = await rows<{
    id: string;
    storage_key: string;
    upload_id: string;
    size: number;
  }>(
    env,
    "SELECT id,storage_key,upload_id,size FROM upload_tickets WHERE state='reserved' AND expires_at<? LIMIT 50",
    [now],
  );
  for (const t of expired) {
    await env.FILES.resumeMultipartUpload(t.storage_key, t.upload_id)
      .abort()
      .catch(() => undefined);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE upload_tickets SET state='expired' WHERE id=? AND state='reserved'",
      ).bind(t.id),
      env.DB.prepare(
        "UPDATE storage_quota SET reserved=max(0,reserved-?) WHERE id='preview' AND changes()=1",
      ).bind(t.size),
    ]);
  }
  const candidates = await rows<{ storage_key: string; size: number }>(
    env,
    "SELECT storage_key,max(size) size FROM files WHERE state='deleted' AND deleted_at<? GROUP BY storage_key LIMIT 50",
    [now - 259200000],
  );
  for (const f of candidates) {
    const live = await env.DB.prepare(
      "SELECT id FROM files WHERE storage_key=? AND state!='deleted' LIMIT 1",
    )
      .bind(f.storage_key)
      .first();
    if (live) {
      await env.DB.prepare(
        "DELETE FROM files WHERE storage_key=? AND state='deleted' AND deleted_at<?",
      )
        .bind(f.storage_key, now - 259200000)
        .run();
      continue;
    }
    await env.FILES.delete(f.storage_key);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM files WHERE storage_key=? AND state='deleted'").bind(
        f.storage_key,
      ),
      env.DB.prepare("UPDATE storage_quota SET used=max(0,used-?) WHERE id='preview'").bind(f.size),
    ]);
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM rate_limits WHERE window_end<?').bind(now),
    env.DB.prepare('DELETE FROM counted_events WHERE expires_at<?').bind(now),
    env.DB.prepare('DELETE FROM verifications WHERE expires_at<?').bind(now),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now),
    env.DB.prepare('DELETE FROM mail_outbox WHERE expires_at IS NOT NULL AND expires_at<?').bind(
      now,
    ),
  ]);
  return { expired: expired.length, collected: candidates.length };
}
