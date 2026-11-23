import { it, expect } from 'vitest';
import { testDatabase } from './helpers/database';
import { adminMutation, validateImportUrl, parseIntervals } from '../app/lib/admin.server';
it('rejects non-admin changes and taxonomy cycles, audits successful changes', async () => {
  const d = testDatabase();
  try {
    const composer = {
      userId: 'u',
      composerId: 'c',
      name: 'C',
      role: 'composer' as const,
    };
    await expect(
      adminMutation(d.env, composer, {
        area: 'tags',
        intent: 'save',
        name: 'X',
        slug: 'x',
      }),
    ).rejects.toThrow();
    const admin = { ...composer, role: 'admin' as const };
    await adminMutation(d.env, admin, {
      area: 'tags',
      intent: 'save',
      id: 'parent',
      name: 'Parent',
      slug: 'parent',
      type: 'topic',
    });
    await adminMutation(d.env, admin, {
      area: 'tags',
      intent: 'save',
      id: 'child',
      name: 'Child',
      slug: 'child',
      type: 'topic',
      parent_id: 'parent',
    });
    await expect(
      adminMutation(d.env, admin, {
        area: 'tags',
        intent: 'save',
        id: 'parent',
        name: 'Parent',
        slug: 'parent',
        type: 'topic',
        parent_id: 'child',
      }),
    ).rejects.toThrow('cycle');
    expect(d.sqlite.prepare('SELECT count(*) n FROM audit_events').get()?.n).toBe(2);
  } finally {
    d.close();
  }
});
it('rejects private, local, credentialed and non-HTTPS import destinations', () => {
  for (const url of [
    'http://example.com/a.pdf',
    'https://localhost/a',
    'https://127.0.0.1/a',
    'https://[::1]/a',
    'https://10.0.0.1/a',
    'https://user:pass@example.com/a',
    'https://169.254.169.254/a',
  ])
    expect(() => validateImportUrl(url)).toThrow();
  expect(validateImportUrl('https://example.com/score.pdf').hostname).toBe('example.com');
});
it('bounds playback intervals and rejects malformed inputs', () => {
  expect(parseIntervals('1-3, 5-7')).toEqual([
    [1, 3],
    [5, 7],
  ]);
  expect(() => parseIntervals('5-2')).toThrow();
  expect(() => parseIntervals('0-999999')).toThrow();
});
it('edits catalog availability and preserves one administrator', async () => {
  const d = testDatabase();
  try {
    d.sqlite.exec(
      "INSERT INTO users(id,name,email,role,created_at,updated_at) VALUES('u','Admin','a@example.invalid','admin',0,0);INSERT INTO composers(id,name,slug) VALUES('c','C','c');INSERT INTO arrangements(id,code,title,composer_id) VALUES('a','a','A','c');",
    );
    const viewer = {
      userId: 'u',
      composerId: 'c',
      name: 'Admin',
      role: 'admin' as const,
    };
    await adminMutation(d.env, viewer, {
      area: 'catalog',
      intent: 'save',
      id: 'a',
      title: 'Updated',
      available_at: '100',
      published: '0',
      winner: '1',
    });
    expect(
      d.sqlite.prepare("SELECT title,published,winner FROM arrangements WHERE id='a'").get(),
    ).toMatchObject({ title: 'Updated', published: 0, winner: 1 });
    await expect(
      adminMutation(d.env, viewer, {
        area: 'users',
        intent: 'save',
        id: 'u',
        name: 'Admin',
        role: 'composer',
      }),
    ).rejects.toThrow('at least one');
  } finally {
    d.close();
  }
});
