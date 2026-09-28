-- Task #166. Disabled by default. No subscriptions, historical backfill or live sends.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE SCHEMA drive_notification_private;
REVOKE ALL ON SCHEMA drive_notification_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA drive_notification_private TO service_role;

CREATE TABLE drive_notification_private.settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 capture_enabled boolean NOT NULL DEFAULT false,
 send_enabled boolean NOT NULL DEFAULT false,
 daily_limit integer NOT NULL DEFAULT 20 CHECK(daily_limit BETWEEN 1 AND 100),
 budget_day date, budget_used integer NOT NULL DEFAULT 0 CHECK(budget_used>=0)
);
INSERT INTO drive_notification_private.settings(singleton) VALUES(true);

-- Provision only after documented opt-in, verified contact and regional assignment.
-- Subscription approval is deliberately not inferred from a request's phone field.
CREATE TABLE drive_notification_private.subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 audience text NOT NULL CHECK(audience IN ('customer','operations')),
 country text NOT NULL CHECK(country='EG'),
 phone text NOT NULL CHECK(phone ~ '^\+[1-9][0-9]{6,14}$'),
 language text NOT NULL CHECK(language IN ('ar','en')),
 consent_reference text NOT NULL CHECK(length(consent_reference) BETWEEN 8 AND 120),
 verified_at timestamptz NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 UNIQUE(user_id,audience,country)
);

CREATE TABLE drive_notification_private.outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES public.drive_request_events(id),
 request_id uuid NOT NULL REFERENCES public.drive_request_context(request_id),
 subscription_id uuid NOT NULL REFERENCES drive_notification_private.subscriptions(id),
 recipient_user_id uuid NOT NULL REFERENCES public.profiles(id),
 channel text NOT NULL DEFAULT 'whatsapp' CHECK(channel='whatsapp'),
 audience text NOT NULL CHECK(audience IN ('customer','operations')),
 country text NOT NULL CHECK(country='EG'),
 phone text NOT NULL, language text NOT NULL CHECK(language IN ('ar','en')),
 action text NOT NULL CHECK(action IN ('created','review','confirm','decline','customer_accept')),
 request_reference text NOT NULL, expected_status text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN
   ('pending','claimed','sending','accepted','queued','sent','delivered','read','failed','undelivered','unknown','suppressed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 lease_token uuid, lease_until timestamptz, available_at timestamptz NOT NULL DEFAULT now(),
 provider_sid text UNIQUE CHECK(provider_sid ~ '^SM[0-9a-fA-F]{32}$'),
 error_code text CHECK(error_code ~ '^[A-Z0-9_]{1,64}$'),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_id,channel,recipient_user_id,audience),
 UNIQUE(event_id,channel,phone)
);
CREATE INDEX drive_whatsapp_pending ON drive_notification_private.outbox(available_at,created_at) WHERE state='pending';
CREATE INDEX drive_whatsapp_request ON drive_notification_private.outbox(request_id);

CREATE TABLE drive_notification_private.receipts (
 outbox_id uuid NOT NULL REFERENCES drive_notification_private.outbox(id),
 provider_sid text NOT NULL, state text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(outbox_id,provider_sid,state)
);
ALTER TABLE drive_notification_private.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_notification_private.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_notification_private.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_notification_private.receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA drive_notification_private FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,UPDATE ON drive_notification_private.settings TO service_role;
GRANT SELECT,INSERT,UPDATE ON drive_notification_private.subscriptions TO service_role;
GRANT SELECT ON drive_notification_private.outbox,drive_notification_private.receipts TO service_role;

-- Background recipient eligibility, intentionally stricter than interactive CEO access:
-- every Operations subscription needs an active explicit grant, including a CEO.
CREATE FUNCTION drive_notification_private.eligible(p_subscription uuid,p_request uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (
  SELECT 1 FROM drive_notification_private.subscriptions s
  JOIN public.profiles p ON p.id=s.user_id AND p.status='active' AND p.deleted_at IS NULL
  JOIN public.marketplace_requests r ON r.id=p_request AND r.drive_offer_id IS NOT NULL
  JOIN public.drive_request_context c ON c.request_id=r.id AND c.country=s.country
  WHERE s.id=p_subscription AND s.enabled AND s.verified_at<=now()
  AND ((s.audience='customer' AND r.user_id=s.user_id
    AND regexp_replace(coalesce(r.customer_brief->>'phone',''),'[ ()-]','','g')=s.phone)
   OR (s.audience='operations' AND lower(btrim(p.role)) IN ('admin','super_admin','staff')
    AND EXISTS(SELECT 1 FROM public.team_access_grants g WHERE g.invited_user_id=p.id AND g.status='active'
      AND g.access_level IN ('scoped_staff','global_admin')
      AND cardinality(g.permissions)>0 AND array_position(g.permissions,NULL) IS NULL
      AND g.permissions <@ ARRAY['admin:full','operations:read','operations:write','customers:read','customers:write',
        'partners:read','partners:write','products:read','products:write','finance:read','finance:write','verification:read','verification:write']::text[]
      AND g.country_scope IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM unnest(g.country_scope) x WHERE x IS NULL OR btrim(x)='')
      AND (g.access_level='global_admin' OR 'admin:full'=ANY(g.permissions)
       OR ('operations:read'=ANY(g.permissions) AND EXISTS(SELECT 1 FROM unnest(g.country_scope) x
        WHERE public.normalize_admin_country_key(x)=c.country))))))
 );
$$;
REVOKE ALL ON FUNCTION drive_notification_private.eligible(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION drive_notification_private.capture_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT (SELECT capture_enabled FROM drive_notification_private.settings WHERE singleton) THEN RETURN NEW; END IF;
 INSERT INTO drive_notification_private.outbox(event_id,request_id,subscription_id,recipient_user_id,
   audience,country,phone,language,action,request_reference,expected_status)
 SELECT NEW.id,NEW.request_id,s.id,s.user_id,s.audience,NEW.country,s.phone,s.language,NEW.action,r.request_reference,NEW.new_status
 FROM public.marketplace_requests r JOIN drive_notification_private.subscriptions s ON s.country=NEW.country
 WHERE r.id=NEW.request_id AND r.status=NEW.new_status
  AND NEW.new_status=CASE NEW.action WHEN 'created' THEN 'request_submitted' WHEN 'review' THEN 'under_review'
    WHEN 'confirm' THEN 'awaiting_customer_acceptance' WHEN 'decline' THEN 'declined' WHEN 'customer_accept' THEN 'awaiting_payment' END
  AND (s.audience='customer' OR NEW.action IN ('created','customer_accept'))
  AND drive_notification_private.eligible(s.id,r.id)
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION drive_notification_private.capture_event() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER drive_whatsapp_capture AFTER INSERT ON public.drive_request_events
 FOR EACH ROW EXECUTE FUNCTION drive_notification_private.capture_event();

CREATE FUNCTION public.claim_drive_whatsapp()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v drive_notification_private.outbox%ROWTYPE; v_token uuid:=gen_random_uuid();
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton AND send_enabled FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- Before send: safe to reclaim. After send intent: never automatically resend.
 UPDATE drive_notification_private.outbox SET state='unknown',error_code='SEND_LEASE_EXPIRED',updated_at=now()
 WHERE state='sending' AND lease_until<=now();
 UPDATE drive_notification_private.outbox SET state='pending',lease_token=NULL,lease_until=NULL,updated_at=now()
 WHERE state='claimed' AND lease_until<=now();
 SELECT * INTO v FROM drive_notification_private.outbox
 WHERE state='pending' AND available_at<=now() AND attempts<3 ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE drive_notification_private.outbox SET state='claimed',lease_token=v_token,lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=v.id;
 RETURN jsonb_build_object('id',v.id,'token',v_token,'audience',v.audience,'action',v.action,'language',v.language,
   'phone',v.phone,'reference',v.request_reference);
END $$;

CREATE FUNCTION public.begin_drive_whatsapp(p_id uuid,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v drive_notification_private.outbox%ROWTYPE; cfg drive_notification_private.settings%ROWTYPE; valid boolean;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF NOT cfg.send_enabled THEN RETURN false; END IF;
 SELECT * INTO v FROM drive_notification_private.outbox WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR v.state<>'claimed' OR v.lease_token IS DISTINCT FROM p_token OR v.lease_until<=now() THEN RETURN false; END IF;
 SELECT EXISTS(SELECT 1 FROM public.marketplace_requests r JOIN drive_notification_private.subscriptions s ON s.id=v.subscription_id
  WHERE r.id=v.request_id AND r.status=v.expected_status AND r.requested_for>now()
   AND s.phone=v.phone AND s.language=v.language AND s.user_id=v.recipient_user_id
   AND s.audience=v.audience AND s.country=v.country
   AND drive_notification_private.eligible(s.id,r.id)
   AND (v.action<>'confirm' OR r.quote_expires_at>now())) INTO valid;
 IF NOT valid OR v.created_at<now()-interval '24 hours' THEN
  UPDATE drive_notification_private.outbox SET state='suppressed',error_code='STALE_OR_INELIGIBLE',updated_at=now() WHERE id=p_id; RETURN false;
 END IF;
 IF cfg.budget_day IS DISTINCT FROM (now() AT TIME ZONE 'UTC')::date THEN
  cfg.budget_used:=0;
 END IF;
 IF cfg.budget_used>=cfg.daily_limit THEN
  UPDATE drive_notification_private.outbox SET state='pending',lease_token=NULL,lease_until=NULL,
   available_at=(date_trunc('day',now() AT TIME ZONE 'UTC')+interval '1 day') AT TIME ZONE 'UTC',updated_at=now() WHERE id=p_id;
  RETURN false;
 END IF;
 UPDATE drive_notification_private.settings SET budget_day=(now() AT TIME ZONE 'UTC')::date,budget_used=cfg.budget_used+1 WHERE singleton;
 UPDATE drive_notification_private.outbox SET state='sending',attempts=attempts+1,lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=p_id;
 RETURN true;
END $$;

CREATE FUNCTION public.finish_drive_whatsapp(p_id uuid,p_token uuid,p_outcome text,p_sid text DEFAULT NULL,p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v drive_notification_private.outbox%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_outcome IS NULL OR p_outcome NOT IN ('accepted','retry','failed','unknown')
  OR (p_outcome='accepted' AND (p_sid IS NULL OR p_sid !~ '^SM[0-9a-fA-F]{32}$'))
  OR (p_outcome<>'accepted' AND p_sid IS NOT NULL)
  OR (p_error IS NOT NULL AND p_error !~ '^[A-Z0-9_]{1,64}$')
 THEN RAISE EXCEPTION 'INVALID_RESULT' USING ERRCODE='22023'; END IF;
 SELECT * INTO v FROM drive_notification_private.outbox WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR v.lease_token IS DISTINCT FROM p_token THEN RETURN false; END IF;
 -- A signed callback can arrive before the create-message HTTP response.
 IF v.state NOT IN ('sending','unknown') THEN RETURN v.provider_sid IS NOT NULL AND v.provider_sid=p_sid; END IF;
 IF v.provider_sid IS NOT NULL AND v.provider_sid IS DISTINCT FROM p_sid THEN RETURN false; END IF;
 UPDATE drive_notification_private.outbox SET
  state=CASE WHEN p_outcome='retry' THEN CASE WHEN attempts<3 THEN 'pending' ELSE 'failed' END ELSE p_outcome END,
  provider_sid=coalesce(p_sid,provider_sid),error_code=p_error,
  available_at=now()+make_interval(secs=>60*(2^greatest(attempts-1,0))::integer),updated_at=now()
 WHERE id=p_id;
 RETURN true;
END $$;

CREATE FUNCTION public.record_drive_whatsapp_receipt(p_id uuid,p_token uuid,p_sid text,p_phone text,p_state text,p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v drive_notification_private.outbox%ROWTYPE; order_states text[]:=ARRAY['accepted','queued','sent','delivered','read'];
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_state IS NULL OR p_state NOT IN ('accepted','queued','sending','sent','delivered','read','failed','undelivered')
  OR p_sid IS NULL OR p_sid !~ '^SM[0-9a-fA-F]{32}$'
  OR (p_error IS NOT NULL AND p_error !~ '^[A-Z0-9_]{1,64}$')
 THEN RAISE EXCEPTION 'INVALID_RECEIPT' USING ERRCODE='22023'; END IF;
 SELECT * INTO v FROM drive_notification_private.outbox WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR v.lease_token IS DISTINCT FROM p_token OR v.phone IS DISTINCT FROM p_phone
  OR v.attempts=0 OR v.state IN ('pending','claimed','suppressed')
  OR (v.provider_sid IS NOT NULL AND v.provider_sid<>p_sid) THEN RETURN false; END IF;
 INSERT INTO drive_notification_private.receipts(outbox_id,provider_sid,state) VALUES(p_id,p_sid,p_state) ON CONFLICT DO NOTHING;
 -- Provider 'sending' means accepted, not the worker's ambiguous send-intent state.
 IF p_state='sending' THEN p_state:='queued'; END IF;
 UPDATE drive_notification_private.outbox SET provider_sid=p_sid,
  state=CASE
   WHEN v.state='read' THEN 'read'
   WHEN p_state IN ('delivered','read') AND coalesce(array_position(order_states,p_state),0)>coalesce(array_position(order_states,v.state),0) THEN p_state
   WHEN v.state='delivered' THEN 'delivered'
   WHEN v.state IN ('failed','undelivered') THEN v.state
   WHEN p_state IN ('failed','undelivered') THEN p_state
   WHEN coalesce(array_position(order_states,p_state),0)>coalesce(array_position(order_states,v.state),0) THEN p_state
   ELSE v.state END,
  error_code=CASE WHEN p_state IN ('failed','undelivered') AND v.state NOT IN ('delivered','read') THEN p_error ELSE error_code END,
  updated_at=now() WHERE id=p_id;
 RETURN true;
END $$;

-- Scoped operational inspection without exposing phone numbers or provider credentials.
CREATE FUNCTION public.get_drive_whatsapp_delivery(p_request_id uuid)
RETURNS TABLE(audience text,state text,attempts integer,error_code text,updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR current_setting('role',true) IS DISTINCT FROM 'authenticated'
  OR NOT EXISTS(SELECT 1 FROM public.drive_request_context c WHERE c.request_id=p_request_id
   AND public.has_operational_access('operations:read',c.country,false))
 THEN RAISE EXCEPTION 'OPERATIONS_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT o.audience,o.state,o.attempts,o.error_code,o.updated_at
  FROM drive_notification_private.outbox o WHERE o.request_id=p_request_id ORDER BY o.created_at;
END $$;

REVOKE ALL ON FUNCTION public.claim_drive_whatsapp(),public.begin_drive_whatsapp(uuid,uuid),
 public.finish_drive_whatsapp(uuid,uuid,text,text,text),public.record_drive_whatsapp_receipt(uuid,uuid,text,text,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.claim_drive_whatsapp(),public.begin_drive_whatsapp(uuid,uuid),
 public.finish_drive_whatsapp(uuid,uuid,text,text,text),public.record_drive_whatsapp_receipt(uuid,uuid,text,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.get_drive_whatsapp_delivery(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_drive_whatsapp_delivery(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
