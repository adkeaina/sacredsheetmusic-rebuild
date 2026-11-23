import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { cloudflareContext } from '../lib/context.server';
import { requireAdmin } from '../lib/auth.server';
import { rows } from '../lib/db.server';
export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env, authState } = context.get(cloudflareContext);
  await requireAdmin(request, env, authState);
  const page = Math.max(1, Number(new URL(request.url).searchParams.get('page') || 1) || 1);
  return {
    page,
    mail: await rows<{
      id: string;
      recipient: string;
      subject: string;
      body: string;
      status: string;
      created_at: number;
    }>(
      env,
      'SELECT id,recipient,subject,body,status,created_at FROM mail_outbox ORDER BY created_at DESC LIMIT 20 OFFSET ?',
      [(page - 1) * 20],
    ),
  };
}
export default function Outbox() {
  const { mail, page } = useLoaderData<typeof loader>();
  return (
    <>
      <h1>Private preview outbox</h1>
      <p>Captured messages have not been delivered. Only administrators can view this page.</p>
      <nav className="pagination">
        {page > 1 && <Link to={'?page=' + (page - 1)}>Previous</Link>}
        <span>Page {page}</span>
        {mail.length === 20 && <Link to={'?page=' + (page + 1)}>Next</Link>}
      </nav>
      {mail.map((m) => (
        <article className="comment" key={m.id}>
          <h2>{m.subject}</h2>
          <p>
            {m.recipient} · {m.status}
          </p>
          <p className="preserve-lines">{m.body}</p>
        </article>
      ))}
    </>
  );
}
