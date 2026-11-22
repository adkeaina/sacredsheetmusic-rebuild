import { readFile } from 'node:fs/promises';
import { localRuntime } from './local-runtime';
const {mf,db}=await localRuntime();
try { await db.exec(await readFile('migrations/0001.sql','utf8')); console.log('Local database migration applied.'); } finally { await mf.dispose(); }
