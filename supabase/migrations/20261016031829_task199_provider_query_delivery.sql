-- Task199: explicit target-only provider status reads. No enrollment or activation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE drive_notification_private.execution_windows
 ALTER COLUMN webhook_id DROP NOT NULL,
 ADD COLUMN delivery_mode text NOT NULL DEFAULT 'webhook' CHECK(delivery_mode IN ('webhook','provider_query')),
 ADD COLUMN status_query_attempts integer NOT NULL DEFAULT 0 CHECK(status_query_attempts BETWEEN 0 AND 3),
 ADD COLUMN query_lease_token uuid,
 ADD COLUMN query_lease_until timestamptz,
 ADD COLUMN query_available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 ADD COLUMN last_query_outcome text CHECK(last_query_outcome IN ('observed','unconfirmed')),
 ADD CONSTRAINT execution_window_delivery_binding CHECK(
  (delivery_mode='webhook' AND webhook_id IS NOT NULL) OR (delivery_mode='provider_query' AND webhook_id IS NULL)),
 ADD CONSTRAINT execution_window_query_lease CHECK((query_lease_token IS NULL)=(query_lease_until IS NULL));

CREATE FUNCTION drive_notification_private.open_delivery_window(p_request_id uuid,p_outbox_id uuid,p_recipient_user_id uuid,
 p_category text,p_language text,p_phone_number_id text,p_webhook_id uuid,p_approval_reference text,p_expires_at timestamptz,p_delivery_mode text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg drive_notification_private.settings%ROWTYPE; v drive_notification_private.outbox%ROWTYPE;
 created uuid; started timestamptz:=clock_timestamp();
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_category IS DISTINCT FROM 'operations.created' OR p_language IS NULL OR p_language NOT IN ('ar','en')
  OR p_phone_number_id IS NULL OR p_phone_number_id !~ '^[0-9]{5,32}$'
  OR p_expires_at IS NULL OR p_expires_at<=started OR p_expires_at>started+interval '10 minutes'
  OR p_approval_reference IS NULL OR length(p_approval_reference) NOT BETWEEN 8 AND 120
  OR p_delivery_mode IS NULL OR p_delivery_mode NOT IN ('webhook','provider_query')
  OR (p_delivery_mode='webhook' AND (p_webhook_id IS NULL OR p_webhook_id='00000000-0000-0000-0000-000000000000'::uuid))
  OR (p_delivery_mode='provider_query' AND p_webhook_id IS NOT NULL)
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
  webhook_id,approval_reference,started_at,expires_at,delivery_mode)
 VALUES(p_request_id,p_outbox_id,p_recipient_user_id,p_category,p_language,p_phone_number_id,p_webhook_id,p_approval_reference,started,p_expires_at,p_delivery_mode)
 RETURNING id INTO created;
 UPDATE drive_notification_private.settings SET active_window_id=created WHERE singleton;
 RETURN created;
END $$;

CREATE OR REPLACE FUNCTION public.open_kapso_drive_whatsapp_window(p_request_id uuid,p_outbox_id uuid,p_recipient_user_id uuid,
 p_category text,p_language text,p_phone_number_id text,p_webhook_id uuid,p_approval_reference text,p_expires_at timestamptz)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT drive_notification_private.open_delivery_window(p_request_id,p_outbox_id,p_recipient_user_id,p_category,p_language,
 p_phone_number_id,p_webhook_id,p_approval_reference,p_expires_at,'webhook');
$$;
CREATE FUNCTION public.open_kapso_drive_whatsapp_provider_query_window(p_request_id uuid,p_outbox_id uuid,p_recipient_user_id uuid,
 p_category text,p_language text,p_phone_number_id text,p_approval_reference text,p_expires_at timestamptz)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT drive_notification_private.open_delivery_window(p_request_id,p_outbox_id,p_recipient_user_id,p_category,p_language,
 p_phone_number_id,NULL,p_approval_reference,p_expires_at,'provider_query');
$$;

-- Keep the exact reviewed intent implementation, including lock/expiry rollback.
ALTER FUNCTION public.begin_kapso_drive_whatsapp(uuid,uuid,text) SET SCHEMA drive_notification_private;
ALTER FUNCTION drive_notification_private.begin_kapso_drive_whatsapp(uuid,uuid,text) RENAME TO begin_bounded_legacy;
REVOKE ALL ON FUNCTION drive_notification_private.begin_bounded_legacy(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION drive_notification_private.begin_delivery(p_id uuid,p_token uuid,p_phone_number_id text,p_delivery_mode text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg drive_notification_private.settings%ROWTYPE; w drive_notification_private.execution_windows%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF cfg.dispatch_mode='target_only' THEN
  SELECT * INTO w FROM drive_notification_private.execution_windows WHERE id=cfg.active_window_id FOR UPDATE;
  IF NOT FOUND OR w.delivery_mode IS DISTINCT FROM p_delivery_mode THEN RETURN false; END IF;
 ELSIF p_delivery_mode IS DISTINCT FROM 'webhook' THEN RETURN false;
 END IF;
 RETURN drive_notification_private.begin_bounded_legacy(p_id,p_token,p_phone_number_id);
END $$;
CREATE FUNCTION public.begin_kapso_drive_whatsapp(p_id uuid,p_token uuid,p_phone_number_id text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT drive_notification_private.begin_delivery(p_id,p_token,p_phone_number_id,'webhook');
$$;
CREATE FUNCTION public.begin_kapso_drive_whatsapp_provider_query(p_id uuid,p_token uuid,p_phone_number_id text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' SET statement_timeout='4s' AS $$
 SELECT drive_notification_private.begin_delivery(p_id,p_token,p_phone_number_id,'provider_query');
$$;

CREATE OR REPLACE FUNCTION drive_notification_private.stop_window(p_window_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w drive_notification_private.execution_windows%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_reason IS NULL OR p_reason NOT IN ('manual','expired','unknown','delivered','failed') THEN RAISE EXCEPTION 'INVALID_STOP' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 SELECT * INTO w FROM drive_notification_private.execution_windows WHERE id=p_window_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE drive_notification_private.execution_windows SET stopped_at=coalesce(stopped_at,clock_timestamp()),
  stop_reason=coalesce(stop_reason,p_reason),deactivation_required=(w.delivery_mode='webhook') WHERE id=w.id;
 UPDATE drive_notification_private.settings SET send_enabled=false WHERE singleton AND active_window_id=w.id;
 RETURN jsonb_build_object('window_id',w.id,'webhook_id',w.webhook_id,'deactivation_required',w.delivery_mode='webhook');
END $$;

CREATE FUNCTION public.claim_kapso_drive_whatsapp_status_query(p_request_id uuid,p_outbox_id uuid,p_recipient_user_id uuid,
 p_category text,p_language text,p_phone_number_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' SET statement_timeout='4s' AS $$
DECLARE cfg drive_notification_private.settings%ROWTYPE; w drive_notification_private.execution_windows%ROWTYPE;
 v drive_notification_private.outbox%ROWTYPE; token uuid:=gen_random_uuid(); stamp timestamptz;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF NOT FOUND OR cfg.dispatch_mode<>'target_only' OR NOT cfg.send_enabled THEN RETURN NULL; END IF;
 SELECT * INTO w FROM drive_notification_private.execution_windows WHERE id=cfg.active_window_id FOR UPDATE;
 IF NOT FOUND OR w.delivery_mode<>'provider_query' OR w.stopped_at IS NOT NULL OR w.send_started_at IS NULL
  OR w.request_id IS DISTINCT FROM p_request_id OR w.outbox_id IS DISTINCT FROM p_outbox_id
  OR w.recipient_user_id IS DISTINCT FROM p_recipient_user_id OR w.category IS DISTINCT FROM p_category
  OR w.language IS DISTINCT FROM p_language OR w.phone_number_id IS DISTINCT FROM p_phone_number_id THEN RETURN NULL; END IF;
 SELECT * INTO v FROM drive_notification_private.outbox WHERE id=w.outbox_id FOR UPDATE;
 stamp:=clock_timestamp();
 IF w.expires_at<=stamp THEN PERFORM drive_notification_private.stop_window(w.id,'expired'); RETURN NULL; END IF;
 IF NOT FOUND OR v.request_id IS DISTINCT FROM w.request_id OR v.recipient_user_id IS DISTINCT FROM w.recipient_user_id
  OR (v.audience||'.'||v.action) IS DISTINCT FROM w.category OR v.language IS DISTINCT FROM w.language
  OR v.provider_phone_number_id IS DISTINCT FROM w.phone_number_id
  OR v.provider_sid IS NULL OR v.provider_sid !~ '^wamid\.[A-Za-z0-9_+/=-]{1,250}$'
  OR v.state NOT IN ('accepted','queued','sent') OR v.attempts<1
  OR NOT drive_notification_private.eligible(v.subscription_id,v.request_id)
  OR NOT drive_notification_private.category_enabled(v.audience,v.action,v.recipient_user_id,v.language)
  OR w.status_query_attempts>=3 OR w.query_available_at>stamp OR w.query_lease_until>stamp THEN RETURN NULL; END IF;
 UPDATE drive_notification_private.execution_windows SET status_query_attempts=status_query_attempts+1,
  query_lease_token=token,query_lease_until=least(expires_at,stamp+interval '8 seconds'),
  query_available_at=stamp+interval '5 seconds' WHERE id=w.id;
 RETURN jsonb_build_object('window_id',w.id,'query_token',token,'request_id',w.request_id,'outbox_id',w.outbox_id,
  'recipient_user_id',w.recipient_user_id,'category',w.category,'language',w.language,'phone_number_id',w.phone_number_id,
  'provider_sid',v.provider_sid,'phone',v.phone,'expires_at',w.expires_at);
END $$;

CREATE FUNCTION public.finish_kapso_drive_whatsapp_status_query(p_window_id uuid,p_query_token uuid,p_sid text,
 p_phone_number_id text,p_phone text,p_state text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' SET statement_timeout='4s' AS $$
DECLARE w drive_notification_private.execution_windows%ROWTYPE; v drive_notification_private.outbox%ROWTYPE; actual text;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_state IS NOT NULL AND p_state NOT IN ('sent','delivered','read','failed') THEN RAISE EXCEPTION 'INVALID_QUERY_STATE' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 SELECT * INTO w FROM drive_notification_private.execution_windows WHERE id=p_window_id FOR UPDATE;
 IF NOT FOUND OR w.delivery_mode<>'provider_query' OR w.query_lease_token IS NULL
  OR w.query_lease_token IS DISTINCT FROM p_query_token OR w.phone_number_id IS DISTINCT FROM p_phone_number_id THEN RETURN false; END IF;
 SELECT * INTO v FROM drive_notification_private.outbox WHERE id=w.outbox_id FOR UPDATE;
 IF NOT FOUND OR w.query_lease_until<=clock_timestamp() OR w.expires_at<=clock_timestamp()
  OR v.provider_sid IS NULL OR v.provider_sid IS DISTINCT FROM p_sid OR v.provider_phone_number_id IS DISTINCT FROM p_phone_number_id
  OR v.phone IS DISTINCT FROM p_phone OR v.request_id IS DISTINCT FROM w.request_id
  OR v.recipient_user_id IS DISTINCT FROM w.recipient_user_id
  OR (v.audience||'.'||v.action) IS DISTINCT FROM w.category OR v.language IS DISTINCT FROM w.language THEN RETURN false; END IF;
 -- No raw provider content. NULL means unconfirmed, never a delivery or send retry.
 IF p_state IS NOT NULL AND NOT public.record_drive_whatsapp_receipt(v.id,v.lease_token,p_sid,p_phone,p_state,
  CASE WHEN p_state='failed' THEN 'KAPSO_DELIVERY_FAILED' ELSE NULL END) THEN RETURN false; END IF;
 UPDATE drive_notification_private.execution_windows SET query_lease_token=NULL,query_lease_until=NULL,
  query_available_at=clock_timestamp()+interval '5 seconds',last_query_outcome=CASE WHEN p_state IS NULL THEN 'unconfirmed' ELSE 'observed' END WHERE id=w.id;
 SELECT state INTO actual FROM drive_notification_private.outbox WHERE id=v.id;
 IF actual IN ('delivered','read','failed') THEN
  PERFORM drive_notification_private.stop_window(w.id,CASE WHEN actual='failed' THEN 'failed' ELSE 'delivered' END);
 END IF;
 RETURN true;
END $$;

REVOKE ALL ON FUNCTION drive_notification_private.open_delivery_window(uuid,uuid,uuid,text,text,text,uuid,text,timestamptz,text),
 drive_notification_private.begin_delivery(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.open_kapso_drive_whatsapp_window(uuid,uuid,uuid,text,text,text,uuid,text,timestamptz),
 public.open_kapso_drive_whatsapp_provider_query_window(uuid,uuid,uuid,text,text,text,text,timestamptz),
 public.begin_kapso_drive_whatsapp(uuid,uuid,text),public.begin_kapso_drive_whatsapp_provider_query(uuid,uuid,text),
 public.claim_kapso_drive_whatsapp_status_query(uuid,uuid,uuid,text,text,text),
 public.finish_kapso_drive_whatsapp_status_query(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.open_kapso_drive_whatsapp_window(uuid,uuid,uuid,text,text,text,uuid,text,timestamptz),
 public.open_kapso_drive_whatsapp_provider_query_window(uuid,uuid,uuid,text,text,text,text,timestamptz),
 public.begin_kapso_drive_whatsapp(uuid,uuid,text),public.begin_kapso_drive_whatsapp_provider_query(uuid,uuid,text),
 public.claim_kapso_drive_whatsapp_status_query(uuid,uuid,uuid,text,text,text),
 public.finish_kapso_drive_whatsapp_status_query(uuid,uuid,text,text,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
