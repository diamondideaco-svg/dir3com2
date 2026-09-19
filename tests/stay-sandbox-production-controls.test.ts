import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHash, createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import ts from 'typescript';
import * as contract from '../lib/marketplace/stay-demo';

type RpcResponse = { data: unknown; error: unknown };
type Gate = {
  acquire(query: contract.StayDemoQuery, subjectHash: string): Promise<{ decision: string; queryHash: string; value?: contract.StayDemoResult }>;
  complete(queryHash: string, leaseToken: string, value: contract.StayDemoResult): Promise<void>;
  release(queryHash: string, leaseToken: string): Promise<void>;
};

function loadGlobal(responses: RpcResponse[]) {
  const exported: Record<string, unknown> = {};
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const client = { rpc: async (name: string, params: Record<string, unknown>) => {
    calls.push({ name, params }); return responses.shift() ?? { data: null, error: Error('missing response') };
  } };
  runInNewContext(ts.transpileModule(readFileSync('lib/marketplace/stay-demo-global.ts','utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, {
    exports: exported,
    require: (id: string) => {
      if (id === 'server-only') return {};
      if (id === 'node:crypto') return { createHash, createHmac };
      if (id === 'node:net') return { isIP };
      if (id === '@/lib/supabase/server') return { supabaseAdmin: null };
      if (id === './stay-demo') return contract;
      assert.fail(id);
    },
    process,
    Buffer,
  });
  return { gate: (exported.createStayDemoGlobalGate as (client: unknown) => Gate)(client), exported, calls };
}

const query: contract.StayDemoQuery = { destination:'Cairo',checkIn:'2027-01-12',checkOut:'2027-01-14',adults:2,rooms:1,nationality:'EG',currency:'SAR' };
const token = 'fc219f4c-438e-4405-a8b0-109d4a126a3c';
const cached: contract.StayDemoResult = { status:'ok',retrievedAt:'2026-09-19T00:00:00Z',cards:[{
  hotelId:'hotel-1',offerId:'offer-1',name:'Provider hotel',location:null,image:null,rating:null,room:'Room',price:100,currency:'SAR',provider:'LiteAPI',environment:'sandbox',availability:'sandbox_available',retrievedAt:'2026-09-19T00:00:00Z',
}] };

test('production identity is HMACed and no raw address enters RPC parameters', async () => {
  const { gate, exported, calls } = loadGlobal([{ data:{ decision:'provider',lease_token:token },error:null }]);
  const subject = (exported.stayDemoRequestSubject as (request:Request,env:NodeJS.ProcessEnv)=>string|null)(
    new Request('https://example.invalid',{headers:{'x-vercel-forwarded-for':'203.0.113.9, 10.0.0.1'}}),
    { NODE_ENV:'test', VERCEL:'1', DIR3COM_STAY_SANDBOX_RATE_SALT:'s'.repeat(32) },
  );
  assert.match(subject ?? '',/^[a-f0-9]{64}$/); assert.doesNotMatch(subject ?? '',/203\.0\.113\.9/);
  assert.equal((exported.stayDemoRequestSubject as (request:Request,env:NodeJS.ProcessEnv)=>string|null)(
    new Request('https://example.invalid',{headers:{'x-forwarded-for':'203.0.113.9'}}),
    { NODE_ENV:'test', DIR3COM_STAY_SANDBOX_RATE_SALT:'s'.repeat(32) },
  ),null);
  assert.equal((await gate.acquire(query,subject!)).decision,'provider');
  assert.doesNotMatch(JSON.stringify(calls),/203\.0\.113\.9/);
});

test('distributed gate accepts only validated cached provider truth and fails closed', async () => {
  const valid=loadGlobal([{data:{decision:'cache',payload:cached},error:null}]);
  const hit=await valid.gate.acquire(query,'a'.repeat(64));assert.equal(hit.decision,'cache');assert.deepEqual(hit.value,cached);
  for (const response of [{data:{decision:'cache',payload:{status:'ok',cards:[{provider:'fake'}],retrievedAt:'now'}},error:null},{data:null,error:Error('db down')},{data:{decision:'disabled'},error:null}]) {
    assert.equal((await loadGlobal([response]).gate.acquire(query,'a'.repeat(64))).decision,'unavailable');
  }
  for (const decision of ['rate_limited','daily_limit','busy']) assert.equal((await loadGlobal([{data:{decision,retry_after_seconds:17},error:null}]).gate.acquire(query,'a'.repeat(64))).decision,'rate_limited');
});

test('only bounded normalized results are completed; failure releases lease', async () => {
  const state=loadGlobal([{data:true,error:null},{data:true,error:null}]);
  await state.gate.complete('a'.repeat(64),token,cached);await state.gate.release('a'.repeat(64),token);
  assert.deepEqual(state.calls.map(call=>call.name),['complete_public_stay_sandbox_slot','release_public_stay_sandbox_slot']);
  await assert.rejects(state.gate.complete('bad',token,cached),/STAY_SANDBOX_CACHE_UNAVAILABLE/);assert.equal(state.calls.length,2);
  assert.ok(state.calls.every(call=>call.params.p_lease_token===token));
});

test('opaque provider offer IDs and provider ratings survive distributed cache unchanged', async () => {
  const value = structuredClone(cached);
  value.cards[0].offerId = 'opaque-unit-only-'.repeat(150);
  value.cards[0].rating = 8.4;
  const state = loadGlobal([{ data:true,error:null }, { data:{ decision:'cache',payload:value },error:null }]);
  await state.gate.complete('a'.repeat(64),token,value);
  const hit = await state.gate.acquire(query,'b'.repeat(64));
  assert.equal(state.calls[0].name,'complete_public_stay_sandbox_slot');
  assert.equal(hit.decision,'cache');
  assert.deepEqual(hit.value,value);
  assert.equal(hit.value?.cards[0].offerId,value.cards[0].offerId);
});

test('cache failure is explicit and bounded without exposing database details', async () => {
  const state=loadGlobal([{data:null,error:{message:'PRIVATE_CONNECTION_SECRET'}}]);
  await assert.rejects(state.gate.complete('a'.repeat(64),token,cached), {message:'STAY_SANDBOX_CACHE_UNAVAILABLE'});
  const oversized=structuredClone(cached);oversized.cards[0].offerId='x'.repeat(8193);
  await assert.rejects(state.gate.complete('a'.repeat(64),token,oversized),/STAY_SANDBOX_CACHE_UNAVAILABLE/);
  const large=structuredClone(cached);large.cards=Array.from({length:20},()=>({...cached.cards[0],image:'https://example.invalid/'+ 'x'.repeat(15000)}));
  await assert.rejects(state.gate.complete('a'.repeat(64),token,large),/STAY_SANDBOX_CACHE_UNAVAILABLE/);
  assert.equal(state.calls.length,1);
});

test('forged platform/header variants cannot create an anonymous rate identity',()=>{
  const subject=loadGlobal([]).exported.stayDemoRequestSubject as (r:Request,e:NodeJS.ProcessEnv)=>string|null;
  const env:NodeJS.ProcessEnv={NODE_ENV:'test',VERCEL_ENV:'production',DIR3COM_STAY_SANDBOX_RATE_SALT:'s'.repeat(32)};
  const request=new Request('https://example.invalid',{headers:{'x-vercel-forwarded-for':'203.0.113.9'}});
  for(const VERCEL of [undefined,'0','true','']) assert.equal(subject(request,{...env,VERCEL}),null);
  for(const address of ['garbage','203.0.113.9:1234','x'.repeat(500),'']) {
    assert.equal(subject(new Request('https://example.invalid',{headers:{'x-vercel-forwarded-for':address}}),{...env,VERCEL:'1'}),null);
  }
  assert.match(subject(new Request('https://example.invalid',{headers:{'x-vercel-forwarded-for':'2001:db8::1'}}),{...env,VERCEL:'1'})!,/^[a-f0-9]{64}$/);
});

test('missing/malformed lease capabilities and retry metadata fail closed',async()=>{
  for(const lease_token of [undefined,null,'', 'not-a-token',token.toUpperCase()]) {
    const state=loadGlobal([{data:{decision:'provider',lease_token},error:null}]);
    assert.equal((await state.gate.acquire(query,'a'.repeat(64))).decision,'unavailable');
  }
  for(const decision of ['busy','rate_limited','daily_limit']) for(const retry_after_seconds of [undefined,null,0,-1,1.1,86401,'2',Infinity]) {
    assert.equal((await loadGlobal([{data:{decision,retry_after_seconds},error:null}]).gate.acquire(query,'a'.repeat(64))).decision,'unavailable');
  }
  const invalid=loadGlobal([]);
  await invalid.gate.release('a'.repeat(64),'bad');
  await assert.rejects(invalid.gate.complete('a'.repeat(64),'bad',cached),/STAY_SANDBOX_CACHE_UNAVAILABLE/);
  assert.equal(invalid.calls.length,0);
  for(const data of [false,null,undefined,'true']) {
    await assert.rejects(loadGlobal([{data,error:null}]).gate.complete('a'.repeat(64),token,cached),/STAY_SANDBOX_CACHE_UNAVAILABLE/);
  }
});

test('busy/hour/day retry delay survives RPC mapping exactly without exposing token',async()=>{
  for(const [decision,retry_after_seconds] of [['busy',20],['rate_limited',3600],['daily_limit',86400]] as const) {
    const answer=await loadGlobal([{data:{decision,retry_after_seconds},error:null}]).gate.acquire(query,'a'.repeat(64));
    assert.equal((answer as {retryAfterSeconds?:number}).retryAfterSeconds,retry_after_seconds);
  }
});

test('migration is service-role only, atomic, default-off and globally bounded', () => {
  const sql=readFileSync('supabase/migrations/20260919013000_public_stay_sandbox_global_controls.sql','utf8');
  assert.match(sql,/enabled boolean NOT NULL DEFAULT false/);
  assert.match(sql,/provider_calls_per_day integer NOT NULL DEFAULT 200/);
  assert.match(sql,/requests_per_subject_hour integer NOT NULL DEFAULT 30/);
  assert.match(sql,/cache_ttl_seconds integer NOT NULL DEFAULT 60/);
  assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/ON CONFLICT\(usage_day\)[\s\S]*provider_calls/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.acquire_public_stay_sandbox_slot\(text,text\) TO service_role/);
  assert.doesNotMatch(sql,/GRANT .* TO (?:anon|authenticated)/);
});
