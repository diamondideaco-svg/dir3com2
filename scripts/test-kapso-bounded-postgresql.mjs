// Only invoked by the existing fresh local-CI PostgreSQL fixture. No provider I/O.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';
function load(file,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Buffer,URL,URLSearchParams,Request,Response,AbortSignal,AbortController,setTimeout,clearTimeout,fetch:async()=>assert.fail('Live provider forbidden'),require(name){if(name==='server-only')return {};if(name==='node:crypto')return crypto;if(name in deps)return deps[name];throw new Error(name);}});return exports;}
export async function runBoundedContractAcceptance({db,connectPeer,request,requestId,asUser,operations,customer,other}){
 assert.equal(typeof connectPeer,'function','Real isolated PostgreSQL peers required; sequential emulation is not acceptance');
 let checks=0,sequence=0,sends=0;const equal=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const api=load('lib/notifications/kapso-drive-whatsapp.ts',{'./drive-whatsapp':load('lib/notifications/drive-whatsapp.ts')});
 const sender='10000000000166',phone='+10000000003',webhook='00000000-0000-4000-8000-000000000777';
 const env={DIR3COM_WHATSAPP_ENABLED:'true',DIR3COM_WHATSAPP_CATEGORIES:'operations.created',KAPSO_API_KEY:'SYNTHETIC-not-a-provider-key',KAPSO_PHONE_NUMBER_ID:sender,KAPSO_WEBHOOK_SECRET:'SYNTHETIC-SIGNING-SECRET-000000000000000',DIR3COM_WHATSAPP_WORKER_SECRET:'SYNTHETIC-WORKER-SECRET-0000000000000000',DIR3COM_WHATSAPP_SITE_URL:'https://qa.example.invalid',DIR3COM_WHATSAPP_KAPSO_TEMPLATES:JSON.stringify({'operations.created.ar':{name:'synthetic_operations',languageCode:'ar',bodyParameterNames:['request_reference','operations_url']}})};
 const config=api.kapsoConfig(env);assert.ok(config);
 const signatures={claim_kapso_drive_whatsapp_target:['p_request_id','p_outbox_id','p_recipient_user_id','p_category','p_language'],begin_kapso_drive_whatsapp:['p_id','p_token','p_phone_number_id'],finish_drive_whatsapp:['p_id','p_token','p_outcome','p_sid','p_error'],ingest_kapso_drive_whatsapp_receipt:['p_sid','p_phone_number_id','p_phone','p_state','p_error','p_delivery_key_hash'],stop_kapso_drive_whatsapp_window:['p_window_id','p_reason']};
 const storeFor=client=>({async rpc(name,args={}){const keys=signatures[name];assert.ok(keys,'Only bounded RPC names');try{return {data:(await client.query('SELECT public.'+name+'('+keys.map((_,i)=>'$'+(i+1)).join(',')+') AS value',keys.map(k=>args[k]))).rows[0].value,error:null};}catch(error){return {data:null,error};}}});
 const service=async(sql,args=[])=>{await db.exec('SET ROLE service_role');try{return await scalar(sql,args);}finally{await db.exec('RESET ROLE');}};
 const run=async(target,fetcher)=>{await db.exec('SET ROLE service_role');try{return await api.dispatchKapsoTarget(storeFor(db),config,target,fetcher);}finally{await db.exec('RESET ROLE');}};
 const state=t=>scalar('SELECT state FROM drive_notification_private.outbox WHERE id=$1',[t.outboxId]);
 const snapshot=except=>db.query('SELECT to_jsonb(o) AS row FROM drive_notification_private.outbox o WHERE id<>$1 ORDER BY id',[except]).then(x=>x.rows);
 const accepted=(sid,to)=>new Response(JSON.stringify({messaging_product:'whatsapp',contacts:[{input:to,wa_id:to}],messages:[{id:sid}]}),{status:200});
 const fake=async(_url,options)=>{sends++;return accepted('wamid.BOUNDED_'+sends,JSON.parse(options.body).to);};
 await db.exec(fs.readFileSync('supabase/migrations/20261015212723_task199_bounded_whatsapp_execution.sql','utf8'));
 equal(await scalar('SELECT dispatch_mode FROM drive_notification_private.settings'),'target_only','new mode defaults closed');
 await db.exec('ALTER TABLE public.drive_request_events ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT clock_timestamp()');
 const fixture=async(label,open=true)=>{
  // Fixture-owner operations only in the fresh throwaway DB. Never runtime APIs.
  await db.query("UPDATE drive_notification_private.settings SET dispatch_mode='target_only',active_window_id=NULL,send_enabled=true,capture_enabled=true,operations_created_enabled=true,operations_recipient_user_id=$1,operations_template_languages=ARRAY['ar'],customer_actions=ARRAY[]::text[],daily_limit=100",[operations]);
  const created=await request('bounded-'+label+'-'+(++sequence));const id=await requestId(created.reference);
  equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox WHERE request_id=$1',[id]),0,'target-only prevents broad trigger capture');
  const row=(await db.query(`INSERT INTO drive_notification_private.outbox(event_id,request_id,subscription_id,recipient_user_id,audience,country,phone,language,action,request_reference,expected_status,created_at)
   SELECT e.id,r.id,s.id,s.user_id,s.audience,e.country,s.phone,s.language,e.action,r.request_reference,e.new_status,e.created_at
   FROM public.drive_request_events e JOIN public.marketplace_requests r ON r.id=e.request_id
   JOIN drive_notification_private.subscriptions s ON s.user_id=$2 AND s.audience='operations' AND s.country='EG'
   WHERE r.id=$1 AND e.action='created' RETURNING id`,[id,operations])).rows[0];
  const target={requestId:id,outboxId:row.id,recipientUserId:operations,category:'operations.created',language:'ar'};
  if(open)target.windowId=await service("SELECT public.open_kapso_drive_whatsapp_window($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp()+interval '5 minutes')",[id,row.id,operations,target.category,target.language,sender,webhook,'SYNTHETIC-WINDOW-'+sequence]);
  return target;
 };
 const targetArgs=t=>[t.requestId,t.outboxId,t.recipientUserId,t.category,t.language];
 const transportTarget=t=>({requestId:t.requestId,outboxId:t.outboxId,recipientUserId:t.recipientUserId,category:t.category,language:t.language});
 const callback=(sid,status='delivered',to=phone,key='delivery-'+sid.replaceAll('.','_')+'-'+status)=>{const raw=JSON.stringify({phone_number_id:sender,message:{id:sid,to:to.slice(1),timestamp:'1790000000',text:{body:'SYNTHETIC_CONTENT_MUST_NOT_PERSIST'},kapso:{direction:'outbound',status,statuses:[{status,timestamp:'1790000000'}]},errors:[]},conversation:{id:'SYNTHETIC-CONVERSATION'}});return new Request('https://qa.example.invalid/api/webhooks/kapso/drive-whatsapp',{method:'POST',headers:{'content-type':'application/json','x-webhook-signature':crypto.createHmac('sha256',env.KAPSO_WEBHOOK_SECRET).update(raw).digest('hex'),'x-webhook-event':'whatsapp.message.'+status,'x-idempotency-key':key},body:raw});};
 const peer=await connectPeer();await peer.query('SET ROLE service_role');
 try {
  const target=await fixture('race');const before=await snapshot(target.outboxId);
  const missing={...transportTarget(target),outboxId:other};equal(await run(missing,fake),'idle','missing target does not select another');
  equal(sends,0,'no fallback send');equal(await snapshot(target.outboxId),before,'old rows unchanged on target mismatch');
  equal(await service('SELECT public.claim_drive_whatsapp()'),null,'legacy generic claim closed before housekeeping');
  equal(await service("SELECT public.claim_kapso_drive_whatsapp(ARRAY['operations.created.ar'])"),null,'Kapso generic claim closed');
  equal(await snapshot(target.outboxId),before,'generic path touches no old leases');
  const sid='wamid.BOUNDED_EARLY';
  equal(await run(transportTarget(target),async(_url,options)=>{sends++;
   const result=await api.receiveKapsoReceipt(callback(sid),env,()=>storeFor(peer));equal(result.status,200,'early callback acknowledged only after durable commit');
   equal(await scalar('SELECT provider_sid IS NULL FROM drive_notification_private.outbox WHERE id=$1',[target.outboxId]),true,'unbound metadata does not attach by phone');
   equal(await scalar('SELECT count(*)::int FROM drive_notification_private.receipt_inbox WHERE window_id=$1 AND matched_at IS NULL',[target.windowId]),1,'one durable unbound event');
   equal((await api.receiveKapsoReceipt(callback(sid),env,()=>storeFor(peer))).status,200,'early duplicate accepted idempotently');
   equal(await scalar('SELECT count(*)::int FROM drive_notification_private.receipt_inbox WHERE window_id=$1',[target.windowId]),1,'one stored copy');
   return accepted(sid,JSON.parse(options.body).to);
  }),'accepted','HTTP acceptance remains distinct from delivery');
  equal(sends,1,'one fake message only');equal(await state(target),'delivered','exact WAMID reconciles early delivery');
  equal(await scalar('SELECT provider_sid FROM drive_notification_private.outbox WHERE id=$1',[target.outboxId]),sid,'WAMID retained');
  equal(await snapshot(target.outboxId),before,'old rows byte-for-byte unchanged');
  equal(await scalar('SELECT send_enabled FROM drive_notification_private.settings'),false,'delivery closes outbound');
  equal(await scalar('SELECT deactivation_required FROM drive_notification_private.execution_windows WHERE id=$1',[target.windowId]),true,'provider deactivation remains explicit pending action');
  const updated=await scalar('SELECT updated_at FROM drive_notification_private.outbox WHERE id=$1',[target.outboxId]);
  equal((await api.receiveKapsoReceipt(callback(sid),env,()=>storeFor(peer))).status,200,'post-match duplicate returns200');
  equal(await scalar('SELECT updated_at FROM drive_notification_private.outbox WHERE id=$1',[target.outboxId]),updated,'duplicate causes no second state processing');
  equal((await api.receiveKapsoReceipt(callback(sid,'failed'),env,()=>storeFor(peer))).status,200,'late failed receipt is safely recorded');
  equal(await state(target),'delivered','late failed does not roll delivery backward');
  equal((await api.receiveKapsoReceipt(callback('wamid.FOREIGN'),env,()=>storeFor(peer))).status,409,'wrong WAMID cannot update bound order');
  equal((await api.receiveKapsoReceipt(callback(sid,'delivered','+10000000099'),env,()=>storeFor(peer))).status,409,'wrong recipient cannot update');
  equal(await run(transportTarget(target),fake),'idle','repeated dispatch closed');equal(sends,1,'no repeated message');
  const stored=await db.query('SELECT to_jsonb(i) AS row FROM drive_notification_private.receipt_inbox i WHERE window_id=$1',[target.windowId]);
  equal(JSON.stringify(stored.rows).includes('SYNTHETIC_CONTENT'),false,'message content not retained');
  // Real domain transitions by separate synthetic authenticated actors, no payment.
  await asUser(operations,"SELECT public.review_managed_drive_request($1,0,'review')",[target.requestId]);
  await asUser(operations,"SELECT public.review_managed_drive_request($1,1,'confirm','Synthetic vehicle',NULL,150,'USD',clock_timestamp()+interval '1 day',NULL)",[target.requestId]);
  equal(await scalar('SELECT status FROM public.marketplace_requests WHERE id=$1',[target.requestId]),'awaiting_customer_acceptance','quote awaits actual owner decision');
  await asUser(customer,'SELECT public.accept_managed_drive_quote($1,2)',[target.requestId]);
  equal(await scalar('SELECT status FROM public.marketplace_requests WHERE id=$1',[target.requestId]),'awaiting_payment','synthetic owner acceptance updates domain');
  equal(await scalar('SELECT next_action FROM public.marketplace_requests WHERE id=$1',[target.requestId]),'payment_not_enabled','no payment or confirmed booking');

  const concurrent=await fixture('concurrent');const old=await snapshot(concurrent.outboxId);let parallelSends=0;
  const a=await connectPeer(),b=await connectPeer();await a.query('SET ROLE service_role');await b.query('SET ROLE service_role');
  try {const fakeParallel=async(_url,options)=>{parallelSends++;return accepted('wamid.BOUNDED_PARALLEL',JSON.parse(options.body).to);};
   const results=await Promise.all([api.dispatchKapsoTarget(storeFor(a),config,transportTarget(concurrent),fakeParallel),api.dispatchKapsoTarget(storeFor(b),config,transportTarget(concurrent),fakeParallel)]);
   equal(results.filter(x=>x==='accepted').length,1,'two independent DB connections one acceptance');equal(parallelSends,1,'two workers one provider call');
  } finally {await a.end();await b.end();}
  equal(await snapshot(concurrent.outboxId),old,'concurrent calls preserve every old row');

  for(const kind of ['consent','expired','budget','kill']){
   const t=await fixture(kind);const claimed=await service('SELECT public.claim_kapso_drive_whatsapp_target($1,$2,$3,$4,$5)',targetArgs(t));assert.ok(claimed);
   if(kind==='consent')await db.query('UPDATE drive_notification_private.subscriptions SET enabled=false WHERE user_id=$1 AND audience=\'operations\'',[operations]);
   if(kind==='expired')await db.query("UPDATE drive_notification_private.execution_windows SET started_at=clock_timestamp()-interval '10 minutes',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[t.windowId]);
   if(kind==='budget')await db.exec("UPDATE drive_notification_private.settings SET daily_limit=1,budget_used=1,budget_day=(now() AT TIME ZONE 'UTC')::date");
   if(kind==='kill')await db.exec('UPDATE drive_notification_private.settings SET send_enabled=false');
   equal(await service('SELECT public.begin_kapso_drive_whatsapp($1,$2,$3)',[claimed.id,claimed.token,sender]),false,kind+' blocks final send intent');
   await db.query('UPDATE drive_notification_private.subscriptions SET enabled=true WHERE user_id=$1 AND audience=\'operations\'',[operations]);
   await db.exec('UPDATE drive_notification_private.settings SET daily_limit=100');
  }
  const lost=await fixture('unknown');const lostBefore=sends;
  equal(await run(transportTarget(lost),async()=>{sends++;throw new Error('SYNTHETIC_RESPONSE_LOSS');}),'unknown','response loss explicit unknown');
  equal(await state(lost),'unknown','unknown persisted');equal(await run(transportTarget(lost),fake),'idle','unknown never reclaims');equal(sends,lostBefore+1,'no duplicate after response loss');
  const stopped=await fixture('manual-stop');const result=await service("SELECT public.stop_kapso_drive_whatsapp_window($1,'manual')",[stopped.windowId]);
  equal(result.deactivation_required,true,'stop action records provider work separately');equal(await run(transportTarget(stopped),fake),'idle','manual stop prevents network');
  const expired=await fixture('watchdog');await db.query("UPDATE drive_notification_private.execution_windows SET started_at=clock_timestamp()-interval '10 minutes',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[expired.windowId]);
  equal((await service('SELECT public.expire_kapso_drive_whatsapp_window()')).deactivation_required,true,'deadline watchdog closes window');
  equal(await scalar('SELECT send_enabled FROM drive_notification_private.settings'),false,'watchdog disables sends');

  const waiting=await fixture('outbox-expiry');const waitingLease=await service('SELECT public.claim_kapso_drive_whatsapp_target($1,$2,$3,$4,$5)',targetArgs(waiting));
  const held=await connectPeer();const pid=(await peer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const waitingBudget=await scalar('SELECT budget_used FROM drive_notification_private.settings');const waitingSends=sends;
  let pending;
  try {await held.query('BEGIN');await held.query('SELECT 1 FROM drive_notification_private.outbox WHERE id=$1 FOR UPDATE',[waiting.outboxId]);
   await db.query("UPDATE drive_notification_private.execution_windows SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1",[waiting.windowId]);
   const normal=storeFor(peer);const leasedStore={rpc:(name,args)=>name==='claim_kapso_drive_whatsapp_target'?Promise.resolve({data:waitingLease,error:null}):normal.rpc(name,args)};
   pending=api.dispatchKapsoTarget(leasedStore,config,transportTarget(waiting),fake);
   let blocked=false;for(let i=0;i<80;i++){const status=await db.query("SELECT wait_event_type='Lock' AS blocked FROM pg_stat_activity WHERE pid=$1",[pid]);if(status.rows[0]?.blocked){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}
   equal(blocked,true,'begin is actually blocked on the independent outbox lock');
   await db.exec('SELECT pg_sleep(1.05)');await held.query('ROLLBACK');
   equal(await pending,'not_sent','outbox wait crossing expiry rejects the final send');
  } finally {await held.query('ROLLBACK');await held.end();if(pending)await pending;}
  equal(sends,waitingSends,'expiry while waiting causes zero provider calls');
  equal(await scalar('SELECT budget_used FROM drive_notification_private.settings'),waitingBudget,'expired lock wait consumes no budget');
  equal(await scalar('SELECT send_started_at IS NULL AND stop_reason=\'expired\' FROM drive_notification_private.execution_windows WHERE id=$1',[waiting.windowId]),true,'no durable send intent after expiry');
  equal(await scalar('SELECT attempts=0 AND state=\'claimed\' AND provider_phone_number_id IS NULL FROM drive_notification_private.outbox WHERE id=$1',[waiting.outboxId]),true,'no attempt or sender binding from expired wait');

  const rollbackTarget=await fixture('intent-rollback');const rollbackLease=await service('SELECT public.claim_kapso_drive_whatsapp_target($1,$2,$3,$4,$5)',targetArgs(rollbackTarget));
  const rollbackBudget=await scalar('SELECT budget_used FROM drive_notification_private.settings');const rollbackSends=sends;
  await db.exec(`CREATE FUNCTION drive_notification_private.synthetic_delay_intent() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN PERFORM pg_catalog.pg_sleep(2); RETURN NEW; END $$;
   CREATE TRIGGER synthetic_delay_intent BEFORE UPDATE ON drive_notification_private.outbox FOR EACH ROW WHEN(NEW.state='sending' AND OLD.state='claimed') EXECUTE FUNCTION drive_notification_private.synthetic_delay_intent();`);
  let rollbackPending;
  try {
   await db.query("UPDATE drive_notification_private.execution_windows SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1",[rollbackTarget.windowId]);
   const normal=storeFor(peer);const leasedStore={rpc:(name,args)=>name==='claim_kapso_drive_whatsapp_target'?Promise.resolve({data:rollbackLease,error:null}):normal.rpc(name,args)};
   rollbackPending=api.dispatchKapsoTarget(leasedStore,config,transportTarget(rollbackTarget),fake);
   let delayed=false;for(let i=0;i<100;i++){const status=await db.query("SELECT wait_event='PgSleep' AS delayed FROM pg_stat_activity WHERE pid=$1",[pid]);if(status.rows[0]?.delayed){delayed=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}
   equal(delayed,true,'synthetic trigger actually delays the legacy durable intent');
   equal(await rollbackPending,'not_sent','expiry inside legacy begin rolls back its work');
  } finally {if(rollbackPending)await rollbackPending;await db.exec('DROP TRIGGER synthetic_delay_intent ON drive_notification_private.outbox; DROP FUNCTION drive_notification_private.synthetic_delay_intent()');}
  equal(sends,rollbackSends,'late intent performs zero provider calls');
  equal(await scalar('SELECT budget_used FROM drive_notification_private.settings'),rollbackBudget,'subtransaction rolls back budget reservation');
  equal(await scalar('SELECT send_started_at IS NULL AND stop_reason=\'expired\' FROM drive_notification_private.execution_windows WHERE id=$1',[rollbackTarget.windowId]),true,'late legacy intent leaves a stopped window without send timestamp');
  equal(await scalar('SELECT attempts=0 AND state=\'claimed\' AND provider_phone_number_id IS NULL FROM drive_notification_private.outbox WHERE id=$1',[rollbackTarget.outboxId]),true,'subtransaction rolls back attempt and sender binding');

  const deadlineTarget=await fixture('db-deadline');const lease=await service('SELECT public.claim_kapso_drive_whatsapp_target($1,$2,$3,$4,$5)',targetArgs(deadlineTarget));
  equal(await service('SELECT public.begin_kapso_drive_whatsapp($1,$2,$3)',[lease.id,lease.token,sender]),true,'deadline fixture has a durable intent only');
  const locker=await connectPeer();
  try {await locker.query('BEGIN');await locker.query('SELECT 1 FROM drive_notification_private.settings WHERE singleton FOR UPDATE');
   const started=Date.now();const timed=await api.receiveKapsoReceipt(callback('wamid.BOUNDED_TIMEOUT'),env,()=>storeFor(peer));
   equal(timed.status,503,'lock timeout never acknowledges ingestion');assert.ok(Date.now()-started<6500);checks++;
  } finally {await locker.query('ROLLBACK');await locker.end();}
  equal(await scalar('SELECT count(*)::int FROM drive_notification_private.receipt_inbox WHERE window_id=$1',[deadlineTarget.windowId]),0,'timed-out transaction leaves no false durable receipt');

  for(const role of ['anon','authenticated']){
   for(const signature of ['public.open_kapso_drive_whatsapp_window(uuid,uuid,uuid,text,text,text,uuid,text,timestamptz)','public.ingest_kapso_drive_whatsapp_receipt(text,text,text,text,text,text)','public.stop_kapso_drive_whatsapp_window(uuid,text)','public.expire_kapso_drive_whatsapp_window()'])equal(await scalar('SELECT has_function_privilege($1,$2,\'EXECUTE\')',[role,signature]),false,role+' no new privileged RPC');
   for(const table of ['execution_windows','receipt_inbox'])equal(await scalar('SELECT has_table_privilege($1,$2,\'SELECT\')',[role,'drive_notification_private.'+table]),false,role+' no new data access');
  }
  for(const name of ['execution_windows','receipt_inbox'])equal(await scalar('SELECT has_table_privilege(\'service_role\',$1,\'INSERT\')',['drive_notification_private.'+name]),false,'service writes through guarded RPC only');
  equal(await scalar("SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='drive_notification_private' AND c.relkind='r' AND c.relrowsecurity"),6,'new private tables retain RLS');
  console.log('PASS '+checks+' bounded contract PostgreSQL assertions; two connections, fake provider, no real data');
  return checks;
 } finally {await peer.end();}
}
