-- Task166. Source-only forward repair; does not enroll, backfill or enable anything.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE TABLE drive_notification_private.customer_authorizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 approval_reference text NOT NULL UNIQUE CHECK(length(approval_reference) BETWEEN 8 AND 120),
 request_reference text NOT NULL CHECK(request_reference ~ '^REQ-[0-9A-F]{20}$'),
 recipient_user_id uuid NOT NULL REFERENCES public.profiles(id),
 subscription_id uuid NOT NULL REFERENCES drive_notification_private.subscriptions(id),
 phone text NOT NULL CHECK(phone ~ '^\+[1-9][0-9]{6,14}$'),
 language text NOT NULL CHECK(language IN ('ar','en')),
 action text NOT NULL CHECK(action IN ('created','review','confirm','decline','customer_accept')),
 expected_version integer NOT NULL CHECK(expected_version>=0),
 phone_number_id text NOT NULL CHECK(phone_number_id ~ '^[0-9]{5,32}$'),
 webhook_id uuid NOT NULL CHECK(webhook_id<>'00000000-0000-0000-0000-000000000000'::uuid),
 outbox_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 request_id uuid REFERENCES public.drive_request_context(request_id),
 event_id uuid UNIQUE REFERENCES public.drive_request_events(id),
 window_id uuid UNIQUE REFERENCES drive_notification_private.execution_windows(id),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 stopped_at timestamptz,
 CHECK(expires_at>started_at AND expires_at<=started_at+interval '9 minutes'),
 CHECK((event_id IS NULL AND request_id IS NULL AND window_id IS NULL)
    OR (event_id IS NOT NULL AND request_id IS NOT NULL AND window_id IS NOT NULL))
);
ALTER TABLE drive_notification_private.customer_authorizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON drive_notification_private.customer_authorizations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON drive_notification_private.customer_authorizations TO service_role;
ALTER TABLE drive_notification_private.settings ADD COLUMN active_customer_authorization_id uuid
 REFERENCES drive_notification_private.customer_authorizations(id);
ALTER TABLE drive_notification_private.execution_windows DROP CONSTRAINT execution_windows_category_check;
ALTER TABLE drive_notification_private.execution_windows ADD CONSTRAINT execution_windows_category_check
 CHECK(category IN ('operations.created','customer.created','customer.review','customer.confirm','customer.decline','customer.customer_accept'));
ALTER TABLE drive_notification_private.execution_windows ADD CONSTRAINT customer_window_webhook_only
 CHECK(category='operations.created' OR delivery_mode='webhook');

-- This approval never captures an existing event. Creation binds the existing
-- deterministic request reference before the natural create RPC has run.
CREATE FUNCTION public.arm_kapso_customer_notification(p_reference text,p_user uuid,p_phone text,p_language text,
 p_action text,p_version integer,p_sender text,p_webhook uuid,p_approval text,p_expires timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg drive_notification_private.settings%ROWTYPE; s drive_notification_private.subscriptions%ROWTYPE;
 a drive_notification_private.customer_authorizations%ROWTYPE; stamp timestamptz; rid uuid; version integer;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF NOT FOUND OR cfg.dispatch_mode<>'target_only' OR cfg.send_enabled OR cfg.capture_enabled
  OR EXISTS(SELECT 1 FROM drive_notification_private.execution_windows WHERE id=cfg.active_window_id AND stopped_at IS NULL)
  OR EXISTS(SELECT 1 FROM drive_notification_private.customer_authorizations WHERE id=cfg.active_customer_authorization_id AND stopped_at IS NULL)
 THEN RAISE EXCEPTION 'CLOSED_GATES_REQUIRED' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM drive_notification_private.subscriptions WHERE user_id=p_user AND audience='customer' AND country='EG' FOR SHARE;
 stamp:=clock_timestamp();
 IF NOT FOUND OR NOT s.enabled OR s.verified_at>stamp OR s.phone IS DISTINCT FROM p_phone OR s.language IS DISTINCT FROM p_language
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user AND status='active' AND deleted_at IS NULL)
  OR p_reference IS NULL OR p_reference !~ '^REQ-[0-9A-F]{20}$'
  OR p_action IS NULL OR p_action NOT IN ('created','review','confirm','decline','customer_accept')
  OR p_language IS NULL OR p_language NOT IN ('ar','en') OR p_version IS NULL OR p_version<0
  OR p_expires IS NULL OR p_expires<=stamp OR p_expires>stamp+interval '9 minutes'
 THEN RAISE EXCEPTION 'INVALID_CUSTOMER_APPROVAL' USING ERRCODE='22023'; END IF;
 SELECT r.id,c.version INTO rid,version FROM public.marketplace_requests r JOIN public.drive_request_context c ON c.request_id=r.id
  WHERE r.request_reference=p_reference AND r.user_id=p_user AND c.country='EG';
 IF (p_action='created' AND (p_version<>0 OR EXISTS(SELECT 1 FROM public.marketplace_requests WHERE request_reference=p_reference)))
  OR (p_action<>'created' AND (rid IS NULL OR version IS DISTINCT FROM p_version OR NOT drive_notification_private.eligible(s.id,rid)))
 THEN RAISE EXCEPTION 'INELIGIBLE_CUSTOMER_APPROVAL' USING ERRCODE='22023'; END IF;
 INSERT INTO drive_notification_private.customer_authorizations(approval_reference,request_reference,recipient_user_id,subscription_id,
  phone,language,action,expected_version,phone_number_id,webhook_id,started_at,expires_at)
 VALUES(p_approval,p_reference,p_user,s.id,p_phone,p_language,p_action,p_version,p_sender,p_webhook,stamp,p_expires) RETURNING * INTO a;
 UPDATE drive_notification_private.settings SET active_customer_authorization_id=a.id,active_window_id=NULL WHERE singleton;
 RETURN jsonb_build_object('authorization_id',a.id,'outbox_id',a.outbox_id,'expires_at',a.expires_at);
END $$;

CREATE OR REPLACE FUNCTION drive_notification_private.capture_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg drive_notification_private.settings%ROWTYPE; a drive_notification_private.customer_authorizations%ROWTYPE;
 r public.marketplace_requests%ROWTYPE; c public.drive_request_context%ROWTYPE; wid uuid; stamp timestamptz;
BEGIN
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF NOT FOUND OR NOT cfg.capture_enabled THEN RETURN NEW; END IF;
 IF cfg.dispatch_mode='general' THEN
  INSERT INTO drive_notification_private.outbox(event_id,request_id,subscription_id,recipient_user_id,audience,country,phone,language,action,request_reference,expected_status)
  SELECT NEW.id,NEW.request_id,s.id,s.user_id,s.audience,NEW.country,s.phone,s.language,NEW.action,q.request_reference,NEW.new_status
  FROM public.marketplace_requests q JOIN drive_notification_private.subscriptions s ON s.country=NEW.country
  WHERE q.id=NEW.request_id AND q.status=NEW.new_status
   AND NEW.new_status=CASE NEW.action WHEN 'created' THEN 'request_submitted' WHEN 'review' THEN 'under_review'
    WHEN 'confirm' THEN 'awaiting_customer_acceptance' WHEN 'decline' THEN 'declined' WHEN 'customer_accept' THEN 'awaiting_payment' END
   AND drive_notification_private.category_enabled(s.audience,NEW.action,s.user_id,s.language)
   AND drive_notification_private.eligible(s.id,q.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
 END IF;
 SELECT * INTO a FROM drive_notification_private.customer_authorizations WHERE id=cfg.active_customer_authorization_id FOR UPDATE;
 stamp:=clock_timestamp();
 IF NOT FOUND OR a.stopped_at IS NOT NULL OR a.event_id IS NOT NULL OR a.expires_at<=stamp OR NEW.action IS DISTINCT FROM a.action
  OR NEW.country IS DISTINCT FROM 'EG' OR cfg.active_window_id IS NOT NULL THEN RETURN NEW; END IF;
 SELECT * INTO r FROM public.marketplace_requests WHERE id=NEW.request_id;
 SELECT * INTO c FROM public.drive_request_context WHERE request_id=NEW.request_id;
 IF r.user_id IS DISTINCT FROM a.recipient_user_id OR r.request_reference IS DISTINCT FROM a.request_reference
  OR c.country IS DISTINCT FROM 'EG' OR c.version IS DISTINCT FROM (a.expected_version+CASE WHEN a.action='created' THEN 0 ELSE 1 END)
  OR r.status IS DISTINCT FROM NEW.new_status OR r.requested_for<=stamp
  OR NEW.new_status IS DISTINCT FROM (CASE a.action WHEN 'created' THEN 'request_submitted' WHEN 'review' THEN 'under_review'
   WHEN 'confirm' THEN 'awaiting_customer_acceptance' WHEN 'decline' THEN 'declined' WHEN 'customer_accept' THEN 'awaiting_payment' END)
  OR (a.action='confirm' AND (r.quote_expires_at IS NULL OR r.quote_expires_at<=stamp))
  OR NOT drive_notification_private.category_enabled('customer',a.action,a.recipient_user_id,a.language)
  OR NOT drive_notification_private.eligible(a.subscription_id,r.id)
  OR NOT EXISTS(SELECT 1 FROM drive_notification_private.subscriptions WHERE id=a.subscription_id AND phone=a.phone AND language=a.language)
 THEN RETURN NEW; END IF;
 INSERT INTO drive_notification_private.outbox(id,event_id,request_id,subscription_id,recipient_user_id,audience,country,phone,language,action,request_reference,expected_status,created_at)
 VALUES(a.outbox_id,NEW.id,r.id,a.subscription_id,a.recipient_user_id,'customer','EG',a.phone,a.language,a.action,a.request_reference,NEW.new_status,stamp);
 INSERT INTO drive_notification_private.execution_windows(request_id,outbox_id,recipient_user_id,category,language,phone_number_id,webhook_id,
  approval_reference,started_at,expires_at,delivery_mode)
 VALUES(r.id,a.outbox_id,a.recipient_user_id,'customer.'||a.action,a.language,a.phone_number_id,a.webhook_id,a.approval_reference,a.started_at,a.expires_at,'webhook') RETURNING id INTO wid;
 UPDATE drive_notification_private.customer_authorizations SET request_id=r.id,event_id=NEW.id,window_id=wid WHERE id=a.id;
 UPDATE drive_notification_private.settings SET active_window_id=wid WHERE singleton;
 RETURN NEW;
END $$;

CREATE FUNCTION drive_notification_private.customer_binding_valid(p_window uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM drive_notification_private.settings cfg
 JOIN drive_notification_private.customer_authorizations a ON a.id=cfg.active_customer_authorization_id
 JOIN drive_notification_private.execution_windows w ON w.id=a.window_id AND w.id=cfg.active_window_id
 JOIN drive_notification_private.outbox o ON o.id=a.outbox_id AND o.id=w.outbox_id
 JOIN public.drive_request_events e ON e.id=a.event_id AND e.id=o.event_id
 JOIN public.marketplace_requests r ON r.id=a.request_id AND r.id=o.request_id AND r.id=w.request_id
 JOIN public.drive_request_context c ON c.request_id=r.id
 JOIN drive_notification_private.subscriptions s ON s.id=a.subscription_id AND s.id=o.subscription_id
 WHERE cfg.singleton AND cfg.dispatch_mode='target_only' AND w.id=p_window AND a.stopped_at IS NULL
 AND w.stopped_at IS NULL AND a.expires_at>clock_timestamp() AND w.expires_at=a.expires_at AND w.delivery_mode='webhook'
 AND r.user_id=a.recipient_user_id AND r.request_reference=a.request_reference AND r.requested_for>clock_timestamp()
 AND w.recipient_user_id=a.recipient_user_id AND o.recipient_user_id=a.recipient_user_id AND s.user_id=a.recipient_user_id
 AND w.category='customer.'||a.action AND o.audience='customer' AND o.action=a.action AND e.action=a.action
 AND e.request_id=r.id AND e.country='EG' AND c.country='EG' AND o.country='EG' AND s.country='EG' AND s.audience='customer'
 AND c.version=a.expected_version+CASE WHEN a.action='created' THEN 0 ELSE 1 END
 AND r.status=o.expected_status AND e.new_status=o.expected_status AND o.created_at>=a.started_at
 AND o.phone=a.phone AND s.phone=a.phone AND o.language=a.language AND s.language=a.language AND w.language=a.language
 AND w.phone_number_id=a.phone_number_id AND w.webhook_id=a.webhook_id AND o.attempts<=1
 AND (a.action<>'confirm' OR r.quote_expires_at>clock_timestamp())
 AND drive_notification_private.category_enabled('customer',a.action,a.recipient_user_id,a.language)
 AND drive_notification_private.eligible(s.id,r.id));
$$;

ALTER FUNCTION public.claim_kapso_drive_whatsapp_target(uuid,uuid,uuid,text,text) SET SCHEMA drive_notification_private;
ALTER FUNCTION drive_notification_private.claim_kapso_drive_whatsapp_target(uuid,uuid,uuid,text,text) RENAME TO claim_window_legacy;
CREATE FUNCTION public.claim_kapso_drive_whatsapp_target(p_request_id uuid,p_outbox_id uuid,p_recipient_user_id uuid,p_category text,p_language text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg drive_notification_private.settings%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF p_category LIKE 'customer.%' AND NOT drive_notification_private.customer_binding_valid(cfg.active_window_id) THEN RETURN NULL; END IF;
 RETURN drive_notification_private.claim_window_legacy(p_request_id,p_outbox_id,p_recipient_user_id,p_category,p_language);
END $$;

-- Customer intent must retain every shared legacy guard. Lock the approved
-- subscription against concurrent revocation/contact edits until intent commits.
ALTER FUNCTION drive_notification_private.begin_delivery(uuid,uuid,text,text) RENAME TO begin_delivery_legacy;
CREATE FUNCTION drive_notification_private.begin_delivery(p_id uuid,p_token uuid,p_phone_number_id text,p_delivery_mode text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg drive_notification_private.settings%ROWTYPE; w drive_notification_private.execution_windows%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 SELECT * INTO w FROM drive_notification_private.execution_windows WHERE id=cfg.active_window_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM drive_notification_private.customer_authorizations WHERE outbox_id=p_id) THEN
  IF p_delivery_mode IS DISTINCT FROM 'webhook' OR cfg.dispatch_mode<>'target_only' OR w.outbox_id IS DISTINCT FROM p_id THEN RETURN false; END IF;
  PERFORM 1 FROM drive_notification_private.outbox WHERE id=p_id FOR UPDATE;
  PERFORM 1 FROM drive_notification_private.subscriptions WHERE id=(SELECT subscription_id FROM drive_notification_private.customer_authorizations WHERE window_id=w.id) FOR SHARE;
  IF NOT drive_notification_private.customer_binding_valid(w.id) THEN RETURN false; END IF;
 END IF;
 RETURN drive_notification_private.begin_delivery_legacy(p_id,p_token,p_phone_number_id,p_delivery_mode);
END $$;

CREATE OR REPLACE FUNCTION public.begin_drive_whatsapp(p_id uuid,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton AND dispatch_mode='general' FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM drive_notification_private.customer_authorizations WHERE outbox_id=p_id) THEN RETURN false; END IF;
 RETURN drive_notification_private.begin_legacy(p_id,p_token);
END $$;

ALTER FUNCTION drive_notification_private.stop_window(uuid,text) RENAME TO stop_window_legacy;
CREATE FUNCTION drive_notification_private.stop_window(p_window_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 result:=drive_notification_private.stop_window_legacy(p_window_id,p_reason);
 UPDATE drive_notification_private.customer_authorizations SET stopped_at=coalesce(stopped_at,clock_timestamp()) WHERE window_id=p_window_id;
 IF FOUND THEN UPDATE drive_notification_private.settings SET capture_enabled=false WHERE singleton AND active_window_id=p_window_id; END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.stop_kapso_customer_notification(p_authorization_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a drive_notification_private.customer_authorizations%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 SELECT * INTO a FROM drive_notification_private.customer_authorizations WHERE id=p_authorization_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF a.window_id IS NOT NULL THEN PERFORM drive_notification_private.stop_window(a.window_id,'manual'); END IF;
 UPDATE drive_notification_private.customer_authorizations SET stopped_at=coalesce(stopped_at,clock_timestamp()) WHERE id=a.id;
 UPDATE drive_notification_private.settings SET send_enabled=false,capture_enabled=false WHERE singleton AND active_customer_authorization_id=a.id;
 RETURN true;
END $$;

ALTER FUNCTION public.expire_kapso_drive_whatsapp_window() SET SCHEMA drive_notification_private;
ALTER FUNCTION drive_notification_private.expire_kapso_drive_whatsapp_window() RENAME TO expire_window_legacy;
CREATE FUNCTION public.expire_kapso_drive_whatsapp_window()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a drive_notification_private.customer_authorizations%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 SELECT x.* INTO a FROM drive_notification_private.customer_authorizations x JOIN drive_notification_private.settings cfg
  ON cfg.active_customer_authorization_id=x.id WHERE cfg.singleton FOR UPDATE OF x;
 IF FOUND AND a.stopped_at IS NULL AND a.expires_at<=clock_timestamp() AND a.window_id IS NULL THEN
  PERFORM public.stop_kapso_customer_notification(a.id);
  RETURN jsonb_build_object('authorization_id',a.id,'stopped',true);
 END IF;
 RETURN drive_notification_private.expire_window_legacy();
END $$;

-- Block generic claims from ever touching these rows, even if a later operator
-- switches mode. The trigger cannot backfill and the generic worker cannot replay.
CREATE OR REPLACE FUNCTION drive_notification_private.claim_general_legacy(p_template_keys text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v drive_notification_private.outbox%ROWTYPE; v_token uuid:=gen_random_uuid();
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton AND send_enabled FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE drive_notification_private.outbox o SET state='unknown',error_code='SEND_LEASE_EXPIRED',updated_at=now()
 WHERE state='sending' AND lease_until<=now() AND NOT EXISTS(SELECT 1 FROM drive_notification_private.customer_authorizations a WHERE a.outbox_id=o.id);
 UPDATE drive_notification_private.outbox o SET state='pending',lease_token=NULL,lease_until=NULL,updated_at=now()
 WHERE state='claimed' AND lease_until<=now() AND NOT EXISTS(SELECT 1 FROM drive_notification_private.customer_authorizations a WHERE a.outbox_id=o.id);
 SELECT * INTO v FROM drive_notification_private.outbox o WHERE state='pending' AND available_at<=now() AND attempts<3
  AND NOT EXISTS(SELECT 1 FROM drive_notification_private.customer_authorizations a WHERE a.outbox_id=o.id)
  AND drive_notification_private.category_enabled(audience,action,recipient_user_id,language)
  AND (p_template_keys IS NULL OR (audience||'.'||action||'.'||language)=ANY(p_template_keys))
 ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE drive_notification_private.outbox SET state='claimed',lease_token=v_token,lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=v.id;
 RETURN jsonb_build_object('id',v.id,'token',v_token,'audience',v.audience,'action',v.action,'language',v.language,'phone',v.phone,'reference',v.request_reference);
END $$;

REVOKE ALL ON FUNCTION drive_notification_private.customer_binding_valid(uuid),drive_notification_private.claim_window_legacy(uuid,uuid,uuid,text,text),
 drive_notification_private.begin_delivery_legacy(uuid,uuid,text,text),drive_notification_private.begin_delivery(uuid,uuid,text,text),
 drive_notification_private.stop_window_legacy(uuid,text),drive_notification_private.stop_window(uuid,text),
 drive_notification_private.expire_window_legacy(),
 drive_notification_private.capture_event(),drive_notification_private.claim_general_legacy(text[]) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.arm_kapso_customer_notification(text,uuid,text,text,text,integer,text,uuid,text,timestamptz),
 public.stop_kapso_customer_notification(uuid),public.claim_kapso_drive_whatsapp_target(uuid,uuid,uuid,text,text),
 public.expire_kapso_drive_whatsapp_window(),public.begin_drive_whatsapp(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.arm_kapso_customer_notification(text,uuid,text,text,text,integer,text,uuid,text,timestamptz),
 public.stop_kapso_customer_notification(uuid),public.claim_kapso_drive_whatsapp_target(uuid,uuid,uuid,text,text),
 public.expire_kapso_drive_whatsapp_window(),public.begin_drive_whatsapp(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
