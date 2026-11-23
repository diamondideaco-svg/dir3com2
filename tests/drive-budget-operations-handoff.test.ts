import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDriveTrip } from '../lib/drive/request';
const trip={pickup:'Cairo',dropoff:'Cairo hotel',pickupAt:'2099-10-12T12:00',returnAt:'2099-10-13T12:00',mode:'chauffeur',currency:'EGP',passengers:2,luggage:1,name:'Synthetic QA',phone:'+201000000000',flightNumber:'',flightArrival:'',specialRequest:'',notes:'',acknowledged:true};
test('Task258 request parser retains explicit customer budget independently of pricing',()=>{
 const parsed=parseDriveTrip({...trip,customerBudget:{amount:'800',currency:'SAR',basis:'trip'}},0);
 assert.equal(parsed.error,null);
 assert.deepEqual((parsed.trip as unknown as Record<string,unknown>)?.customerBudget,{amount:'800',currency:'SAR',basis:'trip'});
});

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React, { type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as requestContract from '../lib/drive/request';
import * as budgetContract from '../lib/drive/customer-budget';
import * as catalog from '../lib/drive/catalog';
import { platformUserRequest, createPlatformScopeOwner, buildPlatformAssistantResponse } from '../lib/dabra/platform-assistant';
const require=createRequire(import.meta.url);
function load(file:string,deps:Record<string,unknown>,globals:Record<string,unknown>={}) {
 const exports:Record<string,unknown>={};
 const output=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 runInNewContext(output,{exports,require:(id:string)=>id in deps?deps[id]:require(id),URLSearchParams,Response,AbortSignal,...globals});return exports;
}
const Budget=load('components/drive/CustomerTripBudget.tsx',{'@/lib/drive/customer-budget':budgetContract}).default;
function renderOperations(locale:'ar'|'en',saved:Record<string,unknown>) {
 const Ops=load('components/drive/DriveOperations.tsx',{
  react:{...React,useState:(value:unknown)=>[value,()=>assert.fail('no Operations action')],useActionState:()=>['',()=>assert.fail('no Operations action')]},
  '@/components/i18n/LanguageProvider':{useLanguage:()=>({language:locale})},
  '@/components/admin/AdminLocale':{AdminSubmitButton:()=>null},
  '@/app/admin/operations/drive/actions':{reviewDriveRequest:()=>assert.fail('no Operations write')},
  './CustomerTripBudget':{default:Budget},'./drive.module.css':{default:{}},
 }).default as (props:Record<string,unknown>)=>ReactElement;
 const request={id:'synthetic-request',request_reference:'REQ-SYNTHETIC',drive_offer_id:'safeerat-eg-jetour-t2',status:'request_submitted',quote_amount:null,quote_currency:null,quote_expires_at:null,drive_request_context:{country:'EG',supplier_amount:150,supplier_currency:'USD',trip:saved,version:1,confirmed_vehicle:null,confirmed_vehicle_year:null,customer_accepted_at:null}};
 return renderToStaticMarkup(Ops({requests:[request],canWrite:false}));
}
function submitButton(node:ReactNode,label:string):(()=>Promise<void>)|null {
 if(Array.isArray(node)){for(const child of node){const result=submitButton(child,label);if(result)return result;}return null;}
 if(!React.isValidElement<{children?:ReactNode;onClick?:()=>Promise<void>}>(node))return null;
 if(node.type==='button'&&node.props.children===label)return node.props.onClick??null;
 return submitButton(node.props.children,label);
}
async function exerciseDeal(locale:'ar'|'en',search:string,permissionDenied=false) {
 let saved:Record<string,unknown>|null=null;let calls=0;let wakes=0;let requestBody='';let responseStatus=0;
 const handler=load('lib/drive/request-server.ts',{
  'server-only':{},'./request':requestContract,'./catalog':catalog,
  '@/lib/notifications/drive-created-wake':{scheduleCreatedDriveWake:()=>{wakes++;}},
  'next/server':{NextResponse:{json:(value:unknown,init:ResponseInit)=>Response.json(value,init)}},
 }).createDriveRequest as (db:unknown,body:Record<string,unknown>,key:string)=>Promise<Response>;
 const db={rpc:async(name:string,args:Record<string,unknown>)=>{
  calls++;assert.equal(name,'create_managed_drive_request');assert.equal('user_id' in args,false);
  if(permissionDenied)return {data:null,error:{code:'42501',message:'PRIVATE_DB_DETAIL'}};
  // Isolated persistence fixture: same existing JSONB boundary, no real database.
  saved=JSON.parse(JSON.stringify(args.p_trip));
  return {data:{reference:'REQ-SYNTHETIC',status:'request_submitted',replayed:false},error:null};
 }};
 let hook=0;const sourceTrip={...trip,customerBudget:{amount:'123',currency:'USD',basis:'trip'}};
 const states:unknown[]=[2,'',false,0,null,'','synthetic@example.invalid',sourceTrip];
 const jsx=require('react/jsx-runtime');
 const Deal=load('components/drive/DriveDeal.tsx',{
  react:{useState:()=>{const index=hook++;return [states[index],(value:unknown)=>{states[index]=typeof value==='function'?value(states[index]):value;}];},useEffect:()=>{},useRef:(current:unknown)=>({current})},
  'next/image':{default:(props:Record<string,unknown>)=>jsx.jsx('img',props)},'next/link':{default:({children,...props}:Record<string,unknown>)=>jsx.jsx('a',{...props,children})},
  '@/components/i18n/LanguageProvider':{useLanguage:()=>({language:locale,direction:locale==='ar'?'rtl':'ltr'})},
  '@/components/currency/useDisplayCurrency':{useDisplayCurrency:()=>({currency:'EGP'})},
  '@/lib/supabase/client':{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'synthetic-token-not-a-credential',user:{id:'synthetic-actor'}}},error:null})}}},
  '@/lib/marketplace/request-attempt':{marketplaceRequestAttemptKey:async()=> 'synthetic-budget-intent'},
  './DriveMarketplace':{DrivePrice:()=>null,DriveInclusions:()=>null,driveErrors:{}},'./CustomerTripBudget':{default:Budget},'./drive.module.css':{default:{}},
 },{
  fetch:async(url:string,options?:RequestInit)=>{
   if(url==='/api/auth/session-identity')return Response.json({authenticated:true,email:'synthetic@example.invalid'});
   assert.equal(url,'/api/marketplace/requests');assert.equal(options?.method,'POST');
   requestBody=String(options?.body);const response=await handler(db,JSON.parse(requestBody),'synthetic-budget-intent');responseStatus=response.status;return response;
  },sessionStorage:{removeItem:()=>{},getItem:()=>null,setItem:()=>assert.fail('no login handoff')},
 }).default as (props:Record<string,unknown>)=>ReactElement;
 const view=Deal({offerId:'safeerat-eg-jetour-t2',initialSearch:search});
 const html=renderToStaticMarkup(view);
 const submit=submitButton(view,locale==='ar'?'إرسال الطلب':'Submit request');assert.ok(submit);
 assert.equal(calls,0);assert.equal(wakes,0);await submit();
 return {saved,calls,wakes,requestBody,responseStatus,html,error:states[1]};
}
for(const locale of ['ar','en'] as const)for(const amount of ['800','900'])test(`Task258 ${locale} ${amount} DABRA to actual form handler to mocked storage to Egypt Operations`,async()=>{
 const turns=locale==='ar'?[
 'أحتاج سيارة مع سائق في القاهرة لمدة ثلاثة أيام لشخصين. لا تحجز.',
 `قصدي تخطيط رحلة جديدة: سيارة مع سائق في القاهرة لمدة ٣ أيام لشخصين. الحد الأعلى ${amount} ريال سعودي إجماليًا.`,
 `من ٨ إلى ١٠ ديسمبر ٢٠٢٦، لشخصين وبسقف ${amount} ريال سعودي للرحلة كلها. لا أريد إنشاء أي طلب، وأخبرني إذا السعر الإجمالي أو التوفر غير مؤكد.`,
 ]:[
 'I need a car with a driver in Cairo for 3 days for 2 adults. Do not book.',
 `New trip: car with a driver in Cairo for 2 people. My car budget is ${amount} SAR total for the whole trip.`,
 `8 to 10 December 2026, two passengers. My car budget is ${amount} SAR for the whole trip. Do not create any request. The total price and availability require Operations confirmation.`,
 ];
 const owner=createPlatformScopeOwner();const history:{role:'user'|'assistant';content:string}[]=[];let answer='';
 for(const content of turns){
  const request=platformUserRequest({role:'user',content},history,null,owner);
  answer=buildPlatformAssistantResponse(request,[],locale,Date.now(),undefined,{currency:'SAR',snapshot:null}).answer;
  history.push({role:'user',content},{role:'assistant',content:answer});
 }
 const href=answer.match(/\]\((\/marketplace\?[^)]+)\)/)?.[1];assert.ok(href,answer);
 const result=await exerciseDeal(locale,new URL(href,'https://local.invalid').search.slice(1));
 assert.equal(result.responseStatus,201);assert.equal(result.calls,1);assert.equal(result.wakes,1);assert.ok(result.saved);
 const saved=result.saved as Record<string,unknown>;
 assert.deepEqual(saved.customerBudget,{amount,currency:'SAR',basis:'trip'});
 assert.equal(saved.currency,'EGP');assert.equal(saved.minimumModelYear,null);assert.equal(saved.acceptableModelYears,null);
 assert.doesNotMatch(result.requestBody,/123|synthetic-token|history|content|quote_amount|user_id/);
 assert.match(result.html,new RegExp(`<bdi>${amount} SAR<\/bdi>`));
 const html=renderOperations(locale,saved);
 assert.match(html,new RegExp(`<bdi>${amount} SAR<\/bdi>`));
 assert.match(html,locale==='ar'?/للرحلة كاملة، وليس لليوم/:/for the whole trip, not per day/);
 assert.match(html,locale==='ar'?/ليس عرض سعر أو ضمان توفر/:/not a quote or availability guarantee/);
 assert.match(html,/150 USD/);assert.doesNotMatch(html,/<form|booking confirmed|تم الحجز/);
});
test('Task258 invalid URL requirement blocks the form before identity or persistence',async()=>{
 for(const search of ['budgetAmount=800&budgetCurrency=SAR','budgetAmount=800&budgetAmount=900&budgetCurrency=SAR&budgetBasis=trip','budgetAmount=-800&budgetCurrency=SAR&budgetBasis=trip']){
  const result=await exerciseDeal('en',search);assert.equal(result.calls,0);assert.equal(result.wakes,0);assert.equal(result.requestBody,'');assert.equal(result.error,'CUSTOMER_BUDGET_INVALID');
 }
});
test('Task258 absent URL requirement cannot inherit a restored draft budget',async()=>{
 const result=await exerciseDeal('en','');assert.equal(result.responseStatus,201);assert.ok(result.saved);assert.equal('customerBudget' in result.saved,false);
});
test('Task258 permission refusal does not persist or schedule a notification',async()=>{
 const result=await exerciseDeal('ar','budgetAmount=800&budgetCurrency=SAR&budgetBasis=trip',true);
 assert.equal(result.responseStatus,403);assert.equal(result.saved,null);assert.equal(result.wakes,0);
});
test('Task258 malformed API budgets reject; legacy absent budget remains valid',()=>{
 assert.equal(parseDriveTrip(trip,0).error,null);
 for(const customerBudget of [null,'800 SAR',[],{}, {amount:'800',currency:'SAR',basis:'day'},{amount:800,currency:'SAR',basis:'trip'},{amount:'800',currency:'SAR',basis:'trip',content:'private conversation'}, {amount:'NaN',currency:'SAR',basis:'trip'}, {amount:'0',currency:'SAR',basis:'trip'}, {amount:'800',currency:'BAD',basis:'trip'}])assert.equal(parseDriveTrip({...trip,customerBudget},0).error,'CUSTOMER_BUDGET_INVALID');
});
test('Task258 persisted untrusted RPC budget is revalidated in Operations, never echoed',()=>{
 const html=renderOperations('en',{...trip,customerBudget:{amount:'PRIVATE_CHAT_TEXT',currency:'SAR',basis:'trip'}});
 assert.match(html,/Budget details could not be verified/);assert.doesNotMatch(html,/PRIVATE_CHAT_TEXT/);
 assert.doesNotMatch(renderOperations('ar',trip),/data-customer-trip-budget/);
});

test('Task258 server rejects malformed requirement before RPC and never schedules',async()=>{
 let wakes=0;
 const handler=load('lib/drive/request-server.ts',{
  'server-only':{},'./request':requestContract,'./catalog':catalog,
  '@/lib/notifications/drive-created-wake':{scheduleCreatedDriveWake:()=>{wakes++;}},
  'next/server':{NextResponse:{json:(value:unknown,init:ResponseInit)=>Response.json(value,init)}},
 }).createDriveRequest as (db:unknown,body:Record<string,unknown>,key:string)=>Promise<Response>;
 for(const customerBudget of [{amount:'800',currency:'SAR',basis:'day'},{amount:'800',currency:'SAR',basis:'trip',approved:true},{amount:'PRIVATE_CHAT',currency:'SAR',basis:'trip'}]){
  const response=await handler({rpc:()=>assert.fail('invalid requirement must not persist')},{drive_offer_id:'safeerat-eg-jetour-t2',catalog_version:catalog.DRIVE_CATALOG_VERSION,trip:{...trip,customerBudget}},'synthetic-budget-intent');
  assert.equal(response.status,400);assert.doesNotMatch(await response.text(),/PRIVATE_CHAT|approved/);
 }
 assert.equal(wakes,0);
});
