import {
  data,
  Form,
  Link,
  redirect,
  useLoaderData,
  useSearchParams,
  type LoaderFunctionArgs,
} from 'react-router';
import { cloudflareContext } from '../lib/context.server';
import { queryCatalog } from '../lib/search.server';
import { getTags } from '../lib/db.server';
import { MusicList, Pagination } from '../components/MusicList';
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  const tags = await getTags(env);
  const raw = params.tag || params['*'] || '';
  const slug = raw.replaceAll('_', '-').toLowerCase();
  const current = tags.find(
    (t) => t.slug === slug || t.name.toLowerCase() === raw.replaceAll('_', ' ').toLowerCase(),
  );
  const original = slug === 'original';
  const all = slug === 'all' || url.pathname.replace(/\.data$/, '') === '/music/index';
  const search = url.pathname.replace(/\.data$/, '').endsWith('/search');
  const recent = url.pathname.includes('most_recently_added');
  if (!search && !recent && !original && !all && !current)
    throw new Response('Category not found', { status: 404 });
  let remembered = '';
  try {
    remembered = decodeURIComponent(
      (request.headers.get('Cookie') || '').match(/ssm_type=([^;]*)/)?.[1] || '',
    );
  } catch {}
  const type = url.searchParams.get('type') ?? remembered;
  const result = await queryCatalog(env, {
    q,
    tag: [current?.slug || (original ? 'original' : ''), url.searchParams.get('tag') || '']
      .filter(Boolean)
      .join(','),
    type,
    page: Number(url.searchParams.get('page') || 1),
    seed: recent ? 'recent' : 'browse',
  });
  if (search && !url.searchParams.has('live') && q && result.total === 1)
    return redirect('/song/' + encodeURIComponent(result.items[0].code));
  return data(
    {
      q,
      result,
      type,
      tags,
      current,
      title: search
        ? 'Search Results for: ' + (q || 'All music')
        : recent
          ? 'Recently Added Songs'
          : original
            ? 'Original Songs'
            : all
              ? 'All Songs'
              : current!.name,
    },
    {
      headers: {
        'Set-Cookie':
          'ssm_type=' + encodeURIComponent(type) + '; Path=/; SameSite=Lax; Max-Age=31536000',
      },
    },
  );
}
export default function Catalog() {
  const { q, result, type, tags, current, title } = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  return (
    <>
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <span>›</span>
        <span>{current?.name || 'Browse music'}</span>
      </div>
      <h1>{title}</h1>
      {current?.description && <p>{current.description}</p>}
      <div className="results-toolbar">
        <p role="status" aria-live="polite">
          <strong>{result.total}</strong>{' '}
          {result.total === 1 ? 'arrangement found' : 'arrangements found'}
        </p>
        <label className="filter-label">
          Filter by type
          <select
            aria-label="Filter by type"
            value={type}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              next.set('type', e.target.value);
              next.delete('page');
              next.set('live', '1');
              setParams(next, { preventScrollReset: true });
            }}
          >
            <option value="">Show all types</option>
            {tags
              .filter((t) => t.parent_id && ['instrument', 'voicing'].includes(t.type))
              .map((t) => (
                <option key={t.id} value={t.slug}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      {result.suggestions.length > 0 && q && (
        <div className="search-suggestions">
          Also browse:{' '}
          {result.suggestions.map((s) => (
            <Link key={s.href} to={s.href}>
              {s.name}
            </Link>
          ))}
        </div>
      )}
      <details className="refine-results">
        <summary>Refine results by category</summary>
        <div className="checkbox-grid">
          {result.facets
            .filter((t) => !['group', 'composer'].includes(t.type))
            .map((t) => (
              <label key={t.slug}>
                <input
                  type="checkbox"
                  checked={(params.get('tag') || '').split(',').includes(t.slug)}
                  onChange={(e) => {
                    const next = new URLSearchParams(params);
                    const chosen = new Set((next.get('tag') || '').split(',').filter(Boolean));
                    if (e.target.checked) chosen.add(t.slug);
                    else chosen.delete(t.slug);
                    if (chosen.size) next.set('tag', [...chosen].join(','));
                    else next.delete('tag');
                    next.delete('page');
                    next.set('live', '1');
                    setParams(next, { preventScrollReset: true });
                  }}
                />
                {t.name} ({t.count})
              </label>
            ))}
        </div>
      </details>
      <Pagination result={result} />
      {result.items.length ? (
        <MusicList items={result.items} />
      ) : (
        <div className="empty-state">
          <h2>No matching music</h2>
          <p>Try a shorter title, a composer name, or another category.</p>
          <button
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete('type');
              setParams(next);
            }}
          >
            Clear the type filter
          </button>
        </div>
      )}
      <Pagination result={result} />
      <p className="sample-disclaimer">Sample catalog · Demonstration scores and recordings</p>
    </>
  );
}
