import { it, expect } from 'vitest';
import { testDatabase } from './helpers/database';
import { collectFiles } from '../app/lib/maintenance.server';
it('retains shared live objects while collecting deleted file references', async () => {
  const db = testDatabase();
  const deleted: string[] = [];
  try {
    db.sqlite.exec(
      "INSERT INTO composers(id,name,slug) VALUES('c','C','c');INSERT INTO arrangements(id,code,title,composer_id) VALUES('a','a','A','c');INSERT INTO files(id,arrangement_id,storage_key,filename,content_type,size,state,deleted_at) VALUES('old',NULL,'shared','s.pdf','application/pdf',50,'deleted',0),('live','a','shared','s.pdf','application/pdf',50,'published',NULL),('gone',NULL,'gone','g.pdf','application/pdf',80,'deleted',0);INSERT INTO storage_objects(storage_key,size,charged) VALUES('shared',50,1),('gone',80,1);UPDATE storage_quota SET used=130;",
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
it('charges each collected object once under overlapping collectors and never deducts free fixtures', async () => {
  const d = testDatabase();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => (release = resolve));
  let calls = 0;
  try {
    d.sqlite.exec(
      "INSERT INTO storage_objects(storage_key,size,charged,state) VALUES('uploaded',80,1,'active'),('fixtures/free',50,0,'active');INSERT INTO files(id,storage_key,filename,content_type,size,state,deleted_at) VALUES('up','uploaded','up.pdf','application/pdf',80,'deleted',0),('free','fixtures/free','free.pdf','application/pdf',50,'deleted',0);UPDATE storage_quota SET used=150;",
    );
    const env = {
      ...d.env,
      FILES: {
        delete: async (key: string) => {
          if (key === 'uploaded' && ++calls === 1) await blocked;
        },
      },
    } as any;
    const first = collectFiles(env, 1000000000);
    await new Promise((r) => setTimeout(r, 5));
    const second = collectFiles(env, 1000000000);
    release();
    await Promise.all([first, second]);
    expect(d.sqlite.prepare('SELECT used FROM storage_quota').get()?.used).toBe(70);
    expect(calls).toBe(1);
  } finally {
    d.close();
  }
});
