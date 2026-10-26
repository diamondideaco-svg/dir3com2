// Disposable PostgreSQL fixture only. Every provider call is an injected stub.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';

function load(file,deps={}) {
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports,Buffer,URL,URLSearchParams,Request,Response,AbortSignal,AbortController,setTimeout,clearTimeout,
   fetch:async()=>assert.fail('External provider I/O forbidden'),require(name){if(name==='server-only')return {};if(name==='node:crypto')return crypto;if(name in deps)return deps[name];throw new Error(name);}});
 return exports;
}

export async function runCustomerBoundedAcceptance({db,connectPeer,request,requestId,asUser,operations,customer,other}) {
 assert.equal(typeof connectPeer,'function','Actual independent PostgreSQL sessions required');
 let checks=0,sequence=0,sends=0;
 const equal=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const service=async(sql,args=[])=>{await db.exec('SET ROLE service_role');try{return await scalar(sql,args);}finally{await db.exec('RESET ROLE');}};
 const api=load('lib/notifications/kapso-drive-whatsapp.ts',{'./drive-whatsapp':load('lib/notifications/drive-whatsapp.ts')});
 const sender='10000000000166',phone='+10000000001',webhook='00000000-0000-4000-8000-000000000777';
 const actions=['created','review','confirm','decline','customer_accept'];
 const migration='supabase/migrations/20261026110832_task166_bounded_customer_notifications.sql';
 equal(await scalar("SELECT pg_get_constraintdef(oid) LIKE '%operations.created%' AND pg_get_constraintdef(oid) NOT LIKE '%customer.created%' FROM pg_constraint WHERE conname='execution_windows_category_check'"),true,'reproduce baseline Operations-only bound window');
 await db.exec(fs.readFileSync(migration,'utf8'));
 equal(await scalar('SELECT capture_enabled OR send_enabled FROM drive_notification_private.settings'),false,'migration never activates');
 await db.query("INSERT INTO drive_notification_private.subscriptions(user_id,audience,country,phone,language,consent_reference,verified_at,enabled) VALUES($1,'customer','EG',$2,'ar','SYNTHETIC-CUSTOMER-APPROVAL',clock_timestamp(),true),($3,'customer','EG','+10000000002','ar','SYNTHETIC-OTHER-APPROVAL',clock_timestamp(),true)",[customer,phone,other]);
 const signatures={claim_kapso_drive_whatsapp_target:['p_request_id','p_outbox_id','p_recipient_user_id','p_category','p_language'],begin_kapso_drive_whatsapp:['p_id','p_token','p_phone_number_id'],finish_drive_whatsapp:['p_id','p_token','p_outcome','p_sid','p_error'],ingest_kapso_drive_whatsapp_receipt:['p_sid','p_phone_number_id','p_phone','p_state','p_error','p_delivery_key_hash']};
 const storeFor=client=>({async rpc(name,args={}){const keys=signatures[name];assert.ok(keys,'Only allowlisted RPCs');try{return {data:(await client.query('SELECT public.'+name+'('+keys.map((_,i)=>'$'+(i+1)).join(',')+') AS result',keys.map(k=>args[k]))).rows[0].result,error:null};}catch(error){return {data:null,error};}}});
 const configFor=(action,language)=>{const env={DIR3COM_WHATSAPP_ENABLED:'true',DIR3COM_WHATSAPP_CATEGORIES:'customer.'+action,KAPSO_API_KEY:'SYNTHETIC-not-a-provider-key',KAPSO_PHONE_NUMBER_ID:sender,KAPSO_WEBHOOK_SECRET:'SYNTHETIC-SIGNING-SECRET-000000000000000',DIR3COM_WHATSAPP_SITE_URL:'https://qa.example.invalid',DIR3COM_WHATSAPP_KAPSO_TEMPLATES:JSON.stringify({['customer.'+action+'.'+language]:{name:'synthetic_customer_'+action,languageCode:language==='en'?'en_US':'ar'}})};const config=api.kapsoConfig(env);assert.ok(config);equal(api.kapsoConfig({...env,DIR3COM_WHATSAPP_DELIVERY_MODE:'provider_query'}),null,'customer cannot use provider-query');return {env,config};};
 const targetArgs=t=>[t.requestId,t.outboxId,customer,t.category,t.language];
 const claim=t=>service('SELECT public.claim_kapso_drive_whatsapp_target($1,$2,$3,$4,$5)',targetArgs(t));
 const begin=row=>service('SELECT public.begin_kapso_drive_whatsapp($1,$2,$3)',[row.id,row.token,sender]);
 const run=async(t,config,fetcher)=>{await db.exec('SET ROLE service_role');try{return await api.dispatchKapsoTarget(storeFor(db),config,{requestId:t.requestId,outboxId:t.outboxId,recipientUserId:customer,category:t.category,language:t.language},fetcher);}finally{await db.exec('RESET ROLE');}};
 const stop=async()=>{const id=await scalar('SELECT active_customer_authorization_id FROM drive_notification_private.settings');if(id)await service('SELECT public.stop_kapso_customer_notification($1)',[id]);await db.exec('UPDATE drive_notification_private.settings SET send_enabled=false,capture_enabled=false');};
 const arm=async(reference,action,language,version)=>service("SELECT public.arm_kapso_customer_notification($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp()+interval '5 minutes')",[reference,customer,phone,language,action,version,sender,webhook,'SYNTHETIC-CUSTOMER-'+(++sequence)]);
 const fixture=async(action='created',language='ar',capture=true)=>{
  await stop();
  await db.query("UPDATE drive_notification_private.subscriptions SET enabled=true,phone=$2,language=$3 WHERE user_id=$1 AND audience='customer'",[customer,phone,language]);
  await db.exec("UPDATE drive_notification_private.settings SET dispatch_mode='target_only',daily_limit=100,budget_used=0,budget_day=(now() AT TIME ZONE 'UTC')::date,customer_actions=ARRAY['created','review','confirm','decline','customer_accept'],customer_template_languages=ARRAY['ar','en']");
  const key=('bounded-customer-'+(++sequence)).padEnd(20,'-');
  const reference='REQ-'+crypto.createHash('md5').update(customer+':'+key).digest('hex').slice(0,20).toUpperCase();
  let id,version=0;
  if(action!=='created') {id=await requestId((await request(key)).reference);if(['confirm','customer_accept'].includes(action)){await asUser(operations,"SELECT public.review_managed_drive_request($1,0,'review')",[id]);version=1;}if(action==='customer_accept'){await asUser(operations,"SELECT public.review_managed_drive_request($1,1,'confirm','Synthetic vehicle',NULL,150,'USD',clock_timestamp()+interval '1 day',NULL)",[id]);version=2;}}
  const approval=await arm(reference,action,language,version);
  const t={...approval,outboxId:approval.outbox_id,category:'customer.'+action,language,reference,requestId:id};
  const fire=async()=>{if(action==='created'){await request(key);t.requestId=await requestId(reference);}else if(action==='customer_accept')await asUser(customer,'SELECT public.accept_managed_drive_quote($1,$2)',[id,version]);else if(action==='confirm')await asUser(operations,"SELECT public.review_managed_drive_request($1,$2,'confirm','Synthetic vehicle',NULL,150,'USD',clock_timestamp()+interval '1 day',NULL)",[id,version]);else await asUser(operations,'SELECT public.review_managed_drive_request($1,$2,$3)',[id,version,action]);t.windowId=await scalar('SELECT window_id FROM drive_notification_private.customer_authorizations WHERE id=$1',[t.authorization_id]);};
  if(capture){await db.exec('UPDATE drive_notification_private.settings SET send_enabled=true,capture_enabled=true');await fire();}
  return {t,fire};
 };
 const snapshot=except=>db.query('SELECT to_jsonb(o) AS row FROM drive_notification_private.outbox o WHERE id<>$1 ORDER BY id',[except]).then(r=>r.rows);
 const fakeFor=t=>async(_url,options)=>{sends++;const payload=JSON.parse(options.body);equal(payload.to,phone.slice(1),'approved recipient only');equal(payload.template.language.code,t.language==='en'?'en_US':'ar','actual provider language mapping');equal(payload.template.components[0].parameters.map(x=>x.text),[t.reference,'https://qa.example.invalid/my-requests/'+t.reference+'/drive?language='+t.language],'reference and customer-owned link only');return new Response(JSON.stringify({messaging_product:'whatsapp',contacts:[{input:phone.slice(1),wa_id:phone.slice(1)}],messages:[{id:'wamid.CUSTOMER_'+sends}]}),{status:200});};
 const callback=(env,sid,state='delivered')=>{const raw=JSON.stringify({phone_number_id:sender,message:{id:sid,to:phone.slice(1),kapso:{direction:'outbound',status:state}}});return new Request('https://qa.example.invalid/api/webhooks/kapso/drive-whatsapp',{method:'POST',headers:{'content-type':'application/json','x-webhook-signature':crypto.createHmac('sha256',env.KAPSO_WEBHOOK_SECRET).update(raw).digest('hex')},body:raw});};
 for(const action of actions)for(const language of ['ar','en']) {
  const {t}=await fixture(action,language);const {env,config}=configFor(action,language);assert.ok(t.windowId);checks++;
  equal(await scalar('SELECT a.event_id=o.event_id AND a.request_id=o.request_id FROM drive_notification_private.customer_authorizations a JOIN drive_notification_private.outbox o ON o.id=a.outbox_id WHERE a.id=$1',[t.authorization_id]),true,'natural event and request bound');
  const old=await snapshot(t.outboxId);equal(await service('SELECT public.claim_drive_whatsapp()'),null,'generic target-only path stays closed');
  equal(await run(t,config,fakeFor(t)),'accepted',action+'/'+language+' accepted stub is not delivery');
  equal(await scalar('SELECT state FROM drive_notification_private.outbox WHERE id=$1',[t.outboxId]),'accepted','provider acceptance distinct from delivery');
  const sid=await scalar('SELECT provider_sid FROM drive_notification_private.outbox WHERE id=$1',[t.outboxId]);
  const calls=sends;equal(await run(t,config,fakeFor(t)),'idle','accepted never resent');equal(sends,calls,'one attempt');
  await db.exec('SET ROLE service_role');try{equal((await api.receiveKapsoReceipt(callback(env,sid),env,()=>storeFor(db))).status,200,'signed webhook accepted');}finally{await db.exec('RESET ROLE');}
  equal(await scalar('SELECT state FROM drive_notification_private.outbox WHERE id=$1',[t.outboxId]),'delivered','exact signed receipt drives delivery');
  equal(await scalar('SELECT NOT send_enabled AND NOT capture_enabled FROM drive_notification_private.settings'),true,'delivery closes both gates');
  equal(await scalar('SELECT stopped_at IS NOT NULL FROM drive_notification_private.customer_authorizations WHERE id=$1',[t.authorization_id]),true,'durable authorization stop');
  equal(await snapshot(t.outboxId),old,'all old rows unchanged');
 }
 for(const kind of ['consent','phone','language','owner','country','state','version','trip','quote','category','expiry','kill','budget']) {
  const {t}=await fixture(kind==='quote'?'confirm':'created');const row=await claim(t);assert.ok(row);checks++;
  if(kind==='consent')await db.query('UPDATE drive_notification_private.subscriptions SET enabled=false WHERE user_id=$1',[customer]);
  if(kind==='phone')await db.query("UPDATE drive_notification_private.subscriptions SET phone='+10000000099' WHERE user_id=$1",[customer]);
  if(kind==='language')await db.query("UPDATE drive_notification_private.subscriptions SET language='en' WHERE user_id=$1",[customer]);
  if(kind==='owner')await db.query('UPDATE public.marketplace_requests SET user_id=$2 WHERE id=$1',[t.requestId,other]);
  if(kind==='country')await db.query("UPDATE public.drive_request_context SET country='SA' WHERE request_id=$1",[t.requestId]);
  if(kind==='state')await db.query("UPDATE public.marketplace_requests SET status='declined' WHERE id=$1",[t.requestId]);
  if(kind==='version')await db.query('UPDATE public.drive_request_context SET version=version+1 WHERE request_id=$1',[t.requestId]);
  if(kind==='trip')await db.query("UPDATE public.marketplace_requests SET requested_for=clock_timestamp()-interval '1 second' WHERE id=$1",[t.requestId]);
  if(kind==='quote')await db.query("UPDATE public.marketplace_requests SET quote_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[t.requestId]);
  if(kind==='category')await db.exec('UPDATE drive_notification_private.settings SET customer_actions=ARRAY[]::text[]');
  if(kind==='expiry'){await db.query("UPDATE drive_notification_private.customer_authorizations SET started_at=clock_timestamp()-interval '9 minutes',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[t.authorization_id]);await db.query("UPDATE drive_notification_private.execution_windows SET started_at=clock_timestamp()-interval '9 minutes',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[t.windowId]);}
  if(kind==='kill')await db.exec('UPDATE drive_notification_private.settings SET send_enabled=false');
  if(kind==='budget')await db.exec('UPDATE drive_notification_private.settings SET daily_limit=1,budget_used=1');
  equal(await begin(row),false,kind+' changed after claim blocks intent');equal(await scalar('SELECT attempts FROM drive_notification_private.outbox WHERE id=$1',[t.outboxId]),0,kind+' no attempt consumed');
 }
 const {t:wrong}=await fixture();const before=await snapshot(wrong.outboxId);
 for(const args of [[wrong.requestId,other,customer,wrong.category,'ar'],[wrong.requestId,wrong.outboxId,other,wrong.category,'ar'],[wrong.requestId,wrong.outboxId,customer,'customer.review','ar'],[wrong.requestId,wrong.outboxId,customer,wrong.category,'en']])equal(await service('SELECT public.claim_kapso_drive_whatsapp_target($1,$2,$3,$4,$5)',args),null,'mismatched target denied');
 equal(await snapshot(wrong.outboxId),before,'no old queue fallback');
 const {t:unknown}=await fixture();const {config}=configFor('created','ar');const count=sends;
 equal(await run(unknown,config,async()=>{sends++;throw new Error('SYNTHETIC_RESPONSE_LOSS');}),'unknown','uncertain result explicit');equal(await run(unknown,config,fakeFor(unknown)),'idle','unknown no resend');equal(sends,count+1,'unknown one stub call only');
 const {t:stopped,fire}=await fixture('created','ar',false);await service('SELECT public.stop_kapso_customer_notification($1)',[stopped.authorization_id]);await db.exec('UPDATE drive_notification_private.settings SET capture_enabled=true,send_enabled=true');await fire();equal(stopped.windowId,null,'stopped pre-event approval never captures');
 const {t:disabled,fire:fireDisabled}=await fixture('created','ar',false);await fireDisabled();equal(disabled.windowId,null,'capture gate OFF prevents natural event capture');await stop();await assert.rejects(arm(disabled.reference,'created','ar',0),/INELIGIBLE_CUSTOMER_APPROVAL/);checks++;
 const {t:rollback,fire:fireRollback}=await fixture('created','ar',false);
 await db.exec('UPDATE drive_notification_private.settings SET capture_enabled=true,send_enabled=true');
 await db.exec('BEGIN');
 await fireRollback();assert.ok(rollback.windowId);checks++;await db.exec('ROLLBACK');
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox WHERE id=$1',[rollback.outboxId]),0,'failed natural transaction rolls back outbox');
 equal(await scalar('SELECT event_id IS NULL AND window_id IS NULL FROM drive_notification_private.customer_authorizations WHERE id=$1',[rollback.authorization_id]),true,'failed transaction does not consume approval');
 await fireRollback();assert.ok(rollback.windowId);checks++;
 const oldAuthorization=rollback.authorization_id;
 const {t:preExpiry,fire:firePreExpiry}=await fixture('created','ar',false);
 await db.query("UPDATE drive_notification_private.customer_authorizations SET started_at=clock_timestamp()-interval '9 minutes',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[preExpiry.authorization_id]);
 await db.exec('UPDATE drive_notification_private.settings SET capture_enabled=true,send_enabled=true');await firePreExpiry();equal(preExpiry.windowId,null,'expired approval cannot capture');
 assert.ok(await service('SELECT public.expire_kapso_drive_whatsapp_window()'));checks++;
 equal(await scalar('SELECT NOT capture_enabled AND NOT send_enabled FROM drive_notification_private.settings'),true,'watchdog closes pre-event expiry');
 const {t:race}=await fixture();
 await service('SELECT public.stop_kapso_customer_notification($1)',[oldAuthorization]);
 equal(await scalar('SELECT capture_enabled AND send_enabled FROM drive_notification_private.settings'),true,'late stop of old approval cannot stop a newer approval');
 const queryLease=await claim(race);assert.ok(queryLease);checks++;
 equal(await service('SELECT public.begin_kapso_drive_whatsapp_provider_query($1,$2,$3)',[queryLease.id,queryLease.token,sender]),false,'customer intent cannot use query RPC');
 await stop();
 const {t:concurrent}=await fixture();const a=await connectPeer(),b=await connectPeer();
 try {await a.query('SET ROLE service_role');await b.query('SET ROLE service_role');const results=await Promise.all([a.query('SELECT public.claim_kapso_drive_whatsapp_target($1,$2,$3,$4,$5) AS result',targetArgs(concurrent)),b.query('SELECT public.claim_kapso_drive_whatsapp_target($1,$2,$3,$4,$5) AS result',targetArgs(concurrent))]);equal(results.filter(x=>x.rows[0].result!==null).length,1,'real concurrent workers one claim');const row=results.find(x=>x.rows[0].result).rows[0].result;const starts=await Promise.all([a.query('SELECT public.begin_kapso_drive_whatsapp($1,$2,$3) AS result',[row.id,row.token,sender]),b.query('SELECT public.begin_kapso_drive_whatsapp($1,$2,$3) AS result',[row.id,row.token,sender])]);equal(starts.filter(x=>x.rows[0].result).length,1,'real concurrent workers one intent');}finally{await a.end();await b.end();}
 await stop();await db.exec("UPDATE drive_notification_private.settings SET dispatch_mode='general',send_enabled=true");equal(await service("SELECT public.claim_kapso_drive_whatsapp(ARRAY['customer.created.ar','customer.confirm.ar','customer.created.en','customer.review.ar','customer.review.en','customer.confirm.en','customer.decline.ar','customer.decline.en','customer.customer_accept.ar','customer.customer_accept.en'])"),null,'general worker cannot claim/reclaim any bounded customer row');
 // Regression on the INSTALLED new migration, not only its predecessor. Capture
 // Operations through the natural shared trigger, never a fabricated outbox row.
 await stop();
 await db.query("UPDATE drive_notification_private.settings SET dispatch_mode='general',capture_enabled=true,operations_created_enabled=true,operations_recipient_user_id=$1,operations_template_languages=ARRAY['ar'],customer_actions=ARRAY[]::text[]",[operations]);
 const opReference=(await request('bounded-operations-regression')).reference;const opRequestId=await requestId(opReference);
 const opOutbox=await scalar("SELECT id FROM drive_notification_private.outbox WHERE request_id=$1 AND audience='operations'",[opRequestId]);assert.ok(opOutbox);checks++;
 await db.exec("UPDATE drive_notification_private.settings SET capture_enabled=false,dispatch_mode='target_only',active_window_id=NULL");
 const opWindow=await service("SELECT public.open_kapso_drive_whatsapp_window($1,$2,$3,'operations.created','ar',$4,$5,'SYNTHETIC-OPERATIONS-REGRESSION',clock_timestamp()+interval '5 minutes')",[opRequestId,opOutbox,operations,sender,webhook]);assert.ok(opWindow);checks++;
 await db.exec('UPDATE drive_notification_private.settings SET send_enabled=true');
 const opClaim=await service("SELECT public.claim_kapso_drive_whatsapp_target($1,$2,$3,'operations.created','ar')",[opRequestId,opOutbox,operations]);assert.ok(opClaim);checks++;
 equal(await begin(opClaim),true,'existing Operations webhook durable intent survives new wrappers');
 equal(await service("SELECT public.finish_drive_whatsapp($1,$2,'accepted','wamid.OPERATIONS_REGRESSION',NULL)",[opClaim.id,opClaim.token]),true,'Operations acceptance retains shared finish');
 equal(await service("SELECT public.ingest_kapso_drive_whatsapp_receipt('wamid.OPERATIONS_REGRESSION',$1,'+10000000003','delivered',NULL,NULL)",[sender]),true,'Operations exact receipt survives new stop wrapper');
 equal(await scalar('SELECT state FROM drive_notification_private.outbox WHERE id=$1',[opOutbox]),'delivered','Operations not regressed');
 for(const role of ['anon','authenticated'])for(const sig of ['public.arm_kapso_customer_notification(text,uuid,text,text,text,integer,text,uuid,text,timestamptz)','public.stop_kapso_customer_notification(uuid)'])equal(await scalar("SELECT has_function_privilege($1,$2,'EXECUTE')",[role,sig]),false,role+' denied privileged RPC');
 for(const role of ['anon','authenticated','service_role'])for(const privilege of ['INSERT','UPDATE','DELETE'])equal(await scalar("SELECT has_table_privilege($1,'drive_notification_private.customer_authorizations',$2)",[role,privilege]),false,role+' no direct '+privilege+' approval/event binding');
 equal(await scalar("SELECT relrowsecurity FROM pg_class WHERE oid='drive_notification_private.customer_authorizations'::regclass"),true,'private approval RLS retained');
 await stop();
 console.log('PASS '+checks+' bounded customer PostgreSQL assertions; 5 events x AR/EN; real peers; '+sends+' synthetic provider calls; zero external I/O');
 return checks;
}
