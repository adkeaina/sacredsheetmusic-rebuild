import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { username } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './auth-schema.server';
import type { AppEnv, Viewer, AuthState } from './types.server';
import { first, run } from './db.server';
import { enqueueMail } from './mail.server';
import { slugify } from './security.server';
function buildAuth(env: AppEnv, origin: string) {
  return betterAuth({
    appName: 'Sacred Sheet Music independent preview',
    baseURL: origin,
    secret: env.AUTH_SECRET,
    database: drizzleAdapter(drizzle(env.DB, { schema }), {
      provider: 'sqlite',
      schema,
      transaction: false,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      requireEmailVerification: false,
      resetPasswordTokenExpiresIn: 900,
      sendResetPassword: async ({ user, url }) => {
        await enqueueMail(env, {
          userId: user.id,
          recipient: user.email,
          subject: 'Reset your preview password',
          body:
            'This message is captured for the independent preview. Open this one-time link to choose a new password:\n' +
            url,
          kind: 'password-reset',
          expiresAt: Date.now() + 900000,
        });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await enqueueMail(env, {
          userId: user.id,
          recipient: user.email,
          subject: 'Confirm your preview email address',
          body: 'Open this one-time confirmation link:\n' + url,
          kind: 'email-change',
          expiresAt: Date.now() + 3600000,
        });
      },
    },
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
          await enqueueMail(env, {
            userId: user.id,
            recipient: user.email,
            subject: 'Confirm your preview email change',
            body:
              'Requested new email: ' + newEmail + '\nConfirm using this one-time link:\n' + url,
            kind: 'email-change',
            expiresAt: Date.now() + 3600000,
          });
        },
      },
      additionalFields: {
        role: {
          type: 'string',
          required: false,
          defaultValue: 'composer',
          input: false,
        },
      },
    },
    plugins: [username({ minUsernameLength: 3, maxUsernameLength: 40 })],
    advanced: {
      cookiePrefix: 'ssm_auth',
      useSecureCookies: origin.startsWith('https:'),
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true },
    },
    session: {
      expiresIn: 604800,
      updateAge: 86400,
      cookieCache: { enabled: false },
    },
    trustedOrigins: [origin],
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = await first<{ disabled: number }>(
              env,
              'SELECT disabled FROM users WHERE id=?',
              [session.userId],
            );
            if (user?.disabled)
              throw new APIError('FORBIDDEN', {
                message: 'This login has been disabled. Please contact the administrator.',
              });
          },
        },
      },
      user: {
        update: {
          after: async (user) => {
            await run(env, 'UPDATE composers SET private_email=? WHERE user_id=?', [
              user.email,
              user.id,
            ]);
          },
        },
        create: {
          before: async (user) => {
            if (await first(env, 'SELECT id FROM composers WHERE name=?', [user.name.trim()]))
              throw new APIError('BAD_REQUEST', {
                message:
                  'This composer profile already exists. Please contact the administrator to link your login.',
              });
            return { data: { ...user, name: user.name.trim() } };
          },
          after: async (user) => {
            await run(
              env,
              'INSERT INTO composers(id,user_id,name,slug,private_email) VALUES(?,?,?,?,?)',
              [
                'composer-' + user.id,
                user.id,
                user.name,
                slugify(user.name) + '-' + user.id.slice(0, 6),
                user.email,
              ],
            );
            await enqueueMail(env, {
              userId: user.id,
              recipient: user.email,
              subject: 'Your composer login is ready',
              body: 'Your composer profile has been created for this independent preview. You can sign in and manage your own music. No original-site account has been changed.',
            });
          },
        },
      },
    },
    logger: { level: 'error' },
  });
}
const configurations = new WeakMap<
  AppEnv,
  { origin: string; secret: string; auth: ReturnType<typeof buildAuth> }
>();
export function createAuth(env: AppEnv, request: Request) {
  const origin = new URL(request.url).origin;
  const cached = configurations.get(env);
  if (cached?.origin === origin && cached.secret === env.AUTH_SECRET) return cached.auth;
  const auth = buildAuth(env, origin);
  configurations.set(env, { origin, secret: env.AUTH_SECRET, auth });
  return auth;
}
export function getViewer(request: Request, env: AppEnv, state?: AuthState): Promise<Viewer> {
  if (state) return (state.viewer ??= resolveViewer(request, env));
  return resolveViewer(request, env);
}
async function resolveViewer(request: Request, env: AppEnv): Promise<Viewer> {
  if (!(request.headers.get('Cookie') || '').includes('ssm_auth')) return null;
  const session = await createAuth(env, request).api.getSession({
    headers: request.headers,
  });
  if (!session) return null;
  return first<NonNullable<Viewer>>(
    env,
    'SELECT u.id AS userId,u.name,u.role,c.id AS composerId FROM users u LEFT JOIN composers c ON c.user_id=u.id WHERE u.id=? AND u.disabled=0',
    [session.user.id],
  );
}
export async function requireViewer(request: Request, env: AppEnv, state?: AuthState) {
  const viewer = await getViewer(request, env, state);
  if (!viewer) throw new Response('Please log in to continue.', { status: 401 });
  return viewer;
}
export async function requireAdmin(request: Request, env: AppEnv, state?: AuthState) {
  const viewer = await requireViewer(request, env, state);
  if (viewer.role !== 'admin')
    throw new Response('Administrator access is required.', { status: 403 });
  return viewer;
}
