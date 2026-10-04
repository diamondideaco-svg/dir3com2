import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRequestClient } from '@/lib/supabase/server';
import { resolveCanonicalActiveProfile } from '@/lib/auth/identity';
import { readContinuity,mutateContinuity,parseContinuityMutation,type ContinuityRpc } from '@/lib/dabra/continuity-service';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers});
async function actor(request:NextRequest) {
 const session=await createSupabaseRequestClient(request);
 if(!session) return null;
 const profile=await resolveCanonicalActiveProfile(session.supabase,session.user.id);
 if(!profile || profile.role!=='customer') return null;
 return session.supabase;
}
export async function GET(request:NextRequest) {
 if(process.env.DABRA_CONTINUITY_ENABLED!=='true') return json({enabled:false});
 try {
  const client=await actor(request);
  if(!client) return json({error:'CONTINUITY_AUTH_REQUIRED'},401);
  const state=await readContinuity((name,args)=>client.rpc(name,args) as unknown as ReturnType<ContinuityRpc>);
  return json({enabled:true,state});
 } catch {return json({error:'CONTINUITY_UNAVAILABLE'},503);}
}
export async function POST(request:NextRequest) {
 if(process.env.DABRA_CONTINUITY_ENABLED!=='true') return json({enabled:false},404);
 // Cookie and bearer callers both use the same local-origin mutation contract.
 if(request.headers.get('origin')!==request.nextUrl.origin || !request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({error:'CONTINUITY_INVALID'},403);
 try {
  const client=await actor(request);
  if(!client) return json({error:'CONTINUITY_AUTH_REQUIRED'},401);
  if(Number(request.headers.get('content-length')??0)>4096) return json({error:'CONTINUITY_INVALID'},413);
  const reader=request.body?.getReader();if(!reader)return json({error:'CONTINUITY_INVALID'},400);
  let size=0;const chunks:Uint8Array[]=[];
  for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>4096){await reader.cancel();return json({error:'CONTINUITY_INVALID'},413);}chunks.push(part.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let body:unknown;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return json({error:'CONTINUITY_INVALID'},400);}
  const input=parseContinuityMutation(body);if(!input)return json({error:'CONTINUITY_INVALID'},400);
  const state=await mutateContinuity((name,args)=>client.rpc(name,args) as unknown as ReturnType<ContinuityRpc>,input);
  return json({enabled:true,state});
 } catch(error) {
  const code=error instanceof Error?error.message:'CONTINUITY_UNAVAILABLE';
  return json({error:['CONTINUITY_CONFLICT','CONTINUITY_INVALID'].includes(code)?code:'CONTINUITY_UNAVAILABLE'},code==='CONTINUITY_CONFLICT'?409:code==='CONTINUITY_INVALID'?400:503);
 }
}
