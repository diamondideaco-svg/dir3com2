import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';
function load(file,deps={}){
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {exports,Buffer,URL,URLSearchParams,Request,Response,AbortSignal,AbortController,setTimeout,clearTimeout,
  fetch:async()=>assert.fail('Real provider network prohibited'),require(name){if(name==='server-only')return {};if(name==='node:crypto')return crypto;if(name in deps)return deps[name];throw new Error(name);}});return exports;
}
const api=load('lib/notifications/kapso-drive-whatsapp.ts',{'./drive-whatsapp':load('lib/notifications/drive-whatsapp.ts')});
const env={DIR3COM_WHATSAPP_ENABLED:'true',DIR3COM_WHATSAPP_CATEGORIES:'operations.created',KAPSO_API_KEY:'SYNTHETIC-not-a-provider-key',KAPSO_PHONE_NUMBER_ID:'10000000000166',KAPSO_WEBHOOK_SECRET:'SYNTHETIC-SIGNING-SECRET-0000000000000',DIR3COM_WHATSAPP_WORKER_SECRET:'SYNTHETIC-WORKER-SECRET-00000000000000',DIR3COM_WHATSAPP_SITE_URL:'https://qa.example.invalid',DIR3COM_WHATSAPP_KAPSO_TEMPLATES:JSON.stringify({'operations.created.ar':{name:'synthetic_operations',languageCode:'ar'}})};
const item={id:'00000000-0000-4000-8000-000000000001',token:'00000000-0000-4000-8000-000000000002',reference:'REQ-SYNTHETIC',phone:'+10000000003',audience:'operations',action:'created',language:'ar'};
const sid='wamid.SYNTHETIC_CONTRACT';
function callback(patch={},headers={}){
 const raw=JSON.stringify({phone_number_id:env.KAPSO_PHONE_NUMBER_ID,message:{id:sid,to:item.phone.slice(1),kapso:{direction:'outbound',status:'delivered',statuses:[{status:'delivered',timestamp:'1790000000'}]},errors:[],timestamp:'1790000000'},conversation:{id:'synthetic-conversation'},...patch});
 return new Request('https://qa.example.invalid/api/webhooks/kapso/drive-whatsapp',{method:'POST',headers:{'content-type':'application/json','x-webhook-signature':crypto.createHmac('sha256',env.KAPSO_WEBHOOK_SECRET).update(raw).digest('hex'),'x-webhook-event':'whatsapp.message.delivered','x-idempotency-key':'synthetic-delivery-id',...headers},body:raw});
}
test('generic dispatcher is closed by default before store and fetch',async()=>{
 const request=new Request('https://qa.example.invalid/api/internal/drive-whatsapp/dispatch',{method:'POST',headers:{authorization:'Bearer '+env.DIR3COM_WHATSAPP_WORKER_SECRET}});
 const response=await api.handleKapsoDispatch(request,env,()=>assert.fail('No DB access in target-only default'),async()=>assert.fail('No send'));
 assert.equal(response.status,404);
});
test('REST named template parameters are pinned explicitly without SDK casing',async()=>{
 const config=api.kapsoConfig({...env,DIR3COM_WHATSAPP_KAPSO_TEMPLATES:JSON.stringify({'operations.created.ar':{name:'synthetic_operations',languageCode:'ar',bodyParameterNames:['request_reference','operations_url']}})});
 assert.ok(config);let sends=0;
 const result=await api.sendKapsoTemplate(config,item,async(_url,options)=>{sends++;const body=JSON.parse(options.body);const p=body.template.components[0].parameters;assert.deepEqual(p.map(x=>x.parameter_name),['request_reference','operations_url']);assert.ok(p.every(x=>!('parameterName' in x)));assert.equal(p[0].text,item.reference);return new Response(JSON.stringify({messaging_product:'whatsapp',contacts:[{input:item.phone.slice(1),wa_id:item.phone.slice(1)}],messages:[{id:sid}]}),{status:200});});
 assert.equal(sends,1);assert.equal(result.outcome,'accepted');assert.equal(result.sid,sid);
 for(const names of [[],['same','same'],['one'],['first','second','third'],['bad name','second']])assert.equal(api.kapsoConfig({...env,DIR3COM_WHATSAPP_KAPSO_TEMPLATES:JSON.stringify({'operations.created.ar':{name:'synthetic_operations',languageCode:'ar',bodyParameterNames:names}})}),null);
});
test('documented v2 callback persists only normalized status and hashed delivery key',async()=>{
 let calls=0;const response=await api.receiveKapsoReceipt(callback(),env,()=>({rpc:async(name,args)=>{calls++;assert.equal(name,'ingest_kapso_drive_whatsapp_receipt');assert.deepEqual(Object.keys(args).sort(),['p_delivery_key_hash','p_error','p_phone','p_phone_number_id','p_sid','p_state']);assert.equal(args.p_sid,sid);assert.equal(args.p_state,'delivered');assert.equal(args.p_delivery_key_hash,crypto.createHash('sha256').update('synthetic-delivery-id').digest('hex'));assert.ok(!JSON.stringify(args).includes('synthetic-conversation'));return {data:true,error:null};}}));
 assert.equal(response.status,200);assert.equal(calls,1);
});
test('forged signature and foreign phone never get a privileged store',async()=>{
 assert.equal((await api.receiveKapsoReceipt(callback({}, {'x-webhook-signature':'f'.repeat(64)}),env,()=>assert.fail('No lookup'))).status,403);
 assert.equal((await api.receiveKapsoReceipt(callback({phone_number_id:'10000000999'}),env,()=>assert.fail('No lookup'))).status,400);
});
test('opaque delivery keys are hashed without assuming a provider UUID format',async()=>{
 const key='opaque.key/with+symbols=123';const response=await api.receiveKapsoReceipt(callback({}, {'x-idempotency-key':key}),env,()=>({rpc:async(_name,args)=>{assert.equal(args.p_delivery_key_hash,crypto.createHash('sha256').update(key).digest('hex'));return {data:true,error:null};}}));assert.equal(response.status,200);
});
test('database timeout aborts and never falsely acknowledges durable ingestion',async()=>{
 let aborted=false;const response=await api.receiveKapsoReceipt(callback(),env,()=>({rpc(){return {then(){},abortSignal(signal){signal.addEventListener('abort',()=>{aborted=true;});return new Promise(()=>{});}};}}),20);
 assert.equal(response.status,503);assert.equal(aborted,true);
});
test('slow request body is bounded without parsing or touching database',async()=>{
 const request=new Request('https://qa.example.invalid/api/webhooks/kapso/drive-whatsapp',{method:'POST',headers:{'content-type':'application/json'},body:new ReadableStream({start(){}}),duplex:'half'});
 assert.equal((await api.receiveKapsoReceipt(request,env,()=>assert.fail('No lookup'),20)).status,503);
});
test('oversized body cannot stall the callback through a non-settling cancel',async()=>{
 const request=new Request('https://qa.example.invalid/api/webhooks/kapso/drive-whatsapp',{method:'POST',headers:{'content-type':'application/json'},body:new ReadableStream({start(controller){controller.enqueue(new Uint8Array(32769));},cancel(){return new Promise(()=>{});}}),duplex:'half'});
 const response=await Promise.race([api.receiveKapsoReceipt(request,env,()=>assert.fail('No lookup'),20),new Promise((_,reject)=>setTimeout(()=>reject(Error('Unbounded callback cancellation')),200))]);
 assert.equal(response.status,400);
});
test('rejected ingestion is not delivery; unsigned event header cannot replace signed status',async()=>{
 const r=callback({}, {'x-webhook-event':'whatsapp.message.failed'});
 assert.equal((await api.receiveKapsoReceipt(r,env,()=>({rpc:async(_name,args)=>{assert.equal(args.p_state,'delivered');return {data:false,error:null};}}))).status,409);
});
test('stop is authenticated, works with outbound disabled and never calls provider',async()=>{
 const request=auth=>new Request('https://qa.example.invalid/api/internal/drive-whatsapp/stop',{method:'POST',headers:{'content-type':'application/json',authorization:auth},body:JSON.stringify({windowId:item.id})});
 assert.equal((await api.handleKapsoStop(request('wrong'),env,()=>assert.fail('No lookup'))).status,401);
 const response=await api.handleKapsoStop(request('Bearer '+env.DIR3COM_WHATSAPP_WORKER_SECRET),{...env,DIR3COM_WHATSAPP_ENABLED:'false'},()=>({rpc:async(name,args)=>{assert.equal(name,'stop_kapso_drive_whatsapp_window');assert.equal(args.p_window_id,item.id);return {data:{deactivation_required:true},error:null};}}));
 assert.equal(response.status,200);assert.equal((await response.json()).result.deactivation_required,true);
});
