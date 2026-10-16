// Actual migrations/RPCs, two real local PostgreSQL clients, synthetic provider only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';
function load(file,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Buffer,URL,URLSearchParams,Request,Response,AbortSignal,AbortController,setTimeout,clearTimeout,fetch:async()=>assert.fail('Live provider forbidden'),require(name){if(name==='server-only')return {};if(name==='node:crypto')return crypto;if(name in deps)return deps[name];throw Error(name);}});return exports;}
async function assertProviderQuerySchema(db){
 const shape=(await db.query(`SELECT
  to_regprocedure('public.open_kapso_drive_whatsapp_provider_query_window(uuid,uuid,uuid,text,text,text,text,timestamptz)') IS NOT NULL
   AND to_regprocedure('public.begin_kapso_drive_whatsapp_provider_query(uuid,uuid,text)') IS NOT NULL
   AND to_regprocedure('public.claim_kapso_drive_whatsapp_status_query(uuid,uuid,uuid,text,text,text)') IS NOT NULL
   AND to_regprocedure('public.finish_kapso_drive_whatsapp_status_query(uuid,uuid,text,text,text,text)') IS NOT NULL AS rpc,
  (SELECT count(*)=7 FROM pg_attribute WHERE attrelid=to_regclass('drive_notification_private.execution_windows')
   AND NOT attisdropped AND (attname,format_type(atttypid,atttypmod)) IN
   (('delivery_mode','text'),('status_query_attempts','integer'),('query_lease_token','uuid'),('query_lease_until','timestamp with time zone'),
    ('query_available_at','timestamp with time zone'),('last_query_outcome','text'),('outbox_id','uuid'))) AS columns,
  (SELECT count(*)=2 FROM pg_constraint WHERE conrelid=to_regclass('drive_notification_private.execution_windows')
   AND contype='c' AND conname IN ('execution_window_delivery_binding','execution_window_query_lease')) AS bindings,
  EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname='outbox_id'
   WHERE c.conrelid=to_regclass('drive_notification_private.execution_windows') AND c.contype='u' AND c.conkey=ARRAY[a.attnum]) AS unique_target`)).rows[0];
 for(const key of ['rpc','columns','bindings','unique_target'])assert.equal(shape?.[key],true,'Provider query schema prerequisite missing: '+key);
}
export async function runProviderQueryAcceptance({db,connectPeer,request,requestId,operations,other}){
 assert.equal(typeof connectPeer,'function','Two real isolated PostgreSQL connections required');
 await assertProviderQuerySchema(db); // Caller owns setup; never reapply a migration here.
 const core=load('lib/notifications/drive-whatsapp.ts');
 const sender=load('lib/notifications/kapso-drive-whatsapp.ts',{'./drive-whatsapp':core});
 const api=load('lib/notifications/kapso-provider-query.ts',{'./drive-whatsapp':core,'./kapso-drive-whatsapp':sender});
 const phone='+10000000003',phoneId='10000000000166',webhook='00000000-0000-4000-8000-000000000777';
 const env={DIR3COM_WHATSAPP_ENABLED:'true',DIR3COM_WHATSAPP_DELIVERY_MODE:'provider_query',DIR3COM_WHATSAPP_CATEGORIES:'operations.created',KAPSO_API_KEY:'SYNTHETIC-NOT-A-PROVIDER-KEY',KAPSO_PHONE_NUMBER_ID:phoneId,DIR3COM_WHATSAPP_WORKER_SECRET:'SYNTHETIC-WORKER-SECRET-000000000000',DIR3COM_WHATSAPP_SITE_URL:'https://qa.example.invalid',DIR3COM_WHATSAPP_KAPSO_TEMPLATES:JSON.stringify({'operations.created.ar':{name:'synthetic_operations',languageCode:'ar'}})};
 const config=sender.kapsoConfig(env);assert.ok(config);let checks=4,sequence=0,posts=0,gets=0;
 const equal=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
 const scalar=async(sql,args=[],client=db)=>Object.values((await client.query(sql,args)).rows[0])[0];
 const service=async(sql,args=[],client=db)=>{await client.query('SET ROLE service_role');try{return await scalar(sql,args,client);}finally{await client.query('RESET ROLE');}};
 const signatures={claim_kapso_drive_whatsapp_target:['p_request_id','p_outbox_id','p_recipient_user_id','p_category','p_language'],begin_kapso_drive_whatsapp:['p_id','p_token','p_phone_number_id'],begin_kapso_drive_whatsapp_provider_query:['p_id','p_token','p_phone_number_id'],finish_drive_whatsapp:['p_id','p_token','p_outcome','p_sid','p_error'],claim_kapso_drive_whatsapp_status_query:['p_request_id','p_outbox_id','p_recipient_user_id','p_category','p_language','p_phone_number_id'],finish_kapso_drive_whatsapp_status_query:['p_window_id','p_query_token','p_sid','p_phone_number_id','p_phone','p_state']};
 const storeFor=client=>({async rpc(name,args={}){const keys=signatures[name];assert.ok(keys,'Allowlisted fixture RPC only');try{return {data:(await client.query('SELECT public.'+name+'('+keys.map((_,i)=>'$'+(i+1)).join(',')+') AS value',keys.map(k=>args[k]))).rows[0].value,error:null};}catch(error){return {data:null,error};}}});
 const transport=t=>({requestId:t.requestId,outboxId:t.outboxId,recipientUserId:operations,category:'operations.created',language:'ar'});
 const targetArgs=t=>[t.requestId,t.outboxId,operations,'operations.created','ar'];
 const req=t=>new Request('https://qa.example.invalid/api/internal/drive-whatsapp/reconcile-target',{method:'POST',headers:{authorization:'Bearer '+env.DIR3COM_WHATSAPP_WORKER_SECRET,'content-type':'application/json'},body:JSON.stringify(t)});
 const run=async(t,fetcher,client=db,chosen=config,override=null)=>{await client.query('SET ROLE service_role');try{return await sender.dispatchKapsoTarget(override??storeFor(client),chosen,transport(t),fetcher);}finally{await client.query('RESET ROLE');}};
 const reconcile=async(t,fetcher,client=db,override=null)=>{await client.query('SET ROLE service_role');try{return await api.handleKapsoTargetReconcile(req(t),env,()=>override??storeFor(client),fetcher);}finally{await client.query('RESET ROLE');}};
 const state=t=>scalar('SELECT state FROM drive_notification_private.outbox WHERE id=$1',[t.outboxId]);
 const messageId=t=>scalar('SELECT provider_sid FROM drive_notification_private.outbox WHERE id=$1',[t.outboxId]);
 const snapshot=t=>db.query('SELECT to_jsonb(o) AS row FROM drive_notification_private.outbox o WHERE id<>$1 ORDER BY id',[t.outboxId]).then(r=>r.rows);
 const post=async(_url,options)=>{posts++;assert.equal(options.method,'POST');const to=JSON.parse(options.body).to;return Response.json({messaging_product:'whatsapp',contacts:[{input:to,wa_id:to}],messages:[{id:'wamid.QUERY_'+posts}]});};
 const get=(sid,status='delivered',patch={})=>async(url,options)=>{gets++;assert.equal(options.method,'GET');assert.equal(new URL(url).origin,'https://api.kapso.ai');return Response.json({id:sid,to:phone.slice(1),kapso:{direction:'outbound',status},...patch});};
 const noNetwork=async()=>assert.fail('No transport permitted');
 const fixture=async(label,mode='provider_query')=>{
  await db.query("UPDATE drive_notification_private.settings SET dispatch_mode='target_only',active_window_id=NULL,send_enabled=true,capture_enabled=true,operations_created_enabled=true,operations_recipient_user_id=$1,operations_template_languages=ARRAY['ar'],customer_actions=ARRAY[]::text[],daily_limit=100,budget_used=0",[operations]);
  const created=await request('query-'+label+'-'+(++sequence));const id=await requestId(created.reference);
  equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox WHERE request_id=$1',[id]),0,'target-only capture remains closed');
  const outboxId=(await db.query(`INSERT INTO drive_notification_private.outbox(event_id,request_id,subscription_id,recipient_user_id,audience,country,phone,language,action,request_reference,expected_status,created_at)
   SELECT e.id,r.id,s.id,s.user_id,s.audience,e.country,s.phone,s.language,e.action,r.request_reference,e.new_status,e.created_at
   FROM public.drive_request_events e JOIN public.marketplace_requests r ON r.id=e.request_id
   JOIN drive_notification_private.subscriptions s ON s.user_id=$2 AND s.audience='operations' AND s.country='EG'
   WHERE r.id=$1 AND e.action='created' RETURNING id`,[id,operations])).rows[0].id;
  const t={requestId:id,outboxId};
  t.windowId=mode==='webhook'
   ?await service("SELECT public.open_kapso_drive_whatsapp_window($1,$2,$3,'operations.created','ar',$4,$5,$6,clock_timestamp()+interval '5 minutes')",[id,outboxId,operations,phoneId,webhook,'SYNTHETIC-QUERY-WINDOW-'+sequence])
   :await service("SELECT public.open_kapso_drive_whatsapp_provider_query_window($1,$2,$3,'operations.created','ar',$4,$5,clock_timestamp()+interval '5 minutes')",[id,outboxId,operations,phoneId,'SYNTHETIC-QUERY-WINDOW-'+sequence]);
  return t;
 };
 const claimQuery=(t,client=db,args=[...targetArgs(t),phoneId])=>service('SELECT public.claim_kapso_drive_whatsapp_status_query($1,$2,$3,$4,$5,$6)',args,client);
 const finishQuery=(lease,status,sid=lease.provider_sid,token=lease.query_token)=>service('SELECT public.finish_kapso_drive_whatsapp_status_query($1,$2,$3,$4,$5,$6)',[lease.window_id,token,sid,phoneId,phone,status]);
 const peer=await connectPeer();
 try {
  // Actual catalog failures in the owned fixture, each rolled back before any provider I/O.
  for(const [sql,missing] of [
   ['ALTER FUNCTION public.claim_kapso_drive_whatsapp_status_query(uuid,uuid,uuid,text,text,text) RENAME TO synthetic_missing_query','rpc'],
   ['ALTER TABLE drive_notification_private.execution_windows RENAME COLUMN status_query_attempts TO synthetic_missing_attempts','columns'],
   ['ALTER TABLE drive_notification_private.execution_windows DROP CONSTRAINT execution_window_query_lease','bindings'],
  ]){await db.exec('BEGIN');try{await db.exec(sql);await assert.rejects(assertProviderQuerySchema(db),new RegExp('schema prerequisite missing: '+missing));checks++;}finally{await db.exec('ROLLBACK');}}
  await assertProviderQuerySchema(db);
  const stoppedWebhook=await fixture('inherited-stop-bookkeeping','webhook');
  const firstStop=await service("SELECT public.stop_kapso_drive_whatsapp_window($1,'manual')",[stoppedWebhook.windowId]);
  equal(firstStop.deactivation_required,true,'webhook stop requires separate provider action');
  const firstStamp=await scalar('SELECT stopped_at::text FROM drive_notification_private.execution_windows WHERE id=$1',[stoppedWebhook.windowId]);
  // Simulate an external bookkeeping clear, not an implemented runtime acknowledgment API.
  await db.query('UPDATE drive_notification_private.execution_windows SET deactivation_required=false WHERE id=$1',[stoppedWebhook.windowId]);
  equal((await service("SELECT public.stop_kapso_drive_whatsapp_window($1,'manual')",[stoppedWebhook.windowId])).deactivation_required,true,'inherited stop reasserts webhook work after external clear');
  equal(await scalar('SELECT stopped_at::text FROM drive_notification_private.execution_windows WHERE id=$1',[stoppedWebhook.windowId]),firstStamp,'repeated stop preserves original timestamp');
  equal(await scalar('SELECT stop_reason FROM drive_notification_private.execution_windows WHERE id=$1',[stoppedWebhook.windowId]),'manual','repeated stop preserves original reason');
  equal(await scalar('SELECT send_enabled FROM drive_notification_private.settings'),false,'repeated stop never enables sending');
  const concurrent=await fixture('exclusive');const old=await snapshot(concurrent),postBefore=posts;
  const sends=await Promise.all([run(concurrent,post),run(concurrent,post,peer)]);
  equal(sends.sort(),['accepted','idle'],'two workers reserve/send once');equal(posts,postBefore+1,'one POST after concurrent send');
  equal(await scalar('SELECT attempts FROM drive_notification_private.outbox WHERE id=$1',[concurrent.outboxId]),1,'one durable send attempt');
  const sid=await messageId(concurrent);assert.match(sid,/^wamid\./);checks++;
  equal(await scalar('SELECT delivery_mode FROM drive_notification_private.execution_windows WHERE id=$1',[concurrent.windowId]),'provider_query','explicit database query mode');
  equal(await scalar('SELECT webhook_id FROM drive_notification_private.execution_windows WHERE id=$1',[concurrent.windowId]),null,'no invented webhook identity');
  let entered,release;const atFetch=new Promise(resolve=>{entered=resolve;});const finishFetch=new Promise(resolve=>{release=resolve;});const getBefore=gets;
  const first=reconcile(transport(concurrent),async(url,options)=>{entered();await finishFetch;return get(sid)(url,options);});
  await atFetch;const second=await reconcile(transport(concurrent),noNetwork,peer);equal((await second.json()).result,'idle','second status reader fenced during first GET');
  release();equal((await (await first).json()).result,'recorded','one exact query records delivery');equal(gets,getBefore+1,'one concurrent GET');
  equal(await state(concurrent),'delivered','stored WAMID matches durable receipt');equal(await snapshot(concurrent),old,'all other outbox rows unchanged');
  equal(await scalar('SELECT deactivation_required FROM drive_notification_private.execution_windows WHERE id=$1',[concurrent.windowId]),false,'query mode has no provider deactivation fiction');
  equal(await run(concurrent,noNetwork),'idle','accepted/delivered never resend');equal((await (await reconcile(transport(concurrent),noNetwork)).json()).result,'idle','terminal delivery stops future GETs');

  const lost=await fixture('lost-post');const lostPosts=posts;
  equal(await run(lost,async()=>{posts++;throw Error('SYNTHETIC_POST_RESPONSE_LOSS');}),'unknown','POST response loss persists Unknown');
  equal(await state(lost),'unknown','durable Unknown');equal(await run(lost,noNetwork),'idle','Unknown never becomes a send retry');
  equal((await (await reconcile(transport(lost),noNetwork)).json()).result,'idle','missing WAMID prevents lookup');equal(posts,lostPosts+1,'one ambiguous POST only');

  const completion=await fixture('completion-loss');const normal=storeFor(db),completionPosts=posts;
  const loseFinish={rpc:async(name,args)=>{const result=await normal.rpc(name,args);return name==='finish_drive_whatsapp'&&result.error===null?{data:null,error:Error('SYNTHETIC_FINISH_REPLY_LOSS')}:result;}};
  await assert.rejects(run(completion,post,db,config,loseFinish),/RESULT_PERSISTENCE_UNCONFIRMED/);checks++;
  equal(await state(completion),'accepted','finish committed state and WAMID before reply loss');const committed=await messageId(completion);assert.ok(committed);checks++;
  equal(await run(completion,noNetwork),'idle','lost finish reply cannot repeat POST');
  equal((await (await reconcile(transport(completion),get(committed))).json()).result,'recorded','read-only reconciliation uses committed WAMID');equal(posts,completionPosts+1,'reconciliation made no new POST');

  const atomic=await fixture('atomic-finish');await assert.rejects(run(atomic,async(_url,options)=>{posts++;return Response.json({messaging_product:'whatsapp',contacts:[{input:phone.slice(1),wa_id:phone.slice(1)}],messages:[{id:committed}],echo:options.method});}),/RESULT_PERSISTENCE_UNCONFIRMED/);checks++;
  equal(await state(atomic),'sending','unique-WAMID failure rolls back acceptance');equal(await messageId(atomic),null,'same failure rolls back WAMID as one DB transaction');
  equal(await run(atomic,noNetwork),'idle','durable intent fences failed completion');equal((await (await reconcile(transport(atomic),noNetwork)).json()).result,'idle','no WAMID means no GET');

  const bounded=await fixture('three-404s');await run(bounded,post);const boundedPosts=posts,boundedGets=gets;
  for(let i=0;i<3;i++){
   await db.query("UPDATE drive_notification_private.execution_windows SET query_available_at=clock_timestamp()-interval '1 second' WHERE id=$1",[bounded.windowId]);
   const r=await reconcile(transport(bounded),async()=>{gets++;return new Response(null,{status:404});});equal((await r.json()).result,'unconfirmed','404 is not delivery');
  }
  equal((await (await reconcile(transport(bounded),noNetwork)).json()).result,'idle','three-query durable cap');
  equal(gets,boundedGets+3,'exactly three bounded reads');equal(posts,boundedPosts,'no retry POST after 404');equal(await state(bounded),'accepted','404 does not change acceptance to delivered/failed');
  equal(await scalar('SELECT status_query_attempts FROM drive_notification_private.execution_windows WHERE id=$1',[bounded.windowId]),3,'query budget survives invocation boundaries');
  equal(await scalar('SELECT attempts FROM drive_notification_private.outbox WHERE id=$1',[bounded.outboxId]),1,'queries do not inflate send attempts');

  for(const [label,patch] of [['wamid',{id:'wamid.FOREIGN'}],['recipient',{to:'10000000009'}],['bsuid-only',{to:null,to_user_id:'US.SYNTHETIC'}],['sender',{kapso:{direction:'outbound',status:'delivered',phone_number_id:'10000000999'}}]]){
   const t=await fixture('mismatch-'+label);await run(t,post);const before=await snapshot(t);
   equal((await (await reconcile(transport(t),get(await messageId(t),'delivered',patch))).json()).result,'unconfirmed',label+' mismatch fails closed');
   equal(await state(t),'accepted',label+' cannot move target delivery');equal(await snapshot(t),before,label+' cannot move another row');
  }
  const wrongTarget=await fixture('wrong-target');await run(wrongTarget,post);
  for(const t of [{...transport(wrongTarget),outboxId:other},{...transport(wrongTarget),requestId:other},{...transport(wrongTarget),recipientUserId:other}])equal((await (await reconcile(t,noNetwork)).json()).result,'idle','exact target mismatch gives zero GET');

  const leaseRace=await fixture('lease-fencing');await run(leaseRace,post);const leaseOne=await claimQuery(leaseRace);
  equal(await claimQuery(leaseRace,peer),null,'live lease cannot be reserved twice');
  await db.query("UPDATE drive_notification_private.execution_windows SET query_lease_until=clock_timestamp()-interval '1 second',query_available_at=clock_timestamp()-interval '1 second' WHERE id=$1",[leaseRace.windowId]);
  const leaseTwo=await claimQuery(leaseRace,peer);assert.notEqual(leaseOne.query_token,leaseTwo.query_token);checks++;
  equal(await finishQuery(leaseOne,'delivered'),false,'stale query token cannot commit');equal(await state(leaseRace),'accepted','stale result does not imply delivery');
  equal(await finishQuery(leaseTwo,'delivered','wamid.FOREIGN'),false,'wrong saved WAMID cannot commit');
  equal(await finishQuery(leaseTwo,'delivered'),true,'current exact lease records');equal(await finishQuery(leaseTwo,'failed'),false,'duplicate completion is fenced');equal(await state(leaseRace),'delivered','duplicate failure cannot regress delivery');

  const monotonic=await fixture('interleaved');await run(monotonic,post);const statusLease=await claimQuery(monotonic);
  const sendToken=await scalar('SELECT lease_token FROM drive_notification_private.outbox WHERE id=$1',[monotonic.outboxId]);
  equal(await service("SELECT public.record_drive_whatsapp_receipt($1,$2,$3,$4,'read')",[monotonic.outboxId,sendToken,statusLease.provider_sid,phone]),true,'concurrent existing receipt can advance first');
  equal(await finishQuery(statusLease,'failed'),true,'late query is ingested');equal(await state(monotonic),'read','late query never regresses read');
  equal(await scalar('SELECT stop_reason FROM drive_notification_private.execution_windows WHERE id=$1',[monotonic.windowId]),'delivered','stop derives from actual monotonic state');

  const queryLoss=await fixture('query-finish-loss');await run(queryLoss,post);const queryNormal=storeFor(db);
  const lostQueryFinish={rpc:async(name,args)=>{const result=await queryNormal.rpc(name,args);return name==='finish_kapso_drive_whatsapp_status_query'&&!result.error?{data:null,error:Error('SYNTHETIC_QUERY_REPLY_LOSS')}:result;}};
  equal((await reconcile(transport(queryLoss),get(await messageId(queryLoss)),db,lostQueryFinish)).status,503,'lost status commit reply stays unconfirmed to caller');
  equal(await state(queryLoss),'delivered','DB delivery commit retained');equal((await (await reconcile(transport(queryLoss),noNetwork)).json()).result,'idle','restart cannot re-query terminal result or resend');

  for(const gate of ['consent','kill','category','budget','trip','age']){
   const t=await fixture('send-gate-'+gate);const before=posts;
   if(gate==='consent')await db.query("UPDATE drive_notification_private.subscriptions SET enabled=false WHERE user_id=$1 AND audience='operations'",[operations]);
   if(gate==='kill')await db.exec('UPDATE drive_notification_private.settings SET send_enabled=false');
   if(gate==='category')await db.exec('UPDATE drive_notification_private.settings SET operations_created_enabled=false');
   if(gate==='budget')await db.exec('UPDATE drive_notification_private.settings SET budget_used=daily_limit');
   if(gate==='trip')await db.query("UPDATE public.marketplace_requests SET requested_for=clock_timestamp()-interval '1 second' WHERE id=$1",[t.requestId]);
   if(gate==='age')await db.query("UPDATE drive_notification_private.outbox SET created_at=clock_timestamp()-interval '25 hours' WHERE id=$1",[t.outboxId]);
   assert.ok(['idle','not_sent'].includes(await run(t,noNetwork)));checks++;equal(posts,before,gate+' still prevents POST');
   await db.query("UPDATE drive_notification_private.subscriptions SET enabled=true WHERE user_id=$1 AND audience='operations'",[operations]);
  }
  for(const gate of ['consent','kill','expired','manual']){
   const t=await fixture('query-gate-'+gate);await run(t,post);
   if(gate==='consent')await db.query("UPDATE drive_notification_private.subscriptions SET enabled=false WHERE user_id=$1 AND audience='operations'",[operations]);
   if(gate==='kill')await db.exec('UPDATE drive_notification_private.settings SET send_enabled=false');
   if(gate==='expired')await db.query("UPDATE drive_notification_private.execution_windows SET started_at=clock_timestamp()-interval '10 minutes',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[t.windowId]);
   if(gate==='manual')equal((await service("SELECT public.stop_kapso_drive_whatsapp_window($1,'manual')",[t.windowId])).deactivation_required,false,'query stop has no webhook operation');
   equal((await (await reconcile(transport(t),noNetwork)).json()).result,'idle',gate+' prevents GET');
   await db.query("UPDATE drive_notification_private.subscriptions SET enabled=true WHERE user_id=$1 AND audience='operations'",[operations]);
  }
  const wrongMode=await fixture('webhook-window','webhook');equal(await run(wrongMode,noNetwork),'not_sent','query sender cannot use webhook approval window');
  const queryMode=await fixture('query-window');const webhookConfig=sender.kapsoConfig({...env,DIR3COM_WHATSAPP_DELIVERY_MODE:'webhook',KAPSO_WEBHOOK_SECRET:'SYNTHETIC-SIGNING-SECRET-00000000000000'});
  equal(await run(queryMode,noNetwork,db,webhookConfig),'not_sent','webhook sender cannot use query window');
  for(const signature of ['public.open_kapso_drive_whatsapp_provider_query_window(uuid,uuid,uuid,text,text,text,text,timestamptz)','public.begin_kapso_drive_whatsapp_provider_query(uuid,uuid,text)','public.claim_kapso_drive_whatsapp_status_query(uuid,uuid,uuid,text,text,text)','public.finish_kapso_drive_whatsapp_status_query(uuid,uuid,text,text,text,text)']){
   for(const role of ['anon','authenticated'])equal(await scalar('SELECT has_function_privilege($1,$2,\'EXECUTE\')',[role,signature]),false,role+' cannot invoke privileged query API');
   equal(await scalar('SELECT has_function_privilege(\'service_role\',$1,\'EXECUTE\')',[signature]),true,'server role only');
  }
  for(const signature of ['drive_notification_private.begin_bounded_legacy(uuid,uuid,text)','drive_notification_private.begin_delivery(uuid,uuid,text,text)','drive_notification_private.open_delivery_window(uuid,uuid,uuid,text,text,text,uuid,text,timestamptz,text)'])for(const role of ['anon','authenticated','service_role'])equal(await scalar('SELECT has_function_privilege($1,$2,\'EXECUTE\')',[role,signature]),false,'no private helper bypass');
  equal(await scalar("SELECT relrowsecurity FROM pg_class WHERE oid='drive_notification_private.execution_windows'::regclass"),true,'window RLS retained');
  console.log(`PASS ${checks} provider_query PostgreSQL assertions; fake POSTs=${posts}, bounded fake GETs=${gets}; no remote/provider calls`);
  return checks;
 }finally{await peer.end();}
}
