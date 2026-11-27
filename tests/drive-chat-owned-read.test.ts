import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import type {SupabaseClient} from '@supabase/supabase-js';
import type * as Subject from '../lib/drive/owned-request';
import {isMarketplaceRequestReference} from '../lib/marketplace/customer-requests';
import {driveRequestState} from '../lib/drive/request';
import {readCustomerBudget} from '../lib/drive/customer-budget';
const exports:Record<string,unknown>={};
runInNewContext(ts.transpileModule(readFileSync('lib/drive/owned-request.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require(name:string){
 if(name==='server-only')return {};
 if(name==='../marketplace/customer-requests')return {isMarketplaceRequestReference};
 if(name==='./request')return {driveRequestState};
 if(name==='./customer-budget')return {readCustomerBudget};
 throw Error('Unexpected dependency '+name);
}});
const api=exports as unknown as typeof Subject,owner='00000000-0000-4000-8000-000000000265',reference='REQ-0123456789ABCDEF0123';
function fixture(customerBudget:unknown){
 let rpcCalls=0;const filters:unknown[]=[];
 const row={id:'00000000-0000-4000-8000-000000000266',request_reference:reference,status:'awaiting_customer_acceptance',quote_amount:750,quote_currency:'SAR',quote_expires_at:'2099-12-01T00:00:00Z',
  drive_request_context:{version:2,customer_accepted_at:null,confirmed_vehicle:'Synthetic car',confirmed_vehicle_year:2026,supplier_amount:777,supplier_currency:'USD',trip:{pickup:'Cairo pickup',dropoff:'Cairo return',pickupAt:'2099-12-08T21:00',returnAt:'2099-12-11T21:00',mode:'chauffeur',passengers:3,luggage:2,name:'PRIVATE_NAME_MARKER',phone:'PRIVATE_PHONE_MARKER',notes:'PRIVATE_NOTE_MARKER',customerBudget}}};
 const chain={select(fields:string){assert.doesNotMatch(fields,/supplier_|phone|notes/);return chain;},eq(key:string,value:string){filters.push([key,value]);return chain;},not(){return chain;},async maybeSingle(){return {data:row,error:null};}};
 const client={from(table:string){assert.equal(table,'marketplace_requests');return chain;},async rpc(){rpcCalls++;throw Error('Unexpected approval or private notice call');}} as unknown as SupabaseClient;
 return {client,filters,rpcCalls:()=>rpcCalls};
}
test('valid saved customer requirement is revalidated, detached and projected without private fields',async()=>{
 const budget={amount:'800',currency:'SAR',basis:'trip'},f=fixture(budget),result=await api.readOwnedDriveRequest(f.client,owner,reference);
 assert.equal(result.ok,true);if(!result.ok)return;
 assert.deepEqual(JSON.parse(JSON.stringify(result.snapshot.trip.customerBudget)),budget);assert.notEqual(result.snapshot.trip.customerBudget,budget);
 assert.deepEqual(f.filters,[['request_reference',reference],['user_id',owner]]);assert.doesNotMatch(JSON.stringify(result.snapshot),/PRIVATE_|supplier_/);assert.equal(f.rpcCalls(),0);
});
for(const budget of [{amount:{credential:'PRIVATE_NESTED_MARKER'},currency:'SAR',basis:'trip'},{amount:'800',currency:'SAR',basis:'trip',privateField:'PRIVATE_EXTRA_MARKER'},{amount:'800',currency:'INVALID',basis:'trip'},['800','SAR','trip']])test('malformed own-RPC budget cannot leave snapshot or trigger approval: '+JSON.stringify(budget),async()=>{
 const f=fixture(budget),read=await api.readOwnedDriveRequest(f.client,owner,reference);assert.equal(read.ok,false);assert.doesNotMatch(JSON.stringify(read),/PRIVATE_/);
 const accept=await api.acceptOwnedDriveQuote(f.client,owner,reference,2,true);assert.equal(accept.ok,false);assert.equal(f.rpcCalls(),0);
});
