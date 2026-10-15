-- Task199: local candidate only. No enrollment, activation, backfill or budget reset.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE drive_notification_private.execution_windows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.drive_request_context(request_id),
 outbox_id uuid NOT NULL UNIQUE REFERENCES drive_notification_private.outbox(id),
 recipient_user_id uuid NOT NULL REFERENCES public.profiles(id),
 category text NOT NULL CHECK(category='operations.created'),
 language text NOT NULL CHECK(language IN ('ar','en')),
 phone_number_id text NOT NULL CHECK(phone_number_id ~ '^[0-9]{5,32}$'),
 webhook_id uuid NOT NULL CHECK(webhook_id<>'00000000-0000-0000-0000-000000000000'::uuid),
 approval_reference text NOT NULL UNIQUE CHECK(length(approval_reference) BETWEEN 8 AND 120),
 started_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL CHECK(expires_at>started_at AND expires_at<=started_at+interval '10 minutes'),
 send_started_at timestamptz,
 stopped_at timestamptz,
 stop_reason text CHECK(stop_reason IN ('manual','expired','unknown','delivered','failed')),
 deactivation_required boolean NOT NULL DEFAULT false,
 CHECK((stopped_at IS NULL)=(stop_reason IS NULL))
);
CREATE TABLE drive_notification_private.receipt_inbox (
 window_id uuid NOT NULL REFERENCES drive_notification_private.execution_windows(id),
 provider_sid text NOT NULL CHECK(provider_sid ~ '^wamid\.[A-Za-z0-9_+/=-]{1,250}$'),
 state text NOT NULL CHECK(state IN ('delivered','failed')),
 delivery_key_hash text CHECK(delivery_key_hash ~ '^[0-9a-f]{64}$'),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 matched_at timestamptz,
 PRIMARY KEY(window_id,provider_sid,state),
 UNIQUE(window_id,delivery_key_hash)
);
COMMENT ON TABLE drive_notification_private.receipt_inbox IS
 'Only normalized status/WAMID metadata for a started, approved single-target window. No body, message text, contacts, secret or raw headers. Unbound is not order delivery.';
ALTER TABLE drive_notification_private.execution_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_notification_private.receipt_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON drive_notification_private.execution_windows,drive_notification_private.receipt_inbox FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON drive_notification_private.execution_windows,drive_notification_private.receipt_inbox TO service_role;
ALTER TABLE drive_notification_private.settings
 ADD COLUMN dispatch_mode text NOT NULL DEFAULT 'target_only' CHECK(dispatch_mode IN ('target_only','general')),
 ADD COLUMN active_window_id uuid REFERENCES drive_notification_private.execution_windows(id);

CREATE OR REPLACE FUNCTION drive_notification_private.capture_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT (SELECT capture_enabled AND dispatch_mode='general' FROM drive_notification_private.settings WHERE singleton) THEN RETURN NEW; END IF;
 INSERT INTO drive_notification_private.outbox(event_id,request_id,subscription_id,recipient_user_id,
   audience,country,phone,language,action,request_reference,expected_status)
 SELECT NEW.id,NEW.request_id,s.id,s.user_id,s.audience,NEW.country,s.phone,s.language,NEW.action,r.request_reference,NEW.new_status
 FROM public.marketplace_requests r JOIN drive_notification_private.subscriptions s ON s.country=NEW.country
 WHERE r.id=NEW.request_id AND r.status=NEW.new_status
  AND NEW.new_status=CASE NEW.action WHEN 'created' THEN 'request_submitted' WHEN 'review' THEN 'under_review'
    WHEN 'confirm' THEN 'awaiting_customer_acceptance' WHEN 'decline' THEN 'declined' WHEN 'customer_accept' THEN 'awaiting_payment' END
  AND drive_notification_private.category_enabled(s.audience,NEW.action,s.user_id,s.language)
  AND drive_notification_private.eligible(s.id,r.id)
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION drive_notification_private.capture_event() FROM PUBLIC,anon,authenticated,service_role;


-- Reuse the exact installed domain implementations, fenced behind new wrappers.
ALTER FUNCTION drive_notification_private.claim(text[]) RENAME TO claim_general_legacy;
ALTER FUNCTION public.claim_kapso_drive_whatsapp_target(uuid,uuid,uuid,text,text) SET SCHEMA drive_notification_private;
ALTER FUNCTION drive_notification_private.claim_kapso_drive_whatsapp_target(uuid,uuid,uuid,text,text) RENAME TO claim_target_legacy;
ALTER FUNCTION public.begin_drive_whatsapp(uuid,uuid) SET SCHEMA drive_notification_private;
ALTER FUNCTION drive_notification_private.begin_drive_whatsapp(uuid,uuid) RENAME TO begin_legacy;
ALTER FUNCTION public.finish_drive_whatsapp(uuid,uuid,text,text,text) SET SCHEMA drive_notification_private;
ALTER FUNCTION drive_notification_private.finish_drive_whatsapp(uuid,uuid,text,text,text) RENAME TO finish_legacy;
REVOKE ALL ON FUNCTION drive_notification_private.claim_general_legacy(text[]),
 drive_notification_private.claim_target_legacy(uuid,uuid,uuid,text,text),
 drive_notification_private.begin_legacy(uuid,uuid),drive_notification_private.finish_legacy(uuid,uuid,text,text,text)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION drive_notification_private.stop_window(p_window_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w drive_notification_private.execution_windows%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_reason IS NULL OR p_reason NOT IN ('manual','expired','unknown','delivered','failed') THEN RAISE EXCEPTION 'INVALID_STOP' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 SELECT * INTO w FROM drive_notification_private.execution_windows WHERE id=p_window_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE drive_notification_private.execution_windows SET stopped_at=coalesce(stopped_at,clock_timestamp()),
  stop_reason=coalesce(stop_reason,p_reason),deactivation_required=true WHERE id=w.id;
 UPDATE drive_notification_private.settings SET send_enabled=false WHERE singleton AND active_window_id=w.id;
 RETURN jsonb_build_object('window_id',w.id,'webhook_id',w.webhook_id,'deactivation_required',true);
END $$;
REVOKE ALL ON FUNCTION drive_notification_private.stop_window(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.open_kapso_drive_whatsapp_window(p_request_id uuid,p_outbox_id uuid,p_recipient_user_id uuid,
 p_category text,p_language text,p_phone_number_id text,p_webhook_id uuid,p_approval_reference text,p_expires_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg drive_notification_private.settings%ROWTYPE; v drive_notification_private.outbox%ROWTYPE;
 created uuid; started timestamptz:=clock_timestamp();
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_category IS DISTINCT FROM 'operations.created' OR p_language IS NULL OR p_language NOT IN ('ar','en')
  OR p_phone_number_id IS NULL OR p_phone_number_id !~ '^[0-9]{5,32}$'
  OR p_expires_at IS NULL OR p_expires_at<=started OR p_expires_at>started+interval '10 minutes'
  OR p_approval_reference IS NULL OR length(p_approval_reference) NOT BETWEEN 8 AND 120
 THEN RAISE EXCEPTION 'INVALID_WINDOW' USING ERRCODE='22023'; END IF;
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SETTINGS_REQUIRED' USING ERRCODE='22023'; END IF;
 IF cfg.dispatch_mode<>'target_only' OR cfg.active_window_id IS NOT NULL THEN RAISE EXCEPTION 'WINDOW_ALREADY_ASSIGNED' USING ERRCODE='22023'; END IF;
 SELECT * INTO v FROM drive_notification_private.outbox WHERE id=p_outbox_id AND request_id=p_request_id
  AND recipient_user_id=p_recipient_user_id AND (audience||'.'||action)=p_category AND language=p_language
  AND state='pending' AND attempts=0 AND provider_sid IS NULL AND provider_phone_number_id IS NULL
  AND lease_token IS NULL AND lease_until IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT drive_notification_private.eligible(v.subscription_id,v.request_id)
  OR NOT EXISTS(SELECT 1 FROM public.marketplace_requests r WHERE r.id=v.request_id AND r.status=v.expected_status AND r.requested_for>started)
 THEN RAISE EXCEPTION 'INELIGIBLE_TARGET' USING ERRCODE='22023'; END IF;
 INSERT INTO drive_notification_private.execution_windows(request_id,outbox_id,recipient_user_id,category,language,phone_number_id,
  webhook_id,approval_reference,started_at,expires_at)
 VALUES(p_request_id,p_outbox_id,p_recipient_user_id,p_category,p_language,p_phone_number_id,p_webhook_id,p_approval_reference,started,p_expires_at)
 RETURNING id INTO created;
 -- This does not enable send/category/capture or enroll anyone.
 UPDATE drive_notification_private.settings SET active_window_id=created WHERE singleton;
 RETURN created;
END $$;

CREATE FUNCTION drive_notification_private.claim(p_template_keys text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE mode text;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT dispatch_mode INTO mode FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF mode IS DISTINCT FROM 'general' THEN RETURN NULL; END IF;
 -- Crucially: target-only returns before any legacy lease housekeeping.
 RETURN drive_notification_private.claim_general_legacy(p_template_keys);
END $$;
CREATE OR REPLACE FUNCTION public.claim_drive_whatsapp()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT drive_notification_private.claim(NULL); $$;
CREATE OR REPLACE FUNCTION public.claim_kapso_drive_whatsapp(p_template_keys text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_template_keys IS NULL OR cardinality(p_template_keys) NOT BETWEEN 1 AND 12
  OR array_position(p_template_keys,NULL) IS NOT NULL
  OR NOT (p_template_keys <@ ARRAY['operations.created.ar','operations.created.en',
   'customer.created.ar','customer.created.en','customer.review.ar','customer.review.en',
   'customer.confirm.ar','customer.confirm.en','customer.decline.ar','customer.decline.en',
   'customer.customer_accept.ar','customer.customer_accept.en']::text[])
 THEN RAISE EXCEPTION 'INVALID_TEMPLATE_KEYS' USING ERRCODE='22023'; END IF;
 RETURN drive_notification_private.claim(p_template_keys);
END $$;

CREATE FUNCTION public.claim_kapso_drive_whatsapp_target(p_request_id uuid,p_outbox_id uuid,p_recipient_user_id uuid,p_category text,p_language text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg drive_notification_private.settings%ROWTYPE; w drive_notification_private.execution_windows%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF cfg.dispatch_mode<>'target_only' OR NOT cfg.send_enabled THEN RETURN NULL; END IF;
 SELECT * INTO w FROM drive_notification_private.execution_windows WHERE id=cfg.active_window_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF w.expires_at<=clock_timestamp() THEN PERFORM drive_notification_private.stop_window(w.id,'expired'); RETURN NULL; END IF;
 IF w.stopped_at IS NOT NULL OR w.send_started_at IS NOT NULL OR w.request_id IS DISTINCT FROM p_request_id
  OR w.outbox_id IS DISTINCT FROM p_outbox_id OR w.recipient_user_id IS DISTINCT FROM p_recipient_user_id
  OR w.category IS DISTINCT FROM p_category OR w.language IS DISTINCT FROM p_language THEN RETURN NULL; END IF;
 RETURN drive_notification_private.claim_target_legacy(p_request_id,p_outbox_id,p_recipient_user_id,p_category,p_language);
END $$;

CREATE FUNCTION public.begin_drive_whatsapp(p_id uuid,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE mode text;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT dispatch_mode INTO mode FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF mode IS DISTINCT FROM 'general' THEN RETURN false; END IF;
 RETURN drive_notification_private.begin_legacy(p_id,p_token);
END $$;
CREATE OR REPLACE FUNCTION public.begin_kapso_drive_whatsapp(p_id uuid,p_token uuid,p_phone_number_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg drive_notification_private.settings%ROWTYPE; w drive_notification_private.execution_windows%ROWTYPE;
 intent_at timestamptz;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_phone_number_id IS NULL OR p_phone_number_id !~ '^[0-9]{5,32}$' THEN RAISE EXCEPTION 'INVALID_SENDER' USING ERRCODE='22023'; END IF;
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF cfg.dispatch_mode='target_only' THEN
  SELECT * INTO w FROM drive_notification_private.execution_windows WHERE id=cfg.active_window_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF w.expires_at<=clock_timestamp() THEN PERFORM drive_notification_private.stop_window(w.id,'expired'); RETURN false; END IF;
  IF w.stopped_at IS NOT NULL OR w.send_started_at IS NOT NULL OR w.outbox_id IS DISTINCT FROM p_id
   OR w.phone_number_id IS DISTINCT FROM p_phone_number_id THEN RETURN false; END IF;
  -- An independently held outbox lock may outlive the wall-clock window.
  -- Acquire it before the final expiry checks; never use transaction now().
  PERFORM 1 FROM drive_notification_private.outbox WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF w.expires_at<=clock_timestamp() THEN PERFORM drive_notification_private.stop_window(w.id,'expired'); RETURN false; END IF;
 END IF;
 BEGIN
  IF NOT drive_notification_private.begin_legacy(p_id,p_token) THEN RETURN false; END IF;
  intent_at:=clock_timestamp();
  IF cfg.dispatch_mode='target_only' AND w.expires_at<=intent_at THEN
   RAISE EXCEPTION 'WINDOW_EXPIRED_DURING_BEGIN' USING ERRCODE='P1991';
  END IF;
  UPDATE drive_notification_private.outbox SET provider_phone_number_id=p_phone_number_id WHERE id=p_id;
  IF cfg.dispatch_mode='target_only' THEN UPDATE drive_notification_private.execution_windows SET send_started_at=intent_at WHERE id=w.id; END IF;
 EXCEPTION WHEN SQLSTATE 'P1991' THEN
  -- The subtransaction rolls back legacy intent/attempt/budget changes first.
  PERFORM drive_notification_private.stop_window(w.id,'expired');
  RETURN false;
 END;
 RETURN true;
END $$;

CREATE FUNCTION drive_notification_private.drain_receipts(p_window_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w drive_notification_private.execution_windows%ROWTYPE; v drive_notification_private.outbox%ROWTYPE; r record;
BEGIN
 -- Caller holds settings -> window -> outbox, never locks across provider I/O.
 SELECT * INTO w FROM drive_notification_private.execution_windows WHERE id=p_window_id;
 SELECT * INTO v FROM drive_notification_private.outbox WHERE id=w.outbox_id;
 IF v.provider_sid IS NULL THEN RETURN; END IF;
 FOR r IN SELECT * FROM drive_notification_private.receipt_inbox WHERE window_id=w.id
  AND provider_sid=v.provider_sid AND matched_at IS NULL ORDER BY received_at,state LOOP
  IF public.record_drive_whatsapp_receipt(v.id,v.lease_token,r.provider_sid,v.phone,r.state,
    CASE WHEN r.state='failed' THEN 'KAPSO_DELIVERY_FAILED' ELSE NULL END) THEN
   UPDATE drive_notification_private.receipt_inbox SET matched_at=clock_timestamp()
    WHERE window_id=w.id AND provider_sid=r.provider_sid AND state=r.state;
   PERFORM drive_notification_private.stop_window(w.id,r.state);
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION drive_notification_private.drain_receipts(uuid),drive_notification_private.claim(text[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.finish_drive_whatsapp(p_id uuid,p_token uuid,p_outcome text,p_sid text DEFAULT NULL,p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w drive_notification_private.execution_windows%ROWTYPE; ok boolean;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 SELECT * INTO w FROM drive_notification_private.execution_windows WHERE outbox_id=p_id FOR UPDATE;
 IF w.id IS NOT NULL AND p_outcome='retry' THEN RAISE EXCEPTION 'RETRY_FORBIDDEN' USING ERRCODE='22023'; END IF;
 ok:=drive_notification_private.finish_legacy(p_id,p_token,p_outcome,p_sid,p_error);
 IF ok AND w.id IS NOT NULL THEN
  IF p_outcome='accepted' THEN PERFORM drive_notification_private.drain_receipts(w.id);
  ELSIF p_outcome IN ('unknown','failed') THEN PERFORM drive_notification_private.stop_window(w.id,CASE WHEN p_outcome='failed' THEN 'failed' ELSE 'unknown' END);
  END IF;
 END IF;
 RETURN ok;
END $$;

CREATE FUNCTION public.ingest_kapso_drive_whatsapp_receipt(p_sid text,p_phone_number_id text,p_phone text,p_state text,
 p_error text DEFAULT NULL,p_delivery_key_hash text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' SET statement_timeout='4s' AS $$
DECLARE cfg drive_notification_private.settings%ROWTYPE; w drive_notification_private.execution_windows%ROWTYPE;
 v drive_notification_private.outbox%ROWTYPE; inserted integer;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_sid IS NULL OR p_sid !~ '^wamid\.[A-Za-z0-9_+/=-]{1,250}$' OR p_state IS NULL OR p_state NOT IN ('sent','delivered','read','failed')
  OR (p_delivery_key_hash IS NOT NULL AND p_delivery_key_hash !~ '^[0-9a-f]{64}$')
  OR (p_error IS NOT NULL AND p_error IS DISTINCT FROM 'KAPSO_DELIVERY_FAILED') THEN RAISE EXCEPTION 'INVALID_RECEIPT' USING ERRCODE='22023'; END IF;
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF cfg.dispatch_mode='general' THEN RETURN public.record_kapso_drive_whatsapp_receipt(p_sid,p_phone_number_id,p_phone,p_state,p_error); END IF;
 SELECT * INTO w FROM drive_notification_private.execution_windows WHERE id=cfg.active_window_id FOR UPDATE;
 IF NOT FOUND OR w.phone_number_id IS DISTINCT FROM p_phone_number_id OR w.send_started_at IS NULL OR p_state NOT IN ('delivered','failed') THEN RETURN false; END IF;
 SELECT * INTO v FROM drive_notification_private.outbox WHERE id=w.outbox_id FOR UPDATE;
 IF v.phone IS DISTINCT FROM p_phone OR v.provider_phone_number_id IS DISTINCT FROM p_phone_number_id
  OR (v.provider_sid IS NOT NULL AND v.provider_sid IS DISTINCT FROM p_sid) THEN RETURN false; END IF;
 IF v.provider_sid IS NULL AND w.expires_at<=clock_timestamp() THEN PERFORM drive_notification_private.stop_window(w.id,'expired'); RETURN false; END IF;
 IF v.provider_sid IS NULL AND NOT EXISTS(SELECT 1 FROM drive_notification_private.receipt_inbox WHERE window_id=w.id AND provider_sid=p_sid AND state=p_state)
  AND (SELECT count(*) FROM drive_notification_private.receipt_inbox WHERE window_id=w.id)>=8 THEN RETURN false; END IF;
 INSERT INTO drive_notification_private.receipt_inbox(window_id,provider_sid,state,delivery_key_hash)
 VALUES(w.id,p_sid,p_state,p_delivery_key_hash) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted=0 THEN RETURN EXISTS(SELECT 1 FROM drive_notification_private.receipt_inbox WHERE window_id=w.id AND provider_sid=p_sid AND state=p_state); END IF;
 -- Acknowledged unbound metadata is durable, but never attributed by phone alone.
 IF v.provider_sid=p_sid THEN PERFORM drive_notification_private.drain_receipts(w.id); END IF;
 RETURN true;
END $$;

CREATE FUNCTION public.stop_kapso_drive_whatsapp_window(p_window_id uuid,p_reason text DEFAULT 'manual')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_reason IS DISTINCT FROM 'manual' THEN RAISE EXCEPTION 'INVALID_STOP' USING ERRCODE='22023'; END IF;
 RETURN drive_notification_private.stop_window(p_window_id,p_reason);
END $$;
CREATE FUNCTION public.expire_kapso_drive_whatsapp_window()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w drive_notification_private.execution_windows%ROWTYPE; active uuid;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT active_window_id INTO active FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 SELECT * INTO w FROM drive_notification_private.execution_windows WHERE id=active FOR UPDATE;
 IF NOT FOUND OR w.expires_at>clock_timestamp() THEN RETURN NULL; END IF;
 RETURN drive_notification_private.stop_window(w.id,'expired');
END $$;
REVOKE ALL ON FUNCTION public.open_kapso_drive_whatsapp_window(uuid,uuid,uuid,text,text,text,uuid,text,timestamptz),
 public.claim_drive_whatsapp(),public.claim_kapso_drive_whatsapp(text[]),
 public.claim_kapso_drive_whatsapp_target(uuid,uuid,uuid,text,text),public.begin_drive_whatsapp(uuid,uuid),
 public.begin_kapso_drive_whatsapp(uuid,uuid,text),public.finish_drive_whatsapp(uuid,uuid,text,text,text),
 public.ingest_kapso_drive_whatsapp_receipt(text,text,text,text,text,text),
 public.stop_kapso_drive_whatsapp_window(uuid,text),public.expire_kapso_drive_whatsapp_window()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.open_kapso_drive_whatsapp_window(uuid,uuid,uuid,text,text,text,uuid,text,timestamptz),
 public.claim_drive_whatsapp(),public.claim_kapso_drive_whatsapp(text[]),
 public.claim_kapso_drive_whatsapp_target(uuid,uuid,uuid,text,text),public.begin_drive_whatsapp(uuid,uuid),
 public.begin_kapso_drive_whatsapp(uuid,uuid,text),public.finish_drive_whatsapp(uuid,uuid,text,text,text),
 public.ingest_kapso_drive_whatsapp_receipt(text,text,text,text,text,text),
 public.stop_kapso_drive_whatsapp_window(uuid,text),public.expire_kapso_drive_whatsapp_window() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
