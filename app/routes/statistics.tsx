import { Link, redirect, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { cloudflareContext } from '../lib/context.server';
import { first, rows, visible } from '../lib/db.server';
import { visitorSession } from '../lib/visitor.server';
import { recordEvent } from '../lib/community.server';
import { safeExternalUrl } from '../lib/security.server';
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const { env, authState } = context.get(cloudflareContext);
  if (params.code) {
    const item = await first<{ id: string; source_url: string }>(
      env,
      `SELECT a.id,a.source_url FROM arrangements a WHERE a.code=? AND ${visible}`,
      [params.code, Date.now()],
    );
    if (!item?.source_url) throw new Response('Original page unavailable', { status: 404 });
    const visitor = await visitorSession(request, env);
    await recordEvent(env, item.id, 'referral', visitor.id);
    return redirect(safeExternalUrl(item.source_url), {
      headers: visitor.header ? { 'Set-Cookie': visitor.header } : undefined,
    });
  }
  const composer = await first<{ id: string; name: string; slug: string }>(
    env,
    'SELECT id,name,slug FROM composers WHERE id=? OR slug=?',
    [params.id || '', params.id || ''],
  );
  if (!composer) throw new Response('Composer not found', { status: 404 });
  const items = await rows<{
    id: string;
    code: string;
    title: string;
    views: number;
    downloads: number;
    referrals: number;
  }>(
    env,
    `SELECT a.id,a.code,a.title,COALESCE((SELECT count FROM stats WHERE arrangement_id=a.id AND kind='view'),0) views,COALESCE((SELECT count FROM stats WHERE arrangement_id=a.id AND kind='download'),0) downloads,COALESCE((SELECT count FROM stats WHERE arrangement_id=a.id AND kind='referral'),0) referrals FROM arrangements a WHERE composer_id=? AND ${visible} ORDER BY a.title`,
    [composer.id, Date.now()],
  );
  return { composer, items };
}
export default function Statistics() {
  const { composer, items } = useLoaderData<typeof loader>();
  return (
    <>
      <h1>Song statistics for {composer.name}</h1>
      <p>
        Preview activity only. Repeat activity within 30 minutes is counted once per browser and
        song. Audio range requests do not increase downloads.
      </p>
      <p>
        <Link to={'/composer/' + composer.slug}>← Composer profile</Link>
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Song</th>
              <th>Views</th>
              <th>Downloads</th>
              <th>Original-page visits</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>
                  <Link to={'/song/' + i.code}>{i.title}</Link>
                </td>
                <td>{i.views}</td>
                <td>{i.downloads}</td>
                <td>{i.referrals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
