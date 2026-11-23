import type { AppEnv } from './types.server';
import { rows, first, run } from './db.server';
export async function collectFiles(env: Pick<AppEnv, 'DB' | 'FILES'>, now = Date.now()) {
  const expired = await rows<{
    id: string;
    state: string;
    storage_key: string;
    upload_id: string;
    size: number;
    reservation_active: number;
  }>(
    env,
    "SELECT id,state,storage_key,upload_id,size,reservation_active FROM upload_tickets WHERE (state IN ('reserved','finalizing','cancelling','cancelled','expired') AND expires_at<?) OR (state='collecting' AND expires_at<?) LIMIT 3",
    [now - 300000, now - 3600000],
  );
  for (const t of expired) {
    const claim = await run(
      env,
      "UPDATE upload_tickets SET state='collecting',expires_at=? WHERE id=? AND state=?",
      [now + 3600000, t.id, t.state],
    );
    if (!claim.meta.changes) continue;
    const object = await env.FILES.head(t.storage_key);
    if (object) {
      if (await first(env, 'SELECT 1 FROM files WHERE storage_key=? LIMIT 1', [t.storage_key]))
        continue;
      await env.FILES.delete(t.storage_key);
    } else {
      try {
        await env.FILES.resumeMultipartUpload(t.storage_key, t.upload_id).abort();
      } catch (error) {
        if (!/no.?such|not.?found|does not exist|10024/i.test(String(error))) continue;
      }
    }
    const chargedReservation = t.reservation_active === 1;
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE upload_tickets SET state='cleaned',reservation_active=0 WHERE id=? AND state='collecting'",
      ).bind(t.id),
      env.DB.prepare(
        "UPDATE storage_quota SET reserved=max(0,reserved-?) WHERE id='preview' AND changes()=1",
      ).bind(chargedReservation ? t.size : 0),
    ]);
  }
  const candidates = await rows<{ storage_key: string; size: number }>(
    env,
    "SELECT storage_key,max(size) size FROM files WHERE state='deleted' AND deleted_at<? GROUP BY storage_key LIMIT 3",
    [now - 259200000],
  );
  for (const f of candidates) {
    const live = await first(
      env,
      "SELECT 1 FROM files WHERE storage_key=? AND state!='deleted' LIMIT 1",
      [f.storage_key],
    );
    if (live) {
      await run(env, "DELETE FROM files WHERE storage_key=? AND state='deleted' AND deleted_at<?", [
        f.storage_key,
        now - 259200000,
      ]);
      continue;
    }
    await run(
      env,
      "INSERT OR IGNORE INTO storage_objects(storage_key,size,charged,state) VALUES(?,?,0,'active')",
      [f.storage_key, f.size],
    );
    const claim = await run(
      env,
      "UPDATE storage_objects SET state='deleting',claimed_at=? WHERE storage_key=? AND (state='active' OR (state='deleting' AND claimed_at<?))",
      [now, f.storage_key, now - 3600000],
    );
    if (!claim.meta.changes) continue;
    const charge = await first<{ size: number; charged: number }>(
      env,
      'SELECT size,charged FROM storage_objects WHERE storage_key=?',
      [f.storage_key],
    );
    await env.FILES.delete(f.storage_key);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE storage_objects SET state='deleted' WHERE storage_key=? AND state='deleting' AND claimed_at=?",
      ).bind(f.storage_key, now),
      env.DB.prepare(
        "UPDATE storage_quota SET used=max(0,used-?) WHERE id='preview' AND changes()=1",
      ).bind(charge?.charged ? charge.size : 0),
      env.DB.prepare("DELETE FROM files WHERE storage_key=? AND state='deleted'").bind(
        f.storage_key,
      ),
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
