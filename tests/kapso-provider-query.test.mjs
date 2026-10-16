import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';
function load(file,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Buffer,URL,URLSearchParams,Request,Response,AbortSignal,AbortController,setTimeout,clearTimeout,fetch:async()=>assert.fail('Live provider prohibited'),require(name){if(name==='server-only')return {};if(name==='node:crypto')return crypto;if(name in deps)return deps[name];throw Error(name);}});return exports;}
const core=load('lib/notifications/drive-whatsapp.ts');
const sender=load('lib/notifications/kapso-drive-whatsapp.ts',{'./drive-whatsapp':core});
const query=load('lib/notifications/kapso-provider-query.ts',{'./drive-whatsapp':core,'./kapso-drive-whatsapp':sender});
const env={DIR3COM_WHATSAPP_ENABLED:'true',DIR3COM_WHATSAPP_DELIVERY_MODE:'provider_query',DIR3COM_WHATSAPP_CATEGORIES:'operations.created',KAPSO_API_KEY:'SYNTHETIC-NOT-A-PROVIDER-KEY',KAPSO_PHONE_NUMBER_ID:'10000000000166',DIR3COM_WHATSAPP_WORKER_SECRET:'SYNTHETIC-WORKER-SECRET-00000000000000',DIR3COM_WHATSAPP_SITE_URL:'https://qa.example.invalid',DIR3COM_WHATSAPP_KAPSO_TEMPLATES:JSON.stringify({'operations.created.ar':{name:'synthetic_operations',languageCode:'ar'}})};
const target={requestId:'00000000-0000-4000-8000-000000000001',outboxId:'00000000-0000-4000-8000-000000000002',recipientUserId:'00000000-0000-4000-8000-000000000003',category:'operations.created',language:'ar'};
const sid='wamid.SYNTHETIC_QUERY+/==';
const phone='+10000000003';
const lease=()=>({window_id:'00000000-0000-4000-8000-000000000004',query_token:'00000000-0000-4000-8000-000000000005',request_id:target.requestId,outbox_id:target.outboxId,recipient_user_id:target.recipientUserId,category:target.category,language:target.language,phone_number_id:env.KAPSO_PHONE_NUMBER_ID,provider_sid:sid,phone,expires_at:new Date(Date.now()+60000).toISOString()});
const request=(body=target,auth='Bearer '+env.DIR3COM_WHATSAPP_WORKER_SECRET)=>new Request('https://qa.example.invalid/api/internal/drive-whatsapp/reconcile-target',{method:'POST',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify(body)});
function store(row=lease(),error=null){const calls=[];return {calls,rpc:async(name,args)=>{calls.push({name,args});return {data:name==='claim_kapso_drive_whatsapp_status_query'?row:true,error};}};}
const observed=(patch={})=>Response.json({id:sid,to:phone.slice(1),kapso:{direction:'outbound',status:'delivered',processing_status:'completed'},...patch});
const noStore=()=>assert.fail('No privileged lookup');
const noFetch=async()=>assert.fail('No provider I/O');

test('query is explicit and server-only; default webhook still requires its signing secret',()=>{
 const config=sender.kapsoConfig(env);assert.equal(config.deliveryMode,'provider_query');assert.equal('webhookSecret' in config,false);
 assert.equal(sender.kapsoConfig({...env,DIR3COM_WHATSAPP_DELIVERY_MODE:undefined}),null);
 assert.equal(sender.kapsoConfig({...env,DIR3COM_WHATSAPP_DELIVERY_MODE:'webhook',KAPSO_WEBHOOK_SECRET:'SYNTHETIC-SIGNING-SECRET-00000000000000'}).deliveryMode,'webhook');
 for(const mode of ['', 'unknown', 'PROVIDER_QUERY'])assert.equal(sender.kapsoConfig({...env,DIR3COM_WHATSAPP_DELIVERY_MODE:mode}),null);
 assert.equal(sender.kapsoConfig({...env,DIR3COM_WHATSAPP_DISPATCH_MODE:'general'}),null);
 assert.equal(sender.kapsoConfig({...env,DIR3COM_WHATSAPP_CATEGORIES:'customer.confirm'}),null);
});
test('query mode cannot fall back to a generic queue claim',async()=>{
 assert.equal(await sender.dispatchKapsoOne({rpc:()=>assert.fail('No claim')},sender.kapsoConfig(env),noFetch),'not_sent');
 assert.equal((await sender.handleKapsoDispatch(new Request('https://qa.example.invalid/api/internal/drive-whatsapp/dispatch'),env,noStore,noFetch)).status,404);
});
test('worker authentication, configuration and exact target precede privileged access',async()=>{
 assert.equal((await query.handleKapsoTargetReconcile(request(),{...env,DIR3COM_WHATSAPP_ENABLED:'false'},noStore,noFetch)).status,404);
 assert.equal((await query.handleKapsoTargetReconcile(request(),{...env,DIR3COM_WHATSAPP_DELIVERY_MODE:'webhook'},noStore,noFetch)).status,404);
 assert.equal((await query.handleKapsoTargetReconcile(request(target,'wrong'),env,noStore,noFetch)).status,401);
 assert.equal((await query.handleKapsoTargetReconcile(request(),{...env,KAPSO_API_KEY:''},noStore,noFetch)).status,503);
 for(const body of [{...target,sid},{...target,windowId:lease().window_id},{...target,category:'customer.confirm'},{...target,requestId:'../other'}])assert.equal((await query.handleKapsoTargetReconcile(request(body),env,noStore,noFetch)).status,400);
});
test('target send chooses query-specific intent, then atomically completes WAMID through existing finish RPC',async()=>{
 const calls=[];let posts=0;
 const item={id:target.outboxId,token:lease().query_token,phone,reference:'REQ-SYNTHETIC',audience:'operations',action:'created',language:'ar',request_id:target.requestId,recipient_user_id:target.recipientUserId};
 const db={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='claim_kapso_drive_whatsapp_target'?item:true,error:null};}};
 const outcome=await sender.dispatchKapsoTarget(db,sender.kapsoConfig(env),target,async(_url,options)=>{posts++;assert.equal(options.method,'POST');assert.equal(calls.at(-1).name,'begin_kapso_drive_whatsapp_provider_query');return Response.json({messaging_product:'whatsapp',contacts:[{input:phone.slice(1),wa_id:phone.slice(1)}],messages:[{id:sid}]});});
 assert.equal(outcome,'accepted');assert.equal(posts,1);assert.equal(calls.at(-1).name,'finish_drive_whatsapp');assert.equal(calls.at(-1).args.p_sid,sid);assert.equal(calls.at(-1).args.p_outcome,'accepted');
});
test('null claim or missing persisted WAMID never queries the provider',async()=>{
 assert.equal((await query.handleKapsoTargetReconcile(request(),env,()=>store(null),noFetch)).status,200);
 for(const patch of [{provider_sid:null},{provider_sid:'../other'},{phone_number_id:'10000000999'},{request_id:lease().window_id},{outbox_id:lease().window_id},{recipient_user_id:lease().window_id},{language:'en'},{category:'customer.confirm'},{expires_at:'invalid'},{expires_at:'2000-01-01T00:00:00Z'}])assert.equal((await query.handleKapsoTargetReconcile(request(),env,()=>store({...lease(),...patch}),noFetch)).status,503);
});
test('one exact-sender fixed-origin GET reads the saved WAMID, never accepts a client WAMID',async()=>{
 const db=store();let gets=0;
 const response=await query.handleKapsoTargetReconcile(request(),env,()=>db,async(url,options)=>{gets++;const parsed=new URL(url);assert.equal(parsed.origin,'https://api.kapso.ai');assert.equal(parsed.pathname.split('/').at(-3),env.KAPSO_PHONE_NUMBER_ID);assert.equal(decodeURIComponent(parsed.pathname.split('/').at(-1)),sid);assert.equal(parsed.searchParams.get('fields'),'id,to,kapso(direction,status,processing_status)');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.headers['X-API-Key'],env.KAPSO_API_KEY);return observed();});
 assert.equal(gets,1);assert.equal(response.status,200);assert.equal((await response.json()).result,'recorded');assert.equal(db.calls.length,2);assert.equal(db.calls[1].name,'finish_kapso_drive_whatsapp_status_query');assert.equal(db.calls[1].args.p_sid,sid);assert.equal(db.calls[1].args.p_state,'delivered');assert.ok(!JSON.stringify(db.calls).includes('processing_status'));
});
for(const state of ['sent','delivered','read','failed'])test('validated '+state+' is observed separately from POST acceptance',async()=>{
 const db=store();const r=await query.handleKapsoTargetReconcile(request(),env,()=>db,async()=>observed({kapso:{direction:'outbound',status:state}}));assert.equal(r.status,200);assert.equal(db.calls.at(-1).args.p_state,state);
});
for(const [label,body] of Object.entries({wrong_wamid:{id:'wamid.OTHER'},wrong_recipient:{to:'10000000009'},missing_phone:{to:null,to_user_id:'US.SYNTHETIC'},inbound:{kapso:{direction:'inbound',status:'delivered'}},foreign_sender:{kapso:{direction:'outbound',status:'delivered',phone_number_id:'10000000999'}},passive:{kapso:{direction:'outbound',status:'delivered',passive:true}},pending:{kapso:{direction:'outbound',status:'pending'}},provider_error:{error:{message:'SYNTHETIC_PRIVATE_PROVIDER_DETAIL'}}}))test(label+' is unconfirmed and never becomes delivery',async()=>{
 const db=store();let gets=0;const r=await query.handleKapsoTargetReconcile(request(),env,()=>db,async()=>{gets++;return observed(body);});assert.equal(gets,1);assert.equal(r.status,200);assert.equal((await r.json()).result,'unconfirmed');assert.equal(db.calls.at(-1).args.p_state,null);
});
for(const status of [404,429,500,302])test('HTTP'+status+' is one unconfirmed query, never a resend or delivery',async()=>{
 const db=store();let calls=0;const r=await query.handleKapsoTargetReconcile(request(),env,()=>db,async()=>{calls++;return new Response('SYNTHETIC_PRIVATE_BODY',{status});});assert.equal(calls,1);assert.equal((await r.json()).result,'unconfirmed');assert.equal(db.calls.at(-1).args.p_state,null);
});
test('JSON/content-type/size failures are bounded and do not expose payloads',async()=>{
 for(const response of [new Response('{private malformed',{headers:{'content-type':'application/json'}}),new Response(JSON.stringify({id:sid}),{headers:{'content-type':'text/html'}}),new Response('x'.repeat(8193),{headers:{'content-type':'application/json'}})]){
  const db=store();const r=await query.handleKapsoTargetReconcile(request(),env,()=>db,async()=>response);assert.equal(r.status,200);assert.ok(!(await r.text()).includes('private'));assert.equal(db.calls.at(-1).args.p_state,null);
 }
});
test('non-settling HTTP and body transports obey the whole-operation deadline',async()=>{
 for(const fetcher of [()=>new Promise(()=>{}),async()=>new Response(new ReadableStream({start(){},cancel(){return new Promise(()=>{});}}),{headers:{'content-type':'application/json'}})]){
  const db=store();const started=Date.now();const r=await query.handleKapsoTargetReconcile(request(),env,()=>db,fetcher,20);assert.equal(r.status,503);assert.ok(Date.now()-started<500);assert.equal(db.calls.length,1);
 }
});
test('database reservation or completion uncertainty never reports recorded delivery',async()=>{
 const r=await query.handleKapsoTargetReconcile(request(),env,()=>({rpc:()=>new Promise(()=>{})}),noFetch,20);assert.equal(r.status,503);
 const db=store();const base=db.rpc;db.rpc=async(name,args)=>name==='finish_kapso_drive_whatsapp_status_query'?{data:null,error:new Error('SYNTHETIC_PRIVATE_DB_DETAIL')}:base(name,args);
 const failed=await query.handleKapsoTargetReconcile(request(),env,()=>db,async()=>observed());assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('PRIVATE'));
});
test('webhook callback still fails closed without its own signing secret in query mode',async()=>{
 const r=await sender.receiveKapsoReceipt(new Request('https://qa.example.invalid/api/webhooks/kapso/drive-whatsapp',{method:'POST'}),env,noStore);assert.equal(r.status,503);
});
