-- Task #147. Forward-only schema; apply ONLY to isolated QA until separate release authorization.
-- No products/partners/legacy requests are seeded, repriced, reassigned or updated.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE public.drive_managed_offers (
  id text PRIMARY KEY,
  vehicle_id text NOT NULL,
  country text NOT NULL CHECK (country = 'EG'),
  supplier_source text NOT NULL CHECK (supplier_source = 'safeerat-al-arab'),
  airport_amount numeric(12,2) CHECK (airport_amount > 0),
  daily_amount numeric(12,2) NOT NULL CHECK (daily_amount > 0),
  supplier_currency text NOT NULL CHECK (supplier_currency IN ('USD','EGP')),
  version text NOT NULL,
  active boolean NOT NULL DEFAULT true
);
ALTER TABLE public.drive_managed_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drive_managed_offers FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.drive_managed_offers TO anon,authenticated;
CREATE POLICY managed_offer_read ON public.drive_managed_offers FOR SELECT TO anon,authenticated USING (active);
INSERT INTO public.drive_managed_offers (id,vehicle_id,country,supplier_source,airport_amount,daily_amount,supplier_currency,version)
SELECT 'safeerat-eg-'||v.id,v.id,'EG','safeerat-al-arab',v.airport,v.daily,v.currency,'safeerat-eg-20260916-v1'
FROM (VALUES
 ('mercedes-e200-amg',100,200,'USD'),('jetour-t2',50,100,'USD'),('jetour-t1',50,100,'USD'),
 ('nissan-sunny',900,1800,'EGP'),('jetour-x90',1500,3500,'EGP'),('mercedes-e200',80,150,'USD'),
 ('range-rover',200,350,'USD'),('range-rover-2025',250,450,'USD'),('mercedes-gclass',NULL,550,'USD')
) AS v(id,airport,daily,currency);

ALTER TABLE public.marketplace_requests ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.marketplace_requests ADD COLUMN drive_offer_id text REFERENCES public.drive_managed_offers(id) ON DELETE RESTRICT;
ALTER TABLE public.marketplace_requests ADD CONSTRAINT request_exactly_one_catalog_source CHECK ((product_id IS NULL) <> (drive_offer_id IS NULL));
ALTER TABLE public.marketplace_requests ADD CONSTRAINT drive_payment_stop CHECK (drive_offer_id IS NULL OR (
  marketplace_family='drive' AND request_type='request_to_confirm' AND transaction_method='request_to_confirm'
  AND fulfilment_method='request_to_confirm' AND payment_status='awaiting_payment' AND handoff_type='none'
  AND status IN ('request_submitted','under_review','awaiting_customer_acceptance','declined')
));
CREATE TABLE public.drive_request_context (
  request_id uuid PRIMARY KEY REFERENCES public.marketplace_requests(id) ON DELETE RESTRICT,
  country text NOT NULL CHECK (country='EG'),
  offer_version text NOT NULL,
  supplier_amount numeric(12,2) NOT NULL CHECK (supplier_amount>0),
  supplier_currency text NOT NULL CHECK (supplier_currency IN ('USD','EGP')),
  trip jsonb NOT NULL,
  confirmed_vehicle text,
  version integer NOT NULL DEFAULT 0
);
ALTER TABLE public.drive_request_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drive_request_context FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.drive_request_context TO authenticated;
CREATE POLICY drive_context_owner_read ON public.drive_request_context FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.marketplace_requests r WHERE r.id=request_id AND r.user_id=(SELECT auth.uid())));
CREATE POLICY drive_context_operations_read ON public.drive_request_context FOR SELECT TO authenticated
USING (public.has_operational_access('operations:read',country,false));
CREATE POLICY drive_request_operations_read ON public.marketplace_requests FOR SELECT TO authenticated
USING (drive_offer_id IS NOT NULL AND public.has_operational_access('operations:read','EG',false));

-- Linked subtype events preserve the existing request-audit contract unchanged.
-- Customer timelines never receive internal Operations notes.
CREATE TABLE public.drive_request_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.drive_request_context(request_id),
 actor_user_id uuid NOT NULL REFERENCES auth.users(id),
 country text NOT NULL CHECK(country='EG'),
 action text NOT NULL CHECK(action IN ('created','review','confirm','decline')),
 previous_status text,
 new_status text NOT NULL,
 private_note text CHECK(length(private_note)<=2000),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.drive_request_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drive_request_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.drive_request_events TO authenticated;
CREATE POLICY drive_events_operations_read ON public.drive_request_events FOR SELECT TO authenticated
USING(public.has_operational_access('operations:read',country,false));
CREATE TRIGGER drive_events_immutable BEFORE UPDATE OR DELETE ON public.drive_request_events
FOR EACH ROW EXECUTE FUNCTION public.reject_marketplace_request_audit_mutation();
CREATE TRIGGER drive_events_no_truncate BEFORE TRUNCATE ON public.drive_request_events
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_marketplace_request_audit_mutation();
CREATE INDEX drive_events_request ON public.drive_request_events(request_id,created_at);
CREATE INDEX managed_request_offer ON public.marketplace_requests(drive_offer_id) WHERE drive_offer_id IS NOT NULL;

-- Atomic creation + audit, authenticated actor only, authoritative DB rates.
CREATE FUNCTION public.create_managed_drive_request(p_offer_id text,p_key text,p_trip jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_offer public.drive_managed_offers%ROWTYPE; v_request public.marketplace_requests%ROWTYPE;
 v_pickup timestamptz; v_return timestamptz; v_arrival timestamptz; v_amount numeric; v_reference text; v_email text;
BEGIN
 IF auth.uid() IS NULL OR current_setting('role',true) IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT email INTO v_email FROM public.profiles WHERE id=auth.uid() AND status='active' AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR p_key !~ '^[A-Za-z0-9:_-]{16,120}$' OR p_trip IS NULL OR jsonb_typeof(p_trip)<>'object' OR octet_length(p_trip::text)>8000 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 -- One UUID key scoped to the owner, independent of selected model. Changed-payload retry conflicts.
 v_reference := 'REQ-'||upper(substr(md5(auth.uid()::text||':'||p_key),1,20));
 PERFORM pg_advisory_xact_lock(hashtextextended(v_reference,0));
 SELECT * INTO v_request FROM public.marketplace_requests WHERE request_reference=v_reference AND user_id=auth.uid();
 IF FOUND THEN
  IF v_request.drive_offer_id IS DISTINCT FROM p_offer_id OR NOT EXISTS (SELECT 1 FROM public.drive_request_context WHERE request_id=v_request.id AND trip=p_trip) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('reference',v_request.request_reference,'status',v_request.status,'replayed',true);
 END IF;
 SELECT * INTO v_offer FROM public.drive_managed_offers WHERE id=p_offer_id AND active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OFFER_UNAVAILABLE' USING ERRCODE='22023'; END IF;
 IF (p_trip->>'mode') IS NULL OR p_trip->>'mode' NOT IN ('airport','chauffeur')
   OR coalesce(length(btrim(p_trip->>'pickup')),0) NOT BETWEEN 2 AND 200
   OR coalesce(length(btrim(p_trip->>'dropoff')),0) NOT BETWEEN 2 AND 200
   OR coalesce(length(btrim(p_trip->>'name')),0) NOT BETWEEN 2 AND 120
   OR coalesce(length(btrim(p_trip->>'phone')),0) NOT BETWEEN 7 AND 30
   OR coalesce(p_trip->>'phone','') !~ '^[+0-9 ()-]{7,30}$'
   OR p_trip->'acknowledged' IS DISTINCT FROM 'true'::jsonb
   OR coalesce(p_trip->>'currency','') NOT IN ('EGP','USD','SAR','EUR','AED')
   OR coalesce(length(p_trip->>'notes'),0)>1000
   OR coalesce(length(p_trip->>'specialRequest'),0)>500
   OR coalesce(p_trip->>'passengers','') !~ '^([1-9]|1[0-9]|20)$'
   OR coalesce(p_trip->>'luggage','') !~ '^([0-9]|1[0-9]|20)$'
   OR coalesce(p_trip->>'pickupAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'
   OR coalesce(p_trip->>'returnAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'
   THEN RAISE EXCEPTION 'INVALID_TRIP' USING ERRCODE='22023'; END IF;
 v_pickup := (p_trip->>'pickupAt')::timestamp AT TIME ZONE 'Africa/Cairo';
 v_return := (p_trip->>'returnAt')::timestamp AT TIME ZONE 'Africa/Cairo';
 IF to_char(v_pickup AT TIME ZONE 'Africa/Cairo','YYYY-MM-DD"T"HH24:MI')<>p_trip->>'pickupAt'
   OR to_char(v_return AT TIME ZONE 'Africa/Cairo','YYYY-MM-DD"T"HH24:MI')<>p_trip->>'returnAt'
   OR (v_pickup-interval '1 hour') AT TIME ZONE 'Africa/Cairo'=v_pickup AT TIME ZONE 'Africa/Cairo'
   OR (v_return-interval '1 hour') AT TIME ZONE 'Africa/Cairo'=v_return AT TIME ZONE 'Africa/Cairo'
   OR v_pickup<now()+interval '6 hours' OR v_return<=v_pickup OR v_return>v_pickup+interval '90 days'
   THEN RAISE EXCEPTION 'INVALID_PICKUP_RETURN_TIME' USING ERRCODE='22023'; END IF;
 IF p_trip->>'mode'='airport' THEN
  IF coalesce(p_trip->>'flightNumber','') !~ '^[A-Za-z0-9 -]{2,20}$' OR coalesce(p_trip->>'flightArrival','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' THEN RAISE EXCEPTION 'FLIGHT_DETAILS_REQUIRED' USING ERRCODE='22023'; END IF;
  v_arrival := (p_trip->>'flightArrival')::timestamp AT TIME ZONE 'Africa/Cairo';
  IF to_char(v_arrival AT TIME ZONE 'Africa/Cairo','YYYY-MM-DD"T"HH24:MI')<>p_trip->>'flightArrival'
    OR (v_arrival-interval '1 hour') AT TIME ZONE 'Africa/Cairo'=v_arrival AT TIME ZONE 'Africa/Cairo'
    THEN RAISE EXCEPTION 'INVALID_FLIGHT_TIME' USING ERRCODE='22023'; END IF;
 END IF;
 v_amount:=CASE WHEN p_trip->>'mode'='airport' THEN v_offer.airport_amount ELSE v_offer.daily_amount END;
 IF v_amount IS NULL THEN RAISE EXCEPTION 'RATE_UNAVAILABLE' USING ERRCODE='22023'; END IF;
 INSERT INTO public.marketplace_requests (request_reference,user_id,drive_offer_id,request_type,requested_for,traveller_count,customer_brief,marketplace_family,supplier_name,service_name,next_action)
 VALUES (v_reference,auth.uid(),v_offer.id,'request_to_confirm',v_pickup,(p_trip->>'passengers')::int,
 jsonb_build_object('email',v_email,'name',p_trip->>'name','phone',p_trip->>'phone'),'drive','Safeerat Al Arab Cars',v_offer.vehicle_id,'egypt_operations_review') RETURNING * INTO v_request;
 INSERT INTO public.drive_request_context (request_id,country,offer_version,supplier_amount,supplier_currency,trip) VALUES (v_request.id,v_offer.country,v_offer.version,v_amount,v_offer.supplier_currency,p_trip);
 INSERT INTO public.drive_request_events(request_id,actor_user_id,country,action,new_status)
 VALUES(v_request.id,auth.uid(),'EG','created','request_submitted');
 RETURN jsonb_build_object('reference',v_reference,'status',v_request.status,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.create_managed_drive_request(text,text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_managed_drive_request(text,text,jsonb) TO authenticated;

CREATE FUNCTION public.review_managed_drive_request(p_request_id uuid,p_version integer,p_action text,p_vehicle text DEFAULT NULL,p_amount numeric DEFAULT NULL,p_currency text DEFAULT NULL,p_expires timestamptz DEFAULT NULL,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_context public.drive_request_context%ROWTYPE; v_request public.marketplace_requests%ROWTYPE; v_status text;
BEGIN
 IF auth.uid() IS NULL OR current_setting('role',true) IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM public.require_operational_access('operations:write','EG',false);
 SELECT * INTO v_context FROM public.drive_request_context WHERE request_id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT * INTO v_request FROM public.marketplace_requests WHERE id=p_request_id FOR UPDATE;
 IF v_context.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'STALE_REQUEST' USING ERRCODE='40001'; END IF;
 IF v_request.status NOT IN ('request_submitted','under_review') OR p_action IS NULL OR p_action NOT IN ('review','confirm','decline') THEN RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='22023'; END IF;
 IF p_action='review' AND v_request.status<>'request_submitted' THEN RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='22023'; END IF;
 IF coalesce(length(p_note),0)>2000 THEN RAISE EXCEPTION 'INVALID_NOTE' USING ERRCODE='22023'; END IF;
 IF p_action='confirm' AND (v_request.status<>'under_review' OR coalesce(length(btrim(p_vehicle)),0) NOT BETWEEN 2 AND 200 OR p_amount IS NULL OR p_amount<=0 OR p_amount>99999999 OR p_currency IS NULL OR p_currency NOT IN ('EGP','USD','SAR','EUR','AED') OR p_expires IS NULL OR p_expires<=now() OR p_expires>v_request.requested_for) THEN RAISE EXCEPTION 'INVALID_CONFIRMATION' USING ERRCODE='22023'; END IF;
 v_status:=CASE p_action WHEN 'review' THEN 'under_review' WHEN 'confirm' THEN 'awaiting_customer_acceptance' ELSE 'declined' END;
 UPDATE public.marketplace_requests SET status=v_status, quote_amount=CASE WHEN p_action='confirm' THEN p_amount ELSE NULL END,
 quote_currency=CASE WHEN p_action='confirm' THEN p_currency ELSE NULL END,quote_expires_at=CASE WHEN p_action='confirm' THEN p_expires ELSE NULL END,
 next_action=CASE WHEN p_action='confirm' THEN 'payment_not_enabled' ELSE 'egypt_operations_review' END,updated_at=now() WHERE id=p_request_id;
 UPDATE public.drive_request_context SET confirmed_vehicle=CASE WHEN p_action='confirm' THEN p_vehicle ELSE NULL END, version=version+1 WHERE request_id=p_request_id;
 INSERT INTO public.drive_request_events(request_id,actor_user_id,country,action,previous_status,new_status,private_note)
 VALUES(p_request_id,auth.uid(),'EG',p_action,v_request.status,v_status,p_note);
 RETURN jsonb_build_object('status',v_status,'version',p_version+1);
END $$;
REVOKE ALL ON FUNCTION public.review_managed_drive_request(uuid,integer,text,text,numeric,text,timestamptz,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.review_managed_drive_request(uuid,integer,text,text,numeric,text,timestamptz,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
