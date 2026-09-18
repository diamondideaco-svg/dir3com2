import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as tripContract from '../lib/drive/request';
import * as catalogContract from '../lib/drive/catalog';

// Execute the real handler with only the database transport replaced in this test.
const exports: Record<string, unknown> = {};
const dependencies: Record<string, unknown> = {
  'server-only': {}, './request': tripContract, './catalog': catalogContract,
  'next/server': { NextResponse: { json: (body: unknown, init: ResponseInit) => Response.json(body, init) } },
};
runInNewContext(ts.transpileModule(readFileSync('lib/drive/request-server.ts','utf8'), {
  compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,{exports,require(name:string){assert.ok(name in dependencies,name);return dependencies[name];}});
const handler=exports.createDriveRequest as (db:unknown,body:unknown,key:string|null)=>Promise<Response>;
const trip={pickup:'Cairo',dropoff:'Cairo hotel',pickupAt:'2099-10-12T12:00',returnAt:'2099-10-13T12:00',mode:'chauffeur',currency:'EGP',passengers:2,luggage:1,name:'Isolated QA',phone:'+201000000000',flightNumber:'',flightArrival:'',specialRequest:'',notes:'',acknowledged:true};
const body={drive_offer_id:'safeerat-eg-jetour-t2',trip};
const authoritativeTrip={...trip,minimumModelYear:2025,acceptableModelYears:[2025,2026,2027]};

test('Drive API uses authenticated RPC and preserves submitted/replayed status without booking',async()=>{
  for(const replayed of [false,true]){
    let calls=0;
    const db={async rpc(name:string,args:Record<string,unknown>){calls++;assert.equal(name,'create_managed_drive_request');assert.equal(args.p_offer_id,body.drive_offer_id);assert.equal(args.p_key,'isolated-request-intent');assert.deepEqual(JSON.parse(JSON.stringify(args.p_trip)),authoritativeTrip);assert.equal('user_id' in args,false);return {data:{reference:'REQ-ISOLATED',status:replayed?'under_review':'request_submitted',replayed},error:null};}};
    const response=await handler(db,body,'isolated-request-intent');
    assert.equal(response.status,replayed?200:201);assert.equal(calls,1);
    const payload=await response.json();assert.equal(payload.request.status,replayed?'under_review':'request_submitted');
    assert.equal(payload.request.booking_id,undefined);assert.equal(payload.request.payment_status,undefined);
  }
});
test('Drive API rejects malformed contact/acknowledgement, absent intent and missing airport rate before RPC',async()=>{
  const db={rpc(){assert.fail('Invalid input must never reach persistence');}};
  for(const invalid of [{...body,trip:{...trip,acknowledged:false}},{...body,trip:{...trip,phone:'not a phone'}}])assert.equal((await handler(db,invalid,'isolated-request-intent')).status,400);
  assert.equal((await handler(db,body,null)).status,400);
  assert.equal((await handler(db,{drive_offer_id:'safeerat-eg-mercedes-gclass',trip:{...trip,mode:'airport',flightNumber:'MS123',flightArrival:'2099-10-12T11:00'}},'isolated-request-intent')).status,409);
});
test('Drive API maps permission, duplicate, time and service errors without leaking DB details',async()=>{
  for(const [code,status] of [['42501',403],['23505',409],['22023',400],['22007',400],['22008',400],['PGRST202',503]] as const){
    const response=await handler({rpc:async()=>({data:null,error:{code,message:'PRIVATE_DB_DETAIL'}})},body,'isolated-request-intent');
    assert.equal(response.status,status);assert.doesNotMatch(await response.text(),/PRIVATE_DB_DETAIL/);
  }
});
