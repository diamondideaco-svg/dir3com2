-- Task192 / Task166: extend the shared outbox to customer status and quote events.
-- Source-only forward migration. No enrollment, backfill, activation or applied SQL.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE drive_notification_private.settings
 ADD COLUMN IF NOT EXISTS customer_actions text[] NOT NULL DEFAULT '{}' CHECK
  (customer_actions <@ ARRAY['created','review','confirm','decline','customer_accept']::text[] AND array_position(customer_actions,NULL) IS NULL),
 ADD COLUMN IF NOT EXISTS customer_template_languages text[] NOT NULL DEFAULT '{}' CHECK
  (customer_template_languages <@ ARRAY['ar','en']::text[] AND array_position(customer_template_languages,NULL) IS NULL);

-- Category gate shared by atomic capture, claim and final pre-network eligibility.
-- Customer recipients still come exclusively from eligible subscription/request ownership.
CREATE OR REPLACE FUNCTION drive_notification_private.category_enabled(p_audience text,p_action text,p_user uuid,p_language text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM drive_notification_private.settings cfg WHERE cfg.singleton AND
  ((p_audience='operations' AND p_action='created' AND cfg.operations_created_enabled
    AND p_user=cfg.operations_recipient_user_id AND p_language=ANY(cfg.operations_template_languages))
   OR (p_audience='customer' AND p_action=ANY(cfg.customer_actions)
    AND p_language=ANY(cfg.customer_template_languages))));
$$;
REVOKE ALL ON FUNCTION drive_notification_private.category_enabled(text,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION drive_notification_private.capture_event()
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
  AND drive_notification_private.category_enabled(s.audience,NEW.action,s.user_id,s.language)
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
 WHERE state='pending' AND available_at<=now() AND attempts<3
  AND drive_notification_private.category_enabled(audience,action,recipient_user_id,language)
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
 IF NOT cfg.send_enabled THEN RETURN false; END IF;
 SELECT * INTO v FROM drive_notification_private.outbox WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR v.state<>'claimed' OR v.lease_token IS DISTINCT FROM p_token OR v.lease_until<=now() THEN RETURN false; END IF;
 IF NOT drive_notification_private.category_enabled(v.audience,v.action,v.recipient_user_id,v.language) THEN
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

-- Existing RPC privileges, RLS, unique event/recipient keys, sender/WAMID binding,
-- lease fencing, budget and monotonic receipts remain unchanged.
NOTIFY pgrst,'reload schema';
COMMIT;
