import { Link, useLocation } from 'react-router';
import { Headphones, Star } from 'lucide-react';
import type { ArrangementSummary, CatalogPage } from '../lib/types.server';
export function MusicList({ items }: { items: ArrangementSummary[] }) {
  return (
    <div className="music-grid">
      {items.map((item) => (
        <article className="music-card" key={item.id}>
          <Link
            to={'/song/' + encodeURIComponent(item.code)}
            tabIndex={-1}
            aria-hidden="true"
            className="score-thumbnail"
          >
            <img
              src={item.thumbnail || '/fixtures/score.svg'}
              alt=""
              width="144"
              height="186"
              loading="lazy"
            />
            {item.winner > 0 && (
              <span className="winner-badge">
                <Star size={11} /> Winner
              </span>
            )}
          </Link>
          <Link to={'/song/' + encodeURIComponent(item.code)} className="music-title">
            {item.title}
          </Link>
          <div className="music-meta">
            <span>{item.voicing}</span>
            {!!item.has_audio && <Headphones size={12} aria-label="Recording available" />}
          </div>
          <p className="composer-credit">
            By: <Link to={'/composer/' + item.composer_slug}>{item.composer}</Link>
          </p>
          <p className="music-topics">
            {item.difficulty} ·{' '}
            {item.tags
              .split(', ')
              .filter((t) => t !== item.voicing)
              .join(', ')}
          </p>
          {item.rating !== null && (
            <span className="rating">
              <Star size={11} fill="currentColor" /> {Number(item.rating).toFixed(1)}{' '}
              <span className="sr-only">out of 5, sample rating</span>
            </span>
          )}
        </article>
      ))}
    </div>
  );
}
export function Pagination({ result }: { result: CatalogPage }) {
  const location = useLocation();
  if (result.pages <= 1) return null;
  const link = (page: number) => {
    const p = new URLSearchParams(location.search);
    p.set('page', String(page));
    return location.pathname + '?' + p;
  };
  return (
    <nav className="pagination" aria-label="Results pages">
      {result.page > 1 && <Link to={link(result.page - 1)}>← Previous</Link>}
      <span>
        Page {result.page} of {result.pages}
      </span>
      {result.page < result.pages && <Link to={link(result.page + 1)}>Next →</Link>}
    </nav>
  );
}
