import {
  Form,
  Link,
  redirect,
  useLoaderData,
  useActionData,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from 'react-router';
import { useState } from 'react';
import { cloudflareContext } from '../lib/context.server';
import { requireAdmin } from '../lib/auth.server';
import { rows, first, audit } from '../lib/db.server';
import { adminAreas } from '../lib/admin-shared';
import { fields, adminMutation, diagnostics } from '../lib/admin.server';
import { requireSameOrigin, consumeRateLimit } from '../lib/security.server';
import { collectFiles } from '../lib/maintenance.server';
import { reindexArrangement } from '../lib/search.server';
import { removeFile } from '../lib/storage.server';
const aliases: Record<string, string> = {
  'products/list': 'catalog',
  'products/index': 'catalog',
  'products/with_problems': 'diagnostics',
  'tags/list': 'tags',
  'users/list': 'users',
  'content_nodes/list': 'pages',
  'preferences/list': 'preferences',
  'products/spam_all_composers_pre': 'messages',
  'products/single_composer_stats': 'messages',
};
function areaFor(params: Record<string, string | undefined>, request: Request) {
  return (
    params.area ||
    aliases[new URL(request.url).pathname.replace(/\.data$/, '').replace(/^\/admin\//, '')] ||
    'catalog'
  );
}
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(request, env);
  const area = areaFor(params, request);
  if (!adminAreas.includes(area as any)) throw new Response('Tool not found', { status: 404 });
  const url = new URL(request.url);
  const page = Math.max(1, Math.min(10000, Number(url.searchParams.get('page') || 1) || 1));
  const q = (url.searchParams.get('q') || '').slice(0, 100);
  const id = url.searchParams.get('edit') || '';
  let items: Record<string, any>[] = [];
  if (fields[area] || area === 'audit') {
    const column =
      area === 'preferences'
        ? 'key'
        : area === 'files'
          ? 'filename'
          : area === 'contacts'
            ? 'email'
            : area === 'audit'
              ? 'action'
              : ['catalog', 'pages', 'competitions'].includes(area)
                ? 'title'
                : 'name';
    const table = area === 'catalog' ? 'arrangements' : area === 'audit' ? 'audit_events' : area;
    const selection = area === 'users' ? 'id,name,email,role,username,created_at' : '*';
    items = await rows(
      env,
      `SELECT ${selection} FROM ${table} WHERE ${column} LIKE ? ORDER BY ${column} LIMIT 100 OFFSET ?`,
      ['%' + q + '%', (page - 1) * 100],
    );
  }
  let selected: Record<string, any> | null = null;
  if (id && fields[area]) {
    const table = area === 'catalog' ? 'arrangements' : area;
    selected = await first(
      env,
      `SELECT ${area === 'users' ? 'id,name,role' : '*'} FROM ${table} WHERE ${area === 'preferences' ? 'key' : 'id'}=?`,
      [id],
    );
  }
  const composers =
    area === 'messages'
      ? await rows<{ id: string; name: string }>(
          env,
          'SELECT id,name FROM composers ORDER BY name LIMIT 500',
        )
      : [];
  return {
    area,
    items,
    selected,
    fieldNames: fields[area] || [],
    q,
    page,
    report: area === 'diagnostics' ? await diagnostics(env) : null,
    composers,
  };
}
export async function action({ request, params, context }: ActionFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  requireSameOrigin(request);
  const viewer = await requireAdmin(request, env);
  await consumeRateLimit(env, 'admin:' + viewer.userId, 200);
  const f = await request.formData();
  const body = Object.fromEntries([...f.entries()].map(([k, v]) => [k, String(v)]));
  body.area = areaFor(params, request);
  try {
    if (body.intent === 'collect') {
      const result = await collectFiles(env);
      await audit(env, viewer.userId, 'maintenance.collect', 'files');
      return {
        success:
          'Maintenance completed: ' +
          result.expired +
          ' expired uploads, ' +
          result.collected +
          ' file keys checked.',
      };
    }
    if (body.intent === 'reindex') {
      const items = await rows<{ id: string }>(
        env,
        'SELECT id FROM arrangements WHERE id>? ORDER BY id LIMIT 50',
        [body.cursor || ''],
      );
      for (const a of items) await reindexArrangement(env, a.id);
      await audit(env, viewer.userId, 'maintenance.reindex', items.at(-1)?.id || 'complete');
      return {
        success:
          items.length === 50
            ? 'Reindexed 50 songs. Continue with the next batch.'
            : 'Search index rebuild completed.',
        cursor: items.length === 50 ? items.at(-1)!.id : '',
      };
    }
    if (body.area === 'files' && body.intent === 'remove') {
      await removeFile(env, viewer, body.id);
      await audit(env, viewer.userId, 'files.removed', body.id);
      return {
        success: 'File reference removed. Unreferenced objects are collected after three days.',
      };
    }
    if (body.intent === 'entry') {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO competition_entries(competition_id,arrangement_id) VALUES(?,?)',
      )
        .bind(body.id, body.arrangementId)
        .run();
      await audit(env, viewer.userId, 'competition.entry', body.id);
      return { success: 'Competition entry added.' };
    }
    if (body.intent === 'remove-entry') {
      await env.DB.prepare(
        'DELETE FROM competition_entries WHERE competition_id=? AND arrangement_id=?',
      )
        .bind(body.id, body.arrangementId)
        .run();
      await audit(env, viewer.userId, 'competition.entry-removed', body.id);
      return { success: 'Competition entry removed.' };
    }
    const result = await adminMutation(env, viewer, body);
    if ('redirect' in result && result.redirect) return redirect(result.redirect);
    return {
      success:
        body.area === 'messages'
          ? 'Messages captured privately. No email was sent.'
          : 'Changes saved.',
    };
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      error: error instanceof Error ? error.message : 'Unable to save changes.',
    };
  }
}
export default function Administration() {
  const { area, items, selected, fieldNames, q, page, report, composers } =
    useLoaderData<typeof loader>();
  const result = useActionData<{
    error?: string;
    success?: string;
    cursor?: string;
  }>();
  const [status, setStatus] = useState('');
  async function regenerate(id: string) {
    try {
      setStatus('Rendering preview in this browser…');
      const a = (await fetch('/api/admin-media?id=' + encodeURIComponent(id)).then((r) =>
        r.json(),
      )) as any;
      if (a.error) throw new Error(a.error);
      const pdf = await fetch('/files/' + a.fileId).then((r) => r.blob());
      const { pdfThumbnail } = await import('../lib/client/media');
      const controller = new AbortController();
      const image = await pdfThumbnail(
        new File([pdf], 'score.pdf', { type: 'application/pdf' }),
        controller.signal,
      );
      const ticket = (await fetch('/api/uploads/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          arrangementId: id,
          filename: image.name,
          contentType: image.type,
          size: image.size,
          kind: 'preview',
        }),
      }).then((r) => r.json())) as any;
      if (ticket.error) throw new Error(ticket.error);
      const part = await fetch('/api/uploads/part/' + ticket.id + '?part=1', {
        method: 'POST',
        body: image,
      });
      if (!part.ok) throw new Error('Preview upload failed.');
      const complete = await fetch('/api/uploads/complete/' + ticket.id, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!complete.ok) throw new Error('Preview finalization failed.');
      setStatus('Preview regenerated.');
    } catch (error) {
      setStatus(String(error));
    }
  }
  return (
    <>
      <p>
        <Link to="/admin">← Workspace</Link>
      </p>
      <h1>Manage {area}</h1>
      <nav className="admin-nav" aria-label="Administration">
        {adminAreas.map((a) => (
          <Link key={a} aria-current={a === area ? 'page' : undefined} to={'/admin/' + a}>
            {a}
          </Link>
        ))}
        <Link to="/admin/outbox">Private outbox</Link>
      </nav>
      {result?.error && (
        <p role="alert" className="error-message">
          {result.error}
        </p>
      )}
      {result?.success && <p role="status">{result.success}</p>}
      {status && <p role="status">{status}</p>}
      {area === 'diagnostics' ? (
        <>
          <h2>Catalog checks</h2>
          <pre className="diagnostic-report">{JSON.stringify(report, null, 2)}</pre>
          <Form method="post">
            <input type="hidden" name="intent" value="collect" />
            <button>Collect expired uploads and deleted files</button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="reindex" />
            <input type="hidden" name="cursor" value={result?.cursor || ''} />
            <button>
              {result?.cursor
                ? 'Continue search index rebuild'
                : 'Rebuild search index (50 songs per batch)'}
            </button>
          </Form>
        </>
      ) : area === 'messages' ? (
        <>
          <p>
            Messages are captured for review. Announcement delivery requires a separately configured
            provider and recipient consent.
          </p>
          <Form method="post" className="stacked-form">
            <input type="hidden" name="intent" value="capture" />
            <label>
              Composer
              <select name="composerId">
                <option value="">First 50 composers with an email address</option>
                {composers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Message kind
              <select name="kind">
                <option value="announcement">Announcement</option>
                <option value="statistics">Composer statistics</option>
              </select>
            </label>
            <label>
              Subject
              <input name="subject" required maxLength={200} />
            </label>
            <label>
              Message
              <textarea name="body" required rows={8} maxLength={10000} />
            </label>
            <button className="primary-button">Capture messages for review</button>
          </Form>
        </>
      ) : (
        <>
          <Form method="get" className="admin-search">
            <label>
              Search {area}
              <input name="q" defaultValue={q} />
            </label>
            <button>Search</button>
            <Link to={'/admin/' + area}>Clear</Link>
          </Form>
          {area === 'catalog' && (
            <p>
              <Link to="/admin/products/new_original_song">Add original song</Link> ·{' '}
              <Link to="/admin/products/new_arrangement_song">Add arrangement</Link>
            </p>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Record</th>
                  <th>Details</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id || row.key}>
                    <td>
                      {row.title || row.name || row.filename || row.key || row.email || row.action}
                      <small className="record-id">{row.id || row.key}</small>
                    </td>
                    <td>
                      {row.role ||
                        row.type ||
                        row.state ||
                        row.section ||
                        row.status ||
                        row.value ||
                        row.created_at}
                    </td>
                    <td>
                      {fieldNames.length > 0 && (
                        <Link
                          to={'/admin/' + area + '?edit=' + encodeURIComponent(row.id || row.key)}
                        >
                          Edit
                        </Link>
                      )}
                      {area === 'catalog' && (
                        <>
                          <Link to={'/admin/products/edit_song_easy/' + row.id}>Song editor</Link>
                          {['duplicate', 'same-author'].map((intent) => (
                            <Form method="post" key={intent}>
                              <input type="hidden" name="id" value={row.id} />
                              <button name="intent" value={intent}>
                                {intent === 'duplicate' ? 'Duplicate' : 'New same author'}
                              </button>
                            </Form>
                          ))}
                          <button type="button" onClick={() => void regenerate(row.id)}>
                            Regenerate preview
                          </button>
                        </>
                      )}
                      {area === 'files' && (
                        <>
                          <a href={'/files/' + row.id}>Open</a>
                          <Form method="post">
                            <input type="hidden" name="id" value={row.id} />
                            <button name="intent" value="remove">
                              Remove reference
                            </button>
                          </Form>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="pagination">
            {page > 1 && (
              <Link to={'?q=' + encodeURIComponent(q) + '&page=' + (page - 1)}>Previous</Link>
            )}
            <span>Page {page}</span>
            {items.length === 100 && (
              <Link to={'?q=' + encodeURIComponent(q) + '&page=' + (page + 1)}>Next</Link>
            )}
          </nav>
          {fieldNames.length > 0 && (
            <section className="admin-edit">
              <h2>{selected ? 'Edit record' : 'Add record'}</h2>
              {!selected && ['catalog', 'users', 'files', 'contacts'].includes(area) ? (
                <p>
                  Select an existing record above. New music and accounts use their dedicated forms.
                </p>
              ) : (
                <Form
                  method="post"
                  className="stacked-form"
                  key={selected?.id || selected?.key || area}
                >
                  <input type="hidden" name="intent" value="save" />
                  <input type="hidden" name="id" value={selected?.id || selected?.key || ''} />
                  {fieldNames.map((name) => (
                    <label key={name}>
                      {name.replaceAll('_', ' ')}
                      {name === 'role' ? (
                        <select name={name} defaultValue={selected?.[name] || 'composer'}>
                          <option>composer</option>
                          <option>admin</option>
                        </select>
                      ) : name === 'type' ? (
                        <select name={name} defaultValue={selected?.[name] || 'topic'}>
                          {['topic', 'voicing', 'instrument', 'group', 'composer'].map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      ) : ['body', 'description', 'bio', 'notice', 'rights_warning'].includes(
                          name,
                        ) ? (
                        <textarea name={name} defaultValue={selected?.[name] ?? ''} rows={5} />
                      ) : (
                        <input
                          name={name}
                          defaultValue={
                            selected?.[name] ??
                            (['published'].includes(name)
                              ? 1
                              : ['rank', 'available_at', 'opens_at'].includes(name)
                                ? 0
                                : '')
                          }
                          type={
                            [
                              'rank',
                              'available_at',
                              'opens_at',
                              'closes_at',
                              'year',
                              'published',
                              'winner',
                            ].includes(name)
                              ? 'number'
                              : 'text'
                          }
                        />
                      )}
                    </label>
                  ))}
                  <p className="muted">
                    Times use Unix milliseconds. Visibility fields use 1 for yes and 0 for no. Page
                    content is plain text; HTML is displayed safely as text.
                  </p>
                  <button className="primary-button">Save record</button>
                  {selected && !['catalog', 'users', 'files', 'contacts'].includes(area) && (
                    <button
                      name="intent"
                      value="delete"
                      onClick={(e) => {
                        if (!confirm('Delete this record?')) e.preventDefault();
                      }}
                    >
                      Delete record
                    </button>
                  )}
                </Form>
              )}
              {area === 'tags' && (
                <Form method="post">
                  <label>
                    Parent category ID (blank for roots)
                    <input name="parent_id" />
                  </label>
                  <button name="intent" value="alphabetize">
                    Alphabetize children
                  </button>
                </Form>
              )}
              {selected && area === 'competitions' && (
                <Form method="post" className="stacked-form">
                  <input type="hidden" name="id" value={selected.id} />
                  <label>
                    Arrangement ID
                    <input name="arrangementId" required />
                  </label>
                  <button name="intent" value="entry">
                    Add competition entry
                  </button>
                  <button name="intent" value="remove-entry">
                    Remove competition entry
                  </button>
                </Form>
              )}
            </section>
          )}
          {area === 'catalog' && (
            <section>
              <h2>Import a permitted remote file</h2>
              <p>
                Only public HTTPS destinations are accepted. Redirects and DNS addresses are
                checked. You must confirm permission and keep attribution.
              </p>
              <Form method="post" action="/api/admin-media" className="stacked-form">
                <label>
                  Arrangement ID
                  <input name="arrangementId" required />
                </label>
                <label>
                  File URL
                  <input name="url" type="url" required />
                </label>
                <label>
                  Attribution / permission record
                  <input name="provenance" required minLength={5} />
                </label>
                <label>
                  <input type="checkbox" name="rights" required /> I have permission to import this
                  file.
                </label>
                <button>Import file</button>
              </Form>
            </section>
          )}
        </>
      )}
    </>
  );
}
