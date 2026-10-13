// Runs inside the existing freshly-created isolated DB fixture. All provider calls are fake.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';

function load(path, dependencies = {}) {
 const exports = {};
 runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
 }).outputText, { exports, Buffer, URL, URLSearchParams, Response, Request, AbortSignal,
  fetch: async () => { assert.fail('Real network prohibited'); },
  require(name) {
   if (name === 'server-only') return {};
   if (name === 'node:crypto') return crypto;
   if (name in dependencies) return dependencies[name];
   throw new Error(name);
  } });
 return exports;
}
export async function runTargetAcceptance({ db, connectPeer, request, requestId, asUser, operations, customer, other }) {
 let checks = 0;
 const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
 const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
 const api = load('lib/notifications/kapso-drive-whatsapp.ts', {
  './drive-whatsapp': load('lib/notifications/drive-whatsapp.ts'),
 });
 const migration = readFileSync('supabase/migrations/20261012235405_drive_whatsapp_target_claim.sql', 'utf8');
 await db.exec(migration);
 const env = {
  DIR3COM_WHATSAPP_ENABLED: 'true', DIR3COM_WHATSAPP_CATEGORIES: 'operations.created,customer.confirm',
  KAPSO_API_KEY: 'isolated-not-an-api-key', KAPSO_PHONE_NUMBER_ID: '10000000000166',
  KAPSO_WEBHOOK_SECRET: 'isolated-webhook-secret'.repeat(3),
  DIR3COM_WHATSAPP_WORKER_SECRET: 'isolated-worker-secret'.repeat(3),
  DIR3COM_WHATSAPP_SITE_URL: 'https://qa.example.invalid',
  DIR3COM_WHATSAPP_KAPSO_TEMPLATES: JSON.stringify({
   'operations.created.ar': { name: 'isolated_operations_created', languageCode: 'ar' },
   'customer.confirm.ar': { name: 'isolated_customer_confirm', languageCode: 'ar' },
  }),
 };
 const config = api.kapsoConfig(env);
 assert.ok(config);
 // Existing fixture grants/consent remain authoritative. Enable fixture categories only.
 await db.query("UPDATE drive_notification_private.settings SET send_enabled=true,capture_enabled=true,operations_created_enabled=true,operations_recipient_user_id=$1,operations_template_languages=ARRAY['ar'],customer_actions=ARRAY['confirm'],customer_template_languages=ARRAY['ar'],budget_used=0,budget_day=(now() AT TIME ZONE 'UTC')::date,daily_limit=100", [operations]);
 const makeTarget = async key => {
  const result = await request('target-'+key); const id = await requestId(result.reference);
  const row = (await db.query("SELECT id FROM drive_notification_private.outbox WHERE request_id=$1 AND audience='operations'", [id])).rows[0];
  return { requestId: id, outboxId: row.id, recipientUserId: operations, category: 'operations.created', language: 'ar' };
 };
 // Old pending/expired claimed/expired sending/accepted rows are deliberately present.
 const old = [];
 for (const state of ['pending','claimed','sending','accepted']) {
  const t = await makeTarget('old-'+state); old.push(t);
  await db.query("UPDATE drive_notification_private.outbox SET created_at=now()-interval '2 days',state=$2,attempts=CASE WHEN $2 IN ('sending','accepted') THEN 1 ELSE 0 END,lease_token=CASE WHEN $2='pending' THEN NULL ELSE gen_random_uuid() END,lease_until=CASE WHEN $2='pending' THEN NULL ELSE now()-interval '1 minute' END,provider_sid=CASE WHEN $2='accepted' THEN 'wamid.OLD_TARGET_FIXTURE' ELSE NULL END WHERE id=$1", [t.outboxId,state]);
 }
 const snapshot = async excluded => (await db.query('SELECT to_jsonb(o) AS row FROM drive_notification_private.outbox o WHERE id<>$1 ORDER BY id', [excluded])).rows;
 const storeFor = client => ({ async rpc(name, args = {}) {
  const signatures = {
   claim_kapso_drive_whatsapp_target: ['p_request_id','p_outbox_id','p_recipient_user_id','p_category','p_language'],
   begin_kapso_drive_whatsapp: ['p_id','p_token','p_phone_number_id'],
   finish_drive_whatsapp: ['p_id','p_token','p_outcome','p_sid','p_error'],
   record_kapso_drive_whatsapp_receipt: ['p_sid','p_phone_number_id','p_phone','p_state','p_error'],
  };
  const keys = signatures[name]; assert.ok(keys, 'No generic queue RPC permitted');
  const query = 'SELECT public.'+name+'('+keys.map((_,i)=>'$'+(i+1)).join(',')+') AS result';
  try { return { data: (await client.query(query, keys.map(key=>args[key]))).rows[0].result, error: null }; }
  catch (error) { return { data: null, error }; }
 } });
 let calls = 0;
 const fake = async (_url, options) => {
  calls++; const to = JSON.parse(options.body).to;
  return new Response(JSON.stringify({ messaging_product: 'whatsapp', contacts: [{ input: to, wa_id: to }], messages: [{ id: 'wamid.TARGET_FIXTURE_'+calls }] }), { status: 200 });
 };
 const run = async (target, fetcher = fake, changeStore = x=>x) => {
  await db.exec('SET ROLE service_role');
  try { return await api.dispatchKapsoTarget(changeStore(storeFor(db)), config, target, fetcher); }
  finally { await db.exec('RESET ROLE'); }
 };
 const state = target => scalar('SELECT state FROM drive_notification_private.outbox WHERE id=$1',[target.outboxId]);
 const target = await makeTarget('only'); const before = await snapshot(target.outboxId);
 equal(await run(target),'accepted','target accepted by fake provider');
 equal(calls,1,'one fake send');
 equal(await snapshot(target.outboxId),before,'every old row byte-for-byte unchanged');
 equal(await scalar('SELECT provider_sid FROM drive_notification_private.outbox WHERE id=$1',[target.outboxId]),'wamid.TARGET_FIXTURE_1','WAMID persisted');
 equal(await run(target),'idle','accepted replay closed'); equal(calls,1,'no accepted replay send');
 const missing = await makeTarget('mismatch'); const allBefore = await snapshot(other);
 for (const patch of [
  { requestId: other },{ outboxId: other },{ recipientUserId: customer },
  { category: 'customer.confirm' },{ language: 'en' },
 ]) equal(await run({...missing,...patch}),patch.language ? 'not_sent' : 'idle','mismatch stops');
 equal(calls,1,'mismatches zero sends'); equal(await snapshot(other),allBefore,'mismatches zero row changes');
 // A malformed or wrong RPC result is checked before begin/network as well.
 for (const field of ['id','request_id','recipient_user_id','audience','action','language']) {
  const row = { id: missing.outboxId, token: other, request_id: missing.requestId, recipient_user_id: operations,
   audience:'operations',action:'created',language:'ar',phone:'+10000000003',reference:'REQ-ISOLATED' };
  row[field] = field==='audience' ? 'customer' : field==='action' ? 'review' : field==='language' ? 'en' : other;
  await assert.rejects(api.dispatchKapsoTarget({ rpc: async name => { equal(name,'claim_kapso_drive_whatsapp_target','mismatch never begins'); return {data:row,error:null}; } },config,missing,fake),/TARGET_MISMATCH/); checks++;
 }
 equal(calls,1,'untrusted RPC mismatch zero sends');
 const noSend = async (label, mutate, restore) => {
  const t = await makeTarget(label); const oldRows = await snapshot(t.outboxId); const count = calls;
  await mutate(t); await run(t); equal(calls,count,label+' zero sends');
  await restore(t); equal(await snapshot(t.outboxId),oldRows,label+' other outbox rows unchanged');
 };
 await noSend('consent',async()=>db.query('UPDATE drive_notification_private.subscriptions SET enabled=false WHERE user_id=$1',[operations]),async()=>db.query('UPDATE drive_notification_private.subscriptions SET enabled=true WHERE user_id=$1',[operations]));
 await noSend('grant',async()=>db.query("UPDATE public.team_access_grants SET status='revoked' WHERE invited_user_id=$1",[operations]),async()=>db.query("UPDATE public.team_access_grants SET status='active' WHERE invited_user_id=$1",[operations]));
 await noSend('expired',t=>db.query("UPDATE drive_notification_private.outbox SET created_at=now()-interval '25 hours' WHERE id=$1",[t.outboxId]),async()=>{});
 await noSend('trip-expired',t=>db.query("UPDATE public.marketplace_requests SET requested_for=now()-interval '1 second' WHERE id=$1",[t.requestId]),async()=>{});
 await noSend('status-changed',t=>db.query("UPDATE public.marketplace_requests SET status='under_review' WHERE id=$1",[t.requestId]),async()=>{});
 await noSend('budget',async()=>db.exec("UPDATE drive_notification_private.settings SET budget_used=daily_limit,budget_day=(now() AT TIME ZONE 'UTC')::date"),async()=>db.exec('UPDATE drive_notification_private.settings SET budget_used=0'));
 await noSend('kill',async()=>db.exec('UPDATE drive_notification_private.settings SET send_enabled=false'),async()=>db.exec('UPDATE drive_notification_private.settings SET send_enabled=true'));
 await noSend('category-kill',async()=>db.exec('UPDATE drive_notification_private.settings SET operations_created_enabled=false'),async()=>db.exec('UPDATE drive_notification_private.settings SET operations_created_enabled=true'));
 for(const [label,change,restore] of [
  ['kill-after-claim','UPDATE drive_notification_private.settings SET send_enabled=false','UPDATE drive_notification_private.settings SET send_enabled=true'],
  ['consent-after-claim',"UPDATE drive_notification_private.subscriptions SET enabled=false WHERE audience='operations'","UPDATE drive_notification_private.subscriptions SET enabled=true WHERE audience='operations'"],
 ]){
  const t=await makeTarget(label); const oldRows=await snapshot(t.outboxId); const count=calls;
  await run(t,fake,store=>({rpc:async(name,args)=>{const result=await store.rpc(name,args);if(name==='claim_kapso_drive_whatsapp_target')await db.exec(change);return result;}}));
  equal(calls,count,label+' zero sends');await db.exec(restore);equal(await snapshot(t.outboxId),oldRows,label+' other rows unchanged');
 }
 const quoteRequest=await request('target-expired-quote');const quoteId=await requestId(quoteRequest.reference);
 await asUser(operations,"SELECT public.review_managed_drive_request($1,0,'review')",[quoteId]);
 await asUser(operations,"SELECT public.review_managed_drive_request($1,1,'confirm','QA vehicle',NULL,150,'USD',now()+interval '1 day',NULL)",[quoteId]);
 const quoteRow=(await db.query("SELECT id FROM drive_notification_private.outbox WHERE request_id=$1 AND audience='customer' AND action='confirm'",[quoteId])).rows[0];
 const quoteTarget={requestId:quoteId,outboxId:quoteRow.id,recipientUserId:customer,category:'customer.confirm',language:'ar'};
 const quoteBefore=await snapshot(quoteTarget.outboxId);const quoteCount=calls;
 await db.query("UPDATE public.marketplace_requests SET quote_expires_at=now()-interval '1 second' WHERE id=$1",[quoteId]);
 await run(quoteTarget);equal(calls,quoteCount,'expired quote zero sends');equal(await snapshot(quoteTarget.outboxId),quoteBefore,'expired quote other rows unchanged');
 const unknown = await makeTarget('response-lost'); const count = calls;
 equal(await run(unknown,async()=>{ calls++; throw new Error('Simulated accepted then response lost'); }),'unknown','lost provider response unknown');
 equal(await run(unknown),'idle','unknown no retry'); equal(calls,count+1,'response loss one attempt');
 // Completion loss leaves sending, never a new claim even after expired lease.
 const lost = await makeTarget('completion-lost'); const lostCount = calls;
 await assert.rejects(run(lost,fake,store=>({ rpc: async (name,args)=>name==='finish_drive_whatsapp'?{data:null,error:new Error('Lost commit response')}:store.rpc(name,args) })),/RESULT_PERSISTENCE_UNCONFIRMED/); checks++;
 await db.query("UPDATE drive_notification_private.outbox SET lease_until=now()-interval '1 minute' WHERE id=$1",[lost.outboxId]);
 equal(await run(lost),'idle','expired sending no retry'); equal(await state(lost),'sending','no broad cleanup of sending'); equal(calls,lostCount+1,'completion loss one attempt');
 // Claim response loss is also conservative: claimed is not automatically reclaimed.
 const claimLost = await makeTarget('claim-lost');
 await assert.rejects(run(claimLost,fake,store=>({ rpc: async (name,args)=>{ const result=await store.rpc(name,args); return name==='claim_kapso_drive_whatsapp_target'?{data:null,error:new Error('Lost claim response')}:result; } })),/CLAIM_FAILED/); checks++;
 await db.query("UPDATE drive_notification_private.outbox SET lease_until=now()-interval '1 minute' WHERE id=$1",[claimLost.outboxId]);
 const beforeClaimLost=calls; equal(await run(claimLost),'idle','expired claimed no retry'); equal(calls,beforeClaimLost,'claim response loss zero sends');
 // Independent real connections execute the actual dispatcher, not just the claim SQL.
 if (connectPeer) {
  const t = await makeTarget('concurrent'); const peers = await Promise.all([connectPeer(),connectPeer()]); const count = calls; const oldRows=await snapshot(t.outboxId);
  let claims=0;
  try {
   await Promise.all(peers.map(peer=>peer.query('SET ROLE service_role')));
   const results=await Promise.all(peers.map(peer=>api.dispatchKapsoTarget({ rpc:async(name,args)=>{ const result=await storeFor(peer).rpc(name,args); if(name==='claim_kapso_drive_whatsapp_target'&&result.data!==null)claims++; return result; } },config,t,fake)));
   equal(results.sort(),['accepted','idle'],'two actual dispatchers one accepted');
   equal(claims,1,'two workers one claim'); equal(calls,count+1,'two workers one fake send'); equal(await snapshot(t.outboxId),oldRows,'concurrency other rows unchanged');
  } finally { await Promise.all(peers.map(peer=>peer.end())); }
 } else { throw new Error('Target acceptance requires real isolated PostgreSQL with two connections'); }
 const message=await scalar('SELECT provider_sid FROM drive_notification_private.outbox WHERE id=$1',[target.outboxId]);
 const oldRows=await snapshot(target.outboxId);
 const receive=async(sid,sender,phone,status)=>{
  await db.exec('SET ROLE service_role');
  try{return (await storeFor(db).rpc('record_kapso_drive_whatsapp_receipt',{p_sid:sid,p_phone_number_id:sender,p_phone:phone,p_state:status,p_error:null})).data;}
  finally{await db.exec('RESET ROLE');}
 };
 equal(await receive('wamid.WRONG','10000000000166','+10000000003','delivered'),false,'unknown WAMID rejected');
 equal(await receive(message,'10000000000999','+10000000003','delivered'),false,'foreign sender rejected');
 equal(await receive(message,'10000000000166','+10000000099','delivered'),false,'foreign recipient rejected');
 equal(await receive(message,'10000000000166','+10000000003','delivered'),true,'delivery correlated');
 equal(await receive(message,'10000000000166','+10000000003','delivered'),true,'delivery duplicate idempotent');
 await receive(message,'10000000000166','+10000000003','read');
 await receive(message,'10000000000166','+10000000003','sent');
 await receive(message,'10000000000166','+10000000003','failed');
 equal(await state(target),'read','receipts cannot go backwards');
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.receipts WHERE outbox_id=$1 AND state=\'delivered\'',[target.outboxId]),1,'duplicate receipt one record');
 equal(await snapshot(target.outboxId),oldRows,'receipts never touch another request');
 for(const role of ['anon','authenticated'])equal(await scalar("SELECT has_function_privilege($1,'public.claim_kapso_drive_whatsapp_target(uuid,uuid,uuid,text,text)','EXECUTE')",[role]),false,role+' target RPC denied');
 equal(await scalar("SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='drive_notification_private' AND c.relkind='r' AND c.relrowsecurity"),4,'RLS retained');
 console.log('PASS '+checks+' targeted acceptance assertions; real two-connection PostgreSQL, fake provider only');
 return checks;
}
