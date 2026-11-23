import { it, expect } from 'vitest';
import { testDatabase } from './helpers/database';
import { filePolicy } from '../app/lib/file-policy.server';
import { queryCatalog, reindexArrangement } from '../app/lib/search.server';
import { addComment, addVote } from '../app/lib/community.server';
import { adminMutation } from '../app/lib/admin.server';
import { processCatalogJob } from '../app/lib/catalog-jobs.server';
it('keeps future music private and forces notation downloads', () => {
  expect(filePolicy('application/pdf', 1, Date.now() + 86400000, false)).toMatchObject({
    cache: 'private, no-store',
  });
  expect(filePolicy('application/vnd.recordare.musicxml+xml', 1, 0, false).disposition).toBe(
    'attachment',
  );
  expect(filePolicy('application/vnd.recordare.musicxml', 1, 0, false).disposition).toBe(
    'attachment',
  );
});
it('composer pages use real credits and search includes hymn and collaborators', async () => {
  const d = testDatabase();
  try {
    d.sqlite.exec(
      "INSERT INTO composers(id,name,slug) VALUES('a','Alice','alice'),('b','Bob','bob');INSERT INTO arrangements(id,code,title,composer_id,description,hymn) VALUES('real','real','Real','b','','Special Hymn'),('decoy','decoy','Decoy','b','A tribute to Alice','');INSERT INTO credits VALUES('real','a');",
    );
    await reindexArrangement(d.env, 'real');
    await reindexArrangement(d.env, 'decoy');
    const profile = await queryCatalog(d.env, {
      q: '',
      page: 1,
      seed: 'composer',
      composerId: 'a',
    } as any);
    expect(profile.items.map((i) => i.id)).toEqual(['real']);
    expect(
      (await queryCatalog(d.env, { q: 'Alice', page: 1, seed: '' })).items.map((i) => i.id),
    ).toContain('real');
    expect((await queryCatalog(d.env, { q: 'Special Hymn', page: 1, seed: '' })).total).toBe(1);
  } finally {
    d.close();
  }
});
it('rolls back feedback if its private notification cannot persist and accepts 4.5', async () => {
  const d = testDatabase();
  try {
    d.sqlite.exec(
      "INSERT INTO composers(id,name,slug) VALUES('c','C','c');INSERT INTO arrangements(id,code,title,composer_id) VALUES('a','a','A','c');INSERT INTO competitions(id,title,opens_at,closes_at) VALUES('co','Co',0,200);INSERT INTO competition_entries VALUES('co','a');CREATE TRIGGER mail_failure BEFORE INSERT ON mail_outbox BEGIN SELECT RAISE(ABORT,'outbox unavailable');END;",
    );
    await expect(
      addComment(d.env, {
        arrangementId: 'a',
        name: 'Listener',
        email: '',
        text: 'Thank you',
        rating: 5,
        difficulty: null,
      }),
    ).rejects.toThrow();
    expect(d.sqlite.prepare('SELECT count(*) n FROM comments').get()?.n).toBe(0);
    await expect(
      addVote(
        d.env,
        {
          competitionId: 'co',
          arrangementId: 'a',
          household: 'h',
          session: 's',
          userId: null,
          rating: 4.5,
          feedback: 'Thoughtful',
        },
        100,
      ),
    ).rejects.toThrow();
    expect(d.sqlite.prepare('SELECT count(*) n FROM votes').get()?.n).toBe(0);
    d.sqlite.exec('DROP TRIGGER mail_failure');
    await addVote(
      d.env,
      {
        competitionId: 'co',
        arrangementId: 'a',
        household: 'h',
        session: 's',
        userId: null,
        rating: 4.5,
        feedback: 'Thoughtful',
      },
      100,
    );
    expect(d.sqlite.prepare('SELECT rating FROM votes').get()?.rating).toBe(4.5);
  } finally {
    d.close();
  }
});
it('links an existing unclaimed composer without stealing another account and preserves music', async () => {
  const d = testDatabase();
  try {
    d.sqlite.exec(
      "INSERT INTO users(id,name,email,created_at,updated_at) VALUES('u','New Profile','u@example.invalid',0,0),('v','Other','v@example.invalid',0,0);INSERT INTO composers(id,name,slug,user_id) VALUES('old','New Profile','new','u'),('target','Existing Profile','existing',NULL),('taken','Other','other','v');INSERT INTO arrangements(id,code,title,composer_id) VALUES('a','a','Own Song','old');",
    );
    const admin = { userId: 'admin', composerId: null, name: 'Admin', role: 'admin' as const };
    await adminMutation(d.env, admin, {
      area: 'composers',
      intent: 'link',
      id: 'target',
      userId: 'u',
    });
    expect(d.sqlite.prepare("SELECT user_id FROM composers WHERE id='target'").get()?.user_id).toBe(
      'u',
    );
    expect(
      d.sqlite.prepare("SELECT composer_id FROM arrangements WHERE id='a'").get()?.composer_id,
    ).toBe('target');
    await expect(
      adminMutation(d.env, admin, { area: 'composers', intent: 'link', id: 'taken', userId: 'u' }),
    ).rejects.toThrow();
  } finally {
    d.close();
  }
});
it('reconciles parent membership and all search documents in resumable batches', async () => {
  const d = testDatabase();
  try {
    d.sqlite.exec(
      "INSERT INTO composers(id,name,slug) VALUES('c','C','c');INSERT INTO tags(id,name,slug,type,parent_id) VALUES('p','Old Parent','old-parent','topic',NULL),('new','New Parent','new-parent','topic',NULL),('t','Old Category','old-category','topic','p');",
    );
    for (let i = 0; i < 105; i++) {
      d.sqlite
        .prepare('INSERT INTO arrangements(id,code,title,composer_id) VALUES(?,?,?,?)')
        .run('a' + i, 'a' + i, 'Song ' + i, 'c');
      d.sqlite.prepare('INSERT INTO arrangement_tags VALUES(?,?)').run('a' + i, 'p');
      d.sqlite.prepare('INSERT INTO arrangement_tags VALUES(?,?)').run('a' + i, 't');
      d.sqlite.prepare('INSERT INTO arrangement_tag_selections VALUES(?,?)').run('a' + i, 't');
      await reindexArrangement(d.env, 'a' + i);
    }
    const result = await adminMutation(
      d.env,
      { userId: 'admin', composerId: null, name: 'Admin', role: 'admin' },
      {
        area: 'tags',
        intent: 'save',
        id: 't',
        name: 'Renamed Category',
        slug: 'renamed-category',
        type: 'topic',
        parent_id: 'new',
        rank: '0',
      },
    );
    for (let i = 0; i < 20; i++) {
      const job = await processCatalogJob(d.env, (result as any).jobId);
      if (job.done) break;
    }
    expect((await queryCatalog(d.env, { q: 'Old Category', page: 1, seed: '' })).total).toBe(0);
    expect((await queryCatalog(d.env, { q: 'Renamed Category', page: 1, seed: '' })).total).toBe(
      105,
    );
    expect(
      d.sqlite.prepare("SELECT count(*) n FROM arrangement_tags WHERE tag_id='p'").get()?.n,
    ).toBe(0);
  } finally {
    d.close();
  }
});
it('administrator account removal disables access while preserving catalog references', async () => {
  const d = testDatabase();
  try {
    d.sqlite.exec(
      "INSERT INTO users(id,name,email,created_at,updated_at,role) VALUES('admin','Admin','admin@example.invalid',0,0,'admin'),('u','Composer','u@example.invalid',0,0,'composer');INSERT INTO composers(id,name,slug,user_id) VALUES('c','Composer','c','u');INSERT INTO arrangements(id,code,title,composer_id) VALUES('a','a','A','c');",
    );
    const viewer = { userId: 'admin', composerId: null, name: 'Admin', role: 'admin' as const };
    await adminMutation(d.env, viewer, { area: 'users', intent: 'disable', id: 'u' });
    expect(d.sqlite.prepare("SELECT disabled FROM users WHERE id='u'").get()?.disabled).toBe(1);
    expect(d.sqlite.prepare('SELECT title FROM arrangements').get()?.title).toBe('A');
    await expect(
      adminMutation(d.env, viewer, { area: 'users', intent: 'disable', id: 'admin' }),
    ).rejects.toThrow();
  } finally {
    d.close();
  }
});
