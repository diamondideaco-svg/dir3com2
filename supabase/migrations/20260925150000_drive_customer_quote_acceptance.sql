-- Task #158. Customer-owned Drive quote acceptance; booking and payment remain blocked.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.drive_request_context
  ADD COLUMN IF NOT EXISTS customer_accepted_at timestamptz;

ALTER TABLE public.marketplace_requests DROP CONSTRAINT IF EXISTS drive_payment_stop;
ALTER TABLE public.marketplace_requests ADD CONSTRAINT drive_payment_stop CHECK (drive_offer_id IS NULL OR (
  marketplace_family='drive' AND request_type='request_to_confirm' AND transaction_method='request_to_confirm'
  AND fulfilment_method='request_to_confirm' AND payment_status='awaiting_payment' AND handoff_type='none'
  AND status IN ('request_submitted','under_review','awaiting_customer_acceptance','awaiting_payment','declined')
));

ALTER TABLE public.drive_request_events DROP CONSTRAINT IF EXISTS drive_request_events_action_check;
ALTER TABLE public.drive_request_events ADD CONSTRAINT drive_request_events_action_check
  CHECK(action IN ('created','review','confirm','customer_accept','decline'));

CREATE OR REPLACE FUNCTION public.accept_managed_drive_quote(p_request_id uuid,p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_context public.drive_request_context%ROWTYPE; v_request public.marketplace_requests%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR current_setting('role',true) IS DISTINCT FROM 'authenticated'
   OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active' AND deleted_at IS NULL)
 THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;

 SELECT * INTO v_request FROM public.marketplace_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR v_request.user_id IS DISTINCT FROM auth.uid() OR v_request.drive_offer_id IS NULL
 THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_context FROM public.drive_request_context WHERE request_id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='42501'; END IF;

 -- A lost response can be retried with the previous version without duplicating the event.
 IF v_request.status='awaiting_payment' AND v_context.customer_accepted_at IS NOT NULL THEN
  RETURN jsonb_build_object('status',v_request.status,'version',v_context.version,'replayed',true);
 END IF;
 IF p_version IS NULL OR p_version<0 OR v_context.version IS DISTINCT FROM p_version
 THEN RAISE EXCEPTION 'STALE_REQUEST' USING ERRCODE='40001'; END IF;
 IF v_request.status<>'awaiting_customer_acceptance' OR v_request.quote_amount IS NULL
   OR v_request.quote_currency IS NULL OR v_request.quote_expires_at IS NULL
   OR v_request.quote_expires_at<=now()
 THEN RAISE EXCEPTION 'INVALID_OR_EXPIRED_QUOTE' USING ERRCODE='22023'; END IF;

 UPDATE public.marketplace_requests
 SET status='awaiting_payment',payment_status='awaiting_payment',next_action='payment_not_enabled',updated_at=now()
 WHERE id=p_request_id;
 UPDATE public.drive_request_context
 SET customer_accepted_at=now(),version=version+1
 WHERE request_id=p_request_id;
 INSERT INTO public.drive_request_events(request_id,actor_user_id,country,action,previous_status,new_status)
 VALUES(p_request_id,auth.uid(),'EG','customer_accept',v_request.status,'awaiting_payment');
 RETURN jsonb_build_object('status','awaiting_payment','version',p_version+1,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.accept_managed_drive_quote(uuid,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.accept_managed_drive_quote(uuid,integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
