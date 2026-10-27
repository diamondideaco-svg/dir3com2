-- Task166. SOURCE ONLY: explicit snapshot notices, never lifecycle replay.
-- No enrollment, activation, backfill, request mutation or provider I/O.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE TABLE drive_notification_private.current_state_notices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.drive_request_context(request_id),
 source_event_id uuid NOT NULL REFERENCES public.drive_request_events(id),
 expected_version integer NOT NULL CHECK(expected_version=0),
 expected_status text NOT NULL CHECK(expected_status='request_submitted'),
 purpose text NOT NULL DEFAULT 'current_state' CHECK(purpose='current_state'),
 approval_reference text NOT NULL UNIQUE CHECK(length(approval_reference) BETWEEN 8 AND 120),
 phone_number_id text NOT NULL CHECK(phone_number_id ~ '^[0-9]{5,32}$'),
 webhook_id uuid NOT NULL CHECK(webhook_id<>'00000000-0000-0000-0000-000000000000'::uuid),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 stopped_at timestamptz,
 CHECK(expires_at>started_at AND expires_at<=started_at+interval '9 minutes'),
 UNIQUE(request_id,expected_version,expected_status,purpose)
);
CREATE TABLE drive_notification_private.current_state_targets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 notice_id uuid NOT NULL REFERENCES drive_notification_private.current_state_notices(id),
 audience text NOT NULL CHECK(audience IN ('customer','operations')),
 recipient_user_id uuid NOT NULL REFERENCES public.profiles(id),
 subscription_id uuid NOT NULL REFERENCES drive_notification_private.subscriptions(id),
 phone text NOT NULL CHECK(phone ~ '^\+[1-9][0-9]{6,14}$'),
 language text NOT NULL CHECK(language IN ('ar','en')),
 template jsonb NOT NULL,
 window_id uuid UNIQUE REFERENCES drive_notification_private.execution_windows(id),
 stopped_at timestamptz,
 UNIQUE(notice_id,audience), UNIQUE(notice_id,recipient_user_id), UNIQUE(notice_id,phone)
);
ALTER TABLE drive_notification_private.current_state_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_notification_private.current_state_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON drive_notification_private.current_state_notices,drive_notification_private.current_state_targets FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON drive_notification_private.current_state_notices,drive_notification_private.current_state_targets TO service_role;
ALTER TABLE drive_notification_private.outbox ADD COLUMN current_state_target_id uuid UNIQUE
 REFERENCES drive_notification_private.current_state_targets(id);
ALTER TABLE drive_notification_private.outbox DROP CONSTRAINT outbox_action_check;
ALTER TABLE drive_notification_private.outbox ADD CONSTRAINT outbox_action_check CHECK
 ((current_state_target_id IS NULL AND action IN ('created','review','confirm','decline','customer_accept'))
 OR (current_state_target_id IS NOT NULL AND action='current_state'));
-- event_id remains genuine immutable provenance, not the cause of this notice.
COMMENT ON COLUMN drive_notification_private.outbox.current_state_target_id IS
 'Explicit current-state notification cause. event_id is original read-only provenance; no lifecycle event is inserted or relabelled.';
ALTER TABLE drive_notification_private.execution_windows DROP CONSTRAINT execution_windows_category_check;
ALTER TABLE drive_notification_private.execution_windows ADD CONSTRAINT execution_windows_category_check CHECK
 (category IN ('operations.created','customer.created','customer.review','customer.confirm','customer.decline','customer.customer_accept',
 'customer.current_state','operations.current_state'));
-- The preceding customer_window_webhook_only check also makes Operations snapshots webhook-only.

CREATE FUNCTION drive_notification_private.current_state_template_valid(p_template jsonb,p_language text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_typeof(p_template)='object' AND p_template ?& ARRAY['name','languageCode']
 AND (p_template-ARRAY['name','languageCode','bodyParameterNames'])='{}'::jsonb
 AND jsonb_typeof(p_template->'name')='string' AND length(p_template->>'name') BETWEEN 1 AND 512
 AND p_template->>'name' ~ '^[a-z][a-z0-9_]*$'
 AND (CASE p_language WHEN 'ar' THEN p_template->>'languageCode'='ar'
 WHEN 'en' THEN p_template->>'languageCode' IN ('en','en_US','en_GB') ELSE false END)
 AND (NOT p_template ? 'bodyParameterNames' OR
  (jsonb_typeof(p_template->'bodyParameterNames')='array' AND jsonb_array_length(p_template->'bodyParameterNames')=2
   AND jsonb_typeof(p_template->'bodyParameterNames'->0)='string' AND jsonb_typeof(p_template->'bodyParameterNames'->1)='string'
   AND p_template->'bodyParameterNames'->>0 ~ '^[a-z][a-z0-9_]{0,63}$'
   AND p_template->'bodyParameterNames'->>1 ~ '^[a-z][a-z0-9_]{0,63}$'
   AND p_template->'bodyParameterNames'->>0<>p_template->'bodyParameterNames'->>1)),false);
$$;

CREATE FUNCTION drive_notification_private.current_state_valid(p_outbox uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM drive_notification_private.outbox o
 JOIN drive_notification_private.current_state_targets t ON t.id=o.current_state_target_id
 JOIN drive_notification_private.current_state_notices n ON n.id=t.notice_id
 JOIN public.marketplace_requests r ON r.id=n.request_id AND r.id=o.request_id
 JOIN public.drive_request_context c ON c.request_id=r.id
 JOIN public.drive_request_events e ON e.id=n.source_event_id AND e.id=o.event_id
 JOIN drive_notification_private.subscriptions s ON s.id=t.subscription_id AND s.id=o.subscription_id
 WHERE o.id=p_outbox AND n.stopped_at IS NULL AND t.stopped_at IS NULL AND n.expires_at>clock_timestamp()
 AND c.version=n.expected_version AND r.status=n.expected_status AND r.status=o.expected_status AND r.requested_for>clock_timestamp()
 AND e.request_id=r.id AND e.action='created' AND e.new_status=n.expected_status AND e.country='EG' AND c.country='EG'
 AND o.action='current_state' AND o.request_reference=r.request_reference AND o.audience=t.audience
 AND o.recipient_user_id=t.recipient_user_id AND o.phone=t.phone AND o.language=t.language AND o.country='EG'
 AND s.user_id=t.recipient_user_id AND s.audience=t.audience AND s.country='EG' AND s.phone=t.phone AND s.language=t.language
 AND o.attempts<=1 AND drive_notification_private.eligible(s.id,r.id)
 AND drive_notification_private.current_state_template_valid(t.template,t.language));
$$;

CREATE FUNCTION public.prepare_kapso_current_state_notice(p_request_id uuid,p_version integer,p_status text,
 p_customer_subscription uuid,p_operations_subscription uuid,p_sender text,p_webhook uuid,p_templates jsonb,p_approval text,p_expires timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg drive_notification_private.settings%ROWTYPE; n drive_notification_private.current_state_notices%ROWTYPE;
 s drive_notification_private.subscriptions%ROWTYPE; r public.marketplace_requests%ROWTYPE; c public.drive_request_context%ROWTYPE;
 event uuid; count_events integer; target uuid; result jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_version IS DISTINCT FROM 0 OR p_status IS DISTINCT FROM 'request_submitted'
 OR p_customer_subscription IS NULL OR p_operations_subscription IS NULL OR p_customer_subscription=p_operations_subscription
 OR p_sender IS NULL OR p_sender !~ '^[0-9]{5,32}$' OR p_webhook IS NULL OR p_webhook='00000000-0000-0000-0000-000000000000'::uuid
 OR p_approval IS NULL OR length(p_approval) NOT BETWEEN 8 AND 120 OR p_templates IS NULL OR jsonb_typeof(p_templates)<>'object'
 OR NOT p_templates ?& ARRAY['customer','operations'] OR (p_templates-ARRAY['customer','operations'])<>'{}'::jsonb
 THEN RAISE EXCEPTION 'INVALID_STATE_NOTICE' USING ERRCODE='22023'; END IF;
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SETTINGS_REQUIRED' USING ERRCODE='22023'; END IF;
 SELECT * INTO n FROM drive_notification_private.current_state_notices
 WHERE request_id=p_request_id AND expected_version=p_version AND expected_status=p_status FOR UPDATE;
 IF FOUND THEN
  IF n.phone_number_id IS DISTINCT FROM p_sender OR n.webhook_id IS DISTINCT FROM p_webhook OR n.expires_at IS DISTINCT FROM p_expires
   OR NOT EXISTS(SELECT 1 FROM drive_notification_private.current_state_targets WHERE notice_id=n.id AND audience='customer'
     AND subscription_id=p_customer_subscription AND template=p_templates->'customer')
   OR NOT EXISTS(SELECT 1 FROM drive_notification_private.current_state_targets WHERE notice_id=n.id AND audience='operations'
     AND subscription_id=p_operations_subscription AND template=p_templates->'operations')
  THEN RAISE EXCEPTION 'STATE_NOTICE_CONFLICT' USING ERRCODE='22023'; END IF;
 ELSE
  IF cfg.send_enabled OR cfg.capture_enabled OR cfg.dispatch_mode<>'target_only'
   OR EXISTS(SELECT 1 FROM drive_notification_private.execution_windows WHERE id=cfg.active_window_id AND stopped_at IS NULL)
   OR EXISTS(SELECT 1 FROM drive_notification_private.customer_authorizations WHERE id=cfg.active_customer_authorization_id AND stopped_at IS NULL)
   OR p_expires IS NULL OR p_expires<=clock_timestamp() OR p_expires>clock_timestamp()+interval '9 minutes'
  THEN RAISE EXCEPTION 'CLOSED_GATES_OR_EXPIRY_REQUIRED' USING ERRCODE='22023'; END IF;
  -- Existing lifecycle takes request/context before its settings trigger. NOWAIT
  -- prevents a reverse-order wait here and holds the snapshot until commit.
  SELECT * INTO r FROM public.marketplace_requests WHERE id=p_request_id FOR SHARE NOWAIT;
  SELECT * INTO c FROM public.drive_request_context WHERE request_id=p_request_id FOR SHARE NOWAIT;
  IF r.id IS NULL OR r.status IS DISTINCT FROM p_status OR c.version IS DISTINCT FROM p_version OR c.country IS DISTINCT FROM 'EG'
   OR r.requested_for<=clock_timestamp() THEN RAISE EXCEPTION 'STALE_STATE_NOTICE' USING ERRCODE='22023'; END IF;
  SELECT count(*)::integer,min(id::text)::uuid INTO count_events,event FROM public.drive_request_events
   WHERE request_id=r.id AND action='created' AND new_status=p_status AND country='EG';
  IF count_events<>1 THEN RAISE EXCEPTION 'STATE_NOTICE_PROVENANCE_REQUIRED' USING ERRCODE='22023'; END IF;
  INSERT INTO drive_notification_private.current_state_notices(request_id,source_event_id,expected_version,expected_status,
   approval_reference,phone_number_id,webhook_id,expires_at)
   VALUES(r.id,event,p_version,p_status,p_approval,p_sender,p_webhook,p_expires) RETURNING * INTO n;
  FOR s IN SELECT * FROM drive_notification_private.subscriptions WHERE id IN(p_customer_subscription,p_operations_subscription)
   ORDER BY id FOR SHARE NOWAIT LOOP
   IF (s.id=p_customer_subscription AND (s.audience<>'customer' OR s.user_id IS DISTINCT FROM r.user_id))
    OR (s.id=p_operations_subscription AND s.audience<>'operations')
    OR NOT drive_notification_private.eligible(s.id,r.id)
    OR NOT drive_notification_private.current_state_template_valid(p_templates->s.audience,s.language)
    OR EXISTS(SELECT 1 FROM drive_notification_private.outbox WHERE request_id=r.id AND (recipient_user_id=s.user_id OR phone=s.phone))
   THEN RAISE EXCEPTION 'INELIGIBLE_STATE_NOTICE' USING ERRCODE='22023'; END IF;
   INSERT INTO drive_notification_private.current_state_targets(notice_id,audience,recipient_user_id,subscription_id,phone,language,template)
    VALUES(n.id,s.audience,s.user_id,s.id,s.phone,s.language,p_templates->s.audience) RETURNING id INTO target;
   INSERT INTO drive_notification_private.outbox(event_id,request_id,subscription_id,recipient_user_id,audience,country,
    phone,language,action,request_reference,expected_status,current_state_target_id)
    VALUES(event,r.id,s.id,s.user_id,s.audience,'EG',s.phone,s.language,'current_state',r.request_reference,p_status,target);
  END LOOP;
  IF (SELECT count(*) FROM drive_notification_private.current_state_targets WHERE notice_id=n.id)<>2
   THEN RAISE EXCEPTION 'TWO_STATE_NOTICE_RECIPIENTS_REQUIRED' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT jsonb_build_object('notice_id',n.id,'expires_at',n.expires_at,'targets',jsonb_agg(jsonb_build_object(
  'requestId',o.request_id,'outboxId',o.id,'recipientUserId',o.recipient_user_id,'category',o.audience||'.current_state','language',o.language)
  ORDER BY o.audience)) INTO result FROM drive_notification_private.current_state_targets t
  JOIN drive_notification_private.outbox o ON o.current_state_target_id=t.id WHERE t.notice_id=n.id;
 RETURN result;
END $$;

CREATE FUNCTION public.open_kapso_current_state_window(p_notice uuid,p_audience text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg drive_notification_private.settings%ROWTYPE; n drive_notification_private.current_state_notices%ROWTYPE;
 t drive_notification_private.current_state_targets%ROWTYPE; o drive_notification_private.outbox%ROWTYPE; wid uuid;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF NOT FOUND OR cfg.dispatch_mode<>'target_only' OR cfg.capture_enabled OR cfg.send_enabled
  OR EXISTS(SELECT 1 FROM drive_notification_private.execution_windows WHERE id=cfg.active_window_id AND stopped_at IS NULL)
 THEN RAISE EXCEPTION 'CLOSED_GATES_REQUIRED' USING ERRCODE='22023'; END IF;
 SELECT * INTO n FROM drive_notification_private.current_state_notices WHERE id=p_notice FOR UPDATE;
 SELECT * INTO t FROM drive_notification_private.current_state_targets WHERE notice_id=p_notice AND audience=p_audience FOR UPDATE;
 SELECT * INTO o FROM drive_notification_private.outbox WHERE current_state_target_id=t.id FOR UPDATE;
 IF n.id IS NULL OR t.id IS NULL OR t.window_id IS NOT NULL OR NOT drive_notification_private.current_state_valid(o.id)
  OR o.state<>'pending' OR o.attempts<>0 OR o.provider_sid IS NOT NULL OR o.lease_token IS NOT NULL
 THEN RAISE EXCEPTION 'INELIGIBLE_STATE_NOTICE' USING ERRCODE='22023'; END IF;
 INSERT INTO drive_notification_private.execution_windows(request_id,outbox_id,recipient_user_id,category,language,
  phone_number_id,webhook_id,approval_reference,started_at,expires_at,delivery_mode)
 VALUES(n.request_id,o.id,t.recipient_user_id,t.audience||'.current_state',t.language,n.phone_number_id,n.webhook_id,
  'current-state:'||n.id::text||':'||t.audience,n.started_at,n.expires_at,'webhook') RETURNING id INTO wid;
 UPDATE drive_notification_private.current_state_targets SET window_id=wid WHERE id=t.id;
 UPDATE drive_notification_private.settings SET active_window_id=wid WHERE singleton;
 RETURN wid;
END $$;

ALTER FUNCTION drive_notification_private.category_enabled(text,text,uuid,text) RENAME TO category_before_current_state;
CREATE FUNCTION drive_notification_private.category_enabled(p_audience text,p_action text,p_user uuid,p_language text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN p_action='current_state' THEN EXISTS(SELECT 1 FROM drive_notification_private.settings cfg
 JOIN drive_notification_private.execution_windows w ON w.id=cfg.active_window_id
 JOIN drive_notification_private.outbox o ON o.id=w.outbox_id
 JOIN drive_notification_private.current_state_targets t ON t.id=o.current_state_target_id AND t.window_id=w.id
 JOIN drive_notification_private.current_state_notices n ON n.id=t.notice_id
 WHERE cfg.singleton AND cfg.dispatch_mode='target_only' AND NOT cfg.capture_enabled AND w.delivery_mode='webhook'
 AND w.stopped_at IS NULL AND w.expires_at>clock_timestamp() AND w.expires_at=n.expires_at
 AND w.category=p_audience||'.current_state' AND o.audience=p_audience AND o.recipient_user_id=p_user AND o.language=p_language
 AND w.phone_number_id=n.phone_number_id AND w.webhook_id=n.webhook_id
 AND drive_notification_private.current_state_valid(o.id))
 ELSE drive_notification_private.category_before_current_state(p_audience,p_action,p_user,p_language) END;
$$;

ALTER FUNCTION public.claim_kapso_drive_whatsapp_target(uuid,uuid,uuid,text,text) SET SCHEMA drive_notification_private;
ALTER FUNCTION drive_notification_private.claim_kapso_drive_whatsapp_target(uuid,uuid,uuid,text,text) RENAME TO claim_before_current_state;
CREATE FUNCTION public.claim_kapso_drive_whatsapp_target(p_request_id uuid,p_outbox_id uuid,p_recipient_user_id uuid,p_category text,p_language text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o drive_notification_private.outbox%ROWTYPE; w drive_notification_private.execution_windows%ROWTYPE; token uuid;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_category NOT IN ('customer.current_state','operations.current_state') OR p_category IS NULL THEN
  RETURN drive_notification_private.claim_before_current_state(p_request_id,p_outbox_id,p_recipient_user_id,p_category,p_language);
 END IF;
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton AND send_enabled AND NOT capture_enabled AND dispatch_mode='target_only' FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT x.* INTO w FROM drive_notification_private.execution_windows x JOIN drive_notification_private.settings cfg ON cfg.active_window_id=x.id WHERE cfg.singleton FOR UPDATE OF x;
 IF w.expires_at<=clock_timestamp() THEN PERFORM drive_notification_private.stop_window(w.id,'expired'); RETURN NULL; END IF;
 SELECT * INTO o FROM drive_notification_private.outbox WHERE id=p_outbox_id AND request_id=p_request_id AND recipient_user_id=p_recipient_user_id
  AND audience||'.'||action=p_category AND language=p_language AND state='pending' AND attempts=0 AND provider_sid IS NULL
  AND provider_phone_number_id IS NULL AND lease_token IS NULL AND available_at<=clock_timestamp() FOR UPDATE SKIP LOCKED;
 IF o.id IS NULL OR w.outbox_id IS DISTINCT FROM o.id OR w.recipient_user_id IS DISTINCT FROM p_recipient_user_id
  OR w.category IS DISTINCT FROM p_category OR w.language IS DISTINCT FROM p_language OR w.stopped_at IS NOT NULL
  OR w.send_started_at IS NOT NULL
 THEN RETURN NULL; END IF;
 IF NOT drive_notification_private.category_enabled(o.audience,o.action,o.recipient_user_id,o.language) THEN
  PERFORM public.stop_kapso_current_state_notice((SELECT notice_id FROM drive_notification_private.current_state_targets WHERE id=o.current_state_target_id));
  UPDATE drive_notification_private.outbox SET state='suppressed',error_code='STATE_NOTICE_STALE' WHERE id=o.id AND attempts=0;
  RETURN NULL;
 END IF;
 token:=gen_random_uuid();
 UPDATE drive_notification_private.outbox SET state='claimed',lease_token=token,lease_until=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp() WHERE id=o.id;
 RETURN jsonb_build_object('id',o.id,'token',token,'request_id',o.request_id,'recipient_user_id',o.recipient_user_id,
  'audience',o.audience,'action',o.action,'language',o.language,'phone',o.phone,'reference',o.request_reference);
END $$;

ALTER FUNCTION public.begin_kapso_drive_whatsapp(uuid,uuid,text) SET SCHEMA drive_notification_private;
ALTER FUNCTION drive_notification_private.begin_kapso_drive_whatsapp(uuid,uuid,text) RENAME TO begin_before_current_state;
CREATE FUNCTION public.begin_kapso_drive_whatsapp(p_id uuid,p_token uuid,p_phone_number_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM drive_notification_private.outbox WHERE id=p_id AND current_state_target_id IS NOT NULL) THEN RETURN false; END IF;
 RETURN drive_notification_private.begin_before_current_state(p_id,p_token,p_phone_number_id);
END $$;

CREATE FUNCTION public.begin_kapso_current_state_notice(p_id uuid,p_token uuid,p_phone_number_id text,p_template jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' SET statement_timeout='4s' AS $$
DECLARE o drive_notification_private.outbox%ROWTYPE; t drive_notification_private.current_state_targets%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton AND dispatch_mode='target_only' AND send_enabled AND NOT capture_enabled FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT x.* INTO o FROM drive_notification_private.outbox x JOIN drive_notification_private.settings cfg ON true
  JOIN drive_notification_private.execution_windows w ON w.id=cfg.active_window_id AND w.outbox_id=x.id
  WHERE cfg.singleton AND x.id=p_id AND x.state='claimed' AND x.lease_token=p_token AND x.lease_until>clock_timestamp() FOR UPDATE OF x;
 IF o.id IS NULL OR o.current_state_target_id IS NULL THEN RETURN false; END IF;
 SELECT * INTO t FROM drive_notification_private.current_state_targets WHERE id=o.current_state_target_id;
 IF t.template IS DISTINCT FROM p_template THEN
  PERFORM public.stop_kapso_current_state_notice(t.notice_id);
  UPDATE drive_notification_private.outbox SET state='suppressed',error_code='STATE_NOTICE_TEMPLATE_CHANGED' WHERE id=o.id AND attempts=0;
  RETURN false;
 END IF;
 -- NOWAIT preserves existing settings-first order without deadlocking lifecycle writers.
 PERFORM 1 FROM public.marketplace_requests WHERE id=o.request_id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.drive_request_context WHERE request_id=o.request_id FOR SHARE NOWAIT;
 PERFORM 1 FROM drive_notification_private.subscriptions WHERE id=t.subscription_id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.profiles WHERE id=t.recipient_user_id FOR SHARE NOWAIT;
 IF t.audience='operations' THEN PERFORM 1 FROM public.team_access_grants WHERE invited_user_id=t.recipient_user_id FOR SHARE NOWAIT; END IF;
 IF NOT drive_notification_private.current_state_valid(o.id) THEN
  PERFORM public.stop_kapso_current_state_notice(t.notice_id);
  UPDATE drive_notification_private.outbox SET state='suppressed',error_code='STATE_NOTICE_STALE' WHERE id=o.id AND attempts=0;
  RETURN false;
 END IF;
 -- Reuse the installed category, eligibility, lease, window, budget and intent implementation.
 RETURN drive_notification_private.begin_before_current_state(p_id,p_token,p_phone_number_id);
END $$;

ALTER FUNCTION public.begin_drive_whatsapp(uuid,uuid) SET SCHEMA drive_notification_private;
ALTER FUNCTION drive_notification_private.begin_drive_whatsapp(uuid,uuid) RENAME TO begin_generic_before_current_state;
CREATE FUNCTION public.begin_drive_whatsapp(p_id uuid,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM drive_notification_private.outbox WHERE id=p_id AND current_state_target_id IS NOT NULL) THEN RETURN false; END IF;
 RETURN drive_notification_private.begin_generic_before_current_state(p_id,p_token);
END $$;

ALTER FUNCTION drive_notification_private.stop_window(uuid,text) RENAME TO stop_before_current_state;
CREATE FUNCTION drive_notification_private.stop_window(p_window_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; notice uuid;
BEGIN
 result:=drive_notification_private.stop_before_current_state(p_window_id,p_reason);
 UPDATE drive_notification_private.current_state_targets SET stopped_at=coalesce(stopped_at,clock_timestamp())
  WHERE window_id=p_window_id RETURNING notice_id INTO notice;
 IF notice IS NOT NULL THEN
  UPDATE drive_notification_private.settings SET capture_enabled=false WHERE singleton AND active_window_id=p_window_id;
 END IF;
 IF notice IS NOT NULL AND NOT EXISTS(SELECT 1 FROM drive_notification_private.current_state_targets WHERE notice_id=notice AND stopped_at IS NULL) THEN
  UPDATE drive_notification_private.current_state_notices SET stopped_at=coalesce(stopped_at,clock_timestamp()) WHERE id=notice;
 END IF;
 RETURN result;
END $$;

ALTER FUNCTION public.ingest_kapso_drive_whatsapp_receipt(text,text,text,text,text,text) SET SCHEMA drive_notification_private;
ALTER FUNCTION drive_notification_private.ingest_kapso_drive_whatsapp_receipt(text,text,text,text,text,text) RENAME TO ingest_before_current_state;
CREATE FUNCTION public.ingest_kapso_drive_whatsapp_receipt(p_sid text,p_phone_number_id text,p_phone text,p_state text,
 p_error text DEFAULT NULL,p_delivery_key_hash text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' SET statement_timeout='4s' AS $$
DECLARE w drive_notification_private.execution_windows%ROWTYPE; o drive_notification_private.outbox%ROWTYPE; ok boolean;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_sid IS NULL OR p_sid !~ '^wamid\.[A-Za-z0-9_+/=-]{1,250}$' OR p_state IS NULL OR p_state NOT IN ('sent','delivered','read','failed')
 OR (p_delivery_key_hash IS NOT NULL AND p_delivery_key_hash !~ '^[0-9a-f]{64}$')
 OR (p_error IS NOT NULL AND p_error IS DISTINCT FROM 'KAPSO_DELIVERY_FAILED') THEN RAISE EXCEPTION 'INVALID_RECEIPT' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 -- A late receipt must match an already recorded WAMID, never phone alone.
 SELECT x.* INTO w FROM drive_notification_private.execution_windows x JOIN drive_notification_private.outbox q ON q.id=x.outbox_id
 WHERE q.current_state_target_id IS NOT NULL AND q.provider_sid=p_sid AND q.phone=p_phone AND q.provider_phone_number_id=p_phone_number_id
  AND x.phone_number_id=p_phone_number_id AND x.delivery_mode='webhook' AND x.send_started_at IS NOT NULL FOR UPDATE OF x;
 IF w.id IS NULL THEN
  RETURN drive_notification_private.ingest_before_current_state(p_sid,p_phone_number_id,p_phone,p_state,p_error,p_delivery_key_hash);
 END IF;
 SELECT * INTO o FROM drive_notification_private.outbox WHERE id=w.outbox_id FOR UPDATE;
 IF o.attempts<>1 OR o.provider_sid IS DISTINCT FROM p_sid THEN RETURN false; END IF;
 ok:=public.record_drive_whatsapp_receipt(o.id,o.lease_token,p_sid,p_phone,p_state,p_error);
 IF ok AND p_state IN ('delivered','read','failed') THEN
  PERFORM drive_notification_private.stop_window(w.id,CASE WHEN p_state='failed' THEN 'failed' ELSE 'delivered' END);
 END IF;
 RETURN ok;
END $$;

CREATE FUNCTION public.stop_kapso_current_state_notice(p_notice uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t record;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 PERFORM 1 FROM drive_notification_private.current_state_notices WHERE id=p_notice FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 FOR t IN SELECT window_id FROM drive_notification_private.current_state_targets WHERE notice_id=p_notice AND window_id IS NOT NULL ORDER BY id LOOP
  PERFORM drive_notification_private.stop_window(t.window_id,'manual');
 END LOOP;
 UPDATE drive_notification_private.current_state_targets SET stopped_at=coalesce(stopped_at,clock_timestamp()) WHERE notice_id=p_notice;
 UPDATE drive_notification_private.current_state_notices SET stopped_at=coalesce(stopped_at,clock_timestamp()) WHERE id=p_notice;
 RETURN true;
END $$;

-- General paths cannot reclaim, mutate or select these one-shot rows.
CREATE OR REPLACE FUNCTION drive_notification_private.claim_general_legacy(p_template_keys text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v drive_notification_private.outbox%ROWTYPE; v_token uuid:=gen_random_uuid();
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton AND send_enabled FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE drive_notification_private.outbox o SET state='unknown',error_code='SEND_LEASE_EXPIRED',updated_at=now()
 WHERE state='sending' AND lease_until<=now() AND current_state_target_id IS NULL
  AND NOT EXISTS(SELECT 1 FROM drive_notification_private.customer_authorizations a WHERE a.outbox_id=o.id);
 UPDATE drive_notification_private.outbox o SET state='pending',lease_token=NULL,lease_until=NULL,updated_at=now()
 WHERE state='claimed' AND lease_until<=now() AND current_state_target_id IS NULL
  AND NOT EXISTS(SELECT 1 FROM drive_notification_private.customer_authorizations a WHERE a.outbox_id=o.id);
 SELECT * INTO v FROM drive_notification_private.outbox o WHERE state='pending' AND available_at<=now() AND attempts<3 AND current_state_target_id IS NULL
  AND NOT EXISTS(SELECT 1 FROM drive_notification_private.customer_authorizations a WHERE a.outbox_id=o.id)
  AND drive_notification_private.category_enabled(audience,action,recipient_user_id,language)
  AND (p_template_keys IS NULL OR (audience||'.'||action||'.'||language)=ANY(p_template_keys))
 ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE drive_notification_private.outbox SET state='claimed',lease_token=v_token,lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=v.id;
 RETURN jsonb_build_object('id',v.id,'token',v_token,'audience',v.audience,'action',v.action,'language',v.language,'phone',v.phone,'reference',v.request_reference);
END $$;

REVOKE ALL ON FUNCTION drive_notification_private.current_state_template_valid(jsonb,text),drive_notification_private.current_state_valid(uuid),
 drive_notification_private.category_before_current_state(text,text,uuid,text),drive_notification_private.category_enabled(text,text,uuid,text),
 drive_notification_private.claim_before_current_state(uuid,uuid,uuid,text,text),drive_notification_private.begin_before_current_state(uuid,uuid,text),
 drive_notification_private.begin_generic_before_current_state(uuid,uuid),drive_notification_private.ingest_before_current_state(text,text,text,text,text,text),
 drive_notification_private.stop_before_current_state(uuid,text),drive_notification_private.stop_window(uuid,text),
 drive_notification_private.claim_general_legacy(text[]) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.prepare_kapso_current_state_notice(uuid,integer,text,uuid,uuid,text,uuid,jsonb,text,timestamptz),
 public.open_kapso_current_state_window(uuid,text),public.begin_kapso_current_state_notice(uuid,uuid,text,jsonb),public.stop_kapso_current_state_notice(uuid),
 public.claim_kapso_drive_whatsapp_target(uuid,uuid,uuid,text,text),public.begin_kapso_drive_whatsapp(uuid,uuid,text),public.begin_drive_whatsapp(uuid,uuid),
 public.ingest_kapso_drive_whatsapp_receipt(text,text,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_kapso_current_state_notice(uuid,integer,text,uuid,uuid,text,uuid,jsonb,text,timestamptz),
 public.open_kapso_current_state_window(uuid,text),public.begin_kapso_current_state_notice(uuid,uuid,text,jsonb),public.stop_kapso_current_state_notice(uuid),
 public.claim_kapso_drive_whatsapp_target(uuid,uuid,uuid,text,text),public.begin_kapso_drive_whatsapp(uuid,uuid,text),public.begin_drive_whatsapp(uuid,uuid),
 public.ingest_kapso_drive_whatsapp_receipt(text,text,text,text,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
