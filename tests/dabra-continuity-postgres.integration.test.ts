import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {Client} from 'pg';
import {resumeSavedTrip} from '../lib/dabra/continuity-contract';

// Explicit opt-in runner. No fallback DATABASE_URL and no skip-as-pass.
// Only a disposable loopback database is permitted; never connected Supabase.
const ownerA='11111111-1111-4111-8111-111111111111';
const ownerB='22222222-2222-4222-8222-222222222222';
const staff='33333333-3333-4333-8333-333333333333';
const prefs={replyLanguage:'ar',displayCurrency:'SAR',travelClass:'economy',lodgingStyle:'hotel',itineraryPace:'balanced'};
const trip={id:'44444444-4444-4444-8444-444444444444',origin:'Cairo',destination:'Riyadh',startDate:null,endDate:null,adults:2,children:1,rooms:1,budget:5000,currency:'SAR',families:['stay','fly']};
type Snapshot={revision:number;generation:number;consentEnabled:boolean;trip:typeof trip|null;tripExpiresAt:string|null;preferences:typeof prefs|null;preferencesExpiresAt:string|null;replayed?:boolean};
test('real disposable PostgreSQL continuity: durability, ownership, CAS, replay and forgetting',async(t)=>{
 const url=process.env.CONTINUITY_TEST_DATABASE_URL;
 assert.ok(url,'CONTINUITY_TEST_DATABASE_URL required; DB evidence must not silently skip');
 const parsed=new URL(url);assert.ok(['127.0.0.1','localhost'].includes(parsed.hostname));assert.equal(parsed.pathname,'/dir3com_test');
 const database=`dir3com_continuity_${randomUUID().replaceAll('-','')}`;
 const root=new Client({connectionString:url});await root.connect();
 const isolated=new URL(url);isolated.pathname=`/${database}`;
 const clients:Client[]=[];
 const connect=async()=>{const c=new Client({connectionString:isolated.toString()});await c.connect();clients.push(c);return c;};
 await root.query(`create database ${database}`);
 try{
  const admin=await connect();
  await admin.query(`
   create schema auth;
   do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
   do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
   do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
   grant usage on schema public,auth to anon,authenticated,service_role;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table auth.users(id uuid primary key);
   create table public.profiles(id uuid primary key,role text,status text,deleted_at timestamptz);
   alter table public.profiles enable row level security;
   grant select on public.profiles to authenticated;
   create policy own_profile on public.profiles for select to authenticated using(id=auth.uid());
   insert into auth.users values('${ownerA}'),('${ownerB}'),('${staff}');
   insert into public.profiles values('${ownerA}','customer','active',null),('${ownerB}','client','active',null),('${staff}','staff','active',null);
  `);
  await admin.query(readFileSync(new URL('../supabase/drafts/task187-continuity.sql',import.meta.url),'utf8'));
  const customer=await connect();await customer.query('set role authenticated');
  const setOwner=async(c:Client,id:string|null)=>{await c.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);};
  const read=async(c=customer):Promise<Snapshot>=>(await c.query('select public.dabra_continuity_read() as state')).rows[0].state;
  const mutate=async(action:string|null,s:Snapshot,payload:unknown={},nonce=randomUUID(),c=customer):Promise<Snapshot>=>(await c.query('select public.dabra_continuity_mutate($1,$2,$3,$4,$5::jsonb) as state',[action,s.revision,s.generation,nonce,JSON.stringify(payload)])).rows[0].state;
  const denied=async(run:()=>Promise<unknown>,code:string)=>{await assert.rejects(run,(e:unknown)=>Boolean(e&&typeof e==='object'&&'code' in e&&e.code===code));};
  await setOwner(customer,ownerA);
  await t.test('SQL policy defaults disabled and direct storage permissions fail closed',async()=>{
   await denied(()=>read(),'55000');await denied(()=>customer.query('select * from public.dabra_account_continuity'),'42501');
   await denied(()=>customer.query('update public.dabra_account_continuity set consent_enabled=true'),'42501');
   await denied(()=>customer.query('select public.dabra_continuity_purge()'),'42501');
   await admin.query('update public.dabra_continuity_policy set enabled=true');
  });
  let saved:Snapshot;const nonce=randomUUID();const empty=await read();const payload={consent:true,preferences:prefs,trip};
  await t.test('explicit save persists; dropped response retries same request without duplication',async()=>{
   saved=await mutate('save',empty,payload,nonce);assert.equal(saved.revision,1);assert.equal(saved.trip?.id,trip.id);
   const retry=await mutate('save',empty,payload,nonce);assert.equal(retry.revision,1);assert.equal(retry.replayed,true);
   await denied(()=>mutate('save',empty,{...payload,preferences:{...prefs,replyLanguage:'en'}},nonce),'40001');
  });
  await t.test('fresh connection after simulated next day preserves ID without extending retention',async()=>{
   const fresh=await connect();await fresh.query('set role authenticated');await setOwner(fresh,ownerA);
   const nextDay=await read(fresh);assert.equal(nextDay.trip?.id,trip.id);assert.equal(nextDay.preferencesExpiresAt,saved!.preferencesExpiresAt);
   const intent=resumeSavedTrip(nextDay.trip,Date.parse(nextDay.tripExpiresAt!),Date.now()+24*60*60*1000);
   assert.ok(intent);assert.equal(intent.intent.id,trip.id);assert.equal(intent.approvalState,'NOT_REQUESTED');assert.equal(intent.availability,'unknown');assert.deepEqual(intent.options,[]);
   // Independent fresh process/server restart is an additional manual acceptance step.
  });
  await t.test('B sees empty own state; inactive, deleted, staff and absent actors are denied',async()=>{
   await setOwner(customer,ownerB);assert.equal((await read()).trip,null);
   await setOwner(customer,staff);await denied(()=>read(),'42501');await setOwner(customer,null);await denied(()=>read(),'42501');
   await setOwner(customer,ownerA);await admin.query('update public.profiles set status=\'suspended\' where id=$1',[ownerA]);await denied(()=>read(),'42501');
   await admin.query('update public.profiles set status=\'active\',deleted_at=now() where id=$1',[ownerA]);await denied(()=>read(),'42501');
   await admin.query('update public.profiles set deleted_at=null where id=$1',[ownerA]);
  });
  await t.test('direct RPC validates null actions, explicit consent, schema and authority fields',async()=>{
   for(const value of [{...payload,consent:null},{...payload,preferences:{...prefs,replyLanguage:null}}, {...payload,trip:{...trip,currency:null}}, {...payload,trip:{...trip,families:[null]}}, {...payload,trip:{...trip,approval:'APPROVED'}}, {...payload,ownerId:ownerB}])await denied(()=>mutate('save',saved!,value),'22023');
   await denied(()=>mutate(null,saved!),'22023');
  });
  await t.test('two concurrent saves have exactly one winner',async()=>{
   const other=await connect();await other.query('set role authenticated');await setOwner(other,ownerA);
   const results=await Promise.allSettled([mutate('save',saved!,payload),mutate('save',saved!,payload,randomUUID(),other)]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='40001').length,1);saved=await read();
  });
  await t.test('trip edits preserve identity; replacement requires explicit deletion',async()=>{
   await denied(()=>mutate('save',saved!,{...payload,trip:{...trip,id:randomUUID()}}),'40001');
   saved=await mutate('save',saved!,{...payload,trip:{...trip,destination:'Jeddah'}});assert.equal(saved.trip?.id,trip.id);
  });
  await t.test('revoke clears content and invalidates every old save; replay cannot resurrect it',async()=>{
   const before=saved!;const revokeNonce=randomUUID();saved=await mutate('revoke',before,{},revokeNonce);assert.equal(saved.consentEnabled,false);assert.equal(saved.trip,null);assert.equal(saved.preferences,null);assert.equal(saved.generation,before.generation+1);
   await denied(()=>mutate('save',empty,payload,nonce),'40001');await denied(()=>mutate('save',before,payload),'40001');
   assert.equal((await mutate('revoke',before,{},revokeNonce)).trip,null);
   saved=await mutate('save',saved!,payload);assert.equal(saved.consentEnabled,true);
  });
  await t.test('deletion remains deleted when old save receipt is replayed',async()=>{
   const before=saved!;const lastNonce=randomUUID();saved=await mutate('save',before,payload,lastNonce);
   saved=await mutate('delete_trip',saved!);assert.equal(saved.trip,null);assert.equal((await mutate('save',before,payload,lastNonce)).trip,null);
   saved=await mutate('clear_preferences',saved!);assert.equal(saved.preferences,null);
  });
  await t.test('expired data is hidden immediately and privileged purge physically clears it',async()=>{
   saved=await mutate('save',saved!,payload);
   await admin.query('update public.dabra_account_continuity set preferences_expires_at=now()-interval \'1 second\',trip_expires_at=now()-interval \'1 second\' where owner_id=$1',[ownerA]);
   const expired=await read();assert.equal(expired.trip,null);assert.equal(expired.preferences,null);
   await admin.query('set role service_role');try{assert.equal((await admin.query('select public.dabra_continuity_purge() as n')).rows[0].n,1);}finally{await admin.query('reset role');}
   const row=(await admin.query('select trip,preferences from public.dabra_account_continuity where owner_id=$1',[ownerA])).rows[0];assert.equal(row.trip,null);assert.equal(row.preferences,null);
  });
  await t.test('account removal cascades both durable content and payload-free receipts',async()=>{
   await admin.query('delete from auth.users where id=$1',[ownerA]);assert.equal((await admin.query('select count(*)::int as n from public.dabra_account_continuity where owner_id=$1',[ownerA])).rows[0].n,0);assert.equal((await admin.query('select count(*)::int as n from public.dabra_continuity_receipts where owner_id=$1',[ownerA])).rows[0].n,0);
  });
 }finally{
  await Promise.allSettled(clients.map(c=>c.end()));await root.query(`drop database ${database}`);await root.end();
 }
});
