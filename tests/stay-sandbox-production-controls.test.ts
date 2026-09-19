import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHash, createHmac } from 'node:crypto';
import ts from 'typescript';
import * as contract from '../lib/marketplace/stay-demo';

type RpcResponse = { data: unknown; error: unknown };
type Gate = {
  acquire(query: contract.StayDemoQuery, subjectHash: string): Promise<{ decision: string; queryHash: string; value?: contract.StayDemoResult }>;
  complete(queryHash: string, value: contract.StayDemoResult): Promise<void>;
  release(queryHash: string): Promise<void>;
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
const cached: contract.StayDemoResult = { status:'ok',retrievedAt:'2026-09-19T00:00:00Z',cards:[{
  hotelId:'hotel-1',offerId:'offer-1',name:'Provider hotel',location:null,image:null,rating:null,room:'Room',price:100,currency:'SAR',provider:'LiteAPI',environment:'sandbox',availability:'sandbox_available',retrievedAt:'2026-09-19T00:00:00Z',
}] };

test('production identity is HMACed and no raw address enters RPC parameters', async () => {
  const { gate, exported, calls } = loadGlobal([{ data:{ decision:'provider' },error:null }]);
  const subject = (exported.stayDemoRequestSubject as (request:Request,env:NodeJS.ProcessEnv)=>string|null)(
    new Request('https://example.invalid',{headers:{'x-vercel-forwarded-for':'203.0.113.9, 10.0.0.1'}}),
    { NODE_ENV:'test', DIR3COM_STAY_SANDBOX_RATE_SALT:'s'.repeat(32) },
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
  for (const decision of ['rate_limited','daily_limit','busy']) assert.equal((await loadGlobal([{data:{decision},error:null}]).gate.acquire(query,'a'.repeat(64))).decision,'rate_limited');
});

test('only bounded normalized results are completed; failure releases lease', async () => {
  const state=loadGlobal([{data:null,error:null},{data:null,error:null}]);
  await state.gate.complete('a'.repeat(64),cached);await state.gate.release('a'.repeat(64));
  assert.deepEqual(state.calls.map(call=>call.name),['complete_public_stay_sandbox_slot','release_public_stay_sandbox_slot']);
  await assert.rejects(state.gate.complete('bad',cached),/STAY_SANDBOX_CACHE_UNAVAILABLE/);assert.equal(state.calls.length,2);
});

test('opaque provider offer IDs and provider ratings survive distributed cache unchanged', async () => {
  const value = structuredClone(cached);
  value.cards[0].offerId = 'opaque-unit-only-'.repeat(150);
  value.cards[0].rating = 8.4;
  const state = loadGlobal([{ data:null,error:null }, { data:{ decision:'cache',payload:value },error:null }]);
  await state.gate.complete('a'.repeat(64),value);
  const hit = await state.gate.acquire(query,'b'.repeat(64));
  assert.equal(state.calls[0].name,'complete_public_stay_sandbox_slot');
  assert.equal(hit.decision,'cache');
  assert.deepEqual(hit.value,value);
  assert.equal(hit.value?.cards[0].offerId,value.cards[0].offerId);
});

test('cache failure is explicit and bounded without exposing database details', async () => {
  const state=loadGlobal([{data:null,error:{message:'PRIVATE_CONNECTION_SECRET'}}]);
  await assert.rejects(state.gate.complete('a'.repeat(64),cached), {message:'STAY_SANDBOX_CACHE_UNAVAILABLE'});
  const oversized=structuredClone(cached);oversized.cards[0].offerId='x'.repeat(8193);
  await assert.rejects(state.gate.complete('a'.repeat(64),oversized),/STAY_SANDBOX_CACHE_UNAVAILABLE/);
  const large=structuredClone(cached);large.cards=Array.from({length:20},()=>({...cached.cards[0],image:'https://example.invalid/'+ 'x'.repeat(15000)}));
  await assert.rejects(state.gate.complete('a'.repeat(64),large),/STAY_SANDBOX_CACHE_UNAVAILABLE/);
  assert.equal(state.calls.length,1);
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
