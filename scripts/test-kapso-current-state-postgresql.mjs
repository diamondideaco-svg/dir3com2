// Only invoked by the existing explicit disposable PostgreSQL scope. All provider calls are stubs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';
function load(file,deps={}) {
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {exports,Buffer,URL,URLSearchParams,Request,Response,AbortSignal,AbortController,setTimeout,clearTimeout,
 fetch:async()=>assert.fail('External provider I/O forbidden'),require(name){if(name==='server-only')return {};if(name==='node:crypto')return crypto;if(name in deps)return deps[name];throw Error(name);}});
 return exports;
}
export async function runCurrentStateAcceptance({db,connectPeer,request,requestId,asUser,operations,customer,other}) {
 assert.equal(typeof connectPeer,'function','Real independent PostgreSQL sessions required');
 let checks=0,seq=0,sends=0,current;
 const equal=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const service=async(sql,args=[],client=db)=>{await client.query('SET ROLE service_role');try{return Object.values((await client.query(sql,args)).rows[0])[0];}finally{await client.query('RESET ROLE');}};
 const denied=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
 await db.exec(fs.readFileSync('supabase/migrations/20261026191529_task166_current_state_notices.sql','utf8'));
 equal(await scalar('SELECT send_enabled OR capture_enabled FROM drive_notification_private.settings'),false,'source migration keeps gates OFF');
 for(const signature of ['prepare_kapso_current_state_notice(uuid,integer,text,uuid,uuid,text,uuid,jsonb,text,timestamptz)',
  'open_kapso_current_state_window(uuid,text)','begin_kapso_current_state_notice(uuid,uuid,text,jsonb)','stop_kapso_current_state_notice(uuid)']) {
  for(const role of ['anon','authenticated','service_role']) equal(await scalar('SELECT has_function_privilege($1,$2,\'EXECUTE\')',[role,'public.'+signature]),role==='service_role','effective public RPC grants including PUBLIC inheritance');
  equal(await scalar("SELECT prosecdef AND proconfig @> ARRAY['search_path=\"\"']::text[] FROM pg_proc WHERE oid=$1::regprocedure",['public.'+signature]),true,'fixed privileged search_path');
 }
 for(const table of ['current_state_notices','current_state_targets']) {
  equal(await scalar('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass',['drive_notification_private.'+table]),true,'private RLS enabled');
  for(const permission of ['INSERT','UPDATE','DELETE'])equal(await scalar('SELECT has_table_privilege(\'service_role\',$1,$2)',['drive_notification_private.'+table,permission]),false,'service cannot mutate private bindings directly');
 }
 for(const signature of ['current_state_valid(uuid)','current_state_template_valid(jsonb,text)','begin_before_current_state(uuid,uuid,text)',
  'begin_generic_before_current_state(uuid,uuid)','claim_before_current_state(uuid,uuid,uuid,text,text)','ingest_before_current_state(text,text,text,text,text,text)']) {
  equal(await scalar('SELECT has_function_privilege(\'service_role\',$1,\'EXECUTE\')',['drive_notification_private.'+signature]),false,'no direct legacy/private bypass');
 }
 const common=load('lib/notifications/drive-whatsapp.ts');
 const api=load('lib/notifications/kapso-drive-whatsapp.ts',{'./drive-whatsapp':common});
 const sender='10000000000166',webhook='00000000-0000-4000-8000-000000000777';
 const customerSub=await scalar("INSERT INTO drive_notification_private.subscriptions(user_id,audience,country,phone,language,consent_reference,verified_at,enabled) VALUES($1,'customer','EG','+10000000001','ar','SYNTHETIC-STATE-CONSENT',clock_timestamp(),false) RETURNING id",[customer]);
 const opsSub=await scalar("SELECT id FROM drive_notification_private.subscriptions WHERE user_id=$1 AND audience='operations'",[operations]);
 const otherSub=await scalar("INSERT INTO drive_notification_private.subscriptions(user_id,audience,country,phone,language,consent_reference,verified_at,enabled) VALUES($1,'customer','EG','+10000000002','ar','SYNTHETIC-OTHER-CONSENT',clock_timestamp(),true) RETURNING id",[other]);
 const templates=language=>({customer:{name:'synthetic_current_customer',languageCode:language==='ar'?'ar':'en_US'},operations:{name:'synthetic_current_operations',languageCode:language==='ar'?'ar':'en_US'}});
 const prepareSql='SELECT public.prepare_kapso_current_state_notice($1,0,\'request_submitted\',$2,$3,$4,$5,$6,$7,$8)';
 const argsFor=(f,approval='SYNTHETIC-STATE-'+(++seq))=>[f.id,customerSub,opsSub,sender,webhook,templates(f.language),approval,f.expiry];
 const stop=async()=>{if(current?.notice_id)await service('SELECT public.stop_kapso_current_state_notice($1)',[current.notice_id]);await db.exec("UPDATE drive_notification_private.settings SET send_enabled=false,capture_enabled=false,dispatch_mode='target_only'");};
 const fresh=async(language='ar')=>{
  await stop();
  await db.query("UPDATE drive_notification_private.subscriptions SET enabled=true,language=$1,phone=CASE audience WHEN 'customer' THEN '+10000000001' ELSE '+10000000003' END WHERE id IN($2,$3)",[language,customerSub,opsSub]);
  await db.query("UPDATE public.profiles SET status='active' WHERE id IN($1,$2)",[customer,operations]);
  await db.query("UPDATE public.team_access_grants SET status='active',country_scope=ARRAY['EG'] WHERE invited_user_id=$1",[operations]);
  await db.exec('UPDATE drive_notification_private.settings SET daily_limit=100');
  const created=await request('state-notice-'+(++seq));
  const id=await requestId(created.reference);
  const before=await scalar('SELECT jsonb_build_object(\'request\',to_jsonb(r),\'context\',to_jsonb(c),\'events\',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.drive_request_events e WHERE request_id=r.id)) FROM public.marketplace_requests r JOIN public.drive_request_context c ON c.request_id=r.id WHERE r.id=$1',[id]);
  return {id,language,before,expiry:new Date(Date.now()+240000).toISOString()};
 };
 const prepare=async f=>{current=await service(prepareSql,argsFor(f));return current;};
 const open=async(notice,audience)=>service('SELECT public.open_kapso_current_state_window($1,$2)',[notice.notice_id,audience]);
 const claim=target=>service('SELECT public.claim_kapso_drive_whatsapp_target($1,$2,$3,$4,$5)',[target.requestId,target.outboxId,target.recipientUserId,target.category,target.language]);
 const begin=(row,template)=>service('SELECT public.begin_kapso_current_state_notice($1,$2,$3,$4)',[row.id,row.token,sender,template]);
 const signatures={claim_kapso_drive_whatsapp_target:['p_request_id','p_outbox_id','p_recipient_user_id','p_category','p_language'],begin_kapso_current_state_notice:['p_id','p_token','p_phone_number_id','p_template'],finish_drive_whatsapp:['p_id','p_token','p_outcome','p_sid','p_error'],ingest_kapso_drive_whatsapp_receipt:['p_sid','p_phone_number_id','p_phone','p_state','p_error','p_delivery_key_hash']};
 const store={async rpc(name,args={}){const keys=signatures[name];assert.ok(keys,'Only scoped RPCs');try{return{data:await service('SELECT public.'+name+'('+keys.map((_,i)=>'$'+(i+1)).join(',')+')',keys.map(k=>args[k])),error:null};}catch(error){return{data:null,error};}}};
 const configFor=f=>{
  const map=Object.fromEntries(['customer','operations'].map(a=>[a+'.current_state.'+f.language,templates(f.language)[a]]));
  const env={DIR3COM_WHATSAPP_ENABLED:'true',DIR3COM_WHATSAPP_DISPATCH_MODE:'target_only',DIR3COM_WHATSAPP_CATEGORIES:'customer.current_state,operations.current_state',KAPSO_API_KEY:'SYNTHETIC-not-a-provider-key',KAPSO_PHONE_NUMBER_ID:sender,KAPSO_WEBHOOK_SECRET:'SYNTHETIC-WEBHOOK-000000000000000000000',DIR3COM_WHATSAPP_SITE_URL:'https://qa.example.invalid',DIR3COM_WHATSAPP_KAPSO_TEMPLATES:JSON.stringify(map)};
  const config=api.kapsoConfig(env);assert.ok(config);checks++;
  equal(api.kapsoConfig({...env,DIR3COM_WHATSAPP_DISPATCH_MODE:'general'}),null,'snapshot config cannot enable general');
  equal(api.kapsoConfig({...env,DIR3COM_WHATSAPP_DELIVERY_MODE:'provider_query'}),null,'snapshot cannot query provider');
  return config;
 };
 let f=await fresh();await db.query('UPDATE drive_notification_private.subscriptions SET enabled=false WHERE id=$1',[customerSub]);
 await denied(()=>service(prepareSql,argsFor(f)),/INELIGIBLE_STATE_NOTICE/);
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.current_state_notices'),0,'missing consent is atomic/no rows');
 await db.query('UPDATE drive_notification_private.subscriptions SET enabled=true WHERE id=$1',[customerSub]);
 await denied(()=>asUser(customer,prepareSql,argsFor(f)),/permission|SERVICE_REQUIRED/i);
 const wrongOwner=argsFor(f);wrongOwner[1]=otherSub;
 await denied(()=>service(prepareSql,wrongOwner),/INELIGIBLE_STATE_NOTICE/);
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.current_state_notices'),0,'wrong owner leaves no intent');
 current=await service(prepareSql,argsFor(f));equal(current.targets.length,2,'one row per party');
 const replay=await service(prepareSql,argsFor(f,'SYNTHETIC-DIFFERENT-APPROVAL'));
 equal(replay,current,'different approval ID cannot create duplicate');
 await denied(()=>service(prepareSql,[...argsFor(f).slice(0,3),'99999999999999',...argsFor(f).slice(4)]),/STATE_NOTICE_CONFLICT/);
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox WHERE request_id=$1',[f.id]),2,'exactly two shared outbox rows');
 equal(await scalar('SELECT jsonb_build_object(\'request\',to_jsonb(r),\'context\',to_jsonb(c),\'events\',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.drive_request_events e WHERE request_id=r.id)) FROM public.marketplace_requests r JOIN public.drive_request_context c ON c.request_id=r.id WHERE r.id=$1',[f.id]),f.before,'no lifecycle mutation or fabricated event');

 f=await fresh();const p1=await connectPeer(),p2=await connectPeer();
 try {
  const outcomes=await Promise.all([service(prepareSql,argsFor(f,'SYNTHETIC-RACE-ONE'),p1),service(prepareSql,argsFor(f,'SYNTHETIC-RACE-TWO'),p2)]);
  equal(outcomes[0],outcomes[1],'two real PG peers converge across approval IDs');current=outcomes[0];
  equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox WHERE request_id=$1',[f.id]),2,'concurrent prepare is one-per-party');
 } finally {await p1.end();await p2.end();}

 for(const language of ['ar','en']) {
  f=await fresh(language);const notice=await prepare(f),config=configFor(f);let previous;
  for(const audience of ['customer','operations']) {
   const target=notice.targets.find(x=>x.category===audience+'.current_state');const wid=await open(notice,audience);
   equal(await scalar('SELECT send_enabled OR capture_enabled FROM drive_notification_private.settings'),false,'opening never enables gates');
   await db.exec('UPDATE drive_notification_private.settings SET send_enabled=true');
   if(previous) {
    equal(await service("SELECT public.ingest_kapso_drive_whatsapp_receipt($1,$2,$3,'read',NULL,NULL)",previous),true,'late prior-window receipt is preserved');
    equal(await scalar('SELECT send_enabled FROM drive_notification_private.settings'),true,'late old receipt cannot stop newer target');
   }
   const stub=async(_url,options)=>{sends++;const body=JSON.parse(options.body);equal(body.to,audience==='customer'?'10000000001':'10000000003','exact synthetic party');equal(body.template.language.code,language==='ar'?'ar':'en_US','approved language');equal(body.template.components[0].parameters.map(x=>x.text),[target.reference??(await scalar('SELECT request_reference FROM public.marketplace_requests WHERE id=$1',[f.id])),'https://qa.example.invalid'+(audience==='customer'?'/my-requests/'+await scalar('SELECT request_reference FROM public.marketplace_requests WHERE id=$1',[f.id])+'/drive':'/admin/operations/drive')+'?language='+language],'truthful role link and reference only');return new Response(JSON.stringify({messaging_product:'whatsapp',contacts:[{input:body.to,wa_id:body.to}],messages:[{id:'wamid.STATE_'+sends}]}),{status:200});};
   equal(await api.dispatchKapsoTarget(store,config,target,stub),'accepted','acceptance is not delivery');
   equal(await scalar('SELECT state FROM drive_notification_private.outbox WHERE id=$1',[target.outboxId]),'accepted','only accepted after HTTP');
   equal(await api.dispatchKapsoTarget(store,config,target,async()=>assert.fail('resend prohibited')),'idle','accepted never resent');
   const sid=await scalar('SELECT provider_sid FROM drive_notification_private.outbox WHERE id=$1',[target.outboxId]);
   const phone=audience==='customer'?'+10000000001':'+10000000003';
   const raw=JSON.stringify({phone_number_id:sender,message:{id:sid,to:phone.slice(1),kapso:{direction:'outbound',status:'delivered'}}});
   const receiptRequest=signature=>new Request('https://qa.example.invalid/api/webhooks/kapso/drive-whatsapp',{method:'POST',headers:{'content-type':'application/json','x-webhook-signature':signature},body:raw});
   const receiptEnv={KAPSO_PHONE_NUMBER_ID:sender,KAPSO_WEBHOOK_SECRET:config.webhookSecret};
   equal((await api.receiveKapsoReceipt(receiptRequest('wrong-signature'),receiptEnv,()=>store)).status,403,'existing invalid-HMAC contract cannot publish delivery');
   equal(await scalar('SELECT state FROM drive_notification_private.outbox WHERE id=$1',[target.outboxId]),'accepted','rejected signature leaves acceptance unchanged');
   equal((await api.receiveKapsoReceipt(receiptRequest(crypto.createHmac('sha256',config.webhookSecret).update(raw).digest('hex')),receiptEnv,()=>store)).status,200,'actual signed webhook adapter to shared receipt RPC');
   equal(await scalar('SELECT state FROM drive_notification_private.outbox WHERE id=$1',[target.outboxId]),'delivered','delivery needs matching receipt');
   equal(await scalar('SELECT NOT send_enabled AND NOT capture_enabled FROM drive_notification_private.settings'),true,'delivery closes gates');
   equal(await scalar('SELECT stopped_at IS NOT NULL FROM drive_notification_private.execution_windows WHERE id=$1',[wid]),true,'durable stop');
   equal(await service('SELECT public.ingest_kapso_drive_whatsapp_receipt($1,$2,$3,\'read\',NULL,NULL)',[sid,sender,audience==='customer'?'+10000000001':'+10000000003']),true,'late exact-WAMID evidence without another send');
   previous=[sid,sender,phone];
  }
  equal(await scalar('SELECT stopped_at IS NOT NULL FROM drive_notification_private.current_state_notices WHERE id=$1',[notice.notice_id]),true,'both parties terminal');
 }

 for(const kind of ['consent','phone','language','profile','grant','country','version','status','expiry','template','budget']) {
  f=await fresh();const notice=await prepare(f),target=notice.targets.find(x=>x.category==='customer.current_state');
  const audience=kind==='grant'?'operations':'customer';const actual=notice.targets.find(x=>x.category===audience+'.current_state');
  await open(notice,audience);await db.exec('UPDATE drive_notification_private.settings SET send_enabled=true');const row=await claim(actual);assert.ok(row);checks++;
  if(kind==='consent')await db.query('UPDATE drive_notification_private.subscriptions SET enabled=false WHERE id=$1',[customerSub]);
  if(kind==='phone')await db.query("UPDATE drive_notification_private.subscriptions SET phone='+10000000999' WHERE id=$1",[customerSub]);
  if(kind==='language')await db.query("UPDATE drive_notification_private.subscriptions SET language='en' WHERE id=$1",[customerSub]);
  if(kind==='profile')await db.query("UPDATE public.profiles SET status='disabled' WHERE id=$1",[customer]);
  if(kind==='grant')await db.query("UPDATE public.team_access_grants SET status='revoked' WHERE invited_user_id=$1",[operations]);
  if(kind==='country')await db.query("UPDATE public.drive_request_context SET country='SA' WHERE request_id=$1",[f.id]);
  if(kind==='version')await db.query('UPDATE public.drive_request_context SET version=1 WHERE request_id=$1',[f.id]);
  if(kind==='status')await db.query("UPDATE public.marketplace_requests SET status='under_review' WHERE id=$1",[f.id]);
  if(kind==='expiry'){await db.query("UPDATE drive_notification_private.current_state_notices SET expires_at=started_at+interval '1 millisecond',started_at=clock_timestamp()-interval '1 minute' WHERE id=$1",[notice.notice_id]);await db.exec("UPDATE drive_notification_private.execution_windows SET expires_at=started_at+interval '1 millisecond',started_at=clock_timestamp()-interval '1 minute' WHERE id=(SELECT active_window_id FROM drive_notification_private.settings)");}
  if(kind==='budget')await db.exec('UPDATE drive_notification_private.settings SET daily_limit=1,budget_used=1,budget_day=(now() AT TIME ZONE \'UTC\')::date');
  const template=kind==='template'?{name:'wrong_template',languageCode:'ar'}:templates('ar')[audience];
  const budget=await scalar('SELECT budget_used FROM drive_notification_private.settings');
  equal(await begin(row,template),false,kind+' denied before network');
  equal(await scalar('SELECT attempts FROM drive_notification_private.outbox WHERE id=$1',[actual.outboxId]),0,kind+' consumes no attempt');
  equal(await scalar('SELECT budget_used FROM drive_notification_private.settings'),budget,kind+' consumes no budget');
  if(kind!=='budget') {
   equal(await scalar('SELECT stopped_at IS NOT NULL FROM drive_notification_private.current_state_notices WHERE id=$1',[notice.notice_id]),true,kind+' durably stops notice');
   equal(await scalar('SELECT send_enabled OR capture_enabled FROM drive_notification_private.settings'),false,kind+' physically closes gates');
  }
  equal(await service('SELECT public.begin_drive_whatsapp($1,$2)',[row.id,row.token]),false,'Twilio begin cannot repurpose notice');
  equal(await service('SELECT public.begin_kapso_drive_whatsapp($1,$2,$3)',[row.id,row.token,sender]),false,'legacy Kapso begin cannot bypass template binding');
  equal(common.parseOutboxItem({...row,action:'current_state'}),null,'legacy parser remains closed');
  assert.ok(target);checks++;
 }

 f=await fresh();const notice=await prepare(f),target=notice.targets[0];await open(notice,target.category.split('.')[0]);await db.exec('UPDATE drive_notification_private.settings SET send_enabled=true');
 const c1=await connectPeer(),c2=await connectPeer();
 try {
  const sql='SELECT public.claim_kapso_drive_whatsapp_target($1,$2,$3,$4,$5)';const params=[target.requestId,target.outboxId,target.recipientUserId,target.category,target.language];
  const claims=await Promise.all([service(sql,params,c1),service(sql,params,c2)]);equal(claims.filter(Boolean).length,1,'two workers claim once');
  const row=claims.find(Boolean);
  await c2.query('BEGIN');await c2.query('UPDATE public.drive_request_context SET version=1 WHERE request_id=$1',[f.id]);
  await denied(()=>begin(row,templates('ar')[target.category.split('.')[0]]),/lock|obtain/i);await c2.query('ROLLBACK');
  equal(await scalar('SELECT attempts FROM drive_notification_private.outbox WHERE id=$1',[row.id]),0,'conflicting lifecycle writer consumes no attempt');
  await c2.query('BEGIN');await c2.query('UPDATE drive_notification_private.subscriptions SET enabled=false WHERE id=$1',[customerSub]);
  await denied(()=>begin(row,templates('ar').customer),/lock|obtain/i);await c2.query('ROLLBACK');
  equal(await scalar('SELECT attempts FROM drive_notification_private.outbox WHERE id=$1',[row.id]),0,'concurrent consent withdrawal fences intent');
  const b=await Promise.all([service('SELECT public.begin_kapso_current_state_notice($1,$2,$3,$4)',[row.id,row.token,sender,templates('ar')[target.category.split('.')[0]]],c1),service('SELECT public.begin_kapso_current_state_notice($1,$2,$3,$4)',[row.id,row.token,sender,templates('ar')[target.category.split('.')[0]]],c2)]);
  equal(b.filter(Boolean).length,1,'concurrent begin has one durable intent');
  await service("SELECT public.finish_drive_whatsapp($1,$2,'unknown',NULL,'SEND_OUTCOME_UNKNOWN')",[row.id,row.token]);
  equal(await claim(target),null,'unknown is never resent');
  equal(await scalar('SELECT attempts FROM drive_notification_private.outbox WHERE id=$1',[row.id]),1,'one network intent only');
  const sibling=notice.targets.find(x=>x.outboxId!==row.id);
  await db.query("UPDATE drive_notification_private.outbox SET state='claimed',lease_token=gen_random_uuid(),lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[sibling.outboxId]);
  await db.exec("UPDATE drive_notification_private.settings SET dispatch_mode='general',send_enabled=true");
  const before=await scalar('SELECT to_jsonb(o) FROM drive_notification_private.outbox o WHERE id=$1',[row.id]);
  equal(await service('SELECT public.claim_drive_whatsapp()'),null,'general cannot claim notice rows');
  equal(await scalar('SELECT to_jsonb(o) FROM drive_notification_private.outbox o WHERE id=$1',[row.id]),before,'general does not resurrect or mutate notice');
  equal(await scalar('SELECT state FROM drive_notification_private.outbox WHERE id=$1',[sibling.outboxId]),'claimed','general does not reclaim expired notice lease');
 } finally {await c1.end();await c2.end();}
 await stop();
 for(const role of ['anon','authenticated']) {
  await db.exec('SET ROLE '+role);
  try {await denied(()=>db.query(prepareSql,argsFor(f)),/permission|SERVICE_REQUIRED/i);await denied(()=>db.exec('SELECT * FROM drive_notification_private.current_state_notices'),/permission/i);}
  finally {await db.exec('RESET ROLE');}
 }
 equal(await scalar('SELECT send_enabled OR capture_enabled FROM drive_notification_private.settings'),false,'final fixture gates OFF');
 console.log('PASS '+checks+' current-state PostgreSQL delta assertions; real peers; '+sends+' synthetic calls; zero external I/O');
 return checks;
}
