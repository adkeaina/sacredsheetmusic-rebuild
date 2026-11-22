import type { CatalogQuery,CatalogPage,ArrangementSummary,Facet } from './types.server';
import { rows,first,run,summarySelect,visible,type DbEnv,type SqlValue } from './db.server';
const ignored=new Set(['with','and','or','the','a','by','for','sheet','music']);
export function normalizeSearch(value:string){return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).map(w=>w==='oh'?'o':w).join(' ');}
export function searchTokens(value:string){return normalizeSearch(value.slice(0,160)).split(' ').filter(w=>w&&!ignored.has(w)).slice(0,12);}
export async function reindexArrangement(env:DbEnv,id:string){
 const a=await first<{id:string;title:string;composer:string;description:string;code:string;voicing:string;tags:string}>(env,`SELECT a.id,a.title,a.description,a.code,a.voicing,c.name AS composer,COALESCE(group_concat(t.name,' '),'') AS tags FROM arrangements a JOIN composers c ON c.id=a.composer_id LEFT JOIN arrangement_tags at ON at.arrangement_id=a.id LEFT JOIN tags t ON t.id=at.tag_id WHERE a.id=? GROUP BY a.id`,[id]);
 const deleteStatement=env.DB.prepare('DELETE FROM arrangement_search WHERE arrangement_id=?').bind(id);
 if(!a){await deleteStatement.run();return;}
 await env.DB.batch([deleteStatement,env.DB.prepare('INSERT INTO arrangement_search(arrangement_id,title,composer,tags,description,code) VALUES(?,?,?,?,?,?)').bind(id,normalizeSearch(a.title),normalizeSearch(a.composer),normalizeSearch(a.tags+' '+a.voicing),normalizeSearch(a.description),normalizeSearch(a.code))]);
}
export async function queryCatalog(env:DbEnv,query:CatalogQuery):Promise<CatalogPage>{
 const tokens=searchTokens(query.q); const normalized=normalizeSearch(query.q);const params:SqlValue[]=[Date.now()];
 let where=visible;let join='';
 if(tokens.length){join=' JOIN arrangement_search ON arrangement_search.arrangement_id=a.id';where+=' AND arrangement_search MATCH ?';params.push(tokens.map(t=>'"'+t.replaceAll('"','')+'"*').join(' AND '));}
 const selected=(query.tag||'').split(',').filter(Boolean).slice(0,12);
 if(selected.includes('original'))where+=' AND a.original=1';
 const tagSlugs=selected.filter(t=>t!=='original'&&t!=='all');
 if(tagSlugs.length){const groups=await rows<{id:string;type:string}>(env,`SELECT id,type FROM tags WHERE slug IN (${tagSlugs.map(()=>'?').join(',')})`,tagSlugs);if(!groups.length)where+=' AND 0';for(const type of new Set(groups.map(t=>t.type))){const ids=groups.filter(t=>t.type===type).map(t=>t.id);where+=` AND EXISTS (WITH RECURSIVE descendants(id) AS (SELECT id FROM tags WHERE id IN (${ids.map(()=>'?').join(',')}) UNION SELECT t.id FROM tags t JOIN descendants d ON t.parent_id=d.id) SELECT 1 FROM arrangement_tags at JOIN descendants d ON d.id=at.tag_id WHERE at.arrangement_id=a.id)`;params.push(...ids);}}
 if(query.type){const types=query.type.split(',').slice(0,8);where+=` AND EXISTS(SELECT 1 FROM arrangement_tags at JOIN tags t ON t.id=at.tag_id WHERE at.arrangement_id=a.id AND t.slug IN (${types.map(()=>'?').join(',')}))`;params.push(...types);}
 const fromBase=`FROM arrangements a JOIN composers c ON c.id=a.composer_id${join}`; const from=`${fromBase} WHERE ${where}`;
 const count=await first<{n:number}>(env,`SELECT count(*) AS n ${from}`,params);const total=count?.n??0;const pages=Math.max(1,Math.ceil(total/48));const page=Math.min(pages,Math.max(1,Math.floor(Number.isFinite(query.page)?query.page:1)));
 let order='a.title COLLATE NOCASE,a.id';const orderParams:SqlValue[]=[];
 if(tokens.length){order='CASE WHEN arrangement_search.title=? THEN 0 WHEN arrangement_search.title LIKE ? THEN 1 ELSE 2 END,bm25(arrangement_search,0,8,4,3,1,8),a.title,a.id';orderParams.push(normalized,normalized+'%');}
 if(query.seed==='recent'&&!tokens.length)order='a.created_at DESC,a.id';
 const items=await rows<ArrangementSummary>(env,`SELECT ${summarySelect} ${from} ORDER BY ${order} LIMIT 48 OFFSET ?`,[...params,...orderParams,(page-1)*48]);
 const facets=await rows<Facet>(env,`SELECT ft.name,ft.slug,ft.type,count(DISTINCT a.id) AS count ${fromBase} JOIN arrangement_tags fat ON fat.arrangement_id=a.id JOIN tags ft ON ft.id=fat.tag_id WHERE ${where} GROUP BY ft.id HAVING count>0 ORDER BY ft.rank,ft.name`,params);
 const suggestions=normalized?await rows<{name:string;href:string}>(env,`SELECT t.name,'/'||t.slug AS href FROM tags t WHERE lower(t.name) LIKE ? AND EXISTS(SELECT 1 FROM arrangement_tags at JOIN arrangements a ON a.id=at.arrangement_id WHERE at.tag_id=t.id AND ${visible}) UNION ALL SELECT c.name,'/composer/'||c.slug AS href FROM composers c WHERE lower(c.name) LIKE ? AND EXISTS(SELECT 1 FROM arrangements a WHERE a.composer_id=c.id AND ${visible}) LIMIT 6`,[query.q.trim().toLowerCase()+'%',Date.now(),query.q.trim().toLowerCase()+'%',Date.now()]):[];
 return {items,total,page,pages,facets,suggestions};
}
