import '../../scripts/sandbox/task187-next-server-alias.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { NextRequest } from 'next/server';

// Synthetic HTTP fixtures exercise the real route/resolver/authority modules.
// No Docker, production database, provider or network traffic is used here.
const require = createRequire(import.meta.url);
assert.match(require.resolve('next/navigation'), /navigation\.react-server\.js$/);
const navigation = require('next/navigation');
assert.throws(() => navigation.notFound(), error => error?.digest === 'NEXT_HTTP_ERROR_FALLBACK;404');
assert.throws(() => navigation.redirect('/synthetic-target'), error => String(error?.digest).startsWith('NEXT_REDIRECT;'));
const base='http://127.0.0.1:19030';
const actorA='11111111-1111-4111-8111-111111111111';
const actorB='33333333-3333-4333-8333-333333333333';
const trip={id:'22222222-2222-4222-8222-222222222222',origin:'Cairo',destination:'Riyadh',startDate:null,endDate:null,adults:2,children:0,rooms:1,budget:null,currency:'SAR',families:['stay']};
const state={revision:1,generation:0,consentEnabled:true,consentVersion:'task187-v1',preferences:null,preferencesExpiresAt:null,trip,tripExpiresAt:'2099-01-01T00:00:00Z',updatedAt:null};
process.env.NEXT_PUBLIC_SUPABASE_URL=base;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic-anonymous-key-not-real';
process.env.DABRA_CONTINUITY_ENABLED='true';
process.env.DABRA_INTERNAL_AI_ENABLED='false';
delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.DABRA_SUCCESSFUL_TASK_PILOT_CONFIG;delete process.env.DABRA_DIALOGUE_FUNDING_POLICY;
let external=0,authReads=0,profileReads=0,rpcReads=0;
globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init);const url=new URL(request.url);
  if(url.origin!==base){external++;throw new Error('SYNTHETIC_EXTERNAL_DENIED');}
  const bearer=request.headers.get('authorization');
  const actor=bearer==='Bearer synthetic-token-a'?actorA:bearer==='Bearer synthetic-token-b'?actorB:null;
  let value;
  if(url.pathname==='/auth/v1/user'){
    authReads++;
    if(!actor)return new Response(JSON.stringify({message:'invalid synthetic session'}),{status:401,headers:{'content-type':'application/json'}});
    value={id:actor,aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',user_metadata:{}};
  }else if(url.pathname==='/rest/v1/profiles'){
    profileReads++;value=actor?[{id:actor,role:'customer',status:'active',deleted_at:null,full_name:'Synthetic'}]:[];
  }else if(url.pathname==='/rest/v1/rpc/dabra_continuity_read'){
    rpcReads++;value=actor===actorA?state:{...state,trip:{...trip,id:'44444444-4444-4444-8444-444444444444'}};
  }else throw new Error('SYNTHETIC_UNEXPECTED_LOCAL_PATH');
  return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
};
const {POST}=await import('../../app/api/ai2/chat/route.ts');
const envelope={revision:1,generation:0,trip};
async function request(locale,token,multipart=false){
  const headers={authorization:`Bearer ${token}`};let body;
  if(multipart){body=new FormData();body.set('message','hotels');body.set('locale',locale);body.set('continuityTrip',JSON.stringify(envelope));}
  else{headers['content-type']='application/json';body=JSON.stringify({message:'hotels',locale,continuityTrip:envelope});}
  const response=await POST(new NextRequest('http://localhost/api/ai2/chat',{method:'POST',headers,body}));
  const text=await response.text();return {status:response.status,cache:response.headers.get('cache-control')??'',text};
}
for(const locale of ['en','ar'])for(const multipart of [false,true]){
  const result=await request(locale,'synthetic-token-a',multipart);
  assert.equal(result.status,200);assert.match(result.cache,/private, no-store/);
  assert.match(result.text,/destination=riyadh/i);assert.doesNotMatch(result.text,/destination=cairo/i);
}
for(const token of ['synthetic-token-b','synthetic-invalid']){
  const result=await request('en',token);
  assert.equal(result.status,409);assert.match(result.cache,/private, no-store/);assert.doesNotMatch(result.text,/Riyadh|Cairo/i);
}
state.tripExpiresAt='2020-01-01T00:00:00Z';
const expired=await request('en','synthetic-token-a');assert.equal(expired.status,409);assert.doesNotMatch(expired.text,/Riyadh|Cairo/i);
assert.equal(external,0);assert.ok(authReads>=7);assert.ok(profileReads>=6);assert.ok(rpcReads>=6);
console.log(JSON.stringify({status:'PASS',valid:4,denied:3,external,actualNavigation:true}));
