import { Form, Link, redirect, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { cloudflareContext } from '../lib/context.server';
import { getViewer, requireAdmin } from '../lib/auth.server';
import { rows, first } from '../lib/db.server';
export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  const viewer = await getViewer(request, env);
  if (!viewer) return redirect('/accounts/login');
  const items = await rows<{
    id: string;
    title: string;
    code: string;
    voicing: string;
    published: number;
  }>(
    env,
    'SELECT id,title,code,voicing,published FROM arrangements WHERE composer_id=? ORDER BY updated_at DESC',
    [viewer.composerId || ''],
  );
  return { viewer, items };
}
export default function Workspace() {
  const { viewer, items } = useLoaderData<typeof loader>();
  return (
    <>
      <h1>{viewer.role === 'admin' ? 'Administration' : 'Composer workspace'}</h1>
      <p>Welcome, {viewer.name}.</p>
      <nav className="workspace-nav">
        <Link to="/admin/products/new_original_song">Add an original song</Link>
        <Link to="/admin/products/new_arrangement_song">Add an arrangement</Link>
        <Link to="/accounts/edit_composer_login">Edit my profile</Link>
        {viewer.role === 'admin' && <Link to="/admin/catalog">Manage the catalog</Link>}
        <Form method="post" action="/accounts/logout">
          <button type="submit">Log out</button>
        </Form>
      </nav>
      <h2>My music</h2>
      {items.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Song</th>
                <th>Voicing</th>
                <th>Visibility</th>
                <th>Edit</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to={'/song/' + a.code}>{a.title}</Link>
                  </td>
                  <td>{a.voicing}</td>
                  <td>{a.published ? 'Published' : 'Draft'}</td>
                  <td>
                    <Link to={'/admin/products/edit_song_easy/' + a.id}>Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <p>You have not added any music yet.</p>
          <Link to="/admin/products/new_original_song">Add your first song →</Link>
        </div>
      )}
      <p className="muted">
        Preview emails are captured privately. This workspace manages only the replacement catalog.
      </p>
    </>
  );
}
