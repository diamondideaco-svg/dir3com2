-- CEO policy 2026-09-09: no non-CEO legacy profile-only authority.
-- Forward-only; no user/grant/business-data backfill. Production apply is separate.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.has_operational_access(
  p_permission text DEFAULT NULL, p_country text DEFAULT NULL,
  p_require_global boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_grant public.team_access_grants%ROWTYPE;
  v_permissions constant text[] := ARRAY['admin:full','operations:read','operations:write',
    'customers:read','customers:write','partners:read','partners:write','products:read',
    'products:write','finance:read','finance:write','verification:read','verification:write'];
  v_global boolean;
BEGIN
  IF v_actor IS NULL OR current_setting('role',true) IS DISTINCT FROM 'authenticated'
    OR (p_permission IS NOT NULL AND NOT (p_permission=ANY(v_permissions))) THEN RETURN false; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id=v_actor;
  IF NOT FOUND OR v_profile.status IS DISTINCT FROM 'active' OR v_profile.deleted_at IS NOT NULL
    OR lower(btrim(v_profile.role)) NOT IN ('admin','super_admin','staff') THEN RETURN false; END IF;
  IF public.is_ceo_actor() THEN RETURN true; END IF;
  SELECT * INTO v_grant FROM public.team_access_grants WHERE invited_user_id=v_actor;
  IF NOT FOUND OR v_grant.status IS DISTINCT FROM 'active'
    OR v_grant.access_level NOT IN ('scoped_staff','global_admin')
    OR v_grant.permissions IS NULL OR cardinality(v_grant.permissions)=0
    OR NOT (v_grant.permissions <@ v_permissions)
    OR array_position(v_grant.permissions,NULL) IS NOT NULL
    OR v_grant.country_scope IS NULL
    OR EXISTS (SELECT 1 FROM unnest(v_grant.country_scope) c WHERE c IS NULL OR btrim(c)='')
    THEN RETURN false; END IF;
  v_global := v_grant.access_level='global_admin' OR 'admin:full'=ANY(v_grant.permissions);
  IF p_require_global AND NOT v_global THEN RETURN false; END IF;
  IF p_permission IS NOT NULL AND NOT v_global AND NOT (p_permission=ANY(v_grant.permissions)) THEN RETURN false; END IF;
  IF v_global THEN RETURN true; END IF;
  IF cardinality(v_grant.country_scope)=0 THEN RETURN false; END IF;
  -- NULL is a permission-only/session check, never a country wildcard for a row.
  IF p_country IS NULL THEN RETURN true; END IF;
  IF public.normalize_admin_country_key(p_country)='' THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM unnest(v_grant.country_scope) c
    WHERE public.normalize_admin_country_key(c)=public.normalize_admin_country_key(p_country));
END $$;
REVOKE ALL ON FUNCTION public.has_operational_access(text,text,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.has_operational_access(text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.require_operational_access(
  p_permission text DEFAULT NULL, p_country text DEFAULT NULL,
  p_require_global boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Serialize sensitive operations with profile/grant edits until transaction end.
  PERFORM 1 FROM public.profiles WHERE id=auth.uid() FOR SHARE;
  PERFORM 1 FROM public.team_access_grants WHERE invited_user_id=auth.uid() FOR SHARE;
  IF NOT public.has_operational_access(p_permission,p_country,p_require_global) THEN
    RAISE EXCEPTION 'OPERATIONAL_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.require_operational_access(text,text,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.require_operational_access(text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin_actor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.has_operational_access('admin:full',NULL,true)
$$;

CREATE OR REPLACE FUNCTION public.can_read_product_audit(p_country text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.has_operational_access('products:read',coalesce(p_country,''),false)
    OR public.has_operational_access('products:write',coalesce(p_country,''),false)
$$;

CREATE OR REPLACE FUNCTION public.product_lifecycle_session_role(p_permission text DEFAULT 'products:write')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'PRODUCT_LIFECYCLE_AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  PERFORM public.require_operational_access(p_permission,NULL,false);
  SELECT lower(btrim(role)) INTO v_role FROM public.profiles WHERE id=auth.uid();
  RETURN CASE WHEN v_role='super_admin' THEN 'admin' ELSE v_role END;
END $$;

CREATE OR REPLACE FUNCTION public.product_lifecycle_actor_role(p_country text,p_permission text DEFAULT 'products:write')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text;
BEGIN
  v_role := public.product_lifecycle_session_role(p_permission);
  IF NOT public.has_operational_access(p_permission,coalesce(p_country,''),false) THEN
    RAISE EXCEPTION 'COUNTRY_SCOPE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  RETURN v_role;
END $$;

-- Keep established global-only modules global-only; no new scoped module is invented.
ALTER POLICY dir74_assignments_admin_select ON public.partner_assignments USING (public.is_admin_actor());
ALTER POLICY dir74_assignments_admin_insert ON public.partner_assignments WITH CHECK (public.is_admin_actor());
ALTER POLICY dir74_assignments_admin_update ON public.partner_assignments USING (public.is_admin_actor()) WITH CHECK (public.is_admin_actor());
ALTER POLICY dir81_admin_partners_select ON public.partners USING (public.is_admin_actor());
ALTER POLICY dir74_customers_admin_select ON public.customers
  USING (public.has_operational_access('customers:read',coalesce(country,''),false));
ALTER POLICY dir74_customers_admin_insert ON public.customers
  WITH CHECK (public.has_operational_access('customers:write',coalesce(country,''),false));
ALTER POLICY dir74_customers_admin_update ON public.customers
  USING (public.has_operational_access('customers:write',coalesce(country,''),false))
  WITH CHECK (public.has_operational_access('customers:write',coalesce(country,''),false));

ALTER POLICY operations_admin_read ON public.audit_logs USING (public.is_admin_actor());
ALTER POLICY operations_admin_insert ON public.audit_logs WITH CHECK (public.is_admin_actor() AND performed_by=auth.uid()::text);
ALTER POLICY operations_admin_read ON public.activity_timeline USING (public.is_admin_actor());
ALTER POLICY operations_admin_insert ON public.activity_timeline WITH CHECK (public.is_admin_actor() AND performed_by=auth.uid()::text);
ALTER POLICY operations_admin_read ON public.system_events USING (public.is_admin_actor());
ALTER POLICY operations_admin_insert ON public.system_events WITH CHECK (public.is_admin_actor());
ALTER POLICY verification_documents_admin_all ON public.verification_documents USING (public.is_admin_actor()) WITH CHECK (public.is_admin_actor());
ALTER POLICY verification_requests_admin_all ON public.verification_requests USING (public.is_admin_actor()) WITH CHECK (public.is_admin_actor());
ALTER POLICY verification_reviews_admin_all ON public.verification_reviews USING (public.is_admin_actor()) WITH CHECK (public.is_admin_actor());
ALTER POLICY verification_status_history_admin_all ON public.verification_status_history USING (public.is_admin_actor()) WITH CHECK (public.is_admin_actor());

CREATE OR REPLACE FUNCTION public.transition_marketplace_request(p_request_id uuid, p_expected_status text, p_new_status text, p_confirmation_evidence jsonb DEFAULT '{}'::jsonb)
 RETURNS marketplace_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  current_request public.marketplace_requests%ROWTYPE;
  updated_request public.marketplace_requests%ROWTYPE;
  caller_database_role text := NULLIF(current_setting('role', true), 'none');
  caller_claims jsonb := COALESCE(auth.jwt(), '{}'::jsonb);
  trusted_actor_id uuid;
  actor_identity_value text;
  actor_role_value text;
  actor_source_value text;
  next_action_value text;
  authoritative_evidence jsonb := '{}'::jsonb;
BEGIN
  IF p_expected_status IS NULL OR p_new_status IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DIR120_INVALID_TRANSITION_INPUT';
  END IF;

  IF caller_database_role = 'authenticated'
    AND caller_claims->>'role' = 'authenticated'
  THEN
    trusted_actor_id := auth.uid();

    SELECT 'admin'
    INTO actor_role_value
    FROM public.profiles
    WHERE id = trusted_actor_id
      AND LOWER(role) IN ('admin', 'super_admin')
      AND status = 'active'
      AND deleted_at IS NULL;

    IF NOT FOUND OR NOT public.is_admin_actor() THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'DIR120_ACTOR_NOT_AUTHORIZED';
    END IF;

    PERFORM public.require_operational_access('admin:full',NULL,true);
    actor_identity_value := trusted_actor_id::text;
    actor_source_value := 'authenticated_admin';
  ELSIF caller_database_role = 'service_role'
    AND caller_claims->>'role' = 'service_role'
  THEN
    trusted_actor_id := NULL;
    actor_identity_value := 'system:service_role';
    actor_role_value := 'service_role';
    actor_source_value := 'system_service';
  ELSE
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'DIR120_ACTOR_NOT_AUTHORIZED';
  END IF;

  SELECT * INTO current_request
  FROM public.marketplace_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'DIR120_REQUEST_NOT_FOUND';
  END IF;

  IF current_request.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'DIR120_STALE_REQUEST_STATE';
  END IF;

  IF current_request.status = p_new_status THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DIR120_NOOP_TRANSITION';
  END IF;

  IF NOT (
    (current_request.status = 'request_submitted' AND p_new_status IN ('under_review', 'declined', 'cancelled')) OR
    (current_request.status = 'under_review' AND p_new_status IN ('awaiting_supplier', 'declined', 'cancelled')) OR
    (current_request.status = 'awaiting_supplier' AND p_new_status IN ('confirmed', 'declined', 'cancelled')) OR
    (current_request.status = 'awaiting_availability' AND p_new_status IN ('confirmed', 'declined', 'cancelled')) OR
    (current_request.status = 'payment_verification' AND p_new_status IN ('confirmed', 'declined', 'cancelled'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DIR120_TRANSITION_NOT_ALLOWED';
  END IF;

  IF p_new_status = 'confirmed' THEN
    IF COALESCE(NULLIF(current_request.transaction_method, ''), current_request.request_type) = 'request_quote'
      AND current_request.status <> 'payment_verification'
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DIR120_QUOTE_NOT_ACCEPTED_FOR_CONFIRMATION';
    END IF;

    authoritative_evidence := public.resolve_marketplace_request_confirmation_evidence(
      current_request.id,
      p_confirmation_evidence
    );
  END IF;

  next_action_value := CASE p_new_status
    WHEN 'under_review' THEN 'assign_owner'
    WHEN 'awaiting_supplier' THEN 'contact_supplier'
    WHEN 'confirmed' THEN 'notify_customer'
    WHEN 'declined' THEN 'notify_customer'
    WHEN 'cancelled' THEN 'none'
    ELSE NULL
  END;

  UPDATE public.marketplace_requests
  SET status = p_new_status,
      next_action = next_action_value,
      confirmation_evidence = CASE WHEN p_new_status = 'confirmed' THEN authoritative_evidence ELSE confirmation_evidence END,
      updated_at = NOW()
  WHERE id = p_request_id
    AND status = p_expected_status
  RETURNING * INTO updated_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'DIR120_STALE_REQUEST_STATE';
  END IF;

  INSERT INTO public.marketplace_request_audit_logs (
    request_id,
    actor_user_id,
    actor_identity,
    actor_role,
    actor_source,
    previous_status,
    new_status,
    event_type,
    metadata
  ) VALUES (
    current_request.id,
    trusted_actor_id,
    actor_identity_value,
    actor_role_value,
    actor_source_value,
    current_request.status,
    p_new_status,
    'request_status_updated',
    jsonb_build_object(
      'request_reference', current_request.request_reference,
      'transaction_method', COALESCE(NULLIF(current_request.transaction_method, ''), current_request.request_type),
      'next_action', next_action_value,
      'confirmation_evidence', CASE WHEN p_new_status = 'confirmed' THEN authoritative_evidence ELSE '{}'::jsonb END
    )
  );

  RETURN updated_request;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.activate_partner_with_attestation(
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
  PERFORM public.require_operational_access('admin:full',NULL,true);
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

COMMIT;
