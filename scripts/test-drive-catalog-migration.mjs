// In-memory PostgreSQL only. No connection URL, credentials or production access.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.TASK167_PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const legacy=fs.readFileSync('supabase/migrations/20260916234223_managed_drive_request_boundary.sql','utf8');
const year=fs.readFileSync('supabase/migrations/20260918190000_drive_model_year_boundary.sql','utf8');
const migration=fs.readFileSync('supabase/migrations/20260927223137_drive_september27_managed_catalog.sql','utf8');
const data=JSON.parse(fs.readFileSync('lib/drive/september-catalog.json','utf8'));
const actor='00000000-0000-4000-8000-000000000167';
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE SQL AS $$ SELECT '${actor}'::uuid $$;
 CREATE TABLE public.profiles(id uuid PRIMARY KEY,email text,status text,deleted_at timestamptz);
 INSERT INTO public.profiles VALUES('${actor}','local-qa@example.invalid','active',NULL);
 CREATE TABLE public.marketplace_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_reference text,user_id uuid,drive_offer_id text,
 status text DEFAULT 'request_submitted',request_type text,requested_for timestamptz,traveller_count integer,
 customer_brief jsonb,marketplace_family text,supplier_name text,service_name text,next_action text);
 CREATE TABLE public.drive_request_context(request_id uuid PRIMARY KEY,country text,offer_version text,supplier_amount numeric,supplier_currency text,trip jsonb);
 CREATE TABLE public.drive_request_events(request_id uuid,actor_user_id uuid,country text,action text,new_status text);
`);
await db.exec(legacy.slice(legacy.indexOf('CREATE TABLE public.drive_managed_offers'),legacy.indexOf('ALTER TABLE public.marketplace_requests')));
await db.exec(year.slice(year.indexOf('CREATE OR REPLACE FUNCTION public.create_managed_drive_request'),year.indexOf('CREATE FUNCTION public.review_managed_drive_request')));
const trip={pickup:'Cairo',dropoff:'Giza',name:'Isolated QA',phone:'+201000000000',acknowledged:true,currency:'USD',minimumModelYear:2025,acceptableModelYears:[2025,2026,2027],
 passengers:2,luggage:1,pickupAt:'2099-01-12T12:00',returnAt:'2099-01-13T12:00',mode:'chauffeur',notes:'',specialRequest:'',flightNumber:'',flightArrival:''};
async function call(key,version,mode='chauffeur') {
 const payload=mode==='airport'?{...trip,mode,flightNumber:'QA123',flightArrival:'2099-01-12T11:00'}:trip;
 await db.exec('SET ROLE authenticated');
 try{return (await db.query('SELECT public.create_managed_drive_request($1,$2,$3::jsonb,$4) AS result',['safeerat-eg-jetour-t2',key,JSON.stringify(payload),version])).rows[0].result;}
 finally{await db.exec('RESET ROLE');}
}
await db.exec('SET ROLE authenticated');
await db.query('SELECT public.create_managed_drive_request($1,$2,$3::jsonb)',['safeerat-eg-jetour-t2','task167-legacy-request',JSON.stringify(trip)]);
await db.exec('RESET ROLE');
await db.exec(migration);
assert.equal((await db.query('SELECT count(*)::int AS n FROM public.drive_managed_offers')).rows[0].n,20);
for(const row of data.rows){
 const result=(await db.query('SELECT * FROM public.drive_managed_offers WHERE id=$1',[row.offerId])).rows[0];
 assert.equal(Number(result.daily_amount)*100,row.dailyCents);assert.equal(Number(result.airport_amount)*100,row.airportCents);
 assert.equal(result.version,data.version);assert.equal(result.supplier_source,'egypt-operations');assert.equal(result.daily_period_hours,24);
}
assert.equal((await call('task167-legacy-request',null)).replayed,true);
assert.equal(Number((await db.query('SELECT supplier_amount FROM public.drive_request_context')).rows[0].supplier_amount),100);
for(const v of [null,'safeerat-eg-20260916-v1','forged']) await assert.rejects(call('task167-reject-version',v),e=>e.code==='40001');
const first=await call('task167-current-request',data.version);
const replay=await call('task167-current-request',data.version);
assert.equal(first.reference,replay.reference);assert.equal(replay.replayed,true);
await call('task167-airport-request',data.version,'airport');
const contexts=(await db.query('SELECT supplier_amount::text AS amount,offer_version FROM public.drive_request_context ORDER BY supplier_amount')).rows;
assert.deepEqual(contexts.map(c=>Number(c.amount)),[82.5,100,165]);
assert.equal((await db.query('SELECT count(*)::int AS n FROM public.drive_request_events')).rows[0].n,3);
assert.equal((await db.query("SELECT count(*)::int AS n FROM public.marketplace_requests WHERE supplier_name='Egypt Operations'")).rows[0].n,2);
assert.equal((await db.query("SELECT has_function_privilege('anon','public.create_managed_drive_request(text,text,jsonb,text)','EXECUTE') AS allowed")).rows[0].allowed,false);
assert.equal((await db.query("SELECT has_table_privilege('authenticated','public.drive_managed_offers','UPDATE') AS allowed")).rows[0].allowed,false);
await db.close();
console.log('PASS: isolated PostgreSQL migration, 20 offers/14 exact rates, 24h terms, stale-version rejection, old/new retry, airport amount, Operations ownership and ACL. No external DB used.');
