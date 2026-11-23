import {
  Form,
  Link,
  redirect,
  useLoaderData,
  useActionData,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from 'react-router';
import { cloudflareContext } from '../lib/context.server';
import { first } from '../lib/db.server';
import { getViewer } from '../lib/auth.server';
import { requireSameOrigin, requestLimit } from '../lib/security.server';
import { addComment } from '../lib/community.server';
export async function loader({ params, context }: LoaderFunctionArgs) {
  const { env, authState } = context.get(cloudflareContext);
  const item = await first<{ id: string; code: string; title: string }>(
    env,
    'SELECT id,code,title FROM arrangements WHERE id=? AND published=1 AND available_at<=?',
    [params.id || '', Date.now()],
  );
  if (!item) throw new Response('Song not found', { status: 404 });
  return { item };
}
export async function action({ request, params, context }: ActionFunctionArgs) {
  const { env, authState } = context.get(cloudflareContext);
  requireSameOrigin(request);
  await requestLimit(env, request, 'comment', 20);
  const f = await request.formData();
  try {
    if (
      f.get('website') ||
      String(f.get('answer') || '')
        .trim()
        .toLowerCase() !== 'sunday'
    )
      throw new Error('Please answer the spam-prevention question with Sunday.');
    const viewer = await getViewer(request, env, authState);
    const item = await addComment(env, {
      arrangementId: params.id || String(f.get('id') || ''),
      name: String(f.get('name') || f.get('user_name') || ''),
      email: String(f.get('email') || f.get('user_email') || ''),
      text: String(f.get('text') || f.get('comment') || ''),
      rating: f.get('rating') ? Number(f.get('rating')) : null,
      difficulty: f.get('difficulty') ? Number(f.get('difficulty')) : null,
      userId: viewer?.userId,
    });
    return redirect('/song/' + item.code);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not save your comment.',
    };
  }
}
export default function Comment() {
  const { item } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <>
      <h1>Comment on {item.title}</h1>
      <p>
        <Link to={'/song/' + item.code}>← Back to the song</Link>
      </p>
      <p>
        Constructive comments are public. Your email address remains private. Notifications are
        captured in this preview.
      </p>
      <Form method="post" className="stacked-form">
        {result?.error && <p role="alert">{result.error}</p>}
        <label>
          Your name
          <input name="name" required maxLength={100} />
        </label>
        <label>
          Your email (optional)
          <input name="email" type="email" />
        </label>
        <label>
          Comment
          <textarea name="text" required minLength={3} maxLength={10000} rows={6} />
        </label>
        <label>
          Overall rating
          <select name="rating">
            <option value="">No rating</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} / 5
              </option>
            ))}
          </select>
        </label>
        <label>
          Difficulty
          <select name="difficulty">
            <option value="">No rating</option>
            {['Very easy', 'Easy', 'Intermediate', 'Difficult', 'Very difficult'].map((n, i) => (
              <option key={n} value={i + 1}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          What day comes after Saturday?
          <input name="answer" required autoComplete="off" placeholder="Sunday" />
        </label>
        <label className="honeypot" aria-hidden="true">
          Website
          <input name="website" tabIndex={-1} />
        </label>
        <button className="primary-button">Save comment</button>
      </Form>
    </>
  );
}
