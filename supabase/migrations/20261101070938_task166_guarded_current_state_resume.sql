-- Source only. No existing notice is renewed, activated or sent by this migration.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- One renewal maximum. Preserve the expired authorization's original clock and
-- bindings rather than deleting/re-preparing the notice or resetting attempts.
CREATE TABLE drive_notification_private.current_state_resumptions (
 notice_id uuid PRIMARY KEY REFERENCES drive_notification_private.current_state_notices(id),
 approval_reference text NOT NULL UNIQUE CHECK(length(approval_reference) BETWEEN 8 AND 120),
 request_id uuid NOT NULL REFERENCES public.drive_request_context(request_id),
 customer_outbox_id uuid NOT NULL UNIQUE REFERENCES drive_notification_private.outbox(id),
 operations_outbox_id uuid NOT NULL UNIQUE REFERENCES drive_notification_private.outbox(id),
 previous_started_at timestamptz NOT NULL,
 previous_expires_at timestamptz NOT NULL,
 resumed_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 CHECK(customer_outbox_id<>operations_outbox_id),
 CHECK(previous_expires_at<=resumed_at),
 CHECK(expires_at=resumed_at+interval '9 minutes')
);
ALTER TABLE drive_notification_private.current_state_resumptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON drive_notification_private.current_state_resumptions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON drive_notification_private.current_state_resumptions TO service_role;

-- The tool approval happens before this RPC executes. Its database clock starts
-- only after all locks/checks; the caller cannot supply or extend the deadline.
-- Customer renews an entirely untouched expired pair once. Operations consumes
-- the same deadline after the customer's known acceptance, never after unknown.
CREATE FUNCTION public.resume_kapso_current_state_window(p_notice uuid,p_request uuid,
 p_customer_outbox uuid,p_operations_outbox uuid,p_audience text,p_approval text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='1s' SET statement_timeout='4s' AS $$
DECLARE cfg drive_notification_private.settings%ROWTYPE;
 n drive_notification_private.current_state_notices%ROWTYPE;
 a drive_notification_private.current_state_resumptions%ROWTYPE;
 t drive_notification_private.current_state_targets%ROWTYPE;
 o drive_notification_private.outbox%ROWTYPE;
 customer_target drive_notification_private.current_state_targets%ROWTYPE;
 customer_outbox drive_notification_private.outbox%ROWTYPE;
 w drive_notification_private.execution_windows%ROWTYPE;
 r public.marketplace_requests%ROWTYPE; c public.drive_request_context%ROWTYPE;
 started timestamptz; wid uuid; changed integer;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF p_notice IS NULL OR p_request IS NULL OR p_customer_outbox IS NULL OR p_operations_outbox IS NULL
  OR p_customer_outbox=p_operations_outbox OR p_audience IS NULL OR p_audience NOT IN ('customer','operations')
  OR p_approval IS NULL OR length(p_approval) NOT BETWEEN 8 AND 120 THEN
  RAISE EXCEPTION 'INVALID_STATE_RESUMPTION' USING ERRCODE='22023';
 END IF;
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF NOT FOUND OR cfg.dispatch_mode<>'target_only' OR cfg.capture_enabled
  OR cfg.active_continuous_service_id IS NOT NULL
  OR EXISTS(SELECT 1 FROM drive_notification_private.continuous_services WHERE activated_at IS NOT NULL AND stopped_at IS NULL)
  OR EXISTS(SELECT 1 FROM drive_notification_private.customer_authorizations WHERE stopped_at IS NULL) THEN
  RAISE EXCEPTION 'CLOSED_GATES_REQUIRED' USING ERRCODE='22023';
 END IF;
 SELECT * INTO n FROM drive_notification_private.current_state_notices WHERE id=p_notice FOR UPDATE;
 IF NOT FOUND OR n.request_id IS DISTINCT FROM p_request OR n.stopped_at IS NOT NULL THEN
  RAISE EXCEPTION 'STATE_RESUMPTION_BINDING' USING ERRCODE='22023';
 END IF;
 -- Same order as preparation; NOWAIT avoids a lifecycle/consent reverse-order wait.
 SELECT * INTO r FROM public.marketplace_requests WHERE id=n.request_id FOR SHARE NOWAIT;
 SELECT * INTO c FROM public.drive_request_context WHERE request_id=n.request_id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.drive_request_events WHERE id=n.source_event_id FOR SHARE NOWAIT;
 IF r.id IS NULL OR r.status IS DISTINCT FROM n.expected_status OR c.version IS DISTINCT FROM n.expected_version
  OR c.country IS DISTINCT FROM 'EG' OR r.requested_for IS NULL OR r.requested_for<=clock_timestamp()
  OR (SELECT count(*) FROM public.drive_request_events WHERE request_id=r.id AND action='created'
      AND new_status=n.expected_status AND country='EG')<>1
  OR NOT EXISTS(SELECT 1 FROM public.drive_request_events WHERE id=n.source_event_id AND request_id=r.id
      AND action='created' AND new_status=n.expected_status AND country='EG') THEN
  RAISE EXCEPTION 'STALE_STATE_NOTICE' USING ERRCODE='22023';
 END IF;
 PERFORM 1 FROM drive_notification_private.current_state_targets WHERE notice_id=n.id ORDER BY id FOR UPDATE;
 PERFORM 1 FROM drive_notification_private.outbox WHERE request_id=n.request_id ORDER BY id FOR UPDATE;
 PERFORM 1 FROM drive_notification_private.subscriptions WHERE id IN
  (SELECT subscription_id FROM drive_notification_private.current_state_targets WHERE notice_id=n.id) ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.profiles WHERE id IN
  (SELECT recipient_user_id FROM drive_notification_private.current_state_targets WHERE notice_id=n.id) ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.team_access_grants WHERE invited_user_id IN
  (SELECT recipient_user_id FROM drive_notification_private.current_state_targets WHERE notice_id=n.id AND audience='operations') FOR SHARE NOWAIT;
 IF (SELECT count(*) FROM drive_notification_private.current_state_targets WHERE notice_id=n.id)<>2
  OR (SELECT count(*) FROM drive_notification_private.outbox WHERE request_id=n.request_id)<>2 THEN
  RAISE EXCEPTION 'STATE_RESUMPTION_BINDING' USING ERRCODE='22023';
 END IF;
 FOR t IN SELECT * FROM drive_notification_private.current_state_targets WHERE notice_id=n.id ORDER BY audience LOOP
  SELECT * INTO o FROM drive_notification_private.outbox WHERE current_state_target_id=t.id;
  IF o.id IS NULL OR o.id IS DISTINCT FROM (CASE t.audience WHEN 'customer' THEN p_customer_outbox ELSE p_operations_outbox END)
   OR o.request_id IS DISTINCT FROM r.id OR o.event_id IS DISTINCT FROM n.source_event_id
   OR o.recipient_user_id IS DISTINCT FROM t.recipient_user_id OR o.subscription_id IS DISTINCT FROM t.subscription_id
   OR o.phone IS DISTINCT FROM t.phone OR o.language IS DISTINCT FROM t.language OR o.audience IS DISTINCT FROM t.audience
   OR o.action<>'current_state' OR o.country<>'EG' OR o.expected_status IS DISTINCT FROM n.expected_status
   OR o.request_reference IS DISTINCT FROM r.request_reference
   OR NOT EXISTS(SELECT 1 FROM drive_notification_private.subscriptions s WHERE s.id=t.subscription_id
     AND s.user_id=t.recipient_user_id AND s.audience=t.audience AND s.country='EG' AND s.phone=t.phone AND s.language=t.language)
   OR (t.audience='customer' AND t.recipient_user_id IS DISTINCT FROM r.user_id)
   OR NOT drive_notification_private.eligible(t.subscription_id,r.id)
   OR NOT drive_notification_private.current_state_template_valid(t.template,t.language) THEN
   RAISE EXCEPTION 'INELIGIBLE_STATE_NOTICE' USING ERRCODE='22023';
  END IF;
  IF p_audience='customer' OR t.audience='operations' THEN
   IF t.stopped_at IS NOT NULL OR t.window_id IS NOT NULL OR o.state<>'pending' OR o.attempts<>0
    OR o.provider_sid IS NOT NULL OR o.provider_phone_number_id IS NOT NULL OR o.lease_token IS NOT NULL
    OR o.lease_until IS NOT NULL OR o.error_code IS NOT NULL THEN
    RAISE EXCEPTION 'STATE_RESUMPTION_NOT_UNTOUCHED' USING ERRCODE='22023';
   END IF;
  END IF;
  IF t.audience='customer' THEN customer_target:=t; customer_outbox:=o; END IF;
 END LOOP;
 SELECT * INTO a FROM drive_notification_private.current_state_resumptions WHERE notice_id=n.id;
 IF p_audience='customer' THEN
  IF cfg.send_enabled OR a.notice_id IS NOT NULL OR n.expires_at>clock_timestamp()
   OR EXISTS(SELECT 1 FROM drive_notification_private.execution_windows WHERE request_id=n.request_id)
   OR EXISTS(SELECT 1 FROM drive_notification_private.execution_windows WHERE stopped_at IS NULL)
   OR EXISTS(SELECT 1 FROM drive_notification_private.receipts q JOIN drive_notification_private.outbox b ON b.id=q.outbox_id WHERE b.request_id=n.request_id)
   OR EXISTS(SELECT 1 FROM drive_notification_private.continuous_receipt_inbox q JOIN drive_notification_private.outbox b ON b.id=q.matched_outbox_id WHERE b.request_id=n.request_id) THEN
   RAISE EXCEPTION 'STATE_RESUMPTION_NOT_UNTOUCHED' USING ERRCODE='22023';
  END IF;
  started:=clock_timestamp();
  INSERT INTO drive_notification_private.current_state_resumptions(notice_id,approval_reference,request_id,
   customer_outbox_id,operations_outbox_id,previous_started_at,previous_expires_at,resumed_at,expires_at)
   VALUES(n.id,p_approval,r.id,p_customer_outbox,p_operations_outbox,n.started_at,n.expires_at,started,started+interval '9 minutes');
  UPDATE drive_notification_private.current_state_notices SET started_at=started,expires_at=started+interval '9 minutes' WHERE id=n.id;
 ELSE
  IF a.notice_id IS NULL OR a.approval_reference IS DISTINCT FROM p_approval OR a.request_id IS DISTINCT FROM p_request
   OR a.customer_outbox_id IS DISTINCT FROM p_customer_outbox OR a.operations_outbox_id IS DISTINCT FROM p_operations_outbox
   OR n.expires_at IS DISTINCT FROM a.expires_at OR n.expires_at<=clock_timestamp()
   OR customer_outbox.state NOT IN ('accepted','queued','sent','delivered','read') OR customer_outbox.attempts<>1
   OR customer_outbox.provider_sid IS NULL OR customer_outbox.provider_sid !~ '^wamid\.[A-Za-z0-9_+/=-]{1,250}$'
   OR customer_outbox.provider_phone_number_id IS DISTINCT FROM n.phone_number_id THEN
   RAISE EXCEPTION 'STATE_RESUMPTION_CUSTOMER_UNCONFIRMED' USING ERRCODE='22023';
  END IF;
  SELECT * INTO w FROM drive_notification_private.execution_windows WHERE id=customer_target.window_id FOR UPDATE;
  IF NOT FOUND OR w.outbox_id IS DISTINCT FROM customer_outbox.id OR w.send_started_at IS NULL
   OR cfg.active_window_id IS DISTINCT FROM w.id
   OR EXISTS(SELECT 1 FROM drive_notification_private.execution_windows WHERE stopped_at IS NULL AND id<>w.id) THEN
   RAISE EXCEPTION 'STATE_RESUMPTION_CUSTOMER_UNCONFIRMED' USING ERRCODE='22023';
  END IF;
  -- Close only the consumed first target, never the parent notice or webhook.
  IF w.stopped_at IS NULL THEN PERFORM drive_notification_private.stop_window(w.id,'manual'); END IF;
 END IF;
 wid:=public.open_kapso_current_state_window(n.id,p_audience);
 UPDATE drive_notification_private.settings SET send_enabled=true
  WHERE singleton AND active_window_id=wid AND dispatch_mode='target_only' AND NOT send_enabled
   AND NOT capture_enabled AND active_continuous_service_id IS NULL;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'CLOSED_GATES_REQUIRED' USING ERRCODE='22023'; END IF;
 IF p_audience='operations' THEN
  -- The consumed customer's webhook is shared with the replacement. This is
  -- metadata reconciliation inside the same transaction, not provider cleanup.
  UPDATE drive_notification_private.execution_windows previous SET deactivation_required=false
   WHERE previous.id=w.id AND previous.stopped_at IS NOT NULL AND previous.outbox_id=p_customer_outbox
    AND previous.request_id=n.request_id AND previous.webhook_id=n.webhook_id
    AND EXISTS(SELECT 1 FROM drive_notification_private.execution_windows replacement
      WHERE replacement.id=wid AND replacement.request_id=n.request_id AND replacement.outbox_id=p_operations_outbox
       AND replacement.webhook_id=previous.webhook_id AND replacement.delivery_mode='webhook'
       AND replacement.stopped_at IS NULL AND replacement.expires_at>clock_timestamp());
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'STATE_RESUMPTION_HANDOFF_CONFLICT' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT * INTO n FROM drive_notification_private.current_state_notices WHERE id=n.id;
 RETURN jsonb_build_object('notice_id',n.id,'window_id',wid,'expires_at',n.expires_at,'target',
  (SELECT jsonb_build_object('requestId',b.request_id,'outboxId',b.id,'recipientUserId',b.recipient_user_id,
    'category',b.audience||'.current_state','language',b.language)
   FROM drive_notification_private.outbox b JOIN drive_notification_private.execution_windows x ON x.outbox_id=b.id WHERE x.id=wid));
END $$;
REVOKE ALL ON FUNCTION public.resume_kapso_current_state_window(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resume_kapso_current_state_window(uuid,uuid,uuid,uuid,text,text) TO service_role;

-- Preserve the existing stop implementation and ACL. Only an already consumed
-- renewed customer sharing a currently armed Operations webhook suppresses its
-- obsolete cleanup marker; late receipts must not recreate that marker. The
-- Operations terminal stop, emergency OFF and every unrelated window retain
-- their existing behavior.
CREATE OR REPLACE FUNCTION drive_notification_private.stop_window(p_window_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg drive_notification_private.settings%ROWTYPE; w drive_notification_private.execution_windows%ROWTYPE;
 notice uuid; result jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_reason IS NULL OR p_reason NOT IN ('manual','expired','unknown','delivered','failed') THEN RAISE EXCEPTION 'INVALID_STOP' USING ERRCODE='22023'; END IF;
 SELECT * INTO cfg FROM drive_notification_private.settings WHERE singleton FOR UPDATE;
 IF cfg.dispatch_mode<>'continuous' THEN
  result:=drive_notification_private.stop_before_continuous(p_window_id,p_reason);
  IF cfg.dispatch_mode='target_only' AND cfg.send_enabled AND NOT cfg.capture_enabled AND cfg.active_continuous_service_id IS NULL
   AND EXISTS(SELECT 1 FROM drive_notification_private.current_state_resumptions a
    JOIN drive_notification_private.current_state_notices n ON n.id=a.notice_id AND n.request_id=a.request_id
    JOIN drive_notification_private.current_state_targets t ON t.notice_id=n.id AND t.audience='customer'
    JOIN drive_notification_private.execution_windows previous ON previous.id=t.window_id AND previous.outbox_id=a.customer_outbox_id
    JOIN drive_notification_private.current_state_targets sibling ON sibling.notice_id=n.id AND sibling.audience='operations'
    JOIN drive_notification_private.execution_windows replacement ON replacement.id=sibling.window_id AND replacement.outbox_id=a.operations_outbox_id
    WHERE previous.id=p_window_id AND previous.stopped_at IS NOT NULL AND previous.send_started_at IS NOT NULL
     AND cfg.active_window_id=replacement.id AND replacement.id<>previous.id
     AND previous.request_id=n.request_id AND replacement.request_id=n.request_id
     AND previous.delivery_mode='webhook' AND replacement.delivery_mode='webhook'
     AND previous.webhook_id=n.webhook_id AND replacement.webhook_id=n.webhook_id
     AND replacement.category='operations.current_state' AND replacement.stopped_at IS NULL
     AND replacement.expires_at=n.expires_at AND n.expires_at=a.expires_at AND n.expires_at>clock_timestamp()) THEN
   UPDATE drive_notification_private.execution_windows SET deactivation_required=false WHERE id=p_window_id;
   result:=jsonb_set(result,'{deactivation_required}','false'::jsonb);
  END IF;
  RETURN result;
 END IF;
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
COMMIT;
