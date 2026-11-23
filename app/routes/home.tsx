import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { cloudflareContext } from '../lib/context.server';
import { queryCatalog } from '../lib/search.server';
import { MusicList } from '../components/MusicList';
export async function loader({ context }: LoaderFunctionArgs) {
  const { env, authState } = context.get(cloudflareContext);
  const recent = await queryCatalog(env, { q: '', page: 1, seed: 'recent' });
  return {
    recent: recent.items.slice(0, 6),
    discovery: recent.items.filter((_, i) => i % 4 === 1).slice(0, 6),
    total: recent.total,
  };
}
export default function Home() {
  const { recent, discovery, total } = useLoaderData<typeof loader>();
  return (
    <>
      <div className="breadcrumbs">
        <span>Home</span>
      </div>
      <h1>Free Sacred Sheet Music</h1>
      <div className="welcome-copy">
        <p>
          Welcome! Find sacred music for choir, solo voices, piano, and instruments. Browse the
          categories to the left, or search for a title, composer, or topic.
        </p>
        <p>
          All <strong>{total} arrangements in this preview are sample entries.</strong> Scores and
          recordings are original demonstration exercises.{' '}
          <a href="https://sacredsheetmusic.org/" target="_blank" rel="noreferrer">
            Visit the original website
          </a>{' '}
          for its real catalog.
        </p>
      </div>
      <section className="music-section">
        <div className="section-heading">
          <h2>Recently added songs</h2>
          <Link to="/music/most_recently_added">See the full list →</Link>
        </div>
        <MusicList items={recent} />
      </section>
      <section className="music-section">
        <div className="section-heading">
          <h2>Some music to discover</h2>
          <Link to="/all">Browse all songs →</Link>
        </div>
        <MusicList items={discovery} />
      </section>
      <div className="composer-callout">
        <h2>Compose or arrange?</h2>
        <p>Share your works and help others find music for their voices and instruments.</p>
        <Link to="/about/upload">Publish/list your own works with us! →</Link>
      </div>
      <p className="sample-disclaimer">
        This preview is not affiliated with the original website or its maintainers.
      </p>
    </>
  );
}
