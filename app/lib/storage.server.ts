import type { AppEnv, Viewer } from './types.server';
import { first, rows, run, audit, type DbEnv, type FileRecord } from './db.server';
import { assertOwns, safeExternalUrl } from './security.server';
import { reindexArrangement } from './search.server';
export const PART_SIZE = 8 * 1024 * 1024;
export type UploadInput = {
  filename: string;
  contentType: string;
  size: number;
  kind: string;
  arrangementId?: string;
  parentId?: string;
};
const formats: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'audio/mpeg': ['mp3'],
  'audio/midi': ['mid', 'midi'],
  'audio/wav': ['wav'],
  'audio/aac': ['aac'],
  'audio/mp4': ['m4a'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'application/vnd.recordare.musicxml+xml': ['musicxml'],
  'application/vnd.recordare.musicxml': ['mxl'],
};
export function validateUpload(input: UploadInput) {
  const ext = input.filename.toLowerCase().split('.').at(-1) || '';
  const image = input.contentType.startsWith('image/');
  if (!formats[input.contentType]?.includes(ext))
    throw new Error(
      'Use a PDF, supported recording, MIDI, MusicXML, or image file. Active web files and video uploads are not accepted.',
    );
  if (
    !Number.isSafeInteger(input.size) ||
    input.size < 1 ||
    input.size > (image ? 10 : 120) * 1024 * 1024
  )
    throw new Error(
      image ? 'Images must be no larger than 10 MiB.' : 'Files must be no larger than 120 MiB.',
    );
  if (input.filename.length > 200 || /[\x00-\x1f\/\\]/.test(input.filename))
    throw new Error('Please use a simple filename without path separators.');
  if (input.kind === 'preview' && !image) throw new Error('A preview must be an image.');
  return input;
}
export function assertSignature(bytes: Uint8Array, type: string) {
  const text = new TextDecoder().decode(bytes.slice(0, 4096));
  let valid = false;
  switch (type) {
    case 'application/pdf':
      valid = text.startsWith('%PDF-');
      break;
    case 'audio/mpeg':
      valid = text.startsWith('ID3') || (bytes[0] === 255 && (bytes[1] & 224) === 224);
      break;
    case 'audio/midi':
      valid = text.startsWith('MThd');
      break;
    case 'audio/wav':
      valid = text.startsWith('RIFF') && text.slice(8, 12) === 'WAVE';
      break;
    case 'audio/aac':
      valid = bytes[0] === 255 && (bytes[1] & 240) === 240;
      break;
    case 'audio/mp4':
      valid = text.slice(4, 8) === 'ftyp';
      break;
    case 'image/png':
      valid =
        bytes.slice(0, 8).every((v, i) => v === [137, 80, 78, 71, 13, 10, 26, 10][i]) &&
        bytes.length >= 24;
      if (valid) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        valid =
          view.getUint32(16) > 0 &&
          view.getUint32(20) > 0 &&
          view.getUint32(16) <= 12000 &&
          view.getUint32(20) <= 12000;
      }
      break;
    case 'image/jpeg':
      valid = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      break;
    case 'image/gif':
      valid = text.startsWith('GIF87a') || text.startsWith('GIF89a');
      break;
    case 'image/webp':
      valid = text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP';
      break;
    case 'application/vnd.recordare.musicxml+xml':
      valid =
        /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!DOCTYPE\s+score-(?:partwise|timewise)\s+(?:PUBLIC|SYSTEM)\s+(?:"[^"]*"\s*){1,2}>\s*)?<score-(?:partwise|timewise)(?:\s|>)/.test(
          text,
        );
      break;
    case 'application/vnd.recordare.musicxml':
      valid = bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4;
      break;
  }
  if (!valid)
    throw new Error(
      'The file contents do not match its declared format, or the image dimensions are unsafe.',
    );
}
export type ArrangementInput = {
  id?: string;
  title: string;
  voicing: string;
  tagIds: string[];
  rights: boolean;
  original?: boolean;
  hymn?: string;
  description?: string;
  lyrics?: string;
  sourceUrl?: string;
  youtubeId?: string;
  difficulty?: string;
  composerId?: string;
  additionalComposerIds?: string[];
  code?: string;
};
export async function ownedArrangement(env: DbEnv, viewer: Viewer, id: string) {
  const a = await first<{
    id: string;
    composer_id: string;
    code: string;
    published: number;
  }>(env, 'SELECT id,composer_id,code,published FROM arrangements WHERE id=?', [id]);
  if (!a) throw new Response('Arrangement not found', { status: 404 });
  assertOwns(viewer, a.composer_id);
  return a;
}
export async function saveArrangement(env: DbEnv, viewer: Viewer, input: ArrangementInput) {
  if (!viewer) throw new Response('Please log in', { status: 401 });
  const old = input.id ? await ownedArrangement(env, viewer, input.id) : null;
  const composerId =
    viewer.role === 'admin'
      ? input.composerId || old?.composer_id || viewer.composerId
      : old?.composer_id || viewer.composerId;
  if (!composerId) throw new Error('Choose a composer for this song.');
  assertOwns(viewer, composerId);
  const composer = await first<{ name: string }>(env, 'SELECT name FROM composers WHERE id=?', [
    composerId,
  ]);
  if (!composer) throw new Error('Composer not found.');
  const title = input.title.trim();
  if (title.length < 2 || title.length > 180)
    throw new Error('Please enter a song name between 2 and 180 characters.');
  if (!input.voicing || input.voicing.length > 100)
    throw new Error('Please select at least one voicing or instrument.');
  if (!input.rights)
    throw new Error('Please confirm that you have permission to share this music.');
  const source = safeExternalUrl(input.sourceUrl?.trim() || '');
  let youtube = input.youtubeId?.trim() || '';
  if (youtube.startsWith('http')) {
    const url = new URL(safeExternalUrl(youtube));
    if (!['youtube.com', 'www.youtube.com', 'youtu.be', 'www.youtu.be'].includes(url.hostname))
      throw new Error('Please use a YouTube video address or ID.');
    youtube = url.hostname.includes('youtu.be')
      ? url.pathname.slice(1)
      : url.searchParams.get('v') || url.pathname.split('/').at(-1) || '';
  }
  if (youtube && !/^[A-Za-z0-9_-]{11}$/.test(youtube))
    throw new Error('Please enter a valid YouTube video ID.');
  const id = old?.id || crypto.randomUUID();
  let code =
    input.code?.trim() ||
    old?.code ||
    [title, input.voicing, 'by', composer.name]
      .join(' ')
      .replace(/[^\p{L}\p{N} ._-]/gu, '')
      .replaceAll(' ', '_');
  if (!code || code.length > 300 || code.includes('/'))
    throw new Error('Please use a song code without slashes, up to 300 characters.');
  const conflict = await first<{ id: string }>(
    env,
    'SELECT id FROM arrangements WHERE code=? AND id!=?',
    [code, id],
  );
  if (conflict) code += '_' + id.slice(0, 6);
  const tags = input.tagIds.slice(0, 40);
  if (tags.length) {
    const valid = await first<{ n: number }>(
      env,
      `SELECT count(*) AS n FROM tags WHERE id IN (${tags.map(() => '?').join(',')})`,
      tags,
    );
    if (valid?.n !== new Set(tags).size)
      throw new Error('One of the selected categories is unavailable.');
  }
  const statements = [
    env.DB.prepare(
      'INSERT INTO arrangements(id,code,title,composer_id,description,lyrics,voicing,difficulty,original,hymn,source_url,youtube_id,published,rights_attested,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,title=excluded.title,composer_id=excluded.composer_id,description=excluded.description,lyrics=excluded.lyrics,voicing=excluded.voicing,difficulty=excluded.difficulty,original=excluded.original,hymn=excluded.hymn,source_url=excluded.source_url,youtube_id=excluded.youtube_id,rights_attested=excluded.rights_attested,updated_at=excluded.updated_at',
    ).bind(
      id,
      code,
      title,
      composerId,
      (input.description || '').slice(0, 20000),
      (input.lyrics || '').slice(0, 50000),
      input.voicing,
      input.difficulty || 'Intermediate',
      input.original ? 1 : 0,
      (input.hymn || '').slice(0, 180),
      source,
      youtube,
      old?.published || 0,
      1,
      Date.now(),
      Date.now(),
    ),
    env.DB.prepare('DELETE FROM arrangement_tags WHERE arrangement_id=?').bind(id),
    env.DB.prepare('DELETE FROM arrangement_tag_selections WHERE arrangement_id=?').bind(id),
    env.DB.prepare('DELETE FROM credits WHERE arrangement_id=?').bind(id),
    env.DB.prepare('INSERT OR IGNORE INTO credits(arrangement_id,composer_id) VALUES(?,?)').bind(
      id,
      composerId,
    ),
  ];
  for (const credit of [...new Set(input.additionalComposerIds || [])].slice(0, 10)) {
    if (await first(env, 'SELECT 1 FROM composers WHERE id=?', [credit]))
      statements.push(
        env.DB.prepare(
          'INSERT OR IGNORE INTO credits(arrangement_id,composer_id) VALUES(?,?)',
        ).bind(id, credit),
      );
  }
  if (old && old.code !== code)
    statements.push(
      env.DB.prepare('INSERT OR IGNORE INTO aliases(code,arrangement_id) VALUES(?,?)').bind(
        old.code,
        id,
      ),
    );
  for (const tag of tags)
    statements.push(
      env.DB.prepare(
        'INSERT OR IGNORE INTO arrangement_tag_selections(arrangement_id,tag_id) VALUES(?,?)',
      ).bind(id, tag),
    );
  for (const tag of tags)
    statements.push(
      env.DB.prepare(
        'WITH RECURSIVE ancestors(id,parent_id) AS (SELECT id,parent_id FROM tags WHERE id=? UNION SELECT t.id,t.parent_id FROM tags t JOIN ancestors a ON a.parent_id=t.id) INSERT OR IGNORE INTO arrangement_tags(arrangement_id,tag_id) SELECT ?,id FROM ancestors',
      ).bind(tag, id),
    );
  await env.DB.batch(statements);
  await reindexArrangement(env, id);
  return { id, code };
}
export async function publishArrangement(env: DbEnv, viewer: Viewer, id: string, publish: boolean) {
  await ownedArrangement(env, viewer, id);
  const a = await first<{
    source_url: string;
    rights_attested: number;
    voicing: string;
  }>(env, 'SELECT source_url,rights_attested,voicing FROM arrangements WHERE id=?', [id]);
  if (publish) {
    const processing = await first(
      env,
      "SELECT 1 FROM processing_jobs j JOIN files f ON f.id=j.file_id WHERE j.arrangement_id=? AND j.type='pdf-preview' AND j.status!='complete' AND f.state='published' LIMIT 1",
      [id],
    );
    if (processing)
      throw new Error(
        'PDF processing is incomplete or failed. Your original file and draft are saved. Retry the preview or remove that file before publishing.',
      );
    const count = await first<{ n: number }>(
      env,
      "SELECT count(*) AS n FROM files WHERE arrangement_id=? AND state='published' AND kind!='preview'",
      [id],
    );
    if (!a?.rights_attested || !a.voicing || (!a.source_url && !count?.n))
      throw new Error(
        'Attach a score/recording or provide the original song page before publishing. Your draft has been saved.',
      );
  }
  await run(env, 'UPDATE arrangements SET published=?,updated_at=? WHERE id=?', [
    publish ? 1 : 0,
    Date.now(),
    id,
  ]);
  await reindexArrangement(env, id);
}
export async function reserveUpload(
  env: AppEnv,
  viewer: NonNullable<Viewer>,
  input: UploadInput & { arrangementId: string },
) {
  validateUpload(input);
  if (
    input.parentId &&
    !(await first(
      env,
      "SELECT 1 FROM files WHERE id=? AND arrangement_id=? AND state='published'",
      [input.parentId, input.arrangementId],
    ))
  )
    throw new Error('The parent score file is unavailable.');
  await ownedArrangement(env, viewer, input.arrangementId);
  const id = crypto.randomUUID();
  const key = 'uploads/' + viewer.userId + '/' + id + '/' + input.filename;
  const multipart = await env.FILES.createMultipartUpload(key, {
    httpMetadata: { contentType: input.contentType },
    customMetadata: { ticketId: id, ownerId: viewer.userId },
  });
  try {
    const result = await env.DB.batch([
      env.DB.prepare(
        `UPDATE storage_quota SET reserved=reserved+? WHERE id='preview' AND used+reserved+?<=max_bytes AND (SELECT COALESCE(sum(size),0) FROM files WHERE owner_id=? AND state!='failed')+(SELECT COALESCE(sum(size),0) FROM upload_tickets WHERE user_id=? AND state='reserved')+?<=1073741824`,
      ).bind(input.size, input.size, viewer.userId, viewer.userId, input.size),
      env.DB.prepare(
        'INSERT INTO upload_tickets(id,user_id,arrangement_id,storage_key,filename,content_type,size,kind,expires_at,created_at,upload_id,parent_id) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE changes()=1',
      ).bind(
        id,
        viewer.userId,
        input.arrangementId,
        key,
        input.filename,
        input.contentType,
        input.size,
        input.kind,
        Date.now() + 3600000,
        Date.now(),
        multipart.uploadId,
        input.parentId || null,
      ),
    ]);
    if (!result[1].meta.changes)
      throw new Error(
        'This preview has reached its upload quota. Your song draft is saved; please try a smaller file or contact the administrator.',
      );
    return { id, partSize: PART_SIZE, expiresAt: Date.now() + 3600000 };
  } catch (error) {
    await multipart.abort();
    throw error;
  }
}
export type Ticket = {
  id: string;
  user_id: string;
  arrangement_id: string;
  storage_key: string;
  filename: string;
  content_type: string;
  size: number;
  kind: string;
  state: string;
  upload_id: string;
  validated: number;
  expires_at: number;
  parent_id: string | null;
  reservation_active: number;
};
async function getTicket(env: DbEnv, viewer: NonNullable<Viewer>, id: string) {
  const ticket = await first<Ticket>(env, 'SELECT * FROM upload_tickets WHERE id=?', [id]);
  if (!ticket || ticket.user_id !== viewer.userId)
    throw new Response('Upload not found', { status: 404 });
  await ownedArrangement(env, viewer, ticket.arrangement_id);
  return ticket;
}
export async function uploadPart(
  env: AppEnv,
  viewer: NonNullable<Viewer>,
  id: string,
  part: number,
  request: Request,
) {
  const ticket = await getTicket(env, viewer, id);
  if (ticket.state !== 'reserved' || ticket.expires_at < Date.now())
    throw new Error('This upload expired. Retry to create a fresh upload.');
  const count = Math.ceil(ticket.size / PART_SIZE);
  if (!Number.isSafeInteger(part) || part < 1 || part > count || !request.body)
    throw new Error('Invalid upload part.');
  const expected = part === count ? ticket.size - PART_SIZE * (part - 1) : PART_SIZE;
  let size = 0;
  let header = new Uint8Array(0);
  const stream = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        size += chunk.byteLength;
        if (size > expected) throw new Error('Upload part is larger than declared.');
        if (part === 1 && header.length < 4096) {
          const next = new Uint8Array(Math.min(4096, header.length + chunk.length));
          next.set(header);
          next.set(chunk.slice(0, next.length - header.length), header.length);
          header = next;
        }
        controller.enqueue(chunk);
      },
      flush() {
        if (size !== expected) throw new Error('Upload part length does not match the file.');
        if (part === 1) assertSignature(header, ticket.content_type);
      },
    }),
  );
  const fixed = new FixedLengthStream(expected);
  const pumping = stream.pipeTo(fixed.writable);
  const [result] = await Promise.all([
    env.FILES.resumeMultipartUpload(ticket.storage_key, ticket.upload_id).uploadPart(
      part,
      fixed.readable,
    ),
    pumping,
  ]);
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO upload_parts(ticket_id,part_number,etag,size) VALUES(?,?,?,?) ON CONFLICT(ticket_id,part_number) DO UPDATE SET etag=excluded.etag,size=excluded.size',
    ).bind(id, part, result.etag, size),
    env.DB.prepare(
      'UPDATE upload_tickets SET validated=CASE WHEN ?=1 THEN 1 ELSE validated END WHERE id=?',
    ).bind(part, id),
  ]);
  return { partNumber: part, etag: result.etag };
}
export async function finalizeUpload(env: AppEnv, viewer: NonNullable<Viewer>, id: string) {
  const ticket = await getTicket(env, viewer, id);
  if (ticket.state === 'complete') {
    const existing = await first<FileRecord>(env, 'SELECT * FROM files WHERE id=?', [id]);
    if (existing) return existing;
    throw new Error('The completed file is no longer available.');
  }
  if (!['reserved', 'finalizing'].includes(ticket.state) || ticket.expires_at < Date.now())
    throw new Error('This upload is no longer active.');
  const parts = await rows<{ part_number: number; etag: string; size: number }>(
    env,
    'SELECT part_number,etag,size FROM upload_parts WHERE ticket_id=? ORDER BY part_number',
    [id],
  );
  if (
    !ticket.validated ||
    parts.length !== Math.ceil(ticket.size / PART_SIZE) ||
    parts.some((p, i) => p.part_number !== i + 1) ||
    parts.reduce((n, p) => n + p.size, 0) !== ticket.size
  )
    throw new Error('Some file parts are missing. Retry the upload before saving.');
  if (ticket.state === 'reserved') {
    const claim = await run(
      env,
      "UPDATE upload_tickets SET state='finalizing',expires_at=? WHERE id=? AND state='reserved'",
      [Date.now() + 3600000, id],
    );
    if (!claim.meta.changes)
      throw new Error('This upload is already finishing or being cancelled. Please retry.');
  }
  try {
    await env.FILES.resumeMultipartUpload(ticket.storage_key, ticket.upload_id).complete(
      parts.map((p) => ({ partNumber: p.part_number, etag: p.etag })),
    );
  } catch (error) {
    const object = await env.FILES.head(ticket.storage_key);
    if (!object || object.size !== ticket.size || object.customMetadata?.ticketId !== id)
      throw error;
  }
  const statements = [
    env.DB.prepare(
      "INSERT OR IGNORE INTO files(id,arrangement_id,owner_id,storage_key,filename,content_type,size,state,kind,rank,parent_id,provenance) SELECT id,arrangement_id,user_id,storage_key,filename,content_type,size,'published',kind,(SELECT COALESCE(max(rank),-1)+1 FROM files WHERE arrangement_id=?),parent_id,'Uploader confirmed permission to share.' FROM upload_tickets WHERE id=? AND state='finalizing'",
    ).bind(ticket.arrangement_id, id),
    env.DB.prepare(
      "UPDATE storage_quota SET used=used+?,reserved=reserved-? WHERE id='preview' AND changes()=1",
    ).bind(ticket.size, ticket.size),
    env.DB.prepare(
      "INSERT OR IGNORE INTO storage_objects(storage_key,size,charged,state) SELECT storage_key,size,1,'active' FROM upload_tickets WHERE id=? AND state='finalizing'",
    ).bind(id),
    env.DB.prepare(
      "UPDATE upload_tickets SET state='complete',reservation_active=0 WHERE id=? AND state='finalizing'",
    ).bind(id),
  ];
  if (ticket.content_type === 'application/pdf') {
    statements.push(
      env.DB.prepare(
        "INSERT OR IGNORE INTO processing_jobs(id,arrangement_id,file_id,type,status,created_at,updated_at) VALUES(?,?,?,'pdf-preview','pending',?,?)",
      ).bind('pdf-' + id, ticket.arrangement_id, id, Date.now(), Date.now()),
      env.DB.prepare('UPDATE arrangements SET published=0 WHERE id=?').bind(ticket.arrangement_id),
    );
  }
  if (ticket.kind === 'preview') {
    if (ticket.parent_id)
      statements.push(
        env.DB.prepare(
          "UPDATE files SET state='deleted',deleted_at=? WHERE parent_id=? AND kind='preview' AND id!=? AND state='published'",
        ).bind(Date.now(), ticket.parent_id, id),
      );
    statements.push(
      env.DB.prepare('UPDATE arrangements SET thumbnail=? WHERE id=?').bind(
        '/files/' + id,
        ticket.arrangement_id,
      ),
    );
  }
  await env.DB.batch(statements);
  const file = await first<FileRecord>(env, 'SELECT * FROM files WHERE id=?', [id]);
  if (!file)
    throw new Error(
      'File finalization was interrupted. The reservation is retained; retry to recover it.',
    );
  return file;
}
export async function cancelUpload(env: AppEnv, viewer: NonNullable<Viewer>, id: string) {
  const t = await getTicket(env, viewer, id);
  if (t.state !== 'reserved') return;
  const claim = await run(
    env,
    "UPDATE upload_tickets SET state='cancelling' WHERE id=? AND state='reserved'",
    [id],
  );
  if (!claim.meta.changes) return;
  try {
    await env.FILES.resumeMultipartUpload(t.storage_key, t.upload_id).abort();
  } catch (error) {
    const object = await env.FILES.head(t.storage_key);
    if (!object && !/no.?such|not.?found|does not exist|10024/i.test(String(error))) throw error;
  }
  const referenced = await first(env, 'SELECT 1 FROM files WHERE storage_key=? LIMIT 1', [
    t.storage_key,
  ]);
  if (referenced)
    throw new Error(
      'This file is still referenced; its reservation is retained for reconciliation.',
    );
  const object = await env.FILES.head(t.storage_key);
  if (object) await env.FILES.delete(t.storage_key);
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE upload_tickets SET state='cancelled',reservation_active=0 WHERE id=? AND state='cancelling'",
    ).bind(id),
    env.DB.prepare(
      "UPDATE storage_quota SET reserved=max(0,reserved-?) WHERE id='preview' AND changes()=1",
    ).bind(t.reservation_active ? t.size : 0),
  ]);
}
export async function removeFile(env: DbEnv, viewer: Viewer, id: string) {
  const f = await first<{ arrangement_id: string }>(
    env,
    'SELECT arrangement_id FROM files WHERE id=?',
    [id],
  );
  if (!f) throw new Response('File not found', { status: 404 });
  await ownedArrangement(env, viewer, f.arrangement_id);
  await run(env, "UPDATE files SET state='deleted',deleted_at=? WHERE id=?", [Date.now(), id]);
  await run(env, "UPDATE arrangements SET thumbnail='/fixtures/score.svg' WHERE thumbnail=?", [
    '/files/' + id,
  ]);
}
export async function deleteArrangement(env: AppEnv, viewer: NonNullable<Viewer>, id: string) {
  await ownedArrangement(env, viewer, id);
  if (
    await first(
      env,
      "SELECT 1 FROM upload_tickets WHERE arrangement_id=? AND state IN ('finalizing','cancelling','collecting') LIMIT 1",
      [id],
    )
  )
    throw new Error('A file transfer is still being reconciled. Retry after maintenance finishes.');
  const tickets = await rows<{ id: string }>(
    env,
    "SELECT id FROM upload_tickets WHERE arrangement_id=? AND state='reserved'",
    [id],
  );
  for (const t of tickets) await cancelUpload(env, viewer, t.id);
  await env.DB.batch([
    env.DB.prepare("UPDATE files SET state='deleted',deleted_at=? WHERE arrangement_id=?").bind(
      Date.now(),
      id,
    ),
    env.DB.prepare('DELETE FROM arrangement_search WHERE arrangement_id=?').bind(id),
    env.DB.prepare('DELETE FROM arrangements WHERE id=?').bind(id),
  ]);
  await audit(env, viewer.userId, 'arrangement.deleted', id);
}
