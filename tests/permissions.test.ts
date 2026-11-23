import { describe, it, expect } from 'vitest';
import { assertOwns, requireSameOrigin, consumeRateLimit } from '../app/lib/security.server';
import { testDatabase } from './helpers/database';
describe('server authorization boundaries', () => {
  it('rejects another composer even when a form supplies their ID', () => {
    expect(() =>
      assertOwns({ userId: 'a', composerId: 'ca', role: 'composer', name: 'A' }, 'cb'),
    ).toThrow();
    expect(() =>
      assertOwns({ userId: 'a', composerId: 'ca', role: 'composer', name: 'A' }, 'ca'),
    ).not.toThrow();
  });
  it('allows an administrator and rejects anonymous editing', () => {
    expect(() =>
      assertOwns({ userId: 'a', composerId: null, role: 'admin', name: 'A' }, 'cb'),
    ).not.toThrow();
    expect(() => assertOwns(null, 'ca')).toThrow();
  });
  it('rejects cross-site and missing-origin mutations', () => {
    expect(() =>
      requireSameOrigin(
        new Request('https://preview.test/form', {
          method: 'POST',
          headers: { Origin: 'https://other.test' },
        }),
      ),
    ).toThrow();
    expect(() =>
      requireSameOrigin(new Request('https://preview.test/form', { method: 'POST' })),
    ).toThrow();
    expect(() =>
      requireSameOrigin(
        new Request('https://preview.test/form', {
          method: 'POST',
          headers: { Origin: 'https://preview.test' },
        }),
      ),
    ).not.toThrow();
  });
  it('limits repeated mutations and opens a new window without unbounded state', async () => {
    const db = testDatabase();
    try {
      await consumeRateLimit(db.env, 'visitor', 2, 1000, 100);
      await consumeRateLimit(db.env, 'visitor', 2, 1000, 101);
      await expect(consumeRateLimit(db.env, 'visitor', 2, 1000, 102)).rejects.toThrow();
      await expect(consumeRateLimit(db.env, 'visitor', 2, 1000, 1200)).resolves.toBeUndefined();
    } finally {
      db.close();
    }
  });
});
