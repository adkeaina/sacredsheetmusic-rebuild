import { localRuntime } from './local-runtime';
import { seedStatements } from './seed-data';
import { readFile } from 'node:fs/promises';
const {mf,db,files}=await localRuntime();
try {
 const data=seedStatements(Date.now(),Number(process.env.PERFORMANCE_ROWS||0));
 for(let i=0;i<data.length;i+=40)await db.batch(data.slice(i,i+40).map(s=>db.prepare(s.sql).bind(...s.params)));
 await db.prepare('DELETE FROM arrangement_search').run();
 await db.prepare(`INSERT INTO arrangement_search(arrangement_id,title,composer,tags,description,code) SELECT a.id,lower(a.title),lower(c.name),lower(a.voicing||' '||COALESCE(group_concat(t.name,' '),'')),lower(a.description),lower(a.code) FROM arrangements a JOIN composers c ON c.id=a.composer_id LEFT JOIN arrangement_tags at ON at.arrangement_id=a.id LEFT JOIN tags t ON t.id=at.tag_id GROUP BY a.id`).run();
 for(const [name,type] of [['sample.pdf','application/pdf'],['sample.mp3','audio/mpeg'],['sample.mid','audio/midi'],['score.svg','image/svg+xml']]){const content=await readFile('public/fixtures/'+name);await files.put('fixtures/'+name,content,{httpMetadata:{contentType:type}});await db.prepare('UPDATE files SET size=? WHERE storage_key=?').bind(content.byteLength,'fixtures/'+name).run();}
 console.log('Seeded sample data and owned media. Re-running preserves existing records.');
} finally{await mf.dispose();}
