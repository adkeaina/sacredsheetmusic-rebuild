import type { AppEnv, ArrangementSummary } from './types.server';
export type DbEnv = Pick<AppEnv, 'DB'>;
export type SqlValue = string | number | null;
export const visible = 'a.published=1 AND a.available_at<=?';
export const summarySelect = `a.id,a.code,a.title,a.composer_id,c.name AS composer,c.slug AS composer_slug,a.voicing,a.difficulty,a.description,a.original,a.winner,a.created_at,a.thumbnail,EXISTS(SELECT 1 FROM files af WHERE af.arrangement_id=a.id AND af.state='published' AND af.content_type LIKE 'audio/%') AS has_audio,(SELECT avg(rating) FROM comments WHERE arrangement_id=a.id AND approved=1) AS rating,COALESCE((SELECT group_concat(t.name, ', ') FROM tags t JOIN arrangement_tags at ON at.tag_id=t.id WHERE at.arrangement_id=a.id),'') AS tags`;
export const getDb = (env: DbEnv) => env.DB;
export async function rows<T>(env: DbEnv, sql: string, params: SqlValue[] = []): Promise<T[]> {
  return (
    await env.DB.prepare(sql)
      .bind(...params)
      .all<T>()
  ).results;
}
export async function first<T>(
  env: DbEnv,
  sql: string,
  params: SqlValue[] = [],
): Promise<T | null> {
  return env.DB.prepare(sql)
    .bind(...params)
    .first<T>();
}
export async function run(env: DbEnv, sql: string, params: SqlValue[] = []) {
  return env.DB.prepare(sql)
    .bind(...params)
    .run();
}
export type FileRecord = {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  kind: string;
  rank: number;
  storage_key: string;
  parent_id: string | null;
  state: string;
};
export type PublicComment = {
  id: string;
  name: string;
  text: string;
  rating: number | null;
  created_at: number;
};
export type ArrangementDetail = ArrangementSummary & {
  lyrics: string;
  hymn: string;
  source_url: string;
  youtube_id: string;
  sample: number;
  notice: string;
  website: string;
  contact_url: string;
  files: FileRecord[];
  comments: PublicComment[];
  related: ArrangementSummary[];
  credits: { id: string; name: string; slug: string }[];
};
export async function getArrangement(env: DbEnv, code: string): Promise<ArrangementDetail | null> {
  const item = await first<Omit<ArrangementDetail, 'files' | 'comments' | 'related'>>(
    env,
    `SELECT ${summarySelect},a.lyrics,a.hymn,a.source_url,a.youtube_id,a.sample,c.notice,c.website,c.contact_url FROM arrangements a JOIN composers c ON c.id=a.composer_id WHERE (a.code=? OR a.id=(SELECT arrangement_id FROM aliases WHERE code=?)) AND ${visible}`,
    [code, code, Date.now()],
  );
  if (!item) return null;
  const [files, comments, related] = await Promise.all([
    rows<FileRecord>(
      env,
      "SELECT id,filename,content_type,size,kind,rank,storage_key,parent_id,state FROM files WHERE arrangement_id=? AND state='published' ORDER BY rank,created_at",
      [item.id],
    ),
    rows<PublicComment>(
      env,
      'SELECT id,name,text,rating,created_at FROM comments WHERE arrangement_id=? AND approved=1 ORDER BY created_at DESC LIMIT 100',
      [item.id],
    ),
    rows<ArrangementSummary>(
      env,
      `SELECT ${summarySelect} FROM arrangements a JOIN composers c ON c.id=a.composer_id WHERE a.id!=? AND ${visible} AND (a.composer_id=? OR (a.hymn!='' AND a.hymn=?)) ORDER BY a.hymn=? DESC,a.title LIMIT 8`,
      [item.id, Date.now(), item.composer_id, item.hymn, item.hymn],
    ),
  ]);
  return {
    ...item,
    files,
    comments,
    related,
    credits: await rows<{ id: string; name: string; slug: string }>(
      env,
      'SELECT c.id,c.name,c.slug FROM composers c JOIN credits cr ON cr.composer_id=c.id WHERE cr.arrangement_id=? AND c.id!=? ORDER BY c.name',
      [item.id, item.composer_id],
    ),
  };
}
export type Tag = {
  id: string;
  name: string;
  slug: string;
  type: string;
  parent_id: string | null;
  rank: number;
  description: string;
  rights_warning: string;
};
export const getTags = (env: DbEnv) => rows<Tag>(env, 'SELECT * FROM tags ORDER BY rank,name');
export async function audit(env: DbEnv, userId: string, action: string, targetId: string) {
  await run(
    env,
    'INSERT INTO audit_events(id,user_id,action,target_id,created_at) VALUES(?,?,?,?,?)',
    [crypto.randomUUID(), userId, action, targetId, Date.now()],
  );
}
