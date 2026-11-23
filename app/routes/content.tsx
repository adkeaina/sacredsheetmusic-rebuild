import {
  Form,
  Link,
  useLoaderData,
  useActionData,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from 'react-router';
import { cloudflareContext } from '../lib/context.server';
import { first, run, rows } from '../lib/db.server';
import { requestLimit } from '../lib/security.server';
import { enqueueMail } from '../lib/mail.server';
import { requireSameOrigin } from '../lib/visitor.server';
export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  const contact = new URL(request.url).pathname.replace(/\.data$/, '') === '/questions/ask';
  const slug = params.slug || 'faq';
  const page = contact
    ? {
        slug: 'contact',
        title: 'Contact Us / Feedback',
        body: 'Messages submitted here are captured privately for this independent preview. They are not sent to the original website or its maintainer.',
      }
    : await first<{ slug: string; title: string; body: string }>(
        env,
        'SELECT slug,title,body FROM pages WHERE slug=? AND published=1',
        [slug],
      );
  if (!page) throw new Response('Page not found', { status: 404 });
  return {
    page,
    contact,
    sections: await rows<{ slug: string; title: string; body: string }>(
      env,
      'SELECT slug,title,body FROM pages WHERE section=? AND slug!=? AND published=1 ORDER BY rank,title',
      [slug === 'faq' ? 'faq' : page.slug, page.slug],
    ),
  };
}
export async function action({ request, context }: ActionFunctionArgs) {
  requireSameOrigin(request);
  const { env } = context.get(cloudflareContext);
  await requestLimit(env, request, 'contact', 10);
  const f = await request.formData();
  const email = String(f.get('email') || '').trim();
  const message = String(f.get('message') || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 5 || message.length > 10000)
    return {
      error: 'Please enter a valid email address and a message between 5 and 10,000 characters.',
    };
  if (f.get('website')) return { error: 'Please leave the website field empty.' };
  await run(env, 'INSERT INTO contacts(id,name,email,message,created_at) VALUES(?,?,?,?,?)', [
    crypto.randomUUID(),
    String(f.get('name') || '').slice(0, 100),
    email,
    message,
    Date.now(),
  ]);
  await enqueueMail(env, {
    recipient: 'administrator@example.invalid',
    subject: 'Preview contact submission',
    body: email + '\n' + message,
  });
  return {
    success: 'Your message was captured privately for this preview. No email was sent.',
  };
}
export default function Content() {
  const { page, contact, sections } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <>
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <span>›</span>
        <span>{page.title}</span>
      </div>
      <h1>{page.title}</h1>
      <div className="prose">
        {page.body.split('\n\n').map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {sections.map((s) => (
        <section key={s.slug}>
          <h2>{s.title}</h2>
          <p className="preserve-lines">{s.body}</p>
        </section>
      ))}
      {['upload', 'self-upload'].includes(page.slug) && (
        <div className="action-links">
          <Link className="primary-button" to="/accounts/new_composer_login">
            Create a composer login
          </Link>
          <Link to="/accounts/login">Already registered? Log in →</Link>
        </div>
      )}
      {page.slug === 'all-resources' && (
        <ul className="resource-list">
          <li>
            <a href="https://sacredsheetmusic.org/" target="_blank" rel="noreferrer">
              Original Sacred Sheet Music website
            </a>
          </li>
          <li>
            <a
              href="https://www.churchofjesuschrist.org/media/music?lang=eng"
              target="_blank"
              rel="noreferrer"
            >
              Church music resources
            </a>
          </li>
          <li>
            <Link to="/composers">Sample composer directory</Link>
          </li>
        </ul>
      )}
      {page.slug === 'sheet-music-competition' && (
        <Link className="primary-button" to="/competition">
          Explore the sample competition →
        </Link>
      )}
      {contact && (
        <Form method="post" className="stacked-form">
          {result?.error && (
            <p role="alert" className="error-message">
              {result.error}
            </p>
          )}
          {result?.success && (
            <p role="status" className="success-message">
              {result.success}
            </p>
          )}
          <label>
            Your name
            <input name="name" maxLength={100} />
          </label>
          <label>
            Your email address
            <input type="email" name="email" required />
          </label>
          <label>
            Your message
            <textarea name="message" rows={7} required minLength={5} maxLength={10000} />
          </label>
          <label className="honeypot" aria-hidden="true">
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
          <button className="primary-button" type="submit">
            Submit feedback
          </button>
        </Form>
      )}
    </>
  );
}
