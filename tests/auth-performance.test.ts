import { it, expect } from 'vitest';
import { testDatabase } from './helpers/database';
import { createAuth } from '../app/lib/auth.server';
import type { AppEnv } from '../app/lib/types.server';
it('scopes reusable configuration to its deployment origin and signing secret', () => {
  const d = testDatabase();
  try {
    const env = {
      ...d.env,
      AUTH_SECRET: 'test-secret-at-least-thirty-two-characters-long',
      HOUSEHOLD_SECRET: 'household-test-secret',
      ADMIN_BOOTSTRAP_TOKEN: 'bootstrap-test-secret',
    } as AppEnv;
    const a = createAuth(
      env,
      new Request('https://preview.example/admin', { headers: { Cookie: 'first-user' } }),
    );
    const b = createAuth(
      env,
      new Request('https://preview.example/admin', { headers: { Cookie: 'second-user' } }),
    );
    expect(a).toBe(b);
    env.AUTH_SECRET = 'rotated-test-secret-at-least-thirty-two-characters';
    expect(createAuth(env, new Request('https://preview.example/admin'))).not.toBe(a);
  } finally {
    d.close();
  }
});
