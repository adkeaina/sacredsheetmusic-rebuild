import type { AppEnv } from './types.server';
import { rows, run } from './db.server';
export async function inspectStoredFiles(env: Pick<AppEnv, 'DB' | 'FILES'>, cursor: string) {
  const files = await rows<{
    id: string;
    storage_key: string;
    arrangement_id: string;
    filename: string;
  }>(
    env,
    "SELECT id,storage_key,arrangement_id,filename FROM files WHERE state='published' AND id>? ORDER BY id LIMIT 10",
    [cursor],
  );
  const missing: typeof files = [];
  for (const file of files) {
    const head = await env.FILES.head(file.storage_key);
    if (!head) missing.push(file);
    else await run(env, 'UPDATE files SET content_hash=? WHERE id=?', [head.etag, file.id]);
  }
  const duplicates = await rows(
    env,
    "SELECT arrangement_id,content_hash,count(*) count,group_concat(filename) filenames FROM files WHERE state='published' AND content_hash!='' GROUP BY arrangement_id,content_hash HAVING count(*)>1 LIMIT 100",
  );
  return {
    missing,
    duplicates,
    cursor: files.length === 10 ? files.at(-1)!.id : '',
    done: files.length < 10,
  };
}
