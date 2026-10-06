import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/ai2/chat/route';
import * as service from '../lib/dabra/continuity-service';
import * as chat from '../lib/dabra/continuity-chat';
const trip={id:'11111111-1111-4111-8111-111111111111',origin:'Cairo',destination:'Riyadh',startDate:null,endDate:null,adults:2,children:0,rooms:1,budget:5000,currency:'EUR',families:['stay']} as const;
const input=chat.parseContinuityChatTrip({revision:1,generation:0,trip})!;
const state={revision:1,generation:0,consentEnabled:true,consentVersion:'task187-v1',preferences:null,preferencesExpiresAt:null,trip,tripExpiresAt:'2027-01-01T00:00:00Z',updatedAt:null};
function fixture(enabled=true,role:string|null='customer') {
  let authCalls=0;const reads:unknown[][]=[];const io={data:state as unknown,error:null as {message:string}|null};
  const dependencies:Record<string,unknown>={
    '../supabase/server':{createSupabaseRequestClient:async()=>{authCalls++;return role?{user:{id:'authenticated-A'},supabase:{rpc:async(...args:unknown[])=>{reads.push(args);return io;}}}:null;}},
    '../auth/identity':{resolveCanonicalActiveProfile:async(_client:unknown,id:string)=>{assert.equal(id,'authenticated-A');return role?{role}:null;}},
    './continuity-service':service,'./continuity-chat':chat,
  };
  const compiled=ts.transpileModule(readFileSync(new URL('../lib/dabra/continuity-chat-server.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={} as {resolveContinuityChatTrip:(r:NextRequest,i:chat.ContinuityChatTrip)=>Promise<unknown>};
  runInNewContext(compiled,{exports,require:(id:string)=>{assert.ok(id in dependencies,id);return dependencies[id];},process:{env:{DABRA_CONTINUITY_ENABLED:enabled?'true':undefined}},Date},{filename:'continuity-chat-server.ts'});
  return {resolve:()=>exports.resolveContinuityChatTrip(new NextRequest('http://localhost/api/ai2/chat'),input),reads,io,authCalls:()=>authCalls};
}
test('actual server resolver uses authenticated customer RPC ownership, not client actor metadata',async()=>{
  const f=fixture();assert.deepEqual(await f.resolve(),input.trip);
  assert.deepEqual(f.reads,[['dabra_continuity_read',undefined]]);
  assert.equal(f.authCalls(),1);
  for(const role of [null,'partner','admin','staff']){const denied=fixture(true,role);assert.equal(await denied.resolve(),null);assert.equal(denied.reads.length,0);}
  const disabled=fixture(false);assert.equal(await disabled.resolve(),null);assert.equal(disabled.authCalls(),0);
});
test('actual resolver rejects delete, revoke, expiry and another accounts stored trip',async()=>{
  for(const value of [{...state,revision:2}, {...state,generation:1,consentEnabled:false,consentVersion:null,trip:null,tripExpiresAt:null}, {...state,trip:null,tripExpiresAt:null}, {...state,tripExpiresAt:'2020-01-01T00:00:00Z'}, {...state,trip:{...trip,id:'22222222-2222-4222-8222-222222222222'}}]){const f=fixture();f.io.data=value;assert.equal(await f.resolve(),null);}
  const f=fixture();f.io.error={message:'private-database-details'};await assert.rejects(f.resolve(),/CONTINUITY_UNAVAILABLE/);
});
test('actual JSON/multipart chat route rejects malformed and disabled continuity with private no-store',async()=>{
  const previous=process.env.DABRA_CONTINUITY_ENABLED;process.env.DABRA_CONTINUITY_ENABLED='false';
  try {
    for(const value of [{...input,ownerId:'forged-B'}, {...input,trip:{...trip,destination:'https://bad.invalid'}}]) {
      const response=await POST(new NextRequest('http://localhost/api/ai2/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'hotels',continuityTrip:value,locale:'en'})}));assert.equal(response.status,400);assert.match(response.headers.get('cache-control')!,/private, no-store/);
    }
    const form=new FormData();form.set('message','hotels');form.set('continuityTrip',JSON.stringify(input));form.set('locale','en');
    const denied=await POST(new NextRequest('http://localhost/api/ai2/chat',{method:'POST',body:form}));assert.equal(denied.status,409);assert.match(denied.headers.get('cache-control')!,/private, no-store/);assert.doesNotMatch(await denied.text(),/Riyadh|Cairo/);
    form.set('continuityTrip','{');assert.equal((await POST(new NextRequest('http://localhost/api/ai2/chat',{method:'POST',body:form}))).status,400);
  } finally {if(previous===undefined)delete process.env.DABRA_CONTINUITY_ENABLED;else process.env.DABRA_CONTINUITY_ENABLED=previous;}
});
