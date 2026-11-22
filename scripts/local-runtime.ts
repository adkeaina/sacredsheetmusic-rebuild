import { Miniflare } from 'miniflare';
import { resolve } from 'node:path';
export async function localRuntime() {
 const mf = new Miniflare({resourcePersistencePath:resolve('.cloudflare/state/v3'),workers:[{config:{name:'tooling',compatibilityDate:'2026-11-22',env:{DB:{type:'d1',id:'9dfd38b2-ffb0-4e63-b509-dd3558e88ace'},FILES:{type:'r2',name:'sacred-music-preview-files'}},manifest:{mainModule:'index.js',modules:{'index.js':{type:'esm',contents:'export default { fetch(){return new Response("local tooling")} }'}}}}}]});
 return {mf,db:await mf.getD1Database('DB','tooling'),files:await mf.getR2Bucket('FILES','tooling')};
}
