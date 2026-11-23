import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

function database() { const db = new DatabaseSync(':memory:'); db.exec(readFileSync('migrations/0001.sql', 'utf8')); return db; }
describe('persistent data integrity', () => {
  it('does not count a repeated bookmark twice', () => {
    const db = database();
    db.exec("INSERT INTO composers(id,name,slug) VALUES('c','Sample','sample'); INSERT INTO arrangements(id,code,title,composer_id) VALUES('a','sample-piece','Sample Piece','c');");
    db.exec("INSERT OR IGNORE INTO bookmarks(session_id,arrangement_id) VALUES('visitor','a'); INSERT OR IGNORE INTO bookmarks(session_id,arrangement_id) VALUES('visitor','a');");
    expect(db.prepare('SELECT count(*) AS n FROM bookmarks').get()?.n).toBe(1);
    db.close();
  });
  it('rejects a second vote for the same household and contest entry', () => {
    const db = database();
    db.exec("INSERT INTO composers(id,name,slug) VALUES('c','Sample','sample'); INSERT INTO arrangements(id,code,title,composer_id) VALUES('a','sample-piece','Sample Piece','c'); INSERT INTO competitions(id,title,opens_at,closes_at) VALUES('contest','Test',0,100); INSERT INTO competition_entries(competition_id,arrangement_id) VALUES('contest','a'); INSERT INTO votes(id,competition_id,arrangement_id,household_key,session_id,rating,created_at) VALUES('1','contest','a','home','session',5,50);");
    expect(() => db.exec("INSERT INTO votes(id,competition_id,arrangement_id,household_key,session_id,rating,created_at) VALUES('2','contest','a','home','other',4,51)")).toThrow();
    expect(db.prepare('SELECT sum(rating) AS points FROM votes').get()?.points).toBe(5);
    db.close();
  });
  it('allows arrangements to share a permitted media object', () => { const db=database(); db.exec("INSERT INTO composers(id,name,slug) VALUES('c','Sample','sample'); INSERT INTO arrangements(id,code,title,composer_id) VALUES('a','a','A','c'),('b','b','B','c'); INSERT INTO files(id,arrangement_id,storage_key,filename,content_type,size) VALUES('f1','a','shared.pdf','sample.pdf','application/pdf',100),('f2','b','shared.pdf','sample.pdf','application/pdf',100);"); expect(db.prepare('SELECT count(*) AS n FROM files').get()?.n).toBe(2);db.close(); });
  it('keeps file references valid when an arrangement is deleted', () => {
    const db = database();
    db.exec("INSERT INTO composers(id,name,slug) VALUES('c','Sample','sample'); INSERT INTO arrangements(id,code,title,composer_id) VALUES('a','sample-piece','Sample Piece','c'); INSERT INTO files(id,arrangement_id,storage_key,filename,content_type,size,state) VALUES('f','a','files/f','sample.pdf','application/pdf',100,'published'); DELETE FROM arrangements WHERE id='a';");
    expect(db.prepare('SELECT count(*) AS n FROM files WHERE arrangement_id IS NOT NULL').get()?.n).toBe(0);
    db.close();
  });
});
