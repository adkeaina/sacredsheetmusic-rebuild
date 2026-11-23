import { it, expect } from 'vitest';
import { testDatabase } from './helpers/database';
import { inspectStoredFiles } from '../app/lib/diagnostics.server';
it('finds missing stored objects and duplicate attachments within a song', async () => {
  const d = testDatabase();
  try {
    d.sqlite.exec(
      "INSERT INTO composers(id,name,slug) VALUES('c','C','c');INSERT INTO arrangements(id,code,title,composer_id) VALUES('a','a','A','c');INSERT INTO files(id,arrangement_id,storage_key,filename,content_type,size,state) VALUES('f1','a','missing','a.pdf','application/pdf',100,'published'),('f2','a','same','b.pdf','application/pdf',100,'published'),('f3','a','same','b.pdf','application/pdf',100,'published');",
    );
    const report = await inspectStoredFiles(
      {
        ...d.env,
        FILES: {
          head: async (key: string) =>
            key === 'missing' ? null : { etag: 'same-content', size: 100 },
        },
      } as any,
      '',
    );
    expect(report.missing.map((f: any) => f.id)).toEqual(['f1']);
    expect(report.duplicates.length).toBeGreaterThan(0);
  } finally {
    d.close();
  }
});
import { validateTrustedImport } from '../app/lib/admin.server';
it('requires explicitly trusted import sources on every destination', () => {
  expect(() =>
    validateTrustedImport('https://untrusted.example/a.pdf', ['preview.example']),
  ).toThrow('trusted');
  expect(validateTrustedImport('https://preview.example/a.pdf', ['preview.example']).hostname).toBe(
    'preview.example',
  );
});
