import { readFile, readdir } from 'node:fs/promises';
import { localRuntime } from './local-runtime';
const { mf, db } = await localRuntime();
try {
  await db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY,applied_at INTEGER NOT NULL);',
  );
  for (const name of (await readdir('migrations')).filter((n) => n.endsWith('.sql')).sort()) {
    if (await db.prepare('SELECT name FROM schema_migrations WHERE name=?').bind(name).first())
      continue;
    await db.exec(await readFile('migrations/' + name, 'utf8'));
    await db
      .prepare('INSERT INTO schema_migrations(name,applied_at) VALUES(?,?)')
      .bind(name, Date.now())
      .run();
    console.log('Applied ' + name);
  }
  console.log('Local database is current.');
} finally {
  await mf.dispose();
}
