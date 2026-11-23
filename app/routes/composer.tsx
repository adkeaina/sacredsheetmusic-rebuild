import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { cloudflareContext } from '../lib/context.server';
import { first, rows } from '../lib/db.server';
import { queryCatalog } from '../lib/search.server';
import { MusicList, Pagination } from '../components/MusicList';
type Composer = {
  id: string;
  name: string;
  slug: string;
  bio: string;
  website: string;
  contact_url: string;
  sample: number;
  notice: string;
};
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  if (!params.slug)
    return {
      list: await rows<Composer>(
        env,
        'SELECT id,name,slug,bio,website,contact_url,sample,notice FROM composers ORDER BY name',
      ),
      composer: null,
      result: null,
    };
  const composer = await first<Composer>(
    env,
    'SELECT id,name,slug,bio,website,contact_url,sample,notice FROM composers WHERE slug=?',
    [params.slug],
  );
  if (!composer) throw new Response('Composer not found', { status: 404 });
  const result = await queryCatalog(env, {
    q: composer.name,
    page: Number(new URL(request.url).searchParams.get('page') || 1),
    seed: 'composer',
  });
  return { list: [], composer, result };
}
export default function ComposerPage() {
  const { list, composer, result } = useLoaderData<typeof loader>();
  return (
    <>
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <span>›</span>
        <Link to="/composers">Composers</Link>
        {composer && (
          <>
            <span>›</span>
            <span>{composer.name}</span>
          </>
        )}
      </div>
      <h1>{composer ? composer.name : 'Composers'}</h1>
      {composer ? (
        <>
          <p className="composer-bio">{composer.bio}</p>
          {composer.sample > 0 && (
            <p className="sample-disclaimer">Fictional sample composer profile.</p>
          )}
          {composer.website && (
            <p>
              <a href={composer.website} target="_blank" rel="noreferrer">
                Visit the composer’s website
              </a>
            </p>
          )}
          {composer.contact_url && (
            <p>
              <a href={composer.contact_url}>Contact {composer.name}</a>
            </p>
          )}
          <h2>Sheet music by {composer.name}</h2>
          {result && (
            <>
              <MusicList items={result.items} />
              <Pagination result={result} />
            </>
          )}
          <p>
            <Link to={'/music/composer_all_song_stats/' + composer.id}>View song statistics →</Link>
          </p>
        </>
      ) : (
        <ul className="composer-directory">
          {list.map((c) => (
            <li key={c.id}>
              <Link to={'/composer/' + c.slug}>{c.name}</Link>
              {c.sample > 0 && <span>Sample composer</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
