import { describe, it, expect } from 'vitest';
import { validateUpload, assertSignature, saveArrangement } from '../app/lib/storage.server';
import { testDatabase } from './helpers/database';
describe('upload and arrangement boundaries', () => {
  it('accepts source file limits and rejects oversized or active content', () => {
    expect(() =>
      validateUpload({
        filename: 'score.pdf',
        contentType: 'application/pdf',
        size: 125829120,
        kind: 'score',
      }),
    ).not.toThrow();
    expect(() =>
      validateUpload({
        filename: 'score.pdf',
        contentType: 'application/pdf',
        size: 125829121,
        kind: 'score',
      }),
    ).toThrow();
    expect(() =>
      validateUpload({
        filename: 'image.png',
        contentType: 'image/png',
        size: 10485761,
        kind: 'preview',
      }),
    ).toThrow();
    expect(() =>
      validateUpload({
        filename: 'page.html',
        contentType: 'text/html',
        size: 100,
        kind: 'attachment',
      }),
    ).toThrow();
  });
  it('checks actual signatures instead of trusting filenames', () => {
    expect(() =>
      assertSignature(new TextEncoder().encode('%PDF-1.7\n'), 'application/pdf'),
    ).not.toThrow();
    expect(() =>
      assertSignature(new TextEncoder().encode('<script>alert(1)</script>'), 'application/pdf'),
    ).toThrow();
    expect(() =>
      assertSignature(
        new Uint8Array([
          137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 2, 0, 0, 0, 2, 0,
        ]),
        'image/png',
      ),
    ).not.toThrow();
  });
  it('rejects changes to another composer and preserves a draft after metadata save', async () => {
    const db = testDatabase();
    try {
      db.sqlite.exec(
        "INSERT INTO composers(id,name,slug) VALUES('ca','Composer A','a'),('cb','Composer B','b');INSERT INTO arrangements(id,code,title,composer_id) VALUES('other','other','Other','cb');",
      );
      const viewer = {
        userId: 'u',
        composerId: 'ca',
        role: 'composer' as const,
        name: 'Composer A',
      };
      await expect(
        saveArrangement(db.env, viewer, {
          id: 'other',
          title: 'Stolen',
          voicing: 'SATB',
          tagIds: [],
          rights: true,
        }),
      ).rejects.toThrow();
      const item = await saveArrangement(db.env, viewer, {
        title: 'My New Song',
        voicing: 'SATB',
        tagIds: [],
        rights: true,
      });
      expect(
        db.sqlite.prepare('SELECT published FROM arrangements WHERE id=?').get(item.id)?.published,
      ).toBe(0);
      expect(
        db.sqlite.prepare('SELECT title FROM arrangements WHERE id=?').get('other')?.title,
      ).toBe('Other');
    } finally {
      db.close();
    }
  });
});

import { reserveUpload, finalizeUpload, cancelUpload, removeFile } from '../app/lib/storage.server';
import type { AppEnv } from '../app/lib/types.server';
it('serializes quota reservations and finalizes a completed transfer only once', async () => {
  const db = testDatabase();
  let aborted = 0;
  const objects = new Map<string, { size: number; customMetadata: { ticketId: string } }>();
  const bucket = {
    async createMultipartUpload(key: string, options: any) {
      objects.set(key, { size: 100, customMetadata: options.customMetadata });
      return {
        uploadId: 'multipart',
        async abort() {
          aborted++;
        },
      };
    },
    resumeMultipartUpload() {
      return {
        async complete() {
          return {};
        },
        async abort() {
          aborted++;
        },
      };
    },
    async head(key: string) {
      return objects.get(key);
    },
  };
  const env = { ...db.env, FILES: bucket } as unknown as AppEnv;
  const viewer = {
    userId: 'u',
    composerId: 'c',
    role: 'composer' as const,
    name: 'Composer',
  };
  try {
    db.sqlite.exec(
      "INSERT INTO users(id,name,email,created_at,updated_at) VALUES('u','Composer','u@example.invalid',0,0);INSERT INTO composers(id,name,slug,user_id) VALUES('c','Composer','c','u');INSERT INTO arrangements(id,code,title,composer_id) VALUES('a','a','A','c');UPDATE storage_quota SET max_bytes=150;",
    );
    const input = {
      arrangementId: 'a',
      filename: 'a.pdf',
      contentType: 'application/pdf',
      kind: 'score',
      size: 100,
    };
    const results = await Promise.allSettled([
      reserveUpload(env, viewer, input),
      reserveUpload(env, viewer, input),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(aborted).toBe(1);
    const ticket = (
      results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{
        id: string;
      }>
    ).value;
    await expect(finalizeUpload(env, viewer, ticket.id)).rejects.toThrow('missing');
    db.sqlite
      .prepare('INSERT INTO upload_parts(ticket_id,part_number,etag,size) VALUES(?,1,?,100)')
      .run(ticket.id, 'etag');
    db.sqlite.prepare('UPDATE upload_tickets SET validated=1 WHERE id=?').run(ticket.id);
    await finalizeUpload(env, viewer, ticket.id);
    await finalizeUpload(env, viewer, ticket.id);
    expect(db.sqlite.prepare('SELECT used,reserved FROM storage_quota').get()).toMatchObject({
      used: 100,
      reserved: 0,
    });
    expect(db.sqlite.prepare('SELECT count(*) n FROM files').get()?.n).toBe(1);
    await cancelUpload(env, viewer, ticket.id);
    expect(db.sqlite.prepare('SELECT used FROM storage_quota').get()?.used).toBe(100);
  } finally {
    db.close();
  }
});
it('lets an administrator assign the composer while retaining additional credits', async () => {
  const db = testDatabase();
  try {
    db.sqlite.exec(
      "INSERT INTO composers(id,name,slug) VALUES('c1','First','first'),('c2','Second','second'),('c3','Third','third');",
    );
    const result = await saveArrangement(
      db.env,
      { userId: 'admin', composerId: 'c1', name: 'Admin', role: 'admin' },
      {
        title: 'Collaboration',
        composerId: 'c2',
        additionalComposerIds: ['c3'],
        voicing: 'SATB',
        tagIds: [],
        rights: true,
      } as any,
    );
    expect(
      db.sqlite.prepare('SELECT composer_id FROM arrangements WHERE id=?').get(result.id)
        ?.composer_id,
    ).toBe('c2');
    expect(
      db.sqlite
        .prepare('SELECT composer_id FROM credits WHERE arrangement_id=? ORDER BY composer_id')
        .all(result.id)
        .map((c) => c.composer_id),
    ).toEqual(['c2', 'c3']);
  } finally {
    db.close();
  }
});
it('retains a finalization reservation until an unreferenced completed object is reconciled', async () => {
  const db = testDatabase();
  let stored = false;
  const env = {
    ...db.env,
    FILES: {
      createMultipartUpload: async () => ({ uploadId: 'upload', abort: async () => {} }),
      resumeMultipartUpload: () => ({
        complete: async () => {
          stored = true;
        },
        abort: async () => {
          if (stored) throw new Error('Already completed');
        },
      }),
      head: async () => (stored ? { size: 100, customMetadata: { ticketId: ticket.id } } : null),
      delete: async () => {
        stored = false;
      },
    },
  } as unknown as AppEnv;
  const viewer = { userId: 'u', composerId: 'c', role: 'composer' as const, name: 'C' };
  let ticket: { id: string };
  try {
    db.sqlite.exec(
      "INSERT INTO users(id,name,email,created_at,updated_at) VALUES('u','C','u@example.invalid',0,0);INSERT INTO composers(id,name,slug,user_id) VALUES('c','C','c','u');INSERT INTO arrangements(id,code,title,composer_id) VALUES('a','a','A','c');",
    );
    ticket = await reserveUpload(env, viewer, {
      arrangementId: 'a',
      filename: 'score.pdf',
      contentType: 'application/pdf',
      size: 100,
      kind: 'score',
    });
    db.sqlite.prepare('INSERT INTO upload_parts VALUES(?,1,?,100)').run(ticket.id, 'etag');
    db.sqlite.prepare('UPDATE upload_tickets SET validated=1 WHERE id=?').run(ticket.id);
    const batch = env.DB.batch.bind(env.DB);
    let fail = true;
    env.DB.batch = (async (statements: any) => {
      if (fail) {
        fail = false;
        throw new Error('D1 interrupted');
      }
      return batch(statements);
    }) as any;
    await expect(finalizeUpload(env, viewer, ticket.id)).rejects.toThrow('D1 interrupted');
    await cancelUpload(env, viewer, ticket.id);
    expect(stored).toBe(true);
    expect(db.sqlite.prepare('SELECT reserved FROM storage_quota').get()?.reserved).toBe(100);
    const { collectFiles } = await import('../app/lib/maintenance.server');
    await collectFiles(env, Date.now() + 172800000);
    expect(stored).toBe(false);
    expect(db.sqlite.prepare('SELECT reserved FROM storage_quota').get()?.reserved).toBe(0);
  } finally {
    db.close();
  }
});
it('failed PDF processing prevents publication while retaining the score and draft', async () => {
  const db = testDatabase();
  try {
    db.sqlite.exec(
      "INSERT INTO composers(id,name,slug) VALUES('c','C','c');INSERT INTO arrangements(id,code,title,composer_id,rights_attested,voicing,published) VALUES('a','a','A','c',1,'SATB',0);INSERT INTO files(id,arrangement_id,storage_key,filename,content_type,size,state) VALUES('f','a','pdf','broken.pdf','application/pdf',100,'published');INSERT INTO processing_jobs(id,arrangement_id,file_id,type,status,created_at,updated_at) VALUES('job','a','f','pdf-preview','failed',0,0);",
    );
    const { publishArrangement } = await import('../app/lib/storage.server');
    await expect(
      publishArrangement(
        db.env,
        { userId: 'u', composerId: 'c', name: 'C', role: 'composer' },
        'a',
        true,
      ),
    ).rejects.toThrow('processing');
    expect(db.sqlite.prepare('SELECT published FROM arrangements').get()?.published).toBe(0);
    expect(db.sqlite.prepare('SELECT count(*) n FROM files').get()?.n).toBe(1);
  } finally {
    db.close();
  }
});
