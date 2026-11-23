import { ServerRouter, type EntryContext } from 'react-router';
import { renderToReadableStream } from 'react-dom/server';
export default async function handleRequest(
  request: Request,
  status: number,
  headers: Headers,
  context: EntryContext,
) {
  const body = await renderToReadableStream(<ServerRouter context={context} url={request.url} />, {
    signal: request.signal,
    onError(error) {
      console.error(
        JSON.stringify({
          event: 'render_error',
          message: error instanceof Error ? error.message : 'unknown',
        }),
      );
    },
  });
  headers.set('Content-Type', 'text/html; charset=utf-8');
  return new Response(body, { status, headers });
}
