// Real disposable PostgreSQL only; all outbound transport is injected synthetic I/O.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';
function load(file,deps={}) {
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {exports,Buffer,URL,URLSearchParams,Request,Response,AbortSignal,AbortController,setTimeout,clearTimeout,fetch:()=>assert.fail('External I/O forbidden'),require(n){if(n==='server-only')return{};if(n==='node:crypto')return crypto;if(n in deps)return deps[n];throw Error(n);}});return exports;
}
export async function runContinuousAcceptance({db,connectPeer,request,requestId,asUser,operations,customer,other}) {
 assert.equal(typeof connectPeer,'function');let checks=0,seq=0,sends=0,active=null;
 const equal=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
 const scalar=async(sql,args=[],client=db)=>Object.values((await client.query(sql,args)).rows[0])[0];
 const service=async(sql,args=[],client=db)=>{await client.query('SET ROLE service_role');try{return await scalar(sql,args,client);}finally{await client.query('RESET ROLE');}};
 const denied=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
 await db.exec(fs.readFileSync('supabase/migrations/20261026204930_task166_continuous_future_events.sql','utf8'));
 equal(await scalar('SELECT send_enabled OR capture_enabled FROM drive_notification_private.settings'),false,'source install does not activate');
 const sender='10000000000166',webhook='00000000-0000-4000-8000-000000000888';
 const customerSub=await scalar("INSERT INTO drive_notification_private.subscriptions(user_id,audience,country,phone,language,consent_reference,verified_at,enabled) VALUES($1,'customer','EG','+10000000001','ar','SYNTHETIC-CONTINUOUS-CONSENT',clock_timestamp(),true) RETURNING id",[customer]);
 const opsSub=await scalar("SELECT id FROM drive_notification_private.subscriptions WHERE user_id=$1 AND audience='operations'",[operations]);
 const common=load('lib/notifications/drive-whatsapp.ts'),api=load('lib/notifications/kapso-drive-whatsapp.ts',{'./drive-whatsapp':common});
 const template=language=>({name:'synthetic_continuous_created',languageCode:language==='ar'?'ar':'en_US'});
 const maps=language=>Object.fromEntries(['customer','operations'].map(a=>[a+'.created.'+language,template(language)]));
 const prepare=(language='ar',limit=100,scopes=[{subscriptionId:customerSub,action:'created'},{subscriptionId:opsSub,action:'created'}],approval='SYNTHETIC-CONTINUOUS-'+(++seq),client=db)=>service('SELECT public.prepare_kapso_continuous_service($1,$2,$3,$4,$5,$6)',[JSON.stringify(scopes),sender,webhook,maps(language),approval,limit],client);
 const activate=id=>service('SELECT public.activate_kapso_continuous_service($1,$2)',[id,active]);
 const fresh=async(language='ar',limit=100)=>{
  await db.exec("UPDATE drive_notification_private.settings SET send_enabled=false,capture_enabled=false,daily_limit=100");
  await db.query("UPDATE drive_notification_private.subscriptions SET enabled=true,language=$1,consent_reference='SYNTHETIC-CONTINUOUS-CONSENT',verified_at=clock_timestamp(),phone=CASE audience WHEN 'customer' THEN '+10000000001' ELSE '+10000000003' END WHERE id IN($2,$3)",[language,customerSub,opsSub]);
  await db.query("UPDATE public.profiles SET status='active',deleted_at=NULL WHERE id IN($1,$2)",[customer,operations]);
  await db.query("UPDATE public.team_access_grants SET status='active',country_scope=ARRAY['EG'] WHERE invited_user_id=$1",[operations]);
  const id=await prepare(language,limit);const stamp=await activate(id);active=id;
  equal(await service('SELECT public.activate_kapso_continuous_service($1,$1)',[id]),stamp,'activation retry does not renew generation');
  await db.exec('UPDATE drive_notification_private.settings SET send_enabled=true,capture_enabled=true');
  return id;
 };
 const claim=(language='ar',client=db)=>service('SELECT public.claim_kapso_continuous($1)',[maps(language)],client);
 const begin=(row,language='ar',client=db)=>service('SELECT public.begin_kapso_continuous($1,$2,$3,$4)',[row.id,row.token,sender,template(language)],client);
 const count=async id=>scalar('SELECT count(*)::int FROM drive_notification_private.outbox WHERE request_id=$1',[id]);
 const created=async label=>{const key='continuous-'+label+'-'+(++seq);const r=await request(key);return{id:await requestId(r.reference),reference:r.reference,key};};
 const signatures={claim_kapso_continuous:['p_templates'],begin_kapso_continuous:['p_id','p_token','p_sender','p_template'],finish_drive_whatsapp:['p_id','p_token','p_outcome','p_sid','p_error'],ingest_kapso_drive_whatsapp_receipt:['p_sid','p_phone_number_id','p_phone','p_state','p_error','p_delivery_key_hash']};
 const store={async rpc(name,args={}){assert.ok(signatures[name],'closed delta RPC map');try{return{data:await service('SELECT public.'+name+'('+signatures[name].map((_,i)=>'$'+(i+1)).join(',')+')',signatures[name].map(k=>args[k])),error:null};}catch(error){return{data:null,error};}}};
 const env=language=>({DIR3COM_WHATSAPP_ENABLED:'true',DIR3COM_WHATSAPP_DISPATCH_MODE:'continuous',DIR3COM_WHATSAPP_CATEGORIES:'customer.created,operations.created',KAPSO_API_KEY:'SYNTHETIC-NOT-A-REAL-KEY',KAPSO_PHONE_NUMBER_ID:sender,KAPSO_WEBHOOK_SECRET:'SYNTHETIC-CONTINUOUS-WEBHOOK-000000000',DIR3COM_WHATSAPP_WORKER_SECRET:'SYNTHETIC-CONTINUOUS-WORKER-0000000000',DIR3COM_WHATSAPP_SITE_URL:'https://qa.example.invalid',DIR3COM_WHATSAPP_KAPSO_TEMPLATES:JSON.stringify(maps(language))});
 const signed=async(sid,phone,language='ar')=>{
  const body=JSON.stringify({phone_number_id:sender,message:{id:sid,to:phone.slice(1),kapso:{status:'delivered',direction:'outbound'}}});
  return api.receiveKapsoReceipt(new Request('https://qa.example.invalid/api/webhooks/kapso/drive-whatsapp',{method:'POST',headers:{'content-type':'application/json','x-webhook-signature':crypto.createHmac('sha256',env(language).KAPSO_WEBHOOK_SECRET).update(body).digest('hex')},body}),env(language),()=>store);
 };
 const send=async(language='ar',early=false)=>api.dispatchKapsoContinuous(store,api.kapsoConfig(env(language)),async(url,options)=>{
  sends++;equal(url,'https://api.kapso.ai/meta/whatsapp/v24.0/'+sender+'/messages','existing provider adapter endpoint');
  const body=JSON.parse(options.body);equal(body.template.name,template(language).name,'bound template');
  equal(body.template.language.code,template(language).languageCode,'AR/EN template language');
  assert.match(body.template.components[0].parameters[1].text,/^https:\/\/qa\.example\.invalid\/(my-requests\/REQ-[A-F0-9]+\/drive|admin\/operations\/drive)\?language=(ar|en)$/);checks++;
  const sid='wamid.synthetic_continuous_'+sends;
  if(early)equal((await signed(sid,'+'+body.to,language)).status,200,'early signed receipt durably acknowledged');
  return new Response(JSON.stringify({messaging_product:'whatsapp',contacts:[{input:body.to,wa_id:body.to}],messages:[{id:sid}]}),{status:200});
 });
 const before=await created('before-activation');equal(await count(before.id),0,'no capture before explicit activation');
 await db.query('UPDATE drive_notification_private.subscriptions SET enabled=false WHERE id=$1',[customerSub]);
 await denied(()=>prepare(),/INELIGIBLE_CONTINUOUS_SCOPE/);
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.continuous_services'),0,'invalid consent preparation atomic');
 await db.query('UPDATE drive_notification_private.subscriptions SET enabled=true WHERE id=$1',[customerSub]);
 await denied(()=>asUser(customer,'SELECT public.prepare_kapso_continuous_service($1,$2,$3,$4,$5,$6)',[JSON.stringify([{subscriptionId:customerSub,action:'created'}]),sender,webhook,{'customer.created.ar':template('ar')},'SYNTHETIC-USER-DENIED',1]),/permission|SERVICE_REQUIRED/i);
 const draftApproval='SYNTHETIC-PREPARE-IDEMPOTENCY';
 const draft=await prepare('ar',20,undefined,draftApproval);
 equal(await prepare('ar',20,[{subscriptionId:opsSub,action:'created'},{subscriptionId:customerSub,action:'created'}],draftApproval),draft,'reordered exact scope preparation converges');
 await denied(()=>prepare('ar',21,undefined,draftApproval),/CONTINUOUS_APPROVAL_CONFLICT/);
 const draftCount=await scalar('SELECT count(*)::int FROM drive_notification_private.continuous_services');
 await denied(()=>prepare('ar',20,[{subscriptionId:customerSub,action:'created'},{subscriptionId:customerSub,action:'created'}]),/duplicate|unique/i);
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.continuous_services'),draftCount,'duplicate scope preparation all-or-nothing');
 // Real bounded RPC chain in this disposable DB only, retained as an old window for stop isolation.
 await db.exec("UPDATE drive_notification_private.settings SET daily_limit=100");
 const oldNotice=await service("SELECT public.prepare_kapso_current_state_notice($1,0,'request_submitted',$2,$3,$4,$5,$6,$7,clock_timestamp()+interval '4 minutes')",[before.id,customerSub,opsSub,sender,webhook,{customer:template('ar'),operations:template('ar')},'SYNTHETIC-OLD-NOTICE']);
 const oldWindow=await service("SELECT public.open_kapso_current_state_window($1,'customer')",[oldNotice.notice_id]);
 const oldTarget=oldNotice.targets.find(t=>t.category==='customer.current_state');assert.ok(oldTarget);checks++;
 await db.exec('UPDATE drive_notification_private.settings SET send_enabled=true');
 const oldRow=await service('SELECT public.claim_kapso_drive_whatsapp_target($1,$2,$3,$4,$5)',[oldTarget.requestId,oldTarget.outboxId,oldTarget.recipientUserId,oldTarget.category,oldTarget.language]);
 equal(await service('SELECT public.begin_kapso_current_state_notice($1,$2,$3,$4)',[oldRow.id,oldRow.token,sender,template('ar')]),true,'historical bounded fixture durable intent');
 equal(await service("SELECT public.finish_drive_whatsapp($1,$2,'accepted',$3,NULL)",[oldRow.id,oldRow.token,'wamid.synthetic_history_notice']),true,'historical bounded fixture accepted only');
 await service('SELECT public.stop_kapso_current_state_notice($1)',[oldNotice.notice_id]);
 await fresh();equal(await count(before.id),2,'activation adds no lifecycle backfill to the two explicit old notice rows');
 equal(await service("SELECT public.ingest_kapso_drive_whatsapp_receipt($1,$2,$3,'delivered',NULL,NULL)",['wamid.synthetic_history_notice',sender,'+10000000001']),true,'late old notice receipt still recorded');
 equal(await scalar('SELECT send_enabled AND capture_enabled FROM drive_notification_private.settings'),true,'late bounded completion cannot shut down continuous service');
 equal(await scalar('SELECT deactivation_required FROM drive_notification_private.execution_windows WHERE id=$1',[oldWindow]),false,'bounded stop cannot request deactivation of the active shared webhook');
 await service('SELECT public.stop_kapso_current_state_notice($1)',[oldNotice.notice_id]);
 equal(await scalar('SELECT send_enabled AND capture_enabled FROM drive_notification_private.settings'),true,'idempotent old notice stop preserves active service');
 equal(await scalar('SELECT capture_enabled AND send_enabled FROM drive_notification_private.settings'),true,'fixture explicitly enabled, not migration');
 const one=await created('ar');equal(await count(one.id),2,'new natural event captures exact two consented recipients');
 equal((await request(one.key)).reference,one.reference,'actual request retry returns the same request');
 equal(await count(one.id),2,'actual request retry cannot duplicate captured notifications');
 const eventsBefore=await scalar('SELECT count(*)::int FROM public.drive_request_events WHERE request_id=$1',[one.id]);
 equal(await send('ar',true),'accepted','existing transport accepted, not delivery shortcut');
 equal(await scalar("SELECT count(*)::int FROM drive_notification_private.outbox WHERE request_id=$1 AND state='delivered'",[one.id]),1,'exact WAMID early receipt matched after finish');
 equal(await scalar('SELECT send_enabled AND capture_enabled FROM drive_notification_private.settings'),true,'completion leaves continuous service running');
 equal(await send('ar',true),'accepted','second party uses same continuous service');
 equal(await scalar('SELECT count(*)::int FROM public.drive_request_events WHERE request_id=$1',[one.id]),eventsBefore,'no fake lifecycle event');
 const next=await created('next');equal(await count(next.id),2,'next independent event still captures without reopening window');
 const row=await claim();assert.ok(row);checks++;
 equal(await service('SELECT public.begin_kapso_continuous($1,$2,$3,$4)',[row.id,row.token,sender,{name:'wrong_template',languageCode:'ar'}]),false,'wrong configured template before network');
 equal(await scalar('SELECT attempts FROM drive_notification_private.outbox WHERE id=$1',[row.id]),0,'rejected template consumes no attempt');
 await fresh('en');const en=await created('en');equal(await count(en.id),2,'English future event two parties');
 equal(await send('en',true),'accepted','English delivered path through actual TS adapter');
 equal(await send('en',true),'accepted','English second party');
 equal(await scalar('SELECT send_enabled AND capture_enabled FROM drive_notification_private.settings'),true,'English completion does not shut down service');
 await db.query("UPDATE drive_notification_private.continuous_services SET activated_at=clock_timestamp()-interval '20 minutes' WHERE id=$1",[active]);
 const aged=await created('no-nine-minute-ttl');equal(await count(aged.id),2,'service remains active after bounded nine-minute age, using an aged fixture clock');
 const clockRow=await claim('en');equal(await begin(clockRow,'en'),true,'service age is not an intent expiry');
 await service("SELECT public.finish_drive_whatsapp($1,$2,'unknown',NULL,'SEND_OUTCOME_UNKNOWN')",[clockRow.id,clockRow.token]);
 const oldTx=await connectPeer();let oldTxEvent;
 try{
  await oldTx.query('BEGIN');await oldTx.query('SELECT transaction_timestamp()');
  await fresh();
  oldTxEvent=await scalar("INSERT INTO public.drive_request_events(request_id,actor_user_id,country,action,new_status) VALUES($1,$2,'EG','created','request_submitted') RETURNING id",[one.id,customer],oldTx);
  await oldTx.query('COMMIT');
 }finally{await oldTx.query('ROLLBACK');await oldTx.end();}
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox WHERE event_id=$1',[oldTxEvent]),0,'real pre-activation transaction cannot produce a catch-up event');
 await fresh();const revoked=await created('revocation');const leased=await claim();
 await db.query('UPDATE drive_notification_private.subscriptions SET enabled=false WHERE id=(SELECT subscription_id FROM drive_notification_private.outbox WHERE id=$1)',[leased.id]);
 equal(await begin(leased),false,'revoked consent cannot begin');
 equal(await scalar('SELECT attempts FROM drive_notification_private.outbox WHERE id=$1',[leased.id]),0,'revoked scope no attempt');
 equal(await scalar("SELECT count(*)::int FROM drive_notification_private.outbox WHERE request_id=$1 AND state='suppressed'",[revoked.id]),1,'invalid target suppressed locally, service not disabled');
 equal(await scalar('SELECT send_enabled FROM drive_notification_private.settings'),true,'revocation never switches off other authorized recipients');
 await fresh();const noRevival=await created('no-revival');
 await db.query('UPDATE drive_notification_private.subscriptions SET enabled=false WHERE id=$1',[customerSub]);
 await db.query('UPDATE drive_notification_private.subscriptions SET enabled=true WHERE id=$1',[customerSub]);
 equal(await scalar("SELECT drive_notification_private.continuous_valid(id) FROM drive_notification_private.outbox WHERE request_id=$1 AND audience='customer'",[noRevival.id]),false,'re-enable flag alone cannot resurrect a previously revoked event');
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.continuous_scopes WHERE service_id=$1 AND subscription_id=$2 AND stopped_at IS NOT NULL',[active,customerSub]),1,'withdrawal is durable without a worker observing it');
 for(const [label,change] of [
  ['consent',"consent_reference='SYNTHETIC-REPLACED-CONSENT'"],['verification',"verified_at=clock_timestamp()"],
  ['phone',"phone='+10000000009'"],['language',"language='en'"]]) {
  await fresh();await created('binding-'+label);const claimed=[await claim(),await claim()];const customerRow=claimed.find(x=>x.audience==='customer');assert.ok(customerRow);checks++;
  await db.query('UPDATE drive_notification_private.subscriptions SET '+change+' WHERE id=$1',[customerSub]);
  equal(await begin(customerRow),false,label+' snapshot changed after claim, no send');
  equal(await scalar('SELECT attempts FROM drive_notification_private.outbox WHERE id=$1',[customerRow.id]),0,label+' mismatch consumes no budget intent');
 }
 await fresh();const versionRequest=await created('version');const versionRow=await claim();
 await db.query('UPDATE public.drive_request_context SET version=version+1 WHERE request_id=$1',[versionRequest.id]);
 equal(await begin(versionRow),false,'same status with newer request version invalidates old event');
 await fresh();await created('grant-revocation');const grantRows=[await claim(),await claim()],opsRow=grantRows.find(x=>x.audience==='operations');assert.ok(opsRow);checks++;
 await db.query("UPDATE public.team_access_grants SET status='inactive' WHERE invited_user_id=$1",[operations]);
 equal(await begin(opsRow),false,'Operations authority revoked after claim fails closed');
 equal(await scalar('SELECT attempts FROM drive_notification_private.outbox WHERE id=$1',[opsRow.id]),0,'grant revocation consumes no intent');
 await fresh();await created('worker-race');const a=await connectPeer(),b=await connectPeer();
 try{
  const claims=await Promise.all([claim('ar',a),claim('ar',b)]);equal(new Set(claims.map(x=>x.id)).size,2,'real concurrent workers distinct rows');
  const starts=await Promise.all([begin(claims[0],'ar',a),begin(claims[0],'ar',b)]);equal(starts.filter(Boolean).length,1,'two real peers one durable intent');
  equal(await service("SELECT public.finish_drive_whatsapp($1,$2,'unknown',NULL,'SEND_OUTCOME_UNKNOWN')",[claims[0].id,claims[0].token]),true,'unknown persisted');
  equal(await begin(claims[0]),false,'unknown never begins again');
  await denied(()=>service("SELECT public.finish_drive_whatsapp($1,$2,'retry',NULL,'SYNTHETIC_RETRY')",[claims[0].id,claims[0].token]),/RETRY_FORBIDDEN/);
  equal(await service('SELECT public.begin_drive_whatsapp($1,$2)',[claims[1].id,claims[1].token]),false,'Twilio direct begin denied');
  equal(await service('SELECT public.begin_kapso_drive_whatsapp($1,$2,$3)',[claims[1].id,claims[1].token,sender]),false,'ordinary Kapso begin denied');
  equal(await service('SELECT public.begin_kapso_drive_whatsapp_provider_query($1,$2,$3)',[claims[1].id,claims[1].token,sender]),false,'provider query cannot repurpose continuous row');
 }finally{await a.end();await b.end();}
 await fresh();const stoppedGeneration=active;const replacementA=await prepare(),replacementB=await prepare();
 const x=await connectPeer(),y=await connectPeer();
 try{
  const results=await Promise.allSettled([service('SELECT public.activate_kapso_continuous_service($1,$2)',[replacementA,stoppedGeneration],x),service('SELECT public.activate_kapso_continuous_service($1,$2)',[replacementB,stoppedGeneration],y)]);
  equal(results.filter(r=>r.status==='fulfilled').length,1,'real concurrent generation replacement uses expected-active CAS');
  equal(results.filter(r=>r.status==='rejected'&&/CONTINUOUS_ACTIVATION_CONFLICT/.test(String(r.reason))).length,1,'losing replacement fails closed');
  active=await scalar('SELECT active_continuous_service_id FROM drive_notification_private.settings');
 }finally{await x.end();await y.end();}
 equal(await scalar('SELECT send_enabled AND capture_enabled FROM drive_notification_private.settings'),true,'atomic generation replacement does not disable service');
 await fresh();const blocked=await created('lock-race');const lockRow=await claim(),peer=await connectPeer();
 try{await peer.query('BEGIN');await peer.query('SELECT 1 FROM public.marketplace_requests WHERE id=$1 FOR UPDATE',[blocked.id]);equal(await begin(lockRow),false,'NOWAIT lifecycle conflict fails closed without deadlock');equal(await scalar('SELECT attempts FROM drive_notification_private.outbox WHERE id=$1',[lockRow.id]),0,'lock conflict no attempt');}finally{await peer.query('ROLLBACK');await peer.end();}
 await fresh();await created('kill');const killRow=await claim();await db.exec('UPDATE drive_notification_private.settings SET send_enabled=false');
 equal(await begin(killRow),false,'real global kill switch remains');equal(await claim(),null,'OFF blocks claims');
 equal(await service('SELECT public.claim_kapso_drive_whatsapp_target($1,$2,$3,$4,$5)',[(await scalar('SELECT request_id FROM drive_notification_private.outbox WHERE id=$1',[killRow.id])),killRow.id,await scalar('SELECT recipient_user_id FROM drive_notification_private.outbox WHERE id=$1',[killRow.id]),killRow.audience+'.'+killRow.action,killRow.language]),null,'bounded target path cannot claim a continuous row');
 await fresh('ar',1);await created('service-budget');const budgetOne=await claim();equal(await begin(budgetOne),true,'one approved service daily slot');
 await service("SELECT public.finish_drive_whatsapp($1,$2,'unknown',NULL,'SEND_OUTCOME_UNKNOWN')",[budgetOne.id,budgetOne.token]);
 const budgetTwo=await claim();equal(await begin(budgetTwo),false,'explicit service count cap');equal(await scalar('SELECT attempts FROM drive_notification_private.outbox WHERE id=$1',[budgetTwo.id]),0,'cap denial no second intent');
 equal(await scalar('SELECT send_enabled FROM drive_notification_private.settings'),true,'budget cap does not shut service down');
 await fresh();await created('intent-expiry');const expiring=await claim();
 await db.query("UPDATE drive_notification_private.outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[expiring.id]);
 equal(await begin(expiring),false,'expired pre-send lease cannot begin');
 equal(await scalar('SELECT attempts FROM drive_notification_private.outbox WHERE id=$1',[expiring.id]),0,'lease expiry no attempt');
 await fresh();await created('global-budget');const globalRow=await claim();await db.exec("UPDATE drive_notification_private.settings SET budget_day=(clock_timestamp() AT TIME ZONE 'UTC')::date,budget_used=daily_limit");
 equal(await begin(globalRow),false,'existing shared global budget enforced');equal(await scalar('SELECT attempts FROM drive_notification_private.outbox WHERE id=$1',[globalRow.id]),0,'global exhaustion no attempt');
 const health=await service('SELECT public.kapso_continuous_health()');equal(health.serviceActive,true,'health active state');assert.ok(health.lastWorkerAt);checks++;
 equal(Object.keys(health).some(k=>/phone|recipient|reference|secret|token/i.test(k)),false,'health returns no contacts or credentials');
 const paused=active;equal(await service('SELECT public.stop_kapso_continuous_service($1)',[paused]),true,'explicit service stop');
 equal(await claim(),null,'stopped service cannot claim');await denied(()=>service('SELECT public.activate_kapso_continuous_service($1,$1)',[paused]),/INACTIVE_CONTINUOUS_SERVICE/);
 // Same phone but another owner never acquires this customer's scope.
 await fresh();const otherRequest=await request('continuous-other-owner',other,'+10000000001');const otherId=await requestId(otherRequest.reference);
 equal(await scalar("SELECT count(*)::int FROM drive_notification_private.outbox WHERE request_id=$1 AND audience='customer'",[otherId]),0,'cross-owner contact cannot match subscription');
 await db.query("UPDATE public.team_access_grants SET country_scope=ARRAY['SA'] WHERE invited_user_id=$1",[operations]);
 const country=await created('country');equal(await scalar("SELECT count(*)::int FROM drive_notification_private.outbox WHERE request_id=$1 AND audience='operations'",[country.id]),0,'foreign Operations country denied');
 for(const sig of ['prepare_kapso_continuous_service(jsonb,text,uuid,jsonb,text,integer)','activate_kapso_continuous_service(uuid,uuid)','claim_kapso_continuous(jsonb)','begin_kapso_continuous(uuid,uuid,text,jsonb)','stop_kapso_continuous_service(uuid)','kapso_continuous_health()']) {
  for(const role of ['anon','authenticated','service_role'])equal(await scalar('SELECT has_function_privilege($1,$2,\'EXECUTE\')',[role,'public.'+sig]),role==='service_role','RPC grants include PUBLIC inheritance');
  equal(await scalar("SELECT proconfig @> ARRAY['search_path=\"\"']::text[] FROM pg_proc WHERE oid=$1::regprocedure",['public.'+sig]),true,'fixed privileged search_path');
 }
 for(const name of ['continuous_services','continuous_scopes','continuous_receipt_inbox']) {
  equal(await scalar('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass',['drive_notification_private.'+name]),true,'private RLS');
  for(const permission of ['INSERT','UPDATE','DELETE'])equal(await scalar('SELECT has_table_privilege(\'service_role\',$1,$2)',['drive_notification_private.'+name,permission]),false,'no direct scope mutation');
 }
 for(const signature of ['continuous_valid(uuid)','capture_continuous_event()','revoke_continuous_scopes()','target_claim_before_continuous(uuid,uuid,uuid,text,text)','begin_before_continuous(uuid,uuid,text)','begin_generic_before_continuous(uuid,uuid)','query_begin_before_continuous(uuid,uuid,text)','ingest_before_continuous(text,text,text,text,text,text)','finish_before_continuous(uuid,uuid,text,text,text)','stop_before_continuous(uuid,text)']) {
  for(const role of ['anon','authenticated','service_role'])equal(await scalar('SELECT has_function_privilege($1,$2,\'EXECUTE\')',[role,'drive_notification_private.'+signature]),false,'private alias cannot bypass continuous authorization');
 }
 await db.exec("UPDATE drive_notification_private.settings SET dispatch_mode='general',send_enabled=true,capture_enabled=false");
 const beforeGeneral=await scalar('SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM drive_notification_private.outbox o WHERE continuous_scope_id IS NOT NULL');
 equal(await service("SELECT public.claim_kapso_drive_whatsapp(ARRAY['customer.created.ar','operations.created.ar'])"),null,'generic does not consume continuous backlog after mode switch');
 equal(await scalar('SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM drive_notification_private.outbox o WHERE continuous_scope_id IS NOT NULL'),beforeGeneral,'generic housekeeping leaves continuous history untouched');
 await db.exec('UPDATE drive_notification_private.settings SET capture_enabled=false,send_enabled=false');
 equal(await scalar('SELECT capture_enabled OR send_enabled FROM drive_notification_private.settings'),false,'own synthetic fixture OFF at disposal only, not production routine');
 console.log(`PASS ${checks} continuous PostgreSQL delta assertions; ${sends} synthetic transport calls; zero external I/O`);
 return checks;
}
