-- Task166 forward adaptation. No enrollment, backfill or activation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE drive_notification_private.settings
 ADD COLUMN IF NOT EXISTS operations_created_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS operations_recipient_user_id uuid REFERENCES public.profiles(id),
 ADD COLUMN IF NOT EXISTS operations_template_languages text[] NOT NULL DEFAULT '{}' CHECK
  (operations_template_languages <@ ARRAY['ar','en']::text[] AND array_position(operations_template_languages,NULL) IS NULL);
ALTER TABLE drive_notification_private.outbox ADD COLUMN IF NOT EXISTS provider_phone_number_id text CHECK(provider_phone_number_id ~ '^[0-9]{5,32}$');
ALTER TABLE drive_notification_private.outbox DROP CONSTRAINT IF EXISTS outbox_provider_sid_check;
ALTER TABLE drive_notification_private.outbox ADD CONSTRAINT outbox_provider_sid_check CHECK
 (provider_sid ~ '^SM[0-9a-fA-F]{32}$' OR provider_sid ~ '^wamid\.[A-Za-z0-9_+/=-]{1,250}$');

CREATE OR REPLACE FUNCTION drive_notification_private.capture_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT (SELECT capture_enabled AND operations_created_enabled FROM drive_notification_private.settings WHERE singleton) THEN RETURN NEW; END IF;
 IF NEW.action<>'created' THEN RETURN NEW; END IF;
 INSERT INTO drive_notification_private.outbox(event_id,request_id,subscription_id,recipient_user_id,
   audience,country,phone,language,action,request_reference,expected_status)
 SELECT NEW.id,NEW.request_id,s.id,s.user_id,s.audience,NEW.country,s.phone,s.language,NEW.action,r.request_reference,NEW.new_status
 FROM public.marketplace_requests r JOIN drive_notification_private.subscriptions s ON s.country=NEW.country
 WHERE r.id=NEW.request_id AND r.status=NEW.new_status
  AND NEW.new_status=CASE NEW.action WHEN 'created' THEN 'request_submitted' WHEN 'review' THEN 'under_review'
    WHEN 'confirm' THEN 'awaiting_customer_acceptance' WHEN 'decline' THEN 'declined' WHEN 'customer_accept' THEN 'awaiting_payment' END
  AND s.audience='operations' AND NEW.action='created'
  AND EXISTS(SELECT 1 FROM drive_notification_private.settings cfg WHERE cfg.singleton
    AND cfg.operations_created_enabled AND s.user_id=cfg.operations_recipient_user_id
    AND s.language=ANY(cfg.operations_template_languages))
  AND drive_notification_private.eligible(s.id,r.id)
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION drive_notification_private.capture_event() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.claim_drive_whatsapp()
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
 WHERE state='pending' AND available_at<=now() AND attempts<3 AND audience='operations' AND action='created'
  AND EXISTS(SELECT 1 FROM drive_notification_private.settings cfg WHERE cfg.singleton AND cfg.operations_created_enabled
    AND recipient_user_id=cfg.operations_recipient_user_id AND language=ANY(cfg.operations_template_languages))
 ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE drive_notification_private.outbox SET state='claimed',lease_token=v_token,lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=v.id;
 RETURN jsonb_build_object('id',v.id,'token',v_token,'audience',v.audience,'action',v.action,'language',v.language,
   'phone',v.phone,'reference',v.request_reference);
END $$;

CREATE OR REPLACE FUNCTION public.begin_drive_whatsapp(p_id uuid,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v drive_notification_private.outbox%ROWTYPE; cfg drive_notification_private.settings%ROWTYPE; valid boolean;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF NOT cfg.send_enabled OR NOT cfg.operations_created_enabled THEN RETURN false; END IF;
 SELECT * INTO v FROM drive_notification_private.outbox WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR v.state<>'claimed' OR v.lease_token IS DISTINCT FROM p_token OR v.lease_until<=now() THEN RETURN false; END IF;
 IF v.audience<>'operations' OR v.action<>'created' OR v.recipient_user_id IS DISTINCT FROM cfg.operations_recipient_user_id
  OR NOT (v.language=ANY(cfg.operations_template_languages)) THEN
  UPDATE drive_notification_private.outbox SET state='suppressed',error_code='CATEGORY_DISABLED',updated_at=now() WHERE id=p_id;
  RETURN false;
 END IF;
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

CREATE OR REPLACE FUNCTION public.finish_drive_whatsapp(p_id uuid,p_token uuid,p_outcome text,p_sid text DEFAULT NULL,p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v drive_notification_private.outbox%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_outcome IS NULL OR p_outcome NOT IN ('accepted','retry','failed','unknown')
  OR (p_outcome='accepted' AND (p_sid IS NULL OR (p_sid !~ '^SM[0-9a-fA-F]{32}$' AND p_sid !~ '^wamid\.[A-Za-z0-9_+/=-]{1,250}$')))
  OR (p_outcome<>'accepted' AND p_sid IS NOT NULL)
  OR (p_error IS NOT NULL AND p_error !~ '^[A-Z0-9_]{1,64}$')
 THEN RAISE EXCEPTION 'INVALID_RESULT' USING ERRCODE='22023'; END IF;
 SELECT * INTO v FROM drive_notification_private.outbox WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR v.lease_token IS DISTINCT FROM p_token THEN RETURN false; END IF;
 IF p_outcome='accepted' AND ((p_sid LIKE 'wamid.%') IS DISTINCT FROM (v.provider_phone_number_id IS NOT NULL)) THEN RETURN false; END IF;
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

CREATE OR REPLACE FUNCTION public.record_drive_whatsapp_receipt(p_id uuid,p_token uuid,p_sid text,p_phone text,p_state text,p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v drive_notification_private.outbox%ROWTYPE; order_states text[]:=ARRAY['accepted','queued','sent','delivered','read'];
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_state IS NULL OR p_state NOT IN ('accepted','queued','sending','sent','delivered','read','failed','undelivered')
  OR p_sid IS NULL OR (p_sid !~ '^SM[0-9a-fA-F]{32}$' AND p_sid !~ '^wamid\.[A-Za-z0-9_+/=-]{1,250}$')
  OR (p_error IS NOT NULL AND p_error !~ '^[A-Z0-9_]{1,64}$')
 THEN RAISE EXCEPTION 'INVALID_RECEIPT' USING ERRCODE='22023'; END IF;
 SELECT * INTO v FROM drive_notification_private.outbox WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR v.lease_token IS DISTINCT FROM p_token OR v.phone IS DISTINCT FROM p_phone
  OR v.attempts=0 OR v.state IN ('pending','claimed','suppressed')
  OR (v.provider_sid IS NOT NULL AND v.provider_sid<>p_sid) THEN RETURN false; END IF;
 IF ((p_sid LIKE 'wamid.%') IS DISTINCT FROM (v.provider_phone_number_id IS NOT NULL)) THEN RETURN false; END IF;
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

CREATE OR REPLACE FUNCTION public.begin_kapso_drive_whatsapp(p_id uuid,p_token uuid,p_phone_number_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_phone_number_id IS NULL OR p_phone_number_id !~ '^[0-9]{5,32}$' THEN RAISE EXCEPTION 'INVALID_SENDER' USING ERRCODE='22023'; END IF;
 -- Same settings-before-row lock order as the core worker; bind sender before network.
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF NOT public.begin_drive_whatsapp(p_id,p_token) THEN RETURN false; END IF;
 UPDATE drive_notification_private.outbox SET provider_phone_number_id=p_phone_number_id WHERE id=p_id;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.record_kapso_drive_whatsapp_receipt(p_sid text,p_phone_number_id text,p_phone text,p_state text,p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v drive_notification_private.outbox%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_sid IS NULL OR p_sid !~ '^wamid\.[A-Za-z0-9_+/=-]{1,250}$' OR p_state IS NULL OR p_state NOT IN ('sent','delivered','read','failed')
 THEN RAISE EXCEPTION 'INVALID_RECEIPT' USING ERRCODE='22023'; END IF;
 SELECT * INTO v FROM drive_notification_private.outbox WHERE provider_sid=p_sid
  AND provider_phone_number_id=p_phone_number_id AND phone=p_phone FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 RETURN public.record_drive_whatsapp_receipt(v.id,v.lease_token,p_sid,p_phone,p_state,p_error);
END $$;
REVOKE ALL ON FUNCTION public.begin_kapso_drive_whatsapp(uuid,uuid,text),public.record_kapso_drive_whatsapp_receipt(text,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_kapso_drive_whatsapp(uuid,uuid,text),public.record_kapso_drive_whatsapp_receipt(text,text,text,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
