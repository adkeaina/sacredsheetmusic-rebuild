import { data, Form, Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { Bookmark, Download, ExternalLink, Headphones } from 'lucide-react';
import { cloudflareContext } from '../lib/context.server';
import { getArrangement, first } from '../lib/db.server';
import { recordEvent } from '../lib/community.server';
import { visitorSession } from '../lib/visitor.server';
import { ScorePreview } from '../components/ScorePreview';
import { MusicList } from '../components/MusicList';
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  const item = await getArrangement(env, params.code || '');
  if (!item) throw new Response('Arrangement not found', { status: 404 });
  const visitor = await visitorSession(request, env);
  await recordEvent(env, item.id, 'view', visitor.id);
  const saved = await first(
    env,
    'SELECT 1 FROM bookmarks WHERE session_id=? AND arrangement_id=?',
    [visitor.id, item.id],
  );
  return data(
    { item, saved: !!saved },
    {
      headers: visitor.header
        ? { 'Set-Cookie': visitor.header, 'Cache-Control': 'private, no-store' }
        : { 'Cache-Control': 'private, no-store' },
    },
  );
}
export default function Song() {
  const { item, saved } = useLoaderData<typeof loader>();
  const score = item.files.find((f) => f.content_type === 'application/pdf');
  const images = item.files.filter(
    (f) => f.content_type.startsWith('image/') && f.kind !== 'preview',
  );
  const audio = item.files.find((f) => f.content_type.startsWith('audio/'));
  const fileUrl = (id: string, download = false) =>
    '/files/' + id + (download ? '?download=1' : '');
  return (
    <>
      <div className="breadcrumbs">
        <Link to="/all">← Back to music</Link>
        <span>›</span>
        <span>{item.voicing}</span>
      </div>
      <div className="song-heading">
        <h1>{item.title}</h1>
        <p>
          By <Link to={'/composer/' + item.composer_slug}>{item.composer}</Link>
          {item.credits.map((c) => (
            <span key={c.id}>
              , <Link to={'/composer/' + c.slug}>{c.name}</Link>
            </span>
          ))}{' '}
          · {item.voicing}
        </p>
      </div>
      {item.sample > 0 && (
        <div className="sample-banner">
          Sample arrangement. The attached score and audio are original demonstration exercises.
        </div>
      )}
      <div className="song-layout">
        <aside className="song-details">
          <h2>Downloads</h2>
          {score && (
            <div className="download-block">
              <strong>Sheet music (PDF)</strong>
              <div className="file-links">
                <a href={fileUrl(score.id)} target="_blank" rel="noreferrer">
                  View PDF
                </a>
                <a href={fileUrl(score.id)} target="_blank" rel="noreferrer">
                  Print PDF
                </a>
                <a href={fileUrl(score.id, true)} download>
                  <Download size={13} /> Download
                </a>
              </div>
            </div>
          )}
          {audio && (
            <div className="download-block">
              <strong>
                <Headphones size={14} /> Recording
              </strong>
              <audio
                controls
                preload="none"
                src={fileUrl(audio.id)}
                aria-label={'Listen to demonstration recording for ' + item.title}
              />
              <a href={fileUrl(audio.id, true)} download>
                Download MP3
              </a>
            </div>
          )}
          {item.files
            .filter((f) => f !== score && f !== audio && f.kind !== 'preview')
            .map((f) => (
              <p key={f.id}>
                <a href={fileUrl(f.id, true)} download>
                  {f.filename}
                </a>
              </p>
            ))}
          <Form method="post" action="/music/wishlist" className="bookmark-form">
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="intent" value={saved ? 'remove' : 'add'} />
            <button type="submit" className="primary-button">
              <Bookmark size={15} fill={saved ? 'currentColor' : 'none'} />
              {saved ? 'Remove bookmark' : 'Bookmark this arrangement'}
            </button>
          </Form>
          <Link to="/music/wishlist">See your bookmarked song list</Link>
          <dl className="song-facts">
            <dt>Voicing / Instrumentation</dt>
            <dd>{item.voicing}</dd>
            <dt>Difficulty</dt>
            <dd>{item.difficulty}</dd>
            <dt>Related categories</dt>
            <dd>
              {item.tags.split(', ').map((t) => (
                <Link key={t} to={'/' + t.toLowerCase().replaceAll(' ', '-')}>
                  {t}
                </Link>
              ))}
            </dd>
          </dl>
          <p>
            See more from <Link to={'/composer/' + item.composer_slug}>{item.composer}</Link>.
          </p>
          {item.website && (
            <p>
              <a href={item.website} target="_blank" rel="noreferrer">
                Composer’s website <ExternalLink size={12} />
              </a>
            </p>
          )}
          {item.contact_url && (
            <p>
              <a href={item.contact_url}>Contact the composer and say thank you</a>
            </p>
          )}
        </aside>
        <div className="song-score">
          <div className="song-background">
            <h2>Song background</h2>
            <p>{item.description}</p>
            {item.notice && <p>{item.notice}</p>}
            {item.source_url && (
              <a
                href={'/music/redirect_to_original_url/' + item.code}
                target="_blank"
                rel="noreferrer"
              >
                Visit the original page <ExternalLink size={12} />
              </a>
            )}
          </div>
          {score ? (
            <ScorePreview url={fileUrl(score.id)} title={item.title} sample={!!item.sample} />
          ) : images.length ? (
            <div className="score-images">
              {images.map((f, i) => (
                <a key={f.id} href={fileUrl(f.id)} target="_blank" rel="noreferrer">
                  <img
                    src={fileUrl(f.id)}
                    alt={item.title + ', score page ' + (i + 1)}
                    loading="lazy"
                    style={{ width: '100%' }}
                  />
                </a>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>This arrangement links to the composer’s original page.</p>
              {item.source_url && (
                <a href={item.source_url} target="_blank" rel="noreferrer">
                  Continue to the composer’s website
                </a>
              )}
            </div>
          )}
          {item.youtube_id && (
            <iframe
              className="video-preview"
              title={'Performance of ' + item.title}
              src={'https://www.youtube-nocookie.com/embed/' + item.youtube_id}
              loading="lazy"
              allowFullScreen
            />
          )}
          {item.lyrics && (
            <section>
              <h2>Lyrics</h2>
              <p className="preserve-lines">{item.lyrics}</p>
            </section>
          )}
        </div>
      </div>
      <section className="comments-section">
        <h2>Comments and ratings</h2>
        {item.comments.length ? (
          item.comments.map((c) => (
            <article key={c.id} className="comment">
              <strong>{c.name}</strong>
              {c.rating && <span> · {c.rating} / 5</span>}
              <p>{c.text}</p>
            </article>
          ))
        ) : (
          <p>No comments yet.</p>
        )}
        <Link to={'/music/comment/' + item.id}>Add a constructive comment / rating →</Link>
      </section>
      {item.related.length > 0 && (
        <section className="music-section">
          <div className="section-heading">
            <h2>Related arrangements and more from this composer</h2>
          </div>
          <MusicList items={item.related} />
        </section>
      )}
    </>
  );
}
