-- Isolated PostgreSQL regression only; caller must verify its local QA target.
-- Every test row and grant is rolled back. Never run against Production.
BEGIN;
CREATE FUNCTION pg_temp.ok(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
CREATE FUNCTION pg_temp.denied(command text, expected text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE caught text; BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS caught=RETURNED_SQLSTATE; END;
 PERFORM pg_temp.ok(caught=expected,label||' ('||coalesce(caught,'no error')||')');
END $$;
SELECT gen_random_uuid() AS customer,gen_random_uuid() AS outsider,gen_random_uuid() AS operator \gset
INSERT INTO auth.users(id,email) VALUES (:'customer','task147-customer@example.invalid'),(:'outsider','task147-outsider@example.invalid'),(:'operator','task147-ops@example.invalid');
INSERT INTO public.profiles(id,email,full_name,role,status) VALUES (:'customer','task147-customer@example.invalid','QA Customer','customer','active'),(:'outsider','task147-outsider@example.invalid','QA Other','customer','active'),(:'operator','task147-ops@example.invalid','QA Egypt Ops','admin','active') ON CONFLICT(id) DO UPDATE SET role=excluded.role,status=excluded.status;
INSERT INTO public.team_access_grants(email,job_title,access_level,country_scope,permissions,status,invited_user_id,created_by) VALUES ('task147-ops@example.invalid','QA Operations','scoped_staff',ARRAY['EG'],ARRAY['operations:read','operations:write'],'active',:'operator',:'operator');
SELECT jsonb_build_object('pickup','Cairo airport','dropoff','Cairo hotel','pickupAt',to_char((now()+interval '2 days') AT TIME ZONE 'Africa/Cairo','YYYY-MM-DD"T"HH24:MI'),'returnAt',to_char((now()+interval '3 days') AT TIME ZONE 'Africa/Cairo','YYYY-MM-DD"T"HH24:MI'),'mode','chauffeur','passengers',2,'luggage',1,'currency','EGP','name','QA Customer','phone','+201000000000','flightNumber','','flightArrival','','notes','','specialRequest','','acknowledged',true,'minimumModelYear',2025,'acceptableModelYears',jsonb_build_array(2025,2026,2027))::text AS trip \gset
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',:'customer','role','authenticated')::text,true);
SELECT public.create_managed_drive_request('safeerat-eg-jetour-t2','task147-idempotency-key',:'trip'::jsonb)->>'reference' AS reference \gset
SELECT id AS request_id FROM public.marketplace_requests WHERE request_reference=:'reference' \gset
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.marketplace_requests WHERE request_reference=:'reference'),'one owner REQ');
SELECT pg_temp.ok((public.create_managed_drive_request('safeerat-eg-jetour-t2','task147-idempotency-key',:'trip'::jsonb)->>'replayed')::boolean,'identical retry replay');
SELECT pg_temp.denied(format('select public.create_managed_drive_request(%L,%L,%L::jsonb)','safeerat-eg-jetour-t1','task147-idempotency-key',:'trip'),'23505','changed offer replay denied');
SELECT pg_temp.denied(format('select public.create_managed_drive_request(%L,%L,%L::jsonb)','safeerat-eg-jetour-t2','task147-missing-ack',jsonb_set(:'trip'::jsonb,'{acknowledged}','false')),'22023','missing acknowledgement rejected');
SELECT pg_temp.denied(format('select public.create_managed_drive_request(%L,%L,%L::jsonb)','safeerat-eg-jetour-t2','task147-old-model',jsonb_set(:'trip'::jsonb,'{minimumModelYear}','2024')),'22023','model older than 2025 rejected');
SELECT pg_temp.denied(format('select public.create_managed_drive_request(%L,%L,%L::jsonb)','safeerat-eg-jetour-t2','task147-too-soon',jsonb_set(:'trip'::jsonb,'{pickupAt}',to_jsonb(to_char((now()+interval '5 hours') AT TIME ZONE 'Africa/Cairo','YYYY-MM-DD"T"HH24:MI')))),'22023','six-hour rule at database');
SELECT pg_temp.ok((SELECT supplier_amount=100 AND supplier_currency='USD' FROM public.drive_request_context WHERE request_id=:'request_id'),'supplier original amount/currency snapshot');
SELECT pg_temp.denied(format('select public.create_managed_drive_request(%L,%L,%L::jsonb)','safeerat-eg-jetour-t2','task147-dst-arrival',:'trip'::jsonb || '{"mode":"airport","flightNumber":"MS123","flightArrival":"2027-04-30T00:30"}'::jsonb),'22023','airport DST gap rejected at RPC');
SELECT pg_temp.denied(format('select public.create_managed_drive_request(%L,%L,%L::jsonb)','safeerat-eg-jetour-t2','task147-bad-flight',:'trip'::jsonb || '{"mode":"airport","flightNumber":"<script>","flightArrival":"2027-05-01T12:00"}'::jsonb),'22023','invalid flight identifier rejected at RPC');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.drive_request_events),'customer cannot read private audit notes');
SELECT pg_temp.denied(format('update public.drive_request_context set supplier_amount=1 where request_id=%L',:'request_id'),'42501','customer cannot change rate');
SELECT pg_temp.denied(format('select public.review_managed_drive_request(%L,0,%L)',:'request_id','review'),'42501','customer cannot confirm request');
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',:'outsider','role','authenticated')::text,true);
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.drive_request_context WHERE request_id=:'request_id'),'cross-customer context isolated');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.marketplace_requests WHERE id=:'request_id'),'cross-customer request isolated');
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',:'operator','role','authenticated')::text,true);
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.drive_request_context WHERE request_id=:'request_id'),'Egypt Ops read');
SELECT public.review_managed_drive_request(:'request_id',0,'review');
SELECT pg_temp.denied(format('select public.review_managed_drive_request(%L,0,%L)',:'request_id','review'),'40001','duplicate action stale version rejected');
RESET ROLE;
UPDATE public.team_access_grants SET country_scope=ARRAY['SA'] WHERE invited_user_id=:'operator';
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.drive_request_context WHERE request_id=:'request_id'),'wrong-country read denied');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.marketplace_requests WHERE id=:'request_id'),'wrong-country parent request denied');
SELECT pg_temp.denied(format('select public.review_managed_drive_request(%L,1,%L)',:'request_id','decline'),'42501','wrong-country write denied');
RESET ROLE;
UPDATE public.team_access_grants SET country_scope=ARRAY['EG'],status='inactive' WHERE invited_user_id=:'operator';
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied(format('select public.review_managed_drive_request(%L,1,%L)',:'request_id','decline'),'42501','inactive grant denied');
RESET ROLE;
UPDATE public.team_access_grants SET status='active' WHERE invited_user_id=:'operator';
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied(format('select public.review_managed_drive_request(%L,1,%L,%L,2024,250,%L,now()+interval ''1 day'',%L)',:'request_id','confirm','Jetour T2 or similar','USD','QA private note'),'22023','Operations cannot confirm model older than 2025');
SELECT public.review_managed_drive_request(:'request_id',1,'confirm','Jetour T2 or similar',2025,250,'USD',now()+interval '1 day','QA private note');
SELECT pg_temp.ok((SELECT confirmed_vehicle_year=2025 FROM public.drive_request_context WHERE request_id=:'request_id'),'confirmed model year preserved');
SELECT pg_temp.ok((SELECT status='awaiting_customer_acceptance' AND payment_status='awaiting_payment' AND product_id IS NULL FROM public.marketplace_requests WHERE id=:'request_id'),'confirmed request is not BOOKING/payment');
SELECT pg_temp.ok((SELECT count(*)=3 FROM public.drive_request_events WHERE request_id=:'request_id'),'all three actions audited');
SELECT pg_temp.denied(format('delete from public.drive_request_events where request_id=%L',:'request_id'),'42501','audit cannot be deleted by Ops');
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',:'customer','role','authenticated')::text,true);
SELECT pg_temp.ok(public.create_managed_drive_request('safeerat-eg-jetour-t2','task147-idempotency-key',:'trip'::jsonb)->>'status'='awaiting_customer_acceptance','replay returns actual status');
RESET ROLE;
SELECT pg_temp.denied(format('update public.marketplace_requests set status=%L where id=%L','confirmed',:'request_id'),'23514','database rejects BOOKING state');
SELECT pg_temp.denied(format('update public.marketplace_requests set payment_status=%L where id=%L','payment_verified',:'request_id'),'23514','database rejects payment claim');
ROLLBACK;
