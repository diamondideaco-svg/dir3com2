-- Task166 LOCAL forward. No enrollment, activation, backfill, keys or sends.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE drive_notification_private.continuous_services (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), approval_reference text NOT NULL UNIQUE CHECK(length(approval_reference) BETWEEN 8 AND 120),
 bindings jsonb NOT NULL, phone_number_id text NOT NULL CHECK(phone_number_id ~ '^[0-9]{5,32}$'),
 webhook_id uuid NOT NULL CHECK(webhook_id<>'00000000-0000-0000-0000-000000000000'::uuid),
 daily_limit integer NOT NULL CHECK(daily_limit BETWEEN 1 AND 100),
 prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(), activated_at timestamptz, stopped_at timestamptz,
 last_worker_at timestamptz, CHECK(stopped_at IS NULL OR activated_at IS NOT NULL)
);
CREATE TABLE drive_notification_private.continuous_scopes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_id uuid NOT NULL REFERENCES drive_notification_private.continuous_services(id),
 subscription_id uuid NOT NULL REFERENCES drive_notification_private.subscriptions(id),
 recipient_user_id uuid NOT NULL REFERENCES public.profiles(id), audience text NOT NULL CHECK(audience IN ('customer','operations')),
 country text NOT NULL CHECK(country='EG'), phone text NOT NULL CHECK(phone ~ '^\+[1-9][0-9]{6,14}$'),
 language text NOT NULL CHECK(language IN ('ar','en')), consent_reference text NOT NULL, verified_at timestamptz NOT NULL,
 action text NOT NULL CHECK(action IN ('created','review','confirm','decline','customer_accept')),
 template jsonb NOT NULL, stopped_at timestamptz, UNIQUE(service_id,subscription_id,action),
 CHECK(audience='customer' OR action='created')
);
CREATE TABLE drive_notification_private.continuous_receipt_inbox (
 service_id uuid NOT NULL REFERENCES drive_notification_private.continuous_services(id),
 provider_sid text NOT NULL CHECK(provider_sid ~ '^wamid\.[A-Za-z0-9_+/=-]{1,250}$'),
 phone_number_id text NOT NULL, phone text NOT NULL, state text NOT NULL CHECK(state IN ('sent','delivered','read','failed')),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(), matched_outbox_id uuid REFERENCES drive_notification_private.outbox(id),
 PRIMARY KEY(service_id,provider_sid,state)
);
ALTER TABLE drive_notification_private.continuous_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_notification_private.continuous_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_notification_private.continuous_receipt_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON drive_notification_private.continuous_services,drive_notification_private.continuous_scopes,drive_notification_private.continuous_receipt_inbox FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON drive_notification_private.continuous_services,drive_notification_private.continuous_scopes,drive_notification_private.continuous_receipt_inbox TO service_role;
ALTER TABLE drive_notification_private.settings DROP CONSTRAINT settings_dispatch_mode_check;
ALTER TABLE drive_notification_private.settings ADD CONSTRAINT settings_dispatch_mode_check CHECK(dispatch_mode IN ('target_only','general','continuous'));
ALTER TABLE drive_notification_private.settings ADD COLUMN active_continuous_service_id uuid REFERENCES drive_notification_private.continuous_services(id);
ALTER TABLE drive_notification_private.outbox ADD COLUMN continuous_scope_id uuid REFERENCES drive_notification_private.continuous_scopes(id), ADD COLUMN continuous_intent_at timestamptz,
 ADD COLUMN continuous_expected_version integer CHECK(continuous_expected_version>=0);
ALTER TABLE drive_notification_private.outbox ADD CONSTRAINT outbox_origin_exclusive CHECK(continuous_scope_id IS NULL OR (current_state_target_id IS NULL AND continuous_expected_version IS NOT NULL));
CREATE INDEX drive_continuous_pending ON drive_notification_private.outbox(available_at,id) WHERE continuous_scope_id IS NOT NULL AND state='pending';
CREATE INDEX drive_continuous_budget ON drive_notification_private.outbox(continuous_intent_at,continuous_scope_id) WHERE continuous_intent_at IS NOT NULL;

CREATE FUNCTION public.prepare_kapso_continuous_service(p_scopes jsonb,p_sender text,p_webhook uuid,p_templates jsonb,p_approval text,p_daily_limit integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg drive_notification_private.continuous_services%ROWTYPE; binding jsonb; x jsonb; sub drive_notification_private.subscriptions%ROWTYPE;
 action text; template jsonb; stamp timestamptz:=clock_timestamp();
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_scopes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_scopes) NOT BETWEEN 1 AND 100
  OR jsonb_typeof(p_templates) IS DISTINCT FROM 'object' OR p_sender IS NULL OR p_sender !~ '^[0-9]{5,32}$'
  OR p_webhook IS NULL OR p_webhook='00000000-0000-0000-0000-000000000000'::uuid
  OR p_daily_limit IS NULL OR p_daily_limit NOT BETWEEN 1 AND 100 OR p_approval IS NULL OR length(p_approval) NOT BETWEEN 8 AND 120
 THEN RAISE EXCEPTION 'INVALID_CONTINUOUS_APPROVAL' USING ERRCODE='22023'; END IF;
 SELECT jsonb_agg(value ORDER BY value->>'subscriptionId',value->>'action') INTO binding FROM jsonb_array_elements(p_scopes);
 -- Serialize duplicate approval references without changing the current operating service.
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 SELECT * INTO cfg FROM drive_notification_private.continuous_services WHERE approval_reference=p_approval;
 IF FOUND THEN
  IF cfg.bindings IS DISTINCT FROM jsonb_build_object('scopes',binding,'templates',p_templates) OR cfg.phone_number_id IS DISTINCT FROM p_sender
   OR cfg.webhook_id IS DISTINCT FROM p_webhook OR cfg.daily_limit IS DISTINCT FROM p_daily_limit THEN RAISE EXCEPTION 'CONTINUOUS_APPROVAL_CONFLICT' USING ERRCODE='22023'; END IF;
  RETURN cfg.id;
 END IF;
 INSERT INTO drive_notification_private.continuous_services(approval_reference,bindings,phone_number_id,webhook_id,daily_limit)
 VALUES(p_approval,jsonb_build_object('scopes',binding,'templates',p_templates),p_sender,p_webhook,p_daily_limit) RETURNING * INTO cfg;
 FOR x IN SELECT value FROM jsonb_array_elements(binding) LOOP
  IF jsonb_typeof(x) IS DISTINCT FROM 'object' OR NOT x ?& ARRAY['subscriptionId','action'] OR (SELECT count(*) FROM jsonb_object_keys(x))<>2
   THEN RAISE EXCEPTION 'INVALID_CONTINUOUS_SCOPE' USING ERRCODE='22023'; END IF;
  action:=x->>'action';
  SELECT * INTO sub FROM drive_notification_private.subscriptions WHERE id=(x->>'subscriptionId')::uuid FOR SHARE;
  IF NOT FOUND OR NOT sub.enabled OR sub.verified_at>stamp OR sub.country<>'EG'
   OR action IS NULL OR action NOT IN ('created','review','confirm','decline','customer_accept') OR (sub.audience='operations' AND action<>'created')
   OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=sub.user_id AND status='active' AND deleted_at IS NULL)
   THEN RAISE EXCEPTION 'INELIGIBLE_CONTINUOUS_SCOPE' USING ERRCODE='22023'; END IF;
  template:=p_templates->(sub.audience||'.'||action||'.'||sub.language);
  IF NOT drive_notification_private.current_state_template_valid(template,sub.language) THEN RAISE EXCEPTION 'INVALID_CONTINUOUS_TEMPLATE' USING ERRCODE='22023'; END IF;
  INSERT INTO drive_notification_private.continuous_scopes(service_id,subscription_id,recipient_user_id,audience,country,phone,language,consent_reference,verified_at,action,template)
  VALUES(cfg.id,sub.id,sub.user_id,sub.audience,sub.country,sub.phone,sub.language,sub.consent_reference,sub.verified_at,action,template);
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_templates) key WHERE NOT EXISTS(SELECT 1 FROM drive_notification_private.continuous_scopes s WHERE s.service_id=cfg.id AND key=s.audience||'.'||s.action||'.'||s.language))
 THEN RAISE EXCEPTION 'UNBOUND_CONTINUOUS_TEMPLATE' USING ERRCODE='22023'; END IF;
 RETURN cfg.id;
END $$;

CREATE FUNCTION public.activate_kapso_continuous_service(p_service uuid,p_expected_active uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg drive_notification_private.settings%ROWTYPE; s drive_notification_private.continuous_services%ROWTYPE; stamp timestamptz:=clock_timestamp();
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 SELECT * INTO s FROM drive_notification_private.continuous_services WHERE id=p_service FOR UPDATE;
 IF NOT FOUND OR s.stopped_at IS NOT NULL THEN RAISE EXCEPTION 'INACTIVE_CONTINUOUS_SERVICE' USING ERRCODE='22023'; END IF;
 IF s.activated_at IS NOT NULL AND cfg.active_continuous_service_id=s.id THEN RETURN s.activated_at; END IF;
 IF s.activated_at IS NOT NULL OR cfg.active_continuous_service_id IS DISTINCT FROM p_expected_active
  OR EXISTS(SELECT 1 FROM drive_notification_private.execution_windows WHERE id=cfg.active_window_id AND stopped_at IS NULL)
  OR EXISTS(SELECT 1 FROM drive_notification_private.customer_authorizations WHERE id=cfg.active_customer_authorization_id AND stopped_at IS NULL)
 THEN RAISE EXCEPTION 'CONTINUOUS_ACTIVATION_CONFLICT' USING ERRCODE='22023'; END IF;
 UPDATE drive_notification_private.continuous_services SET stopped_at=coalesce(stopped_at,stamp) WHERE id=cfg.active_continuous_service_id;
 UPDATE drive_notification_private.continuous_services SET activated_at=stamp WHERE id=s.id;
 UPDATE drive_notification_private.settings SET active_continuous_service_id=s.id,dispatch_mode='continuous',active_window_id=NULL,active_customer_authorization_id=NULL WHERE singleton;
 -- Neither preparation nor activation enables capture/send or changes any budget counter.
 RETURN stamp;
END $$;

CREATE FUNCTION drive_notification_private.continuous_valid(p_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM drive_notification_private.outbox o
 JOIN drive_notification_private.continuous_scopes b ON b.id=o.continuous_scope_id
 JOIN drive_notification_private.continuous_services a ON a.id=b.service_id AND a.activated_at IS NOT NULL AND a.stopped_at IS NULL
 JOIN drive_notification_private.settings cfg ON cfg.singleton AND cfg.active_continuous_service_id=a.id AND cfg.dispatch_mode='continuous'
 JOIN drive_notification_private.subscriptions s ON s.id=b.subscription_id
 JOIN public.marketplace_requests r ON r.id=o.request_id JOIN public.drive_request_context c ON c.request_id=r.id
 WHERE o.id=p_id AND b.stopped_at IS NULL AND o.current_state_target_id IS NULL AND o.created_at>=a.activated_at AND o.created_at>clock_timestamp()-interval '24 hours'
 AND b.recipient_user_id=o.recipient_user_id AND b.subscription_id=o.subscription_id AND b.audience=o.audience AND b.action=o.action AND b.country=o.country
 AND b.phone=o.phone AND b.language=o.language AND s.user_id=b.recipient_user_id AND s.audience=b.audience AND s.country=b.country
 AND s.phone=b.phone AND s.language=b.language AND s.consent_reference=b.consent_reference AND s.verified_at=b.verified_at
 AND r.request_reference=o.request_reference AND r.status=o.expected_status AND c.version=o.continuous_expected_version AND r.requested_for>clock_timestamp() AND c.country=b.country
 AND (o.action<>'confirm' OR r.quote_expires_at>clock_timestamp()) AND drive_notification_private.eligible(s.id,r.id));
$$;

CREATE FUNCTION drive_notification_private.capture_continuous_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg drive_notification_private.settings%ROWTYPE; a drive_notification_private.continuous_services%ROWTYPE;
BEGIN
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF NOT FOUND OR cfg.dispatch_mode<>'continuous' OR NOT cfg.capture_enabled THEN RETURN NEW; END IF;
 SELECT * INTO a FROM drive_notification_private.continuous_services WHERE id=cfg.active_continuous_service_id;
 -- Transactions predating activation cannot become a backlog when their event trigger resumes.
 IF NOT FOUND OR a.activated_at IS NULL OR a.stopped_at IS NOT NULL OR transaction_timestamp()<a.activated_at THEN RETURN NEW; END IF;
 INSERT INTO drive_notification_private.outbox(event_id,request_id,subscription_id,recipient_user_id,audience,country,phone,language,action,request_reference,expected_status,created_at,continuous_scope_id,continuous_expected_version)
 SELECT NEW.id,r.id,s.id,s.user_id,s.audience,s.country,s.phone,s.language,NEW.action,r.request_reference,NEW.new_status,clock_timestamp(),b.id,c.version
 FROM drive_notification_private.continuous_scopes b JOIN drive_notification_private.subscriptions s ON s.id=b.subscription_id
 JOIN public.marketplace_requests r ON r.id=NEW.request_id JOIN public.drive_request_context c ON c.request_id=r.id
 WHERE b.service_id=a.id AND b.stopped_at IS NULL AND b.action=NEW.action AND b.country=NEW.country AND c.country=b.country
 AND s.user_id=b.recipient_user_id AND s.audience=b.audience AND s.country=b.country AND s.phone=b.phone AND s.language=b.language
 AND s.consent_reference=b.consent_reference AND s.verified_at=b.verified_at
 AND r.status=NEW.new_status AND r.requested_for>clock_timestamp()
 AND NEW.new_status=CASE NEW.action WHEN 'created' THEN 'request_submitted' WHEN 'review' THEN 'under_review' WHEN 'confirm' THEN 'awaiting_customer_acceptance' WHEN 'decline' THEN 'declined' WHEN 'customer_accept' THEN 'awaiting_payment' END
 AND drive_notification_private.eligible(s.id,r.id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER drive_whatsapp_capture_continuous AFTER INSERT ON public.drive_request_events FOR EACH ROW EXECUTE FUNCTION drive_notification_private.capture_continuous_event();

-- Revocation is durable even if a contact/consent/authority field is later restored.
-- These triggers only revoke private scopes, never mutate source consent or global service gates.
CREATE FUNCTION drive_notification_private.revoke_continuous_scopes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='subscriptions' THEN
  IF TG_OP='UPDATE' THEN
   IF ROW(OLD.user_id,OLD.audience,OLD.country,OLD.phone,OLD.language,OLD.consent_reference,OLD.verified_at,OLD.enabled)
    IS NOT DISTINCT FROM ROW(NEW.user_id,NEW.audience,NEW.country,NEW.phone,NEW.language,NEW.consent_reference,NEW.verified_at,NEW.enabled) THEN RETURN NEW; END IF;
  END IF;
  UPDATE drive_notification_private.continuous_scopes SET stopped_at=coalesce(stopped_at,clock_timestamp()) WHERE subscription_id=OLD.id;
 ELSIF TG_TABLE_NAME='profiles' THEN
  IF TG_OP='UPDATE' THEN
   IF ROW(OLD.role,OLD.status,OLD.deleted_at) IS NOT DISTINCT FROM ROW(NEW.role,NEW.status,NEW.deleted_at) THEN RETURN NEW; END IF;
  END IF;
  UPDATE drive_notification_private.continuous_scopes SET stopped_at=coalesce(stopped_at,clock_timestamp()) WHERE recipient_user_id=OLD.id;
 ELSIF TG_TABLE_NAME='team_access_grants' THEN
  IF TG_OP='UPDATE' THEN
   IF ROW(OLD.invited_user_id,OLD.status,OLD.access_level,OLD.permissions,OLD.country_scope)
    IS NOT DISTINCT FROM ROW(NEW.invited_user_id,NEW.status,NEW.access_level,NEW.permissions,NEW.country_scope) THEN RETURN NEW; END IF;
  END IF;
  UPDATE drive_notification_private.continuous_scopes SET stopped_at=coalesce(stopped_at,clock_timestamp()) WHERE recipient_user_id=OLD.invited_user_id AND audience='operations';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER drive_continuous_consent_revoked AFTER UPDATE OR DELETE ON drive_notification_private.subscriptions FOR EACH ROW EXECUTE FUNCTION drive_notification_private.revoke_continuous_scopes();
CREATE TRIGGER drive_continuous_profile_revoked AFTER UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION drive_notification_private.revoke_continuous_scopes();
CREATE TRIGGER drive_continuous_grant_revoked AFTER UPDATE OR DELETE ON public.team_access_grants FOR EACH ROW EXECUTE FUNCTION drive_notification_private.revoke_continuous_scopes();
REVOKE ALL ON FUNCTION drive_notification_private.revoke_continuous_scopes() FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION drive_notification_private.category_enabled(text,text,uuid,text) RENAME TO category_before_continuous;
CREATE FUNCTION drive_notification_private.category_enabled(p_audience text,p_action text,p_user uuid,p_language text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN cfg.dispatch_mode='continuous' THEN EXISTS(SELECT 1 FROM drive_notification_private.continuous_scopes s JOIN drive_notification_private.continuous_services a ON a.id=s.service_id
 WHERE a.id=cfg.active_continuous_service_id AND a.activated_at IS NOT NULL AND a.stopped_at IS NULL AND s.stopped_at IS NULL AND s.audience=p_audience AND s.action=p_action AND s.recipient_user_id=p_user AND s.language=p_language)
 ELSE drive_notification_private.category_before_continuous(p_audience,p_action,p_user,p_language) END FROM drive_notification_private.settings cfg WHERE cfg.singleton;
$$;

CREATE FUNCTION public.claim_kapso_continuous(p_templates jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg drive_notification_private.settings%ROWTYPE; o drive_notification_private.outbox%ROWTYPE; token uuid:=gen_random_uuid();
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF NOT FOUND OR cfg.dispatch_mode<>'continuous' OR NOT cfg.send_enabled OR jsonb_typeof(p_templates) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
 UPDATE drive_notification_private.continuous_services SET last_worker_at=clock_timestamp() WHERE id=cfg.active_continuous_service_id AND stopped_at IS NULL;
 UPDATE drive_notification_private.outbox SET state='unknown',error_code='SEND_LEASE_EXPIRED',updated_at=clock_timestamp() WHERE continuous_scope_id IS NOT NULL AND state='sending' AND lease_until<=clock_timestamp();
 UPDATE drive_notification_private.outbox SET state='pending',lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE continuous_scope_id IS NOT NULL AND state='claimed' AND attempts=0 AND lease_until<=clock_timestamp();
 SELECT q.* INTO o FROM drive_notification_private.outbox q JOIN drive_notification_private.continuous_scopes b ON b.id=q.continuous_scope_id
 WHERE q.state='pending' AND q.attempts=0 AND q.provider_sid IS NULL AND q.available_at<=clock_timestamp()
 AND b.template=p_templates->(q.audience||'.'||q.action||'.'||q.language) AND drive_notification_private.continuous_valid(q.id)
 ORDER BY q.created_at,q.id LIMIT 1 FOR UPDATE OF q SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE drive_notification_private.outbox SET state='claimed',lease_token=token,lease_until=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp() WHERE id=o.id;
 RETURN jsonb_build_object('id',o.id,'token',token,'audience',o.audience,'action',o.action,'language',o.language,'phone',o.phone,'reference',o.request_reference,'continuous_scope_id',o.continuous_scope_id);
END $$;

CREATE FUNCTION public.begin_kapso_continuous(p_id uuid,p_token uuid,p_sender text,p_template jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg drive_notification_private.settings%ROWTYPE; o drive_notification_private.outbox%ROWTYPE; b drive_notification_private.continuous_scopes%ROWTYPE; a drive_notification_private.continuous_services%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF NOT FOUND OR cfg.dispatch_mode<>'continuous' OR NOT cfg.send_enabled THEN RETURN false; END IF;
 SELECT * INTO o FROM drive_notification_private.outbox WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR o.continuous_scope_id IS NULL OR o.state<>'claimed' OR o.attempts<>0 OR o.lease_token IS DISTINCT FROM p_token OR o.lease_until<=clock_timestamp() THEN RETURN false; END IF;
 SELECT * INTO b FROM drive_notification_private.continuous_scopes WHERE id=o.continuous_scope_id;
 SELECT * INTO a FROM drive_notification_private.continuous_services WHERE id=b.service_id;
 BEGIN
  PERFORM 1 FROM public.marketplace_requests WHERE id=o.request_id FOR SHARE NOWAIT;
  PERFORM 1 FROM public.drive_request_context WHERE request_id=o.request_id FOR SHARE NOWAIT;
  PERFORM 1 FROM drive_notification_private.subscriptions WHERE id=b.subscription_id FOR SHARE NOWAIT;
  PERFORM 1 FROM public.profiles WHERE id=b.recipient_user_id FOR SHARE NOWAIT;
  IF b.audience='operations' THEN PERFORM 1 FROM public.team_access_grants WHERE invited_user_id=b.recipient_user_id FOR SHARE NOWAIT; END IF;
 EXCEPTION WHEN lock_not_available THEN RETURN false;
 END;
 IF NOT drive_notification_private.continuous_valid(o.id) OR a.phone_number_id IS DISTINCT FROM p_sender OR b.template IS DISTINCT FROM p_template THEN
  UPDATE drive_notification_private.outbox SET state='suppressed',error_code='STALE_OR_INELIGIBLE',updated_at=clock_timestamp() WHERE id=o.id; RETURN false;
 END IF;
 IF (SELECT count(*) FROM drive_notification_private.outbox q JOIN drive_notification_private.continuous_scopes s ON s.id=q.continuous_scope_id WHERE s.service_id=a.id AND q.continuous_intent_at>=(date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))>=a.daily_limit THEN RETURN false; END IF;
 IF NOT drive_notification_private.begin_legacy(o.id,p_token) THEN RETURN false; END IF;
 UPDATE drive_notification_private.outbox SET provider_phone_number_id=p_sender,continuous_intent_at=clock_timestamp() WHERE id=o.id;
 RETURN true;
END $$;

ALTER FUNCTION public.finish_drive_whatsapp(uuid,uuid,text,text,text) SET SCHEMA drive_notification_private;
ALTER FUNCTION drive_notification_private.finish_drive_whatsapp(uuid,uuid,text,text,text) RENAME TO finish_before_continuous;
CREATE FUNCTION public.finish_drive_whatsapp(p_id uuid,p_token uuid,p_outcome text,p_sid text DEFAULT NULL,p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o drive_notification_private.outbox%ROWTYPE; r record; ok boolean;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 SELECT * INTO o FROM drive_notification_private.outbox WHERE id=p_id FOR UPDATE;
 IF o.continuous_scope_id IS NOT NULL AND p_outcome='retry' THEN RAISE EXCEPTION 'RETRY_FORBIDDEN' USING ERRCODE='22023'; END IF;
 ok:=drive_notification_private.finish_before_continuous(p_id,p_token,p_outcome,p_sid,p_error);
 IF ok AND o.continuous_scope_id IS NOT NULL AND p_outcome='accepted' THEN
  FOR r IN SELECT i.* FROM drive_notification_private.continuous_receipt_inbox i JOIN drive_notification_private.continuous_scopes b ON b.service_id=i.service_id
   WHERE b.id=o.continuous_scope_id AND i.provider_sid=p_sid AND i.phone_number_id=o.provider_phone_number_id AND i.phone=o.phone AND i.matched_outbox_id IS NULL ORDER BY i.received_at,i.state LOOP
   IF public.record_drive_whatsapp_receipt(o.id,p_token,p_sid,o.phone,r.state,CASE WHEN r.state='failed' THEN 'KAPSO_DELIVERY_FAILED' ELSE NULL END) THEN
    UPDATE drive_notification_private.continuous_receipt_inbox SET matched_outbox_id=o.id WHERE service_id=r.service_id AND provider_sid=r.provider_sid AND state=r.state;
   END IF;
  END LOOP;
 END IF;
 RETURN ok;
END $$;

ALTER FUNCTION public.ingest_kapso_drive_whatsapp_receipt(text,text,text,text,text,text) SET SCHEMA drive_notification_private;
ALTER FUNCTION drive_notification_private.ingest_kapso_drive_whatsapp_receipt(text,text,text,text,text,text) RENAME TO ingest_before_continuous;
CREATE FUNCTION public.ingest_kapso_drive_whatsapp_receipt(p_sid text,p_phone_number_id text,p_phone text,p_state text,p_error text DEFAULT NULL,p_delivery_key_hash text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' SET statement_timeout='4s' AS $$
DECLARE o drive_notification_private.outbox%ROWTYPE; service uuid;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_sid IS NULL OR p_sid !~ '^wamid\.[A-Za-z0-9_+/=-]{1,250}$' OR p_state IS NULL OR p_state NOT IN ('sent','delivered','read','failed')
  OR p_phone_number_id IS NULL OR p_phone_number_id !~ '^[0-9]{5,32}$' OR p_phone IS NULL OR p_phone !~ '^\+[1-9][0-9]{6,14}$'
  OR (p_error IS NOT NULL AND p_error IS DISTINCT FROM 'KAPSO_DELIVERY_FAILED') OR (p_delivery_key_hash IS NOT NULL AND p_delivery_key_hash !~ '^[0-9a-f]{64}$')
 THEN RAISE EXCEPTION 'INVALID_RECEIPT' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 SELECT * INTO o FROM drive_notification_private.outbox WHERE continuous_scope_id IS NOT NULL AND provider_sid=p_sid AND provider_phone_number_id=p_phone_number_id AND phone=p_phone FOR UPDATE;
 IF FOUND THEN RETURN public.record_drive_whatsapp_receipt(o.id,o.lease_token,p_sid,p_phone,p_state,p_error); END IF;
 SELECT b.service_id INTO service FROM drive_notification_private.outbox q JOIN drive_notification_private.continuous_scopes b ON b.id=q.continuous_scope_id
 WHERE q.state='sending' AND q.attempts=1 AND q.provider_sid IS NULL AND q.provider_phone_number_id=p_phone_number_id AND q.phone=p_phone AND q.lease_until>clock_timestamp()
 ORDER BY q.created_at,q.id LIMIT 1;
 IF service IS NULL THEN RETURN drive_notification_private.ingest_before_continuous(p_sid,p_phone_number_id,p_phone,p_state,p_error,p_delivery_key_hash); END IF;
 IF EXISTS(SELECT 1 FROM drive_notification_private.continuous_receipt_inbox WHERE service_id=service AND provider_sid=p_sid AND state=p_state AND phone_number_id=p_phone_number_id AND phone=p_phone) THEN RETURN true; END IF;
 IF (SELECT count(*) FROM drive_notification_private.continuous_receipt_inbox WHERE service_id=service AND phone=p_phone AND matched_outbox_id IS NULL)>=8 THEN RETURN false; END IF;
 INSERT INTO drive_notification_private.continuous_receipt_inbox(service_id,provider_sid,phone_number_id,phone,state) VALUES(service,p_sid,p_phone_number_id,p_phone,p_state) ON CONFLICT DO NOTHING;
 -- Durable unbound evidence only. It is not attributed to a request by phone.
 RETURN EXISTS(SELECT 1 FROM drive_notification_private.continuous_receipt_inbox WHERE service_id=service AND provider_sid=p_sid AND state=p_state AND phone_number_id=p_phone_number_id AND phone=p_phone);
END $$;

ALTER FUNCTION drive_notification_private.stop_window(uuid,text) RENAME TO stop_before_continuous;
CREATE FUNCTION drive_notification_private.stop_window(p_window_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg drive_notification_private.settings%ROWTYPE; w drive_notification_private.execution_windows%ROWTYPE; notice uuid;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_reason IS NULL OR p_reason NOT IN ('manual','expired','unknown','delivered','failed') THEN RAISE EXCEPTION 'INVALID_STOP' USING ERRCODE='22023'; END IF;
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF cfg.dispatch_mode<>'continuous' THEN RETURN drive_notification_private.stop_before_continuous(p_window_id,p_reason); END IF;
 SELECT * INTO w FROM drive_notification_private.execution_windows WHERE id=p_window_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE drive_notification_private.execution_windows SET stopped_at=coalesce(stopped_at,clock_timestamp()),stop_reason=coalesce(stop_reason,p_reason),
  deactivation_required=(delivery_mode='webhook' AND NOT EXISTS(SELECT 1 FROM drive_notification_private.continuous_services a WHERE a.id=cfg.active_continuous_service_id AND a.activated_at IS NOT NULL AND a.stopped_at IS NULL AND a.webhook_id=w.webhook_id)) WHERE id=w.id;
 UPDATE drive_notification_private.customer_authorizations SET stopped_at=coalesce(stopped_at,clock_timestamp()) WHERE window_id=w.id;
 UPDATE drive_notification_private.current_state_targets SET stopped_at=coalesce(stopped_at,clock_timestamp()) WHERE window_id=w.id RETURNING notice_id INTO notice;
 IF notice IS NOT NULL AND NOT EXISTS(SELECT 1 FROM drive_notification_private.current_state_targets WHERE notice_id=notice AND stopped_at IS NULL) THEN
  UPDATE drive_notification_private.current_state_notices SET stopped_at=coalesce(stopped_at,clock_timestamp()) WHERE id=notice;
 END IF;
 RETURN jsonb_build_object('window_id',w.id,'webhook_id',w.webhook_id,'deactivation_required',(SELECT deactivation_required FROM drive_notification_private.execution_windows WHERE id=w.id));
END $$;

CREATE FUNCTION public.stop_kapso_continuous_service(p_service uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 UPDATE drive_notification_private.continuous_services SET stopped_at=coalesce(stopped_at,clock_timestamp()) WHERE id=p_service AND activated_at IS NOT NULL;
 RETURN FOUND;
END $$;

CREATE FUNCTION public.kapso_continuous_health()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('sendEnabled',cfg.send_enabled,'captureEnabled',cfg.capture_enabled,'mode',cfg.dispatch_mode,
 'serviceActive',coalesce(a.activated_at IS NOT NULL AND a.stopped_at IS NULL,false),'lastWorkerAt',a.last_worker_at,'budgetDay',cfg.budget_day,'budgetUsed',cfg.budget_used,'dailyLimit',cfg.daily_limit,'serviceDailyLimit',a.daily_limit,
 'pending',(SELECT count(*) FROM drive_notification_private.outbox WHERE continuous_scope_id IS NOT NULL AND state='pending'),
 'unknown',(SELECT count(*) FROM drive_notification_private.outbox WHERE continuous_scope_id IS NOT NULL AND state='unknown'),
 'failed',(SELECT count(*) FROM drive_notification_private.outbox WHERE continuous_scope_id IS NOT NULL AND state IN ('failed','undelivered')),
 'stalePending',(SELECT count(*) FROM drive_notification_private.outbox WHERE continuous_scope_id IS NOT NULL AND state='pending' AND created_at<clock_timestamp()-interval '24 hours'),
 'revokedScopes',(SELECT count(*) FROM drive_notification_private.continuous_scopes WHERE service_id=a.id AND stopped_at IS NOT NULL),
 'lastReceiptAt',(SELECT max(r.received_at) FROM drive_notification_private.receipts r JOIN drive_notification_private.outbox o ON o.id=r.outbox_id WHERE o.continuous_scope_id IS NOT NULL),
 'unmatchedReceipts',(SELECT count(*) FROM drive_notification_private.continuous_receipt_inbox WHERE matched_outbox_id IS NULL)) INTO result
 FROM drive_notification_private.settings cfg LEFT JOIN drive_notification_private.continuous_services a ON a.id=cfg.active_continuous_service_id WHERE cfg.singleton;
 RETURN result;
END $$;

-- Legacy consumers must not reclaim, alter or dispatch a continuous row even after a mode change.
CREATE OR REPLACE FUNCTION drive_notification_private.claim_general_legacy(p_template_keys text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v drive_notification_private.outbox%ROWTYPE; v_token uuid:=gen_random_uuid();
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton AND send_enabled FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE drive_notification_private.outbox o SET state='unknown',error_code='SEND_LEASE_EXPIRED',updated_at=now() WHERE state='sending' AND lease_until<=now() AND current_state_target_id IS NULL AND continuous_scope_id IS NULL AND NOT EXISTS(SELECT 1 FROM drive_notification_private.customer_authorizations a WHERE a.outbox_id=o.id);
 UPDATE drive_notification_private.outbox o SET state='pending',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE state='claimed' AND lease_until<=now() AND current_state_target_id IS NULL AND continuous_scope_id IS NULL AND NOT EXISTS(SELECT 1 FROM drive_notification_private.customer_authorizations a WHERE a.outbox_id=o.id);
 SELECT * INTO v FROM drive_notification_private.outbox o WHERE state='pending' AND available_at<=now() AND attempts<3 AND current_state_target_id IS NULL AND continuous_scope_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM drive_notification_private.customer_authorizations a WHERE a.outbox_id=o.id)
 AND drive_notification_private.category_enabled(audience,action,recipient_user_id,language) AND (p_template_keys IS NULL OR (audience||'.'||action||'.'||language)=ANY(p_template_keys)) ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE drive_notification_private.outbox SET state='claimed',lease_token=v_token,lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=v.id;
 RETURN jsonb_build_object('id',v.id,'token',v_token,'audience',v.audience,'action',v.action,'language',v.language,'phone',v.phone,'reference',v.request_reference);
END $$;

ALTER FUNCTION public.begin_drive_whatsapp(uuid,uuid) SET SCHEMA drive_notification_private;
ALTER FUNCTION drive_notification_private.begin_drive_whatsapp(uuid,uuid) RENAME TO begin_generic_before_continuous;
CREATE FUNCTION public.begin_drive_whatsapp(p_id uuid,p_token uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM drive_notification_private.outbox WHERE id=p_id AND continuous_scope_id IS NOT NULL) THEN RETURN false; END IF;
 RETURN drive_notification_private.begin_generic_before_continuous(p_id,p_token);
END $$;
ALTER FUNCTION public.claim_kapso_drive_whatsapp_target(uuid,uuid,uuid,text,text) SET SCHEMA drive_notification_private;
ALTER FUNCTION drive_notification_private.claim_kapso_drive_whatsapp_target(uuid,uuid,uuid,text,text) RENAME TO target_claim_before_continuous;
CREATE FUNCTION public.claim_kapso_drive_whatsapp_target(p_request_id uuid,p_outbox_id uuid,p_recipient_user_id uuid,p_category text,p_language text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM drive_notification_private.outbox WHERE id=p_outbox_id AND continuous_scope_id IS NOT NULL) THEN RETURN NULL; END IF;
 RETURN drive_notification_private.target_claim_before_continuous(p_request_id,p_outbox_id,p_recipient_user_id,p_category,p_language);
END $$;
ALTER FUNCTION public.begin_kapso_drive_whatsapp(uuid,uuid,text) SET SCHEMA drive_notification_private;
ALTER FUNCTION drive_notification_private.begin_kapso_drive_whatsapp(uuid,uuid,text) RENAME TO begin_before_continuous;
CREATE FUNCTION public.begin_kapso_drive_whatsapp(p_id uuid,p_token uuid,p_phone_number_id text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM drive_notification_private.outbox WHERE id=p_id AND continuous_scope_id IS NOT NULL) THEN RETURN false; END IF;
 RETURN drive_notification_private.begin_before_continuous(p_id,p_token,p_phone_number_id);
END $$;
ALTER FUNCTION public.begin_kapso_drive_whatsapp_provider_query(uuid,uuid,text) SET SCHEMA drive_notification_private;
ALTER FUNCTION drive_notification_private.begin_kapso_drive_whatsapp_provider_query(uuid,uuid,text) RENAME TO query_begin_before_continuous;
CREATE FUNCTION public.begin_kapso_drive_whatsapp_provider_query(p_id uuid,p_token uuid,p_phone_number_id text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM drive_notification_private.outbox WHERE id=p_id AND continuous_scope_id IS NOT NULL) THEN RETURN false; END IF;
 RETURN drive_notification_private.query_begin_before_continuous(p_id,p_token,p_phone_number_id);
END $$;
REVOKE ALL ON FUNCTION drive_notification_private.continuous_valid(uuid),drive_notification_private.capture_continuous_event(),drive_notification_private.category_before_continuous(text,text,uuid,text),drive_notification_private.category_enabled(text,text,uuid,text),drive_notification_private.stop_before_continuous(uuid,text),drive_notification_private.stop_window(uuid,text),drive_notification_private.claim_general_legacy(text[]),drive_notification_private.finish_before_continuous(uuid,uuid,text,text,text),drive_notification_private.ingest_before_continuous(text,text,text,text,text,text),drive_notification_private.begin_before_continuous(uuid,uuid,text),drive_notification_private.begin_generic_before_continuous(uuid,uuid),drive_notification_private.query_begin_before_continuous(uuid,uuid,text),drive_notification_private.target_claim_before_continuous(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.prepare_kapso_continuous_service(jsonb,text,uuid,jsonb,text,integer),public.activate_kapso_continuous_service(uuid,uuid),public.claim_kapso_continuous(jsonb),public.begin_kapso_continuous(uuid,uuid,text,jsonb),public.stop_kapso_continuous_service(uuid),public.kapso_continuous_health(),public.finish_drive_whatsapp(uuid,uuid,text,text,text),public.ingest_kapso_drive_whatsapp_receipt(text,text,text,text,text,text),public.begin_drive_whatsapp(uuid,uuid),public.begin_kapso_drive_whatsapp(uuid,uuid,text),public.begin_kapso_drive_whatsapp_provider_query(uuid,uuid,text),public.claim_kapso_drive_whatsapp_target(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_kapso_continuous_service(jsonb,text,uuid,jsonb,text,integer),public.activate_kapso_continuous_service(uuid,uuid),public.claim_kapso_continuous(jsonb),public.begin_kapso_continuous(uuid,uuid,text,jsonb),public.stop_kapso_continuous_service(uuid),public.kapso_continuous_health(),public.finish_drive_whatsapp(uuid,uuid,text,text,text),public.ingest_kapso_drive_whatsapp_receipt(text,text,text,text,text,text),public.begin_drive_whatsapp(uuid,uuid),public.begin_kapso_drive_whatsapp(uuid,uuid,text),public.begin_kapso_drive_whatsapp_provider_query(uuid,uuid,text),public.claim_kapso_drive_whatsapp_target(uuid,uuid,uuid,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
