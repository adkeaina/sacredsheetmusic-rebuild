import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import type { AppEnv } from '../../app/lib/types.server';
export function testDatabase(){
 const sqlite = new DatabaseSync(':memory:'); for(const name of readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync('migrations/'+name,'utf8'));
 const prepare=(sql:string)=>{let values:SQLInputValue[]=[]; const statement={bind(...args:SQLInputValue[]){values=args;return statement;},async first(column?:string){const row=sqlite.prepare(sql).get(...values);return column?row?.[column]??null:row??null;},async all(){return {success:true,results:sqlite.prepare(sql).all(...values),meta:{}};},async run(){const result=sqlite.prepare(sql).run(...values);return {success:true,results:[],meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};},async raw(){return sqlite.prepare(sql).all(...values).map(Object.values);}};return statement;};
 const DB={prepare,async batch(statements:ReturnType<typeof prepare>[]){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}},async exec(sql:string){sqlite.exec(sql);return {count:0,duration:0};}} as unknown as AppEnv['DB'];
 return {env:{DB},sqlite,close:()=>sqlite.close()};
}
