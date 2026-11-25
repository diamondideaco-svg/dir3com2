-- Task265 LOCAL forward only: no enrollment, activation, templates, budget changes, backfill or sends.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE drive_notification_private.continuous_scopes DROP CONSTRAINT continuous_scopes_check;
ALTER TABLE drive_notification_private.continuous_scopes ADD CONSTRAINT continuous_scopes_check CHECK(audience='customer' OR action IN ('created','customer_accept'));
-- No old row can match: the prior CHECK prohibited this category. One explicit approved recipient per service.
CREATE UNIQUE INDEX drive_single_operations_accept_scope ON drive_notification_private.continuous_scopes(service_id) WHERE audience='operations' AND action='customer_accept';
CREATE OR REPLACE FUNCTION public.prepare_kapso_continuous_service(p_scopes jsonb,p_sender text,p_webhook uuid,p_templates jsonb,p_approval text,p_daily_limit integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg drive_notification_private.continuous_services%ROWTYPE; binding jsonb; x jsonb; sub drive_notification_private.subscriptions%ROWTYPE;
 action text; template jsonb; scope_id uuid; stamp timestamptz:=clock_timestamp();
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
  SELECT * INTO sub FROM drive_notification_private.subscriptions WHERE id=(x->>'subscriptionId')::uuid FOR SHARE NOWAIT;
  IF NOT FOUND OR NOT sub.enabled OR sub.verified_at>stamp OR sub.country<>'EG'
   OR action IS NULL OR action NOT IN ('created','review','confirm','decline','customer_accept') OR (sub.audience='operations' AND action NOT IN ('created','customer_accept'))
   OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=sub.user_id AND status='active' AND deleted_at IS NULL)
   THEN RAISE EXCEPTION 'INELIGIBLE_CONTINUOUS_SCOPE' USING ERRCODE='22023'; END IF;
  template:=p_templates->(sub.audience||'.'||action||'.'||sub.language);
  IF NOT drive_notification_private.current_state_template_valid(template,sub.language) THEN RAISE EXCEPTION 'INVALID_CONTINUOUS_TEMPLATE' USING ERRCODE='22023'; END IF;
  INSERT INTO drive_notification_private.continuous_scopes(service_id,subscription_id,recipient_user_id,audience,country,phone,language,consent_reference,verified_at,action,template)
  VALUES(cfg.id,sub.id,sub.user_id,sub.audience,sub.country,sub.phone,sub.language,sub.consent_reference,sub.verified_at,action,template) RETURNING id INTO scope_id;
  PERFORM drive_notification_private.assert_continuous_scope(scope_id);
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_templates) key WHERE NOT EXISTS(SELECT 1 FROM drive_notification_private.continuous_scopes s WHERE s.service_id=cfg.id AND key=s.audience||'.'||s.action||'.'||s.language))
 THEN RAISE EXCEPTION 'UNBOUND_CONTINUOUS_TEMPLATE' USING ERRCODE='22023'; END IF;
 RETURN cfg.id;
END $$;
-- Preserve the observed Core baseline; do not overwrite an unknown deployed implementation.
DO $baseline$
BEGIN
 IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to((SELECT prosrc FROM pg_catalog.pg_proc
  WHERE oid='public.accept_managed_drive_quote(uuid,integer)'::regprocedure),'UTF8')),'hex') IS DISTINCT FROM '9ae4040e646251b637fb9b6925457e9aa89458759b6456ebd2d90a032ec48cc0'
 THEN RAISE EXCEPTION 'TASK265_ACCEPT_BASELINE_MISMATCH'; END IF;
END $baseline$;
CREATE OR REPLACE FUNCTION public.accept_managed_drive_quote(p_request_id uuid,p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_context public.drive_request_context%ROWTYPE; v_request public.marketplace_requests%ROWTYPE; v_stamp timestamptz;
BEGIN
 IF auth.uid() IS NULL OR current_setting('role',true) IS DISTINCT FROM 'authenticated'
   OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active' AND deleted_at IS NULL)
 THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;

 -- Match Operations: context first, request second. Filter ownership before locking,
 -- then recheck it on the locked request; never serialize another owner's request.
 SELECT * INTO v_context FROM public.drive_request_context c WHERE c.request_id=p_request_id
   AND EXISTS (SELECT 1 FROM public.marketplace_requests r
     WHERE r.id=c.request_id AND r.user_id=auth.uid() AND r.drive_offer_id IS NOT NULL)
   FOR UPDATE OF c;
 IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_request FROM public.marketplace_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR v_request.user_id IS DISTINCT FROM auth.uid() OR v_request.drive_offer_id IS NULL
 THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='42501'; END IF;

 -- The actor and deadline may change while either row lock is awaited.
 -- NOWAIT avoids reverse lock waits with account revocation. Hold current authority through this transaction.
 PERFORM 1 FROM public.profiles WHERE id=auth.uid() AND status='active' AND deleted_at IS NULL FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 v_stamp:=clock_timestamp();
 -- A lost response can be retried with the previous version without duplicating the event.
 IF v_request.status='awaiting_payment' AND v_context.customer_accepted_at IS NOT NULL THEN
  RETURN jsonb_build_object('status',v_request.status,'version',v_context.version,'replayed',true);
 END IF;
 IF p_version IS NULL OR p_version<0 OR v_context.version IS DISTINCT FROM p_version
 THEN RAISE EXCEPTION 'STALE_REQUEST' USING ERRCODE='40001'; END IF;
 IF v_request.status<>'awaiting_customer_acceptance' OR v_request.quote_amount IS NULL
   OR v_request.quote_currency IS NULL OR v_request.quote_expires_at IS NULL
   OR v_request.quote_expires_at<=v_stamp
 THEN RAISE EXCEPTION 'INVALID_OR_EXPIRED_QUOTE' USING ERRCODE='22023'; END IF;

 UPDATE public.marketplace_requests
 SET status='awaiting_payment',payment_status='awaiting_payment',next_action='payment_not_enabled',updated_at=v_stamp
 WHERE id=p_request_id;
 UPDATE public.drive_request_context
 SET customer_accepted_at=v_stamp,version=version+1
 WHERE request_id=p_request_id;
 INSERT INTO public.drive_request_events(request_id,actor_user_id,country,action,previous_status,new_status)
 VALUES(p_request_id,auth.uid(),'EG','customer_accept',v_request.status,'awaiting_payment');
 RETURN jsonb_build_object('status','awaiting_payment','version',p_version+1,'replayed',false);
END $$;

-- Same current owner only; status projection discloses neither recipients nor provider identifiers.
CREATE FUNCTION public.read_owned_drive_accept_notice(p_request_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result text;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active' AND deleted_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM public.marketplace_requests r JOIN public.drive_request_context c ON c.request_id=r.id
  WHERE r.id=p_request_id AND r.user_id=auth.uid() AND c.customer_accepted_at IS NOT NULL)
 THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT CASE o.state WHEN 'pending' THEN 'queued' WHEN 'claimed' THEN 'queued' WHEN 'accepted' THEN 'provider_accepted'
  WHEN 'queued' THEN 'provider_accepted' WHEN 'sending' THEN 'sending' WHEN 'sent' THEN 'sent' WHEN 'delivered' THEN 'delivered'
  WHEN 'read' THEN 'read' WHEN 'failed' THEN 'failed' WHEN 'undelivered' THEN 'failed' ELSE 'unknown' END INTO result
 FROM drive_notification_private.outbox o JOIN public.drive_request_events e ON e.id=o.event_id
 WHERE o.request_id=p_request_id AND o.action='customer_accept' AND o.audience='operations' AND e.action='customer_accept'
 ORDER BY o.created_at DESC,o.id LIMIT 1;
 RETURN coalesce(result,'not_queued');
END $$;
REVOKE ALL ON FUNCTION public.read_owned_drive_accept_notice(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_owned_drive_accept_notice(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
