BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE public.partner_whatsapp_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.marketplace_requests(id) ON DELETE RESTRICT,
  request_reference text NOT NULL,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  partner_country text NOT NULL,
  recipient_e164 text NOT NULL CHECK (recipient_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  content_sid text NOT NULL CHECK (content_sid ~ '^HX[0-9A-Za-z]{32}$'),
  content_variables jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content_variables) = 'object'),
  idempotency_key text NOT NULL UNIQUE CHECK (idempotency_key ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','queued','sent','delivered','read','failed')),
  twilio_message_sid text UNIQUE CHECK (twilio_message_sid IS NULL OR twilio_message_sid ~ '^SM[0-9A-Za-z]{32}$'),
  provider_attempted_at timestamptz,
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  error_code text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.partner_whatsapp_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.partner_whatsapp_notifications(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('prepared','queued','sent','delivered','read','failed')),
  provider_event_key text NOT NULL,
  error_code text,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('operations','twilio_callback','provider_error')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, provider_event_key)
);

CREATE INDEX partner_whatsapp_notifications_request_created_idx
  ON public.partner_whatsapp_notifications(request_id, created_at DESC);
CREATE INDEX partner_whatsapp_notification_events_notification_created_idx
  ON public.partner_whatsapp_notification_events(notification_id, created_at);

ALTER TABLE public.partner_whatsapp_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_whatsapp_notification_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.partner_whatsapp_notifications FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.partner_whatsapp_notification_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.partner_whatsapp_notifications TO service_role;
GRANT SELECT, INSERT ON TABLE public.partner_whatsapp_notification_events TO service_role;

CREATE OR REPLACE FUNCTION public.reject_partner_whatsapp_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'PARTNER_WHATSAPP_EVENT_APPEND_ONLY' USING ERRCODE='42501';
END $$;

CREATE TRIGGER partner_whatsapp_events_reject_update_delete
BEFORE UPDATE OR DELETE ON public.partner_whatsapp_notification_events
FOR EACH ROW EXECUTE FUNCTION public.reject_partner_whatsapp_event_mutation();
CREATE TRIGGER partner_whatsapp_events_reject_truncate
BEFORE TRUNCATE ON public.partner_whatsapp_notification_events
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_partner_whatsapp_event_mutation();

CREATE OR REPLACE FUNCTION public.prepare_partner_whatsapp_notification(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_content_sid text,
  p_idempotency_key text
) RETURNS public.partner_whatsapp_notifications
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_grant public.team_access_grants%ROWTYPE;
  v_request public.marketplace_requests%ROWTYPE;
  v_partner public.partners%ROWTYPE;
  v_notification public.partner_whatsapp_notifications%ROWTYPE;
  v_partner_count integer;
  v_phone text;
  v_country_allowed boolean := false;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'PARTNER_WHATSAPP_SERVICE_ROLE_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_actor_user_id IS NULL OR p_request_id IS NULL
    OR p_content_sid !~ '^HX[0-9A-Za-z]{32}$'
    OR p_idempotency_key !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'PARTNER_WHATSAPP_INVALID_INPUT' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_profile FROM public.profiles
  WHERE id=p_actor_user_id FOR SHARE;
  IF NOT FOUND OR v_profile.status IS DISTINCT FROM 'active' OR v_profile.deleted_at IS NOT NULL
    OR lower(btrim(v_profile.role::text)) NOT IN ('admin','super_admin','staff') THEN
    RAISE EXCEPTION 'PARTNER_WHATSAPP_ACTOR_DENIED' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_request FROM public.marketplace_requests
  WHERE id=p_request_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PARTNER_WHATSAPP_REQUEST_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  SELECT count(DISTINCT pa.partner_id) INTO v_partner_count
  FROM public.product_availability pa
  WHERE pa.product_id=v_request.product_id AND pa.partner_id IS NOT NULL;
  IF v_partner_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'PARTNER_WHATSAPP_PARTNER_AMBIGUOUS' USING ERRCODE='23514';
  END IF;

  SELECT p.* INTO v_partner
  FROM public.product_availability pa
  JOIN public.partners p ON p.id=pa.partner_id
  WHERE pa.product_id=v_request.product_id AND pa.partner_id IS NOT NULL
  ORDER BY pa.created_at
  LIMIT 1
  FOR SHARE OF p;
  IF NOT FOUND OR v_partner.status IS DISTINCT FROM 'active' OR v_partner.deleted_at IS NOT NULL
    OR v_partner.synthetic IS TRUE THEN
    RAISE EXCEPTION 'PARTNER_WHATSAPP_PARTNER_DENIED' USING ERRCODE='42501';
  END IF;

  IF p_actor_user_id='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid THEN
    v_country_allowed := true;
  ELSE
    SELECT * INTO v_grant FROM public.team_access_grants
    WHERE invited_user_id=p_actor_user_id FOR SHARE;
    IF FOUND AND v_grant.status='active'
      AND (v_grant.access_level='global_admin' OR 'admin:full'=ANY(v_grant.permissions)
        OR 'operations:write'=ANY(v_grant.permissions)) THEN
      v_country_allowed := v_grant.access_level='global_admin'
        OR 'admin:full'=ANY(v_grant.permissions)
        OR EXISTS (SELECT 1 FROM unnest(v_grant.country_scope) c
          WHERE public.normalize_admin_country_key(c)=public.normalize_admin_country_key(v_partner.country));
    END IF;
  END IF;
  IF NOT v_country_allowed THEN
    RAISE EXCEPTION 'PARTNER_WHATSAPP_COUNTRY_SCOPE_DENIED' USING ERRCODE='42501';
  END IF;

  v_phone := regexp_replace(coalesce(v_partner.phone,''), '[^0-9+]', '', 'g');
  IF v_phone LIKE '00%' THEN v_phone := '+' || substr(v_phone,3); END IF;
  IF v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'PARTNER_WHATSAPP_RECIPIENT_INVALID' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.partner_whatsapp_notifications(
    request_id,request_reference,partner_id,partner_country,recipient_e164,
    content_sid,content_variables,idempotency_key,created_by
  ) VALUES (
    v_request.id,v_request.request_reference,v_partner.id,v_partner.country,v_phone,
    p_content_sid,jsonb_build_object('1',v_request.request_reference,'2',coalesce(v_request.service_name,'DIR3COM request')),
    p_idempotency_key,p_actor_user_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO v_notification;

  IF NOT FOUND THEN
    SELECT * INTO v_notification FROM public.partner_whatsapp_notifications
    WHERE idempotency_key=p_idempotency_key;
    IF NOT FOUND OR v_notification.request_id IS DISTINCT FROM v_request.id
      OR v_notification.partner_id IS DISTINCT FROM v_partner.id
      OR v_notification.recipient_e164 IS DISTINCT FROM v_phone
      OR v_notification.content_sid IS DISTINCT FROM p_content_sid THEN
      RAISE EXCEPTION 'PARTNER_WHATSAPP_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN v_notification;
  END IF;

  INSERT INTO public.partner_whatsapp_notification_events(
    notification_id,status,provider_event_key,actor_user_id,source
  ) VALUES (v_notification.id,'prepared','operations:prepared',p_actor_user_id,'operations');
  RETURN v_notification;
END $$;

CREATE OR REPLACE FUNCTION public.claim_partner_whatsapp_notification(p_notification_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'PARTNER_WHATSAPP_SERVICE_ROLE_REQUIRED' USING ERRCODE='42501';
  END IF;
  UPDATE public.partner_whatsapp_notifications
  SET provider_attempted_at=clock_timestamp(),updated_at=clock_timestamp()
  WHERE id=p_notification_id AND status='prepared' AND provider_attempted_at IS NULL;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.queue_partner_whatsapp_notification(
  p_notification_id uuid,p_message_sid text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.partner_whatsapp_notifications%ROWTYPE;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
    OR p_message_sid !~ '^SM[0-9A-Za-z]{32}$' THEN
    RAISE EXCEPTION 'PARTNER_WHATSAPP_QUEUE_DENIED' USING ERRCODE='42501';
  END IF;
  UPDATE public.partner_whatsapp_notifications SET status='queued',twilio_message_sid=p_message_sid,
    queued_at=clock_timestamp(),updated_at=clock_timestamp()
  WHERE id=p_notification_id AND status='prepared' AND provider_attempted_at IS NOT NULL
    AND twilio_message_sid IS NULL RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'PARTNER_WHATSAPP_QUEUE_CONFLICT' USING ERRCODE='40001'; END IF;
  INSERT INTO public.partner_whatsapp_notification_events(notification_id,status,provider_event_key,actor_user_id,source)
  VALUES(v_row.id,'queued','provider:'||p_message_sid||':queued',v_row.created_by,'operations');
END $$;

CREATE OR REPLACE FUNCTION public.fail_partner_whatsapp_notification(
  p_notification_id uuid,p_error_code text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.partner_whatsapp_notifications%ROWTYPE;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'PARTNER_WHATSAPP_SERVICE_ROLE_REQUIRED' USING ERRCODE='42501';
  END IF;
  UPDATE public.partner_whatsapp_notifications SET status='failed',error_code=left(nullif(btrim(p_error_code),''),100),
    failed_at=clock_timestamp(),updated_at=clock_timestamp()
  WHERE id=p_notification_id AND status='prepared' RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'PARTNER_WHATSAPP_FAILURE_CONFLICT' USING ERRCODE='40001'; END IF;
  INSERT INTO public.partner_whatsapp_notification_events(notification_id,status,provider_event_key,error_code,source)
  VALUES(v_row.id,'failed','provider-error:'||v_row.id::text, v_row.error_code,'provider_error');
END $$;

CREATE OR REPLACE FUNCTION public.apply_partner_whatsapp_callback(
  p_message_sid text,p_status text,p_error_code text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.partner_whatsapp_notifications%ROWTYPE;
  v_status text := lower(btrim(coalesce(p_status,'')));
  v_next text;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
    OR p_message_sid !~ '^SM[0-9A-Za-z]{32}$' THEN
    RAISE EXCEPTION 'PARTNER_WHATSAPP_CALLBACK_DENIED' USING ERRCODE='42501';
  END IF;
  v_next := CASE WHEN v_status IN ('failed','undelivered') THEN 'failed' ELSE v_status END;
  IF v_next NOT IN ('queued','sent','delivered','read','failed') THEN
    RAISE EXCEPTION 'PARTNER_WHATSAPP_CALLBACK_STATUS_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_row FROM public.partner_whatsapp_notifications
  WHERE twilio_message_sid=p_message_sid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PARTNER_WHATSAPP_MESSAGE_UNKNOWN' USING ERRCODE='P0002'; END IF;
  IF v_row.status=v_next OR EXISTS(
    SELECT 1 FROM public.partner_whatsapp_notification_events
    WHERE notification_id=v_row.id AND provider_event_key='twilio:'||p_message_sid||':'||v_status
  ) THEN RAISE EXCEPTION 'PARTNER_WHATSAPP_CALLBACK_REPLAY' USING ERRCODE='23505'; END IF;
  IF NOT (
    (v_row.status='queued' AND v_next IN ('sent','delivered','read','failed')) OR
    (v_row.status='sent' AND v_next IN ('delivered','read','failed')) OR
    (v_row.status='delivered' AND v_next='read')
  ) THEN RAISE EXCEPTION 'PARTNER_WHATSAPP_CALLBACK_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;

  UPDATE public.partner_whatsapp_notifications SET status=v_next,
    sent_at=CASE WHEN v_next='sent' THEN clock_timestamp() ELSE sent_at END,
    delivered_at=CASE WHEN v_next='delivered' THEN clock_timestamp() ELSE delivered_at END,
    read_at=CASE WHEN v_next='read' THEN clock_timestamp() ELSE read_at END,
    failed_at=CASE WHEN v_next='failed' THEN clock_timestamp() ELSE failed_at END,
    error_code=CASE WHEN v_next='failed' THEN left(nullif(btrim(p_error_code),''),100) ELSE error_code END,
    updated_at=clock_timestamp() WHERE id=v_row.id;
  INSERT INTO public.partner_whatsapp_notification_events(notification_id,status,provider_event_key,error_code,source)
  VALUES(v_row.id,v_next,'twilio:'||p_message_sid||':'||v_status,
    CASE WHEN v_next='failed' THEN left(nullif(btrim(p_error_code),''),100) END,'twilio_callback');
  RETURN v_row.id;
END $$;

REVOKE ALL ON FUNCTION public.reject_partner_whatsapp_event_mutation() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.prepare_partner_whatsapp_notification(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.claim_partner_whatsapp_notification(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.queue_partner_whatsapp_notification(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fail_partner_whatsapp_notification(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.apply_partner_whatsapp_callback(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_partner_whatsapp_notification(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_partner_whatsapp_notification(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_partner_whatsapp_notification(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_partner_whatsapp_notification(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_partner_whatsapp_callback(text,text,text) TO service_role;

COMMIT;
