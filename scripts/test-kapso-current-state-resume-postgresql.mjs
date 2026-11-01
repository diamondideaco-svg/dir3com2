// Disposable PostgreSQL only. No provider adapter, network, real IDs or credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';

export async function runCurrentStateResumeAcceptance({db,connectPeer,request,requestId,asUser,operations,customer,other}) {
 assert.equal(typeof connectPeer,'function','Two real PostgreSQL peers required');
 let checks=0,seq=0,current;
 const equal=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
 const scalar=async(sql,args=[],client=db)=>Object.values((await client.query(sql,args)).rows[0])[0];
 const service=async(sql,args=[],client=db)=>{await client.query('SET ROLE service_role');try{return await scalar(sql,args,client);}finally{await client.query('RESET ROLE');}};
 const sql='SELECT public.resume_kapso_current_state_window($1,$2,$3,$4,$5,$6)';
 const sender='10000000000166',webhook='00000000-0000-4000-8000-000000000777';
 const templates={customer:{name:'synthetic_current_customer',languageCode:'ar'},operations:{name:'synthetic_current_operations',languageCode:'ar'}};
 const signature='public.resume_kapso_current_state_window(uuid,uuid,uuid,uuid,text,text)';
 const beforeMigration=await scalar('SELECT to_jsonb(s) FROM drive_notification_private.settings s');
 await db.exec(fs.readFileSync('supabase/migrations/20261101070938_task166_guarded_current_state_resume.sql','utf8'));
 equal(await scalar('SELECT to_jsonb(s) FROM drive_notification_private.settings s'),beforeMigration,'migration does not activate or mutate settings');
 for(const role of ['anon','authenticated','service_role']) equal(await scalar('SELECT has_function_privilege($1,$2,\'EXECUTE\')',[role,signature]),role==='service_role','effective RPC ACL including PUBLIC');
 equal(await scalar('SELECT prosecdef AND proconfig @> ARRAY[\'search_path=""\',\'lock_timeout=1s\',\'statement_timeout=4s\']::text[] FROM pg_proc WHERE oid=$1::regprocedure',[signature]),true,'bounded service-only definer');
 equal(await scalar("SELECT relrowsecurity FROM pg_class WHERE oid='drive_notification_private.current_state_resumptions'::regclass"),true,'audit RLS');
 for(const role of ['anon','authenticated','service_role']) for(const grant of ['INSERT','UPDATE','DELETE']) equal(await scalar('SELECT has_table_privilege($1,\'drive_notification_private.current_state_resumptions\',$2)',[role,grant]),false,'audit cannot be edited through caller grants');
 const customerSub=await scalar("INSERT INTO drive_notification_private.subscriptions(user_id,audience,country,phone,language,consent_reference,verified_at,enabled) VALUES($1,'customer','EG','+10000000001','ar','SYNTHETIC-RESUME-CONSENT',clock_timestamp(),true) RETURNING id",[customer]);
 const opsSub=await scalar("SELECT id FROM drive_notification_private.subscriptions WHERE user_id=$1 AND audience='operations'",[operations]);
 const expire=async n=>db.query("WITH v AS MATERIALIZED(SELECT clock_timestamp() AS at) UPDATE drive_notification_private.current_state_notices SET started_at=v.at-interval '10 minutes',expires_at=v.at-interval '1 minute' FROM v WHERE id=$1",[n.notice_id]);
 const fresh=async()=>{
  if(current)await service('SELECT public.stop_kapso_current_state_notice($1)',[current.notice_id]);
  await db.exec("UPDATE drive_notification_private.settings SET send_enabled=false,capture_enabled=false,dispatch_mode='target_only',active_window_id=NULL,daily_limit=20,budget_used=3,budget_day=(clock_timestamp() AT TIME ZONE 'UTC')::date");
  await db.query("UPDATE drive_notification_private.subscriptions SET enabled=true WHERE id IN($1,$2)",[customerSub,opsSub]);
  await db.query("UPDATE public.profiles SET status='active' WHERE id IN($1,$2)",[customer,operations]);
  await db.query("UPDATE public.team_access_grants SET status='active',country_scope=ARRAY['EG'] WHERE invited_user_id=$1",[operations]);
  const created=await request('resume-only-'+(++seq));const id=await requestId(created.reference);
  const n=await service("SELECT public.prepare_kapso_current_state_notice($1,0,'request_submitted',$2,$3,$4,$5,$6,$7,clock_timestamp()+interval '1 minute')",[id,customerSub,opsSub,sender,webhook,templates,'SYNTHETIC-PREPARE-'+seq]);
  current=n;await expire(n);
  const c=n.targets.find(t=>t.category==='customer.current_state'),o=n.targets.find(t=>t.category==='operations.current_state');
  return {n,id,c,o,args:[n.notice_id,id,c.outboxId,o.outboxId,'customer','SYNTHETIC-RESUME-'+seq]};
 };
 const snapshot=async f=>scalar("SELECT jsonb_build_object('notice',(SELECT to_jsonb(n) FROM drive_notification_private.current_state_notices n WHERE id=$1),'targets',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM drive_notification_private.current_state_targets t WHERE notice_id=$1),'outbox',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM drive_notification_private.outbox o WHERE request_id=$2),'windows',(SELECT coalesce(jsonb_agg(to_jsonb(w) ORDER BY id),'[]'::jsonb) FROM drive_notification_private.execution_windows w WHERE request_id=$2),'audit',(SELECT to_jsonb(a) FROM drive_notification_private.current_state_resumptions a WHERE notice_id=$1),'settings',(SELECT to_jsonb(s) FROM drive_notification_private.settings s))",[f.n.notice_id,f.id]);
 const denied=async(f,pattern,args=f.args,client=db)=>{const before=await snapshot(f);await assert.rejects(()=>service(sql,args,client),pattern);checks++;equal(await snapshot(f),before,'rejection is atomic; no deadline/reset/activation');};
 let f=await fresh();
 await assert.rejects(()=>scalar(sql,f.args),/SERVICE_REQUIRED/);checks++;
 await assert.rejects(()=>asUser(customer,sql,f.args),/permission/);checks++;
 const unchanged=await snapshot(f);
 const result=await service(sql,f.args);
 equal(result.target,f.c,'canonical original customer selector');
 const after=await snapshot(f);
 equal(after.outbox,unchanged.outbox,'renewal creates no row or attempt/lease/SID');
 equal(after.notice.id,unchanged.notice.id,'same notice');
 equal(after.notice.approval_reference,unchanged.notice.approval_reference,'original approval retained');
 equal(after.audit.previous_started_at,unchanged.notice.started_at,'old start retained in audit');
 equal(after.audit.previous_expires_at,unchanged.notice.expires_at,'old deadline retained in audit');
 equal(after.audit.approval_reference,f.args[5],'new explicit authorization retained');
 equal(Date.parse(result.expires_at)-Date.parse(after.audit.resumed_at),540000,'deadline starts inside RPC and lasts nine minutes');
 equal(after.settings.budget_used,unchanged.settings.budget_used,'no budget reset or consumption');
 equal(after.settings.daily_limit,unchanged.settings.daily_limit,'no allowance change');
 equal(after.settings.send_enabled,true,'open and scoped arm commit together');
 equal(after.settings.capture_enabled,false,'no broad capture');
 await denied(f,/STATE_RESUMPTION_NOT_UNTOUCHED/);
 await denied(f,/STATE_RESUMPTION_CUSTOMER_UNCONFIRMED/,[...f.args.slice(0,4),'operations',f.args[5]]);
 const claim=target=>service('SELECT public.claim_kapso_drive_whatsapp_target($1,$2,$3,$4,$5)',[target.requestId,target.outboxId,target.recipientUserId,target.category,target.language]);
 const row=await claim(f.c);assert.ok(row);checks++;
 equal(await service('SELECT public.begin_kapso_current_state_notice($1,$2,$3,$4)',[row.id,row.token,sender,templates.customer]),true,'original begin/budget guards retained');
 equal(await service("SELECT public.finish_drive_whatsapp($1,$2,'accepted',$3,NULL)",[row.id,row.token,'wamid.SYNTHETIC_RESUME_CUSTOMER']),true,'synthetic acceptance recorded, no provider call');
 const operationsResult=await service(sql,[...f.args.slice(0,4),'operations',f.args[5]]);
 equal(operationsResult.target,f.o,'same operations selector');
 equal(operationsResult.expires_at,result.expires_at,'operations does not renew the deadline');
 equal(await scalar('SELECT stopped_at IS NOT NULL FROM drive_notification_private.execution_windows WHERE id=$1',[result.window_id]),true,'only prior consumed window closed');
 equal(await scalar('SELECT send_enabled AND NOT capture_enabled FROM drive_notification_private.settings'),true,'operations armed without changing feature/provider config');
 equal(await service("SELECT public.ingest_kapso_drive_whatsapp_receipt($1,$2,$3,'delivered',NULL,NULL)",['wamid.SYNTHETIC_RESUME_CUSTOMER',sender,'+10000000001']),true,'late customer receipt accepted');
 equal(await scalar('SELECT send_enabled FROM drive_notification_private.settings'),true,'late old callback cannot disarm newer target');
 await denied(f,/STATE_RESUMPTION_NOT_UNTOUCHED/,[...f.args.slice(0,4),'operations',f.args[5]]);

 for(const kind of ['attempt','sid','sender','lease','leaseUntil','unknown','claimed','error','consent','grant','owner','version','status','country','phone','language','provenance','receipt','otherOutbox','window','closedWindow','notExpired','wrongRequest','swappedIds']) {
  f=await fresh();let args=f.args;
  if(kind==='attempt')await db.query('UPDATE drive_notification_private.outbox SET attempts=1 WHERE id=$1',[f.o.outboxId]);
  if(kind==='sid')await db.query("UPDATE drive_notification_private.outbox SET provider_sid='wamid.SYNTHETIC_PREVIOUS' WHERE id=$1",[f.c.outboxId]);
  if(kind==='sender')await db.query('UPDATE drive_notification_private.outbox SET provider_phone_number_id=$1 WHERE id=$2',[sender,f.c.outboxId]);
  if(kind==='lease')await db.query('UPDATE drive_notification_private.outbox SET lease_token=gen_random_uuid() WHERE id=$1',[f.c.outboxId]);
  if(kind==='leaseUntil')await db.query("UPDATE drive_notification_private.outbox SET lease_until=clock_timestamp()-interval '1 minute' WHERE id=$1",[f.c.outboxId]);
  if(kind==='unknown'||kind==='claimed')await db.query('UPDATE drive_notification_private.outbox SET state=$1 WHERE id=$2',[kind,f.c.outboxId]);
  if(kind==='error')await db.query("UPDATE drive_notification_private.outbox SET error_code='SEND_OUTCOME_UNKNOWN' WHERE id=$1",[f.c.outboxId]);
  if(kind==='consent')await db.query('UPDATE drive_notification_private.subscriptions SET enabled=false WHERE id=$1',[customerSub]);
  if(kind==='grant')await db.query("UPDATE public.team_access_grants SET status='revoked' WHERE invited_user_id=$1",[operations]);
  if(kind==='owner')await db.query('UPDATE public.marketplace_requests SET user_id=$1 WHERE id=$2',[operations,f.id]);
  if(kind==='version')await db.query('UPDATE public.drive_request_context SET version=1 WHERE request_id=$1',[f.id]);
  if(kind==='status')await db.query("UPDATE public.marketplace_requests SET status='under_review' WHERE id=$1",[f.id]);
  if(kind==='country')await db.query("UPDATE public.drive_request_context SET country='SA' WHERE request_id=$1",[f.id]);
  if(kind==='phone')await db.query("UPDATE drive_notification_private.current_state_targets SET phone='+10000000999' WHERE notice_id=$1 AND audience='customer'",[f.n.notice_id]);
  if(kind==='language')await db.query("UPDATE drive_notification_private.current_state_targets SET language='en' WHERE notice_id=$1 AND audience='customer'",[f.n.notice_id]);
  if(kind==='provenance')await db.query("UPDATE public.drive_request_events SET action='review' WHERE request_id=$1",[f.id]);
  if(kind==='receipt')await db.query("INSERT INTO drive_notification_private.receipts(outbox_id,provider_sid,state) VALUES($1,'wamid.SYNTHETIC_RECEIPT','delivered')",[f.c.outboxId]);
  if(kind==='otherOutbox')await db.query("INSERT INTO drive_notification_private.outbox(event_id,request_id,subscription_id,recipient_user_id,audience,country,phone,language,action,request_reference,expected_status) SELECT event_id,request_id,subscription_id,$2,audience,country,'+10000000999',language,'created',request_reference,expected_status FROM drive_notification_private.outbox WHERE id=$1",[f.c.outboxId,other]);
  if(kind==='notExpired')await db.query("UPDATE drive_notification_private.current_state_notices SET started_at=clock_timestamp(),expires_at=clock_timestamp()+interval '1 minute' WHERE id=$1",[f.n.notice_id]);
  if(kind==='window'||kind==='closedWindow') {
   await db.query("UPDATE drive_notification_private.current_state_notices SET started_at=clock_timestamp(),expires_at=clock_timestamp()+interval '1 minute' WHERE id=$1",[f.n.notice_id]);
   const wid=await service("SELECT public.open_kapso_current_state_window($1,'customer')",[f.n.notice_id]);
   if(kind==='closedWindow')await service("SELECT public.stop_kapso_drive_whatsapp_window($1,'manual')",[wid]);
   await expire(f.n);
  }
  if(kind==='wrongRequest')args=[f.args[0],customer,...f.args.slice(2)];
  if(kind==='swappedIds')args=[f.args[0],f.id,f.o.outboxId,f.c.outboxId,...f.args.slice(4)];
  await denied(f,/STATE_RESUMPTION|INELIGIBLE_STATE_NOTICE|STALE_STATE_NOTICE/,args);
 }
 f=await fresh();
 await db.exec("CREATE FUNCTION public.synthetic_resume_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_WINDOW_FAILURE'; END $$; CREATE TRIGGER synthetic_resume_failure BEFORE INSERT ON drive_notification_private.execution_windows FOR EACH ROW EXECUTE FUNCTION public.synthetic_resume_failure()");
 await denied(f,/SYNTHETIC_WINDOW_FAILURE/);
 await db.exec('DROP TRIGGER synthetic_resume_failure ON drive_notification_private.execution_windows; DROP FUNCTION public.synthetic_resume_failure()');
 const p1=await connectPeer(),p2=await connectPeer();
 try {
  f=await fresh();await p2.query('BEGIN');await p2.query('UPDATE drive_notification_private.subscriptions SET enabled=false WHERE id=$1',[customerSub]);
  await denied(f,/lock|obtain/i,f.args,p1);await p2.query('ROLLBACK');
  const outcomes=await Promise.allSettled([service(sql,f.args,p1),service(sql,f.args,p2)]);
  equal(outcomes.filter(x=>x.status==='fulfilled').length,1,'concurrent resume opens exactly once');
  equal(outcomes.filter(x=>x.status==='rejected').length,1,'competing resume fails closed');
  equal(await scalar('SELECT count(*)::int FROM drive_notification_private.current_state_resumptions WHERE notice_id=$1',[f.n.notice_id]),1,'one audit');
  equal(await scalar('SELECT count(*)::int FROM drive_notification_private.execution_windows WHERE request_id=$1',[f.id]),1,'one window');
  f=await fresh();await p2.query('BEGIN');
  const barrier=await scalar('SELECT clock_timestamp() FROM drive_notification_private.settings WHERE singleton FOR UPDATE',[],p2);
  const delayed=service(sql,f.args,p1);
  const [opened]=await Promise.all([delayed,new Promise(resolve=>setTimeout(resolve,250)).then(()=>p2.query('COMMIT'))]);
  const resumed=await scalar('SELECT resumed_at FROM drive_notification_private.current_state_resumptions WHERE notice_id=$1',[f.n.notice_id]);
  equal(new Date(resumed).getTime()>=new Date(barrier).getTime()+200,true,'clock starts after lock readiness, not earlier preparation/call');
  equal(Date.parse(opened.expires_at)-new Date(resumed).getTime(),540000,'full bounded deadline measured at actual execution');
 } finally {await p1.end();await p2.end();}
 console.log(`PASS ${checks} current-state resume assertions; real PostgreSQL peers; zero provider calls`);
 return checks;
}
