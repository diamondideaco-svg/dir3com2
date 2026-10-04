import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {NextRequest,NextResponse} from 'next/server';
import * as service from '../lib/dabra/continuity-service';

const snapshot={revision:0,generation:0,consentEnabled:false,consentVersion:null,preferences:null,preferencesExpiresAt:null,trip:null,tripExpiresAt:null,updatedAt:null};
const mutation={action:'revoke',revision:0,generation:0,mutationId:'11111111-1111-4111-8111-111111111111',payload:{}};
function fixture(enabled=true,role:string|null='customer'){
 const calls:{name:string;args:unknown}[]=[];let authCalls=0;
 const io={data: snapshot as unknown,error:null as {code:string;message:string}|null};
 const source=readFileSync(new URL('../app/api/dabra/continuity/route.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={} as {GET:(r:NextRequest)=>Promise<Response>;POST:(r:NextRequest)=>Promise<Response>};
 const dependencies:Record<string,unknown>={
  'next/server':{NextRequest,NextResponse},
  '@/lib/supabase/server':{createSupabaseRequestClient:async()=>{authCalls++;return role?{user:{id:'verified-user'},supabase:{rpc:async(name:string,args:unknown)=>{calls.push({name,args});return io;}}}:null;}},
  '@/lib/auth/identity':{resolveCanonicalActiveProfile:async()=>role?{id:'verified-user',role}:null},
  '@/lib/dabra/continuity-service':service,
 };
 runInNewContext(compiled,{exports,require:(name:string)=>{if(!(name in dependencies))throw Error(`Unexpected dependency ${name}`);return dependencies[name];},process:{env:{DABRA_CONTINUITY_ENABLED:enabled?'true':undefined}},TextDecoder,Uint8Array,Error,JSON},{filename:'continuity-route.ts'});
 return {route:exports,calls,io,authCalls:()=>authCalls};
}
function request(body:unknown=mutation,headers:Record<string,string>={}){
 return new NextRequest('http://localhost/api/dabra/continuity',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
}
test('disabled route performs zero auth or storage IO',async()=>{
 const f=fixture(false);assert.deepEqual(await (await f.route.GET(new NextRequest('http://localhost/api/dabra/continuity'))).json(),{enabled:false});
 assert.equal((await f.route.POST(request())).status,404);assert.equal(f.authCalls(),0);assert.equal(f.calls.length,0);
});
test('guest and non-customer profiles cannot reach storage',async()=>{
 for(const role of [null,'admin','partner','staff']){const f=fixture(true,role);assert.equal((await f.route.GET(new NextRequest('http://localhost/api/dabra/continuity'))).status,401);assert.equal((await f.route.POST(request())).status,401);assert.equal(f.calls.length,0);}
});
test('cross-origin and wrong content type are rejected before auth',async()=>{
 const f=fixture();for(const headers of [{origin:'https://evil.invalid'},{'content-type':'text/plain'}] as Record<string,string>[])assert.equal((await f.route.POST(request(mutation,headers))).status,403);assert.equal(f.authCalls(),0);
});
test('owner fields, unknown preference categories and malformed bodies never reach RPC',async()=>{
 const f=fixture();for(const value of [{...mutation,ownerId:'other'}, {...mutation,action:'save',payload:{consent:true,preferences:{prompt:'remember everything'},trip:null}},'{', {...mutation,payload:{ownerId:'other'}}])assert.equal((await f.route.POST(request(value))).status,400);assert.equal(f.calls.length,0);
});
test('streamed and declared oversized bodies are rejected without RPC',async()=>{
 const f=fixture();assert.equal((await f.route.POST(request(' '.repeat(4097)))).status,413);assert.equal((await f.route.POST(request(mutation,{'content-length':'4097'}))).status,413);assert.equal(f.calls.length,0);
});
test('mutation sends no client-controlled actor and responses are private',async()=>{
 const f=fixture();const response=await f.route.POST(request());assert.equal(response.status,200);assert.match(response.headers.get('cache-control')!,/private, no-store/);
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[{name:'dabra_continuity_mutate',args:{p_action:'revoke',p_revision:0,p_generation:0,p_mutation:mutation.mutationId,p_payload:{}}}]);
 assert.deepEqual(await response.json(),{enabled:true,state:snapshot});
});
test('conflicts, invalid data and internal database errors use safe status and messages',async()=>{
 for(const [code,status] of [['40001',409],['22023',400],['42501',503]] as const){const f=fixture();f.io.error={code,message:'private SQL and credentials'};const response=await f.route.POST(request());assert.equal(response.status,status);assert.doesNotMatch(JSON.stringify(await response.json()),/private SQL|credentials/);}
 const f=fixture();f.io.data={...snapshot,trip:{secret:'bad'}};assert.equal((await f.route.GET(new NextRequest('http://localhost/api/dabra/continuity'))).status,503);
});
test('explicit allowlisted save reaches storage without adding model instructions or identity',async()=>{
 const f=fixture();const preferences={replyLanguage:'ar',displayCurrency:'SAR',travelClass:'economy',lodgingStyle:'hotel',itineraryPace:'balanced'};
 const response=await f.route.POST(request({...mutation,action:'save',payload:{consent:true,preferences,trip:null}}));assert.equal(response.status,200);assert.equal(f.calls.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].args)),{p_action:'save',p_revision:0,p_generation:0,p_mutation:mutation.mutationId,p_payload:{consent:true,preferences,trip:null}});
});
