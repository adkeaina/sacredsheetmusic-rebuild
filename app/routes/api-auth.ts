import type { LoaderFunctionArgs, ActionFunctionArgs } from 'react-router';
import { cloudflareContext } from '../lib/context.server';
import { createAuth } from '../lib/auth.server';
import { requestLimit } from '../lib/security.server';
export async function loader({ request, context }: LoaderFunctionArgs) {
  return createAuth(context.get(cloudflareContext).env, request).handler(request);
}
export async function action({ request, context }: ActionFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  await requestLimit(env, request, 'authentication', 20);
  return createAuth(env, request).handler(request);
}
