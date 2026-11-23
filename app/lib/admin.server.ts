import type { Viewer } from './types.server';
import { first, rows, run, audit, type DbEnv } from './db.server';
import { safeExternalUrl } from './security.server';
import { reindexArrangement } from './search.server';
import { enqueueCatalogJob } from './catalog-jobs.server';
import { enqueueMail } from './mail.server';
import { adminAreas, fields, type AdminArea } from './admin-shared';
export { adminAreas, fields } from './admin-shared';
function admin(viewer: Viewer): asserts viewer is NonNullable<Viewer> {
  if (viewer?.role !== 'admin')
    throw new Response('Administrator access required', { status: 403 });
}
const integer = (value: unknown, fallback = 0) => {
  const n = Number(value ?? fallback);
  if (!Number.isSafeInteger(n))
    throw new Error('Please use a whole number for dates, ordering, and year.');
  return n;
};
export async function adminMutation(env: DbEnv, viewer: Viewer, input: Record<string, string>) {
  admin(viewer);
  const { area, intent } = input;
  if (!adminAreas.includes(area as AdminArea)) throw new Error('Unknown administration area.');
  const id = input.id || crypto.randomUUID();
  if (area === 'users' && intent === 'disable') {
    const changed = await run(
      env,
      "UPDATE users SET disabled=1 WHERE id=? AND (role!='admin' OR (SELECT count(*) FROM users WHERE role='admin' AND disabled=0)>1)",
      [id],
    );
    if (!changed.meta.changes) throw new Error('Keep at least one active administrator.');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id),
      env.DB.prepare('UPDATE composers SET user_id=NULL WHERE user_id=?').bind(id),
      env.DB.prepare('DELETE FROM composer_claims WHERE user_id=?').bind(id),
    ]);
    await audit(env, viewer.userId, 'user.disabled', id);
    return { id };
  }
  if (area === 'composers' && intent === 'link') {
    const user = await first<{ id: string; email: string }>(
      env,
      'SELECT id,email FROM users WHERE id=?',
      [input.userId],
    );
    const target = await first<{ id: string; name: string; user_id: string | null }>(
      env,
      'SELECT id,name,user_id FROM composers WHERE id=?',
      [id],
    );
    if (!user || !target) throw new Error('Choose an existing login and composer.');
    if (target.user_id && target.user_id !== user.id)
      throw new Error('This composer already belongs to another login.');
    if (target.user_id === user.id) return { id };
    const old = await first<{ id: string; slug: string }>(
      env,
      'SELECT id,slug FROM composers WHERE user_id=?',
      [user.id],
    );
    const statements = [
      env.DB.prepare('INSERT INTO composer_claims(composer_id,user_id) VALUES(?,?)').bind(
        id,
        user.id,
      ),
      env.DB.prepare('UPDATE composers SET user_id=NULL WHERE user_id=?').bind(user.id),
      env.DB.prepare('UPDATE composers SET user_id=?,private_email=? WHERE id=?').bind(
        user.id,
        user.email,
        id,
      ),
      env.DB.prepare('UPDATE users SET name=? WHERE id=?').bind(target.name, user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id),
    ];
    if (old) {
      statements.push(
        env.DB.prepare('UPDATE arrangements SET composer_id=? WHERE composer_id=?').bind(
          id,
          old.id,
        ),
        env.DB.prepare(
          'INSERT OR IGNORE INTO credits(arrangement_id,composer_id) SELECT arrangement_id,? FROM credits WHERE composer_id=?',
        ).bind(id, old.id),
        env.DB.prepare('DELETE FROM credits WHERE composer_id=?').bind(old.id),
        env.DB.prepare(
          'INSERT OR REPLACE INTO composer_aliases(slug,composer_id) VALUES(?,?)',
        ).bind(old.slug, id),
      );
    }
    await env.DB.batch(statements);
    await audit(env, viewer.userId, 'composer.link', id);
    return { id, jobId: await enqueueCatalogJob(env) };
  }
  if (intent === 'alphabetize' && area === 'tags') {
    const tags = await rows<{ id: string }>(
      env,
      "SELECT id FROM tags WHERE COALESCE(parent_id,'')=? ORDER BY name COLLATE NOCASE",
      [input.parent_id || ''],
    );
    await env.DB.batch(
      tags.map((t, i) => env.DB.prepare('UPDATE tags SET rank=? WHERE id=?').bind(i, t.id)),
    );
  } else if (intent === 'duplicate' || intent === 'same-author') {
    const a = await first<any>(env, 'SELECT * FROM arrangements WHERE id=?', [id]);
    if (!a) throw new Error('Song not found.');
    const target = crypto.randomUUID();
    await run(
      env,
      'INSERT INTO arrangements(id,code,title,composer_id,description,lyrics,voicing,difficulty,original,hymn,source_url,youtube_id,published,thumbnail,sample,rights_attested) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)',
      [
        target,
        a.code + '_' + target.slice(0, 6),
        intent === 'duplicate' ? a.title + ' (copy)' : 'New song by ' + viewer.name,
        a.composer_id,
        intent === 'duplicate' ? a.description : '',
        intent === 'duplicate' ? a.lyrics : '',
        a.voicing,
        a.difficulty,
        a.original,
        a.hymn,
        intent === 'duplicate' ? a.source_url : '',
        a.youtube_id,
        a.thumbnail,
        a.sample,
        a.rights_attested,
      ],
    );
    if (intent === 'duplicate') {
      await run(
        env,
        'INSERT INTO arrangement_tags SELECT ?,tag_id FROM arrangement_tags WHERE arrangement_id=?',
        [target, id],
      );
      await run(
        env,
        "INSERT INTO files(id,arrangement_id,owner_id,storage_key,filename,content_type,size,state,kind,rank,parent_id,provenance) SELECT ?||'-'||id,?,owner_id,storage_key,filename,content_type,size,state,kind,rank,NULL,provenance FROM files WHERE arrangement_id=? AND state='published'",
        [target, target, id],
      );
    }
    if (intent === 'duplicate') {
      await run(
        env,
        'INSERT INTO arrangement_tag_selections SELECT ?,tag_id FROM arrangement_tag_selections WHERE arrangement_id=?',
        [target, id],
      );
      await run(
        env,
        'INSERT OR IGNORE INTO credits SELECT ?,composer_id FROM credits WHERE arrangement_id=?',
        [target, id],
      );
    }
    await run(env, 'INSERT OR IGNORE INTO credits(arrangement_id,composer_id) VALUES(?,?)', [
      target,
      a.composer_id,
    ]);
    await reindexArrangement(env, target);
    await audit(env, viewer.userId, 'catalog.' + intent, target);
    return { id: target, redirect: '/admin/products/edit_song_easy/' + target };
  } else if (area === 'messages') {
    const subject = (input.subject || '').trim();
    const body = (input.body || '').trim();
    if (!subject || subject.length > 200 || !body || body.length > 10000)
      throw new Error('Please include a subject and message.');
    const composers = await rows<{
      user_id: string | null;
      private_email: string;
      id: string;
    }>(
      env,
      "SELECT id,user_id,private_email FROM composers WHERE private_email!='' AND (?='' OR id=?) ORDER BY id LIMIT 50",
      [input.composerId || '', input.composerId || ''],
    );
    for (const c of composers) {
      let content = body;
      if (input.kind === 'statistics') {
        const totals = await rows<{
          title: string;
          kind: string;
          count: number;
        }>(
          env,
          'SELECT a.title,s.kind,s.count FROM arrangements a JOIN stats s ON s.arrangement_id=a.id WHERE composer_id=?',
          [c.id],
        );
        content += '\n\n' + totals.map((s) => s.title + ': ' + s.kind + ' ' + s.count).join('\n');
      }
      await enqueueMail(env, {
        userId: c.user_id || undefined,
        recipient: c.private_email,
        subject,
        body: content,
        kind: input.kind === 'statistics' ? 'statistics' : 'announcement',
      });
    }
  } else if (intent === 'delete') {
    if (!fields[area] || ['catalog', 'files', 'users'].includes(area))
      throw new Error('Use the dedicated song, file, or account controls.');
    await run(env, `DELETE FROM ${area} WHERE ${area === 'preferences' ? 'key' : 'id'}=?`, [id]);
  } else if (intent === 'save') {
    if (!fields[area]) throw new Error('This area is read only.');
    const values: Record<string, string | number | null> = {};
    for (const f of fields[area]) {
      const value = (input[f] || '').slice(
        0,
        ['body', 'bio', 'description', 'notice'].includes(f) ? 50000 : 1000,
      );
      values[f] = ['rank', 'available_at', 'opens_at', 'closes_at', 'year'].includes(f)
        ? integer(value)
        : ['published', 'winner', 'disabled'].includes(f)
          ? value === '1'
            ? 1
            : 0
          : value;
    }
    if (area === 'tags') {
      if (!input.name?.trim() || !input.slug?.trim())
        throw new Error('A category needs a name and URL slug.');
      if (!['topic', 'voicing', 'instrument', 'group', 'composer', 'hymn'].includes(input.type))
        throw new Error('Choose a supported category type.');
      values.parent_id = input.parent_id || null;
      if (input.parent_id) {
        const ancestors = await rows<{ id: string }>(
          env,
          'WITH RECURSIVE chain(id,parent_id) AS (SELECT id,parent_id FROM tags WHERE id=? UNION SELECT t.id,t.parent_id FROM tags t JOIN chain c ON c.parent_id=t.id) SELECT id FROM chain',
          [input.parent_id],
        );
        if (ancestors.some((a) => a.id === id))
          throw new Error('This parent would create a category cycle.');
      }
    }
    if (area === 'composers') {
      if (!input.name?.trim() || !input.slug?.trim())
        throw new Error('Composer name and slug are required.');
      values.website = safeExternalUrl(input.website || '');
      values.contact_url = safeExternalUrl(input.contact_url || '');
    }
    if (area === 'pages' && (!input.slug?.trim() || !input.title?.trim()))
      throw new Error('Page slug and title are required.');
    if (area === 'users') {
      if (!['composer', 'admin'].includes(input.role)) throw new Error('Choose composer or admin.');
      const old = await first<{ role: string }>(env, 'SELECT role FROM users WHERE id=?', [id]);
      const count = await first<{ n: number }>(
        env,
        "SELECT count(*) n FROM users WHERE role='admin' AND disabled=0",
      );
      if (
        old?.role === 'admin' &&
        (input.role !== 'admin' || input.disabled === '1') &&
        (count?.n || 0) < 2
      )
        throw new Error('Keep at least one administrator.');
    }
    if (area === 'competitions' && Number(values.closes_at) <= Number(values.opens_at))
      throw new Error('The closing time must be after the opening time.');
    if (area === 'contacts' && !['captured', 'reviewed', 'resolved'].includes(input.status))
      throw new Error('Choose a valid contact status.');
    if (area === 'catalog' && !input.title?.trim()) throw new Error('Song title is required.');
    if (area === 'preferences' && !input.key?.trim())
      throw new Error('Preference key is required.');
    const table = area === 'catalog' ? 'arrangements' : area;
    const before =
      area === 'tags' || area === 'composers'
        ? await first<{ slug: string }>(env, `SELECT slug FROM ${area} WHERE id=?`, [id])
        : null;
    if (before && before.slug !== input.slug)
      await run(
        env,
        area === 'tags'
          ? 'INSERT OR REPLACE INTO tag_aliases(slug,tag_id) VALUES(?,?)'
          : 'INSERT OR REPLACE INTO composer_aliases(slug,composer_id) VALUES(?,?)',
        [before.slug, id],
      );
    const existing = await first(
      env,
      `SELECT 1 FROM ${table} WHERE ${area === 'preferences' ? 'key' : 'id'}=?`,
      [area === 'preferences' ? input.key : id],
    );
    const names = Object.keys(values);
    if (existing) {
      await run(
        env,
        `UPDATE ${table} SET ${names.map((n) => n + '=?').join(',')} WHERE ${area === 'preferences' ? 'key' : 'id'}=?`,
        [...Object.values(values), area === 'preferences' ? input.key : id],
      );
    } else {
      if (['users', 'catalog', 'files', 'contacts'].includes(area))
        throw new Error('This record does not exist.');
      const columns = area === 'preferences' ? names : ['id', ...names];
      await run(
        env,
        `INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`,
        area === 'preferences' ? Object.values(values) : [id, ...Object.values(values)],
      );
    }
    if (area === 'users') {
      await run(env, 'UPDATE composers SET name=? WHERE user_id=?', [input.name, id]);
      await run(env, 'DELETE FROM sessions WHERE user_id=?', [id]);
    }
    if (area === 'catalog') await reindexArrangement(env, id);
  } else throw new Error('Unknown operation.');
  await audit(env, viewer.userId, area + '.' + intent, id);
  return {
    id,
    ...(['tags', 'composers'].includes(area) && ['save', 'delete'].includes(intent)
      ? { jobId: await enqueueCatalogJob(env) }
      : {}),
  };
}
export function validateImportUrl(value: string) {
  const u = new URL(value);
  const host = u.hostname.toLowerCase();
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    (u.port && u.port !== '443') ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    !host.includes('.') ||
    host.includes(':') ||
    /^[\d.]+$/.test(host)
  )
    throw new Error('Use a public HTTPS hostname without credentials or a custom port.');
  return u;
}
export { parseIntervals } from './playback';
export async function diagnostics(env: DbEnv) {
  return {
    duplicates: await rows(
      env,
      'SELECT title,composer_id,count(*) count FROM arrangements GROUP BY title,composer_id HAVING count(*)>1 LIMIT 100',
    ),
    missingFiles: await rows(
      env,
      "SELECT a.id,a.title FROM arrangements a WHERE a.source_url='' AND NOT EXISTS(SELECT 1 FROM files f WHERE f.arrangement_id=a.id AND f.state='published' AND f.kind!='preview') LIMIT 100",
    ),
    missingMetadata: await rows(
      env,
      "SELECT id,title FROM arrangements WHERE voicing='' OR rights_attested=0 LIMIT 100",
    ),
    quota: await first(env, 'SELECT used,reserved,max_bytes FROM storage_quota'),
    jobs: await rows(env, 'SELECT * FROM processing_jobs ORDER BY created_at DESC LIMIT 50'),
  };
}

export function validateTrustedImport(value: string, hosts: string[]) {
  const url = validateImportUrl(value);
  if (!hosts.map((h) => h.trim().toLowerCase()).includes(url.hostname.toLowerCase()))
    throw new Error(
      'This import hostname is not a trusted source. Configure import_trusted_hosts in administrator Preferences first.',
    );
  return url;
}
