-- Targeted service-only claim. No activation, backfill, enrollment or queue housekeeping.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE FUNCTION public.claim_kapso_drive_whatsapp_target(
 p_request_id uuid,p_outbox_id uuid,p_recipient_user_id uuid,p_category text,p_language text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v drive_notification_private.outbox%ROWTYPE; v_token uuid:=gen_random_uuid();
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'SERVICE_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR p_outbox_id IS NULL OR p_recipient_user_id IS NULL
  OR p_category IS NULL OR p_category NOT IN ('operations.created','customer.created','customer.review',
   'customer.confirm','customer.decline','customer.customer_accept')
  OR p_language IS NULL OR p_language NOT IN ('ar','en')
 THEN RAISE EXCEPTION 'INVALID_TARGET' USING ERRCODE='22023'; END IF;
 -- Match the existing begin/claim lock order; never touch any other outbox row.
 PERFORM 1 FROM drive_notification_private.settings WHERE singleton AND send_enabled FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO v FROM drive_notification_private.outbox
 WHERE id=p_outbox_id AND request_id=p_request_id AND recipient_user_id=p_recipient_user_id
  AND (audience||'.'||action)=p_category AND language=p_language
  AND state='pending' AND attempts=0 AND provider_sid IS NULL AND provider_phone_number_id IS NULL
  AND lease_token IS NULL AND lease_until IS NULL AND available_at<=now()
  AND drive_notification_private.category_enabled(audience,action,recipient_user_id,language)
 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- No lease reclamation here, even before intent. An uncertain invocation requires
 -- inspection, never an automatic retry. Final eligibility/budget stays in begin.
 UPDATE drive_notification_private.outbox SET state='claimed',lease_token=v_token,
  lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=v.id;
 RETURN jsonb_build_object('id',v.id,'token',v_token,'request_id',v.request_id,
  'recipient_user_id',v.recipient_user_id,'audience',v.audience,'action',v.action,
  'language',v.language,'phone',v.phone,'reference',v.request_reference);
END $$;
REVOKE ALL ON FUNCTION public.claim_kapso_drive_whatsapp_target(uuid,uuid,uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.claim_kapso_drive_whatsapp_target(uuid,uuid,uuid,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
