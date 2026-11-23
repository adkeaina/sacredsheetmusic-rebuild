import { createCookie } from 'react-router';
import type { AppEnv } from './types.server';
export async function visitorSession(request:Request,env:AppEnv){const cookie=createCookie('ssm_visitor',{httpOnly:true,sameSite:'lax',secure:new URL(request.url).protocol==='https:',path:'/',maxAge:31536000,secrets:[env.AUTH_SECRET]});const parsed=await cookie.parse(request.headers.get('Cookie'));const valid=typeof parsed==='string'&&/^[0-9a-f-]{36}$/i.test(parsed);const id=valid?parsed:crypto.randomUUID();return {id,header:valid?null:await cookie.serialize(id)};}
export function requireSameOrigin(request:Request){const origin=request.headers.get('Origin');if(origin!==new URL(request.url).origin)throw new Response('Please submit this form from the website.',{status:403});}
