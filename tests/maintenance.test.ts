import { it, expect } from 'vitest';
import { testDatabase } from './helpers/database';
import { collectFiles } from '../app/lib/maintenance.server';
it('retains shared live objects while collecting deleted file references', async () => {
  const db = testDatabase();
  const deleted: string[] = [];
  try {
    db.sqlite.exec(
      "INSERT INTO composers(id,name,slug) VALUES('c','C','c');INSERT INTO arrangements(id,code,title,composer_id) VALUES('a','a','A','c');INSERT INTO files(id,arrangement_id,storage_key,filename,content_type,size,state,deleted_at) VALUES('old',NULL,'shared','s.pdf','application/pdf',50,'deleted',0),('live','a','shared','s.pdf','application/pdf',50,'published',NULL),('gone',NULL,'gone','g.pdf','application/pdf',80,'deleted',0);UPDATE storage_quota SET used=130;",
    );
    await collectFiles(
      {
        ...db.env,
        FILES: {
          delete: async (key: string) => {
            deleted.push(key);
          },
        },
      } as any,
      1000000000,
    );
    expect(deleted).toEqual(['gone']);
    expect(db.sqlite.prepare("SELECT id FROM files WHERE id='live'").get()).toBeTruthy();
    expect(db.sqlite.prepare('SELECT used FROM storage_quota').get()?.used).toBe(50);
  } finally {
    db.close();
  }
});
