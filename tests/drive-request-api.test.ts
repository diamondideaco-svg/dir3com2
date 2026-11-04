import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as tripContract from '../lib/drive/request';
import * as catalogContract from '../lib/drive/catalog';

// Execute the real handler with only the database transport replaced in this test.
const exports: Record<string, unknown> = {};
let scheduledWakes = 0;
const dependencies: Record<string, unknown> = {
  'server-only': {}, './request': tripContract, './catalog': catalogContract,
  '@/lib/notifications/drive-created-wake': { scheduleCreatedDriveWake() { scheduledWakes++; } },
  'next/server': { NextResponse: { json: (body: unknown, init: ResponseInit) => Response.json(body, init) } },
};
runInNewContext(ts.transpileModule(readFileSync('lib/drive/request-server.ts','utf8'), {
  compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,{exports,require(name:string){assert.ok(name in dependencies,name);return dependencies[name];}});
const handler=exports.createDriveRequest as (db:unknown,body:unknown,key:string|null)=>Promise<Response>;
const trip={pickup:'Cairo',dropoff:'Cairo hotel',pickupAt:'2099-10-12T12:00',returnAt:'2099-10-13T12:00',mode:'chauffeur',currency:'EGP',passengers:2,luggage:1,name:'Isolated QA',phone:'+201000000000',flightNumber:'',flightArrival:'',specialRequest:'',notes:'',acknowledged:true};
const body={drive_offer_id:'safeerat-eg-jetour-t2',catalog_version:catalogContract.DRIVE_CATALOG_VERSION,trip};
const authoritativeTrip={...trip,minimumModelYear:null,acceptableModelYears:null};

test('Drive API uses authenticated RPC and preserves submitted/replayed status without booking',async()=>{
  scheduledWakes=0;
  for(const replayed of [false,true]){
    let calls=0;
    const db={async rpc(name:string,args:Record<string,unknown>){calls++;assert.equal(name,'create_managed_drive_request');assert.equal(args.p_offer_id,body.drive_offer_id);assert.equal(args.p_key,'isolated-request-intent');assert.equal(args.p_catalog_version,body.catalog_version);assert.deepEqual(JSON.parse(JSON.stringify(args.p_trip)),authoritativeTrip);assert.equal('user_id' in args,false);return {data:{reference:'REQ-ISOLATED',status:replayed?'under_review':'request_submitted',replayed},error:null};}};
    const response=await handler(db,body,'isolated-request-intent');
    assert.equal(response.status,replayed?200:201);assert.equal(calls,1);
    const payload=await response.json();assert.equal(payload.request.status,replayed?'under_review':'request_submitted');
    assert.equal(payload.request.booking_id,undefined);assert.equal(payload.request.payment_status,undefined);
  }
  assert.equal(scheduledWakes,1);
});
test('Drive API rejects malformed contact/acknowledgement, absent intent and unknown offer before RPC',async()=>{
  scheduledWakes=0;
  const db={rpc(){assert.fail('Invalid input must never reach persistence');}};
  for(const invalid of [{...body,trip:{...trip,acknowledged:false}},{...body,trip:{...trip,phone:'not a phone'}}])assert.equal((await handler(db,invalid,'isolated-request-intent')).status,400);
  assert.equal((await handler(db,body,null)).status,400);
  assert.equal((await handler(db,{drive_offer_id:'unknown-offer',trip:{...trip,mode:'airport',flightNumber:'MS123',flightArrival:'2099-10-12T11:00'}},'isolated-request-intent')).status,409);
  assert.equal(scheduledWakes,0);
});
test('Drive API maps permission, duplicate, time and service errors without leaking DB details',async()=>{
  scheduledWakes=0;
  for(const [code,status] of [['42501',403],['23505',409],['40001',409],['22023',400],['22007',400],['22008',400],['PGRST202',503]] as const){
    const response=await handler({rpc:async()=>({data:null,error:{code,message:'PRIVATE_DB_DETAIL'}})},body,'isolated-request-intent');
    assert.equal(response.status,status);assert.doesNotMatch(await response.text(),/PRIVATE_DB_DETAIL/);
  }
  assert.equal(scheduledWakes,0);
});

test('old clients preserve original model-year payload on retry; user overrides are ignored',async()=>{
  scheduledWakes=0;
  for(const version of [undefined,'safeerat-eg-20260916-v1','managed-eg-20260927-v1']) {
    const db={async rpc(_name:string,args:Record<string,unknown>){
      const saved=JSON.parse(JSON.stringify(args.p_trip));
      assert.equal(saved.minimumModelYear,2025); assert.deepEqual(saved.acceptableModelYears,[2025,2026,2027]);
      return {data:{reference:'REQ-OLD',status:'under_review',replayed:true},error:null};
    }};
    assert.equal((await handler(db,{...body,catalog_version:version,trip:{...trip,minimumModelYear:2022,acceptableModelYears:[2022]}},'isolated-request-intent')).status,200);
  }
  assert.equal(scheduledWakes,0);
});

test('wake is registered only after create RPC has committed, not while persistence is pending',async()=>{
  scheduledWakes=0;
  const {promise:persisted,resolve:commit}=Promise.withResolvers<{data:{reference:string;status:string;replayed:boolean};error:null}>();
  const response=handler({rpc:()=>persisted},body,'isolated-request-intent');
  await Promise.resolve(); assert.equal(scheduledWakes,0);
  commit({data:{reference:'REQ-ISOLATED',status:'request_submitted',replayed:false},error:null});
  assert.equal((await response).status,201); assert.equal(scheduledWakes,1);
});

test('only the explicit new-create marker can schedule, including concurrent create and replay responses',async()=>{
  scheduledWakes=0;
  for(const replayed of [undefined,null,'false',0]){
    const response=await handler({rpc:async()=>({data:{reference:'REQ-ISOLATED',status:'request_submitted',replayed},error:null})},body,'isolated-request-intent');
    assert.equal(response.status,replayed?200:201);
  }
  assert.equal(scheduledWakes,0);
  const responses=await Promise.all([false,true].map(replayed=>handler({rpc:async()=>({data:{reference:'REQ-ISOLATED',status:'request_submitted',replayed},error:null})},body,'isolated-request-intent')));
  assert.deepEqual(responses.map(response=>response.status),[201,200]);
  assert.equal(scheduledWakes,1);
});

test('real scheduling failure after commit preserves the successful request response and redacts diagnostics',async()=>{
  const wakeExports:Record<string,unknown>={}; const logs:unknown[]=[];
  const wakeDependencies:Record<string,unknown>={
    'server-only':{},
    'next/server':{after(){throw new Error('PRIVATE_AFTER_DETAIL');}},
    '@/lib/supabase/server':{supabaseAdmin:null},
    '@/lib/security/safe-logger':{logServerEvent(event:string,metadata:unknown){logs.push({event,metadata});}},
    './kapso-drive-whatsapp':{handleKapsoDispatch(){assert.fail('Registration failure cannot dispatch');}},
  };
  runInNewContext(ts.transpileModule(readFileSync('lib/notifications/drive-created-wake.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText,{exports:wakeExports,process:{env:{}},performance:{now:()=>0},fetch:()=>assert.fail('External I/O forbidden'),
    require(name:string){assert.ok(name in wakeDependencies,name);return wakeDependencies[name];}});
  const requestExports:Record<string,unknown>={};
  runInNewContext(ts.transpileModule(readFileSync('lib/drive/request-server.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText,{exports:requestExports,require(name:string){
    if(name==='@/lib/notifications/drive-created-wake')return wakeExports;
    assert.ok(name in dependencies,name);return dependencies[name];
  }});
  assert.equal(typeof requestExports.createDriveRequest,'function');
  const realHandler=requestExports.createDriveRequest as typeof handler;
  const response=await realHandler({rpc:async()=>({data:{reference:'REQ-ISOLATED',status:'request_submitted',replayed:false},error:null})},body,'isolated-request-intent');
  assert.equal(response.status,201);
  assert.deepEqual(await response.json(),{request:{request_reference:'REQ-ISOLATED',status:'request_submitted'},replayed:false});
  assert.match(JSON.stringify(logs),/SCHEDULING_UNAVAILABLE/); assert.doesNotMatch(JSON.stringify(logs),/PRIVATE/);
});
