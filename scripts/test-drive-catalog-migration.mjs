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
 customer_brief jsonb,marketplace_family text,supplier_name text,service_name text,next_action text,
 quote_amount numeric,quote_currency text,quote_expires_at timestamptz,updated_at timestamptz);
 CREATE TABLE public.drive_request_context(request_id uuid PRIMARY KEY,country text,offer_version text,supplier_amount numeric,supplier_currency text,trip jsonb,
 version integer DEFAULT 0,confirmed_vehicle text,confirmed_vehicle_year integer CHECK(confirmed_vehicle_year IN(2025,2026,2027)));
 CREATE TABLE public.drive_request_events(request_id uuid,actor_user_id uuid,country text,action text,new_status text,previous_status text,private_note text);
 -- Isolated fixture authority, NOT a substitute for the full RLS/country-scope harness.
 CREATE FUNCTION public.require_operational_access(text,text,boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF $1<>'operations:write' OR $2<>'EG' OR $3 THEN RAISE EXCEPTION 'BAD_QA_SCOPE'; END IF; END $$;
`);
await db.exec(legacy.slice(legacy.indexOf('CREATE TABLE public.drive_managed_offers'),legacy.indexOf('ALTER TABLE public.marketplace_requests')));
await db.exec(year.slice(year.indexOf('CREATE OR REPLACE FUNCTION public.create_managed_drive_request'),year.indexOf('CREATE FUNCTION public.review_managed_drive_request')));
const trip={pickup:'Cairo',dropoff:'Giza',name:'Isolated QA',phone:'+201000000000',acknowledged:true,currency:'USD',minimumModelYear:2025,acceptableModelYears:[2025,2026,2027],
 passengers:2,luggage:1,pickupAt:'2099-01-12T12:00',returnAt:'2099-01-13T12:00',mode:'chauffeur',notes:'',specialRequest:'',flightNumber:'',flightArrival:''};
async function call(key,version,mode='chauffeur') {
 const versionTrip=[data.version,'managed-eg-20260928-v4'].includes(version)?{...trip,minimumModelYear:null,acceptableModelYears:null}:trip;
 const payload=mode==='airport'?{...versionTrip,mode,flightNumber:'QA123',flightArrival:'2099-01-12T11:00'}:versionTrip;
 await db.exec('SET ROLE authenticated');
 try{return (await db.query('SELECT public.create_managed_drive_request($1,$2,$3::jsonb,$4) AS result',['safeerat-eg-jetour-t2',key,JSON.stringify(payload),version])).rows[0].result;}
 finally{await db.exec('RESET ROLE');}
}
await db.exec('SET ROLE authenticated');
await db.query('SELECT public.create_managed_drive_request($1,$2,$3::jsonb)',['safeerat-eg-jetour-t2','task167-legacy-request',JSON.stringify(trip)]);
await db.exec('RESET ROLE');
await db.exec(migration);
assert.equal((await db.query('SELECT count(*)::int AS n FROM public.drive_managed_offers')).rows[0].n,30);
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
const saved=(await db.query('SELECT r.id,c.trip FROM public.marketplace_requests r JOIN public.drive_request_context c ON c.request_id=r.id ORDER BY c.supplier_amount')).rows;
const old=saved.find(r=>r.trip.minimumModelYear===2025);
const current=saved.find(r=>r.trip.minimumModelYear===null);
async function review(id,version,action,year=null){
 await db.exec('SET ROLE authenticated');
 try{return await db.query("SELECT public.review_managed_drive_request($1,$2,$3,'Equivalent approved vehicle',$4,250,'USD',now()+interval '1 day','Isolated QA')",[id,version,action,year]);}
 finally{await db.exec('RESET ROLE');}
}
await review(old.id,0,'review');await review(current.id,0,'review');
for(const year of [2021,2022,2023,2024]) await assert.rejects(review(old.id,1,'confirm',year),e=>e.code==='22023');
await assert.rejects(review(current.id,1,'confirm',999),e=>e.code==='22023');
await review(current.id,1,'confirm',2020);await review(old.id,1,'confirm',2025);
assert.equal((await db.query('SELECT confirmed_vehicle_year FROM public.drive_request_context WHERE request_id=$1',[current.id])).rows[0].confirmed_vehicle_year,2020);
assert.equal((await db.query('SELECT confirmed_vehicle_year FROM public.drive_request_context WHERE request_id=$1',[old.id])).rows[0].confirmed_vehicle_year,2025);
assert.equal((await db.query("SELECT count(*)::int AS n FROM public.drive_request_events WHERE action='confirm'")).rows[0].n,2);
assert.equal((await call('task167-legacy-request',null)).replayed,true);
assert.equal((await db.query("SELECT count(*)::int AS n FROM public.marketplace_requests WHERE status='awaiting_customer_acceptance' AND next_action='payment_not_enabled'")).rows[0].n,2);
// No hidden year floor: old or unspecified years all work for newly approved requests.
for (const vehicleYear of [1990,2021,null]) {
 const created=await call('task167-any-year-'+String(vehicleYear),data.version);
 const id=(await db.query('SELECT id FROM public.marketplace_requests WHERE request_reference=$1',[created.reference])).rows[0].id;
 await review(id,0,'review');await review(id,1,'confirm',vehicleYear);
 assert.equal((await db.query('SELECT confirmed_vehicle_year FROM public.drive_request_context WHERE request_id=$1',[id])).rows[0].confirmed_vehicle_year,vehicleYear);
}
if (process.env.TASK172_PRICE_RELEASE === '1') {
 await db.exec(`CREATE TABLE public.products(id uuid PRIMARY KEY,name_ar text,name_en text,slug text,country text,marketplace_family text,status text,base_price numeric,currency text,lifecycle_version int,deleted_at timestamptz,synthetic boolean DEFAULT false,updated_at timestamptz);
 CREATE TABLE public.product_availability(id uuid PRIMARY KEY,product_id uuid,city text,currency text,price numeric,weekend_price numeric,seasonal_price numeric,discount_percent numeric,capacity int,booked_count int);
 CREATE TABLE public.system_events(event_name text,entity_type text,entity_id text,payload jsonb,source text);`);
 const {verifyDrivePriceRelease}=await import('./verify-drive-price-release.mjs');
 await verifyDrivePriceRelease({execute:statement=>db.exec(statement),scalar:async statement=>String(Object.values((await db.query(statement)).rows[0])[0])});
 const fresh=await call('task172-new-price','managed-eg-20260928-v4');
 assert.equal((await call('task172-new-price','managed-eg-20260928-v4')).replayed,true);
 assert.equal((await call('task167-current-request',data.version)).replayed,true);
 assert.equal(Number((await db.query('SELECT c.supplier_amount FROM public.drive_request_context c JOIN public.marketplace_requests r ON r.id=c.request_id WHERE r.request_reference=$1',[fresh.reference])).rows[0].supplier_amount),140.25);
 await assert.rejects(call('task172-stale-new',data.version),e=>e.code==='40001');
}
await db.close();
console.log('PASS: isolated PostgreSQL migration, 30 offers/27 exact rates, old/new retry, all-years and unspecified-year confirmation, old 2025 promise preserved, invalid year syntax rejected, one audit per confirmation, no booking/payment. No external DB used.');
