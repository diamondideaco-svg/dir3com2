-- No backfill. approved remains non-operational until a fresh admin attestation.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';

DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid='public.audit_logs'::regclass
      AND tgname='operations_append_only' AND tgenabled='O'
  ) THEN
    RAISE EXCEPTION 'PARTNER_ACTIVATION_AUDIT_PREREQUISITE_MISSING';
  END IF;
END $$;

CREATE FUNCTION public.activate_partner_with_attestation(
  p_partner_id uuid,
  p_expected_status text,
  p_expected_updated_at timestamptz,
  p_confirmed boolean,
  p_reason text,
  p_reference text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_partner public.partners%ROWTYPE;
  v_reason text := btrim(coalesce(p_reason,''));
  v_reference text := nullif(btrim(coalesce(p_reference,'')),'');
BEGIN
  -- No service-role actor substitution or delegated staff activation.
  IF current_setting('role',true) IS DISTINCT FROM 'authenticated' OR v_actor IS NULL THEN
    RAISE EXCEPTION 'PARTNER_ACTIVATION_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id=v_actor FOR SHARE;
  IF NOT FOUND OR lower(btrim(v_profile.role::text)) NOT IN ('admin','super_admin')
    OR v_profile.status IS DISTINCT FROM 'active' OR v_profile.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'PARTNER_ACTIVATION_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_confirmed IS DISTINCT FROM true OR length(v_reason)<3 OR length(v_reason)>1000
    OR length(coalesce(v_reference,''))>200 THEN
    RAISE EXCEPTION 'PARTNER_ACTIVATION_ATTESTATION_REQUIRED' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id=p_partner_id FOR SHARE;
  IF NOT FOUND OR v_profile.role IS DISTINCT FROM 'partner'
    OR v_profile.status IS DISTINCT FROM 'active' OR v_profile.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'PARTNER_ACTIVATION_TARGET_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_partner FROM public.partners WHERE id=p_partner_id FOR UPDATE;
  IF NOT FOUND OR v_partner.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'PARTNER_ACTIVATION_TARGET_DENIED' USING ERRCODE='42501';
  END IF;
  IF p_expected_status IS DISTINCT FROM 'approved' OR v_partner.status IS DISTINCT FROM p_expected_status
    OR p_expected_updated_at IS NULL OR v_partner.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'PARTNER_ACTIVATION_STATE_CONFLICT' USING ERRCODE='40001';
  END IF;

  UPDATE public.partners SET status='active',updated_at=clock_timestamp() WHERE id=p_partner_id;
  -- The authenticated admin's fresh attestation, not legacy status, is evidence.
  -- Any audit failure rolls the status change back in the same RPC transaction.
  INSERT INTO public.audit_logs(entity_type,entity_id,action,old_values,new_values,performed_by)
  VALUES ('partner',p_partner_id::text,'partner.activated',
    jsonb_build_object('status',v_partner.status,'updated_at',v_partner.updated_at),
    jsonb_build_object('partner_id',p_partner_id,'status','active','confirmed',true,
      'reason',v_reason,'approval_reference',v_reference,'evidence_type','admin_attestation'),
    v_actor::text);
  RETURN 'active';
END $$;
REVOKE ALL ON FUNCTION public.activate_partner_with_attestation(uuid,text,timestamptz,boolean,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.activate_partner_with_attestation(uuid,text,timestamptz,boolean,text,text)
  TO authenticated;
COMMIT;
