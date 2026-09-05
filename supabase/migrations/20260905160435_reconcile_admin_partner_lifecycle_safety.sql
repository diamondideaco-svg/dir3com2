BEGIN;

-- Forward-only reconciliation for PR #93. The four published #93 migrations
-- remain immutable; this migration replaces their effective definitions.

CREATE OR REPLACE FUNCTION public.product_lifecycle_session_role(
  p_permission text DEFAULT 'products:write'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_grant public.team_access_grants%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_LIFECYCLE_AUTH_REQUIRED' USING ERRCODE='42501';
  END IF;

  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = v_actor
    AND p.status = 'active'
    AND p.deleted_at IS NULL
  FOR SHARE;

  IF NOT FOUND OR v_role NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'PRODUCT_LIFECYCLE_DENIED' USING ERRCODE='42501';
  END IF;
  IF v_role = 'admin' THEN RETURN v_role; END IF;

  SELECT * INTO v_grant
  FROM public.team_access_grants g
  WHERE g.invited_user_id = v_actor
    AND g.status = 'active'
  FOR SHARE;

  IF NOT FOUND OR NOT (
    v_grant.access_level = 'global_admin'
    OR 'admin:full' = ANY(v_grant.permissions)
    OR p_permission = ANY(v_grant.permissions)
  ) THEN
    RAISE EXCEPTION 'PRODUCT_LIFECYCLE_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;

  RETURN v_role;
END;
$$;

REVOKE ALL ON FUNCTION public.product_lifecycle_session_role(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.product_lifecycle_session_role(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.product_lifecycle_actor_role(
  p_country text,
  p_permission text DEFAULT 'products:write'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_grant public.team_access_grants%ROWTYPE;
  v_country text := public.normalize_admin_country_key(p_country);
BEGIN
  v_role := public.product_lifecycle_session_role(p_permission);
  IF v_role = 'admin' THEN RETURN v_role; END IF;

  SELECT * INTO v_grant
  FROM public.team_access_grants g
  WHERE g.invited_user_id = v_actor
    AND g.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_LIFECYCLE_DENIED' USING ERRCODE='42501';
  END IF;

  IF v_grant.access_level <> 'global_admin'
     AND NOT ('admin:full' = ANY(v_grant.permissions)) THEN
    IF v_country = '' OR NOT EXISTS (
      SELECT 1
      FROM unnest(v_grant.country_scope) AS c(country_value)
      WHERE public.normalize_admin_country_key(c.country_value) = v_country
    ) THEN
      RAISE EXCEPTION 'COUNTRY_SCOPE_FORBIDDEN' USING ERRCODE='42501';
    END IF;
  END IF;

  RETURN v_role;
END;
$$;

REVOKE ALL ON FUNCTION public.product_lifecycle_actor_role(text,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.product_lifecycle_actor_role(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_product_draft_lifecycle(
  p_product_id uuid,
  p_expected_version integer,
  p_name_ar text,
  p_name_en text,
  p_slug text,
  p_base_price numeric,
  p_country text,
  p_city text,
  p_marketplace_family text,
  p_fulfilment_state text,
  p_transaction_method text,
  p_supply_type text,
  p_supplier_verified boolean,
  p_featured boolean,
  p_shield_certified boolean,
  p_reason text DEFAULT 'Admin draft updated'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_before jsonb;
  v_after jsonb;
  v_version integer;
  v_status text;
  v_deleted timestamptz;
  v_current_country text;
BEGIN
  v_role := public.product_lifecycle_session_role('products:write');
  IF p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'PRODUCT_VERSION_REQUIRED' USING ERRCODE='22023';
  END IF;

  SELECT to_jsonb(p), p.lifecycle_version, p.status, p.deleted_at, p.country
    INTO v_before, v_version, v_status, v_deleted, v_current_country
  FROM public.products p
  WHERE p.id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  IF v_deleted IS NOT NULL THEN RAISE EXCEPTION 'PRODUCT_ARCHIVED'; END IF;
  PERFORM public.product_lifecycle_actor_role(v_current_country, 'products:write');
  PERFORM public.product_lifecycle_actor_role(p_country, 'products:write');
  IF v_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'PRODUCT_VERSION_STALE'; END IF;
  IF v_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'PRODUCT_NOT_DRAFT'; END IF;

  UPDATE public.products SET
    name_ar = coalesce(p_name_ar,''), name_en = coalesce(p_name_en,''), slug = p_slug,
    base_price = greatest(coalesce(p_base_price,0),0), country = p_country,
    city = nullif(btrim(coalesce(p_city,'')), ''), marketplace_family = p_marketplace_family,
    fulfilment_state = p_fulfilment_state, transaction_method = p_transaction_method,
    supply_type = p_supply_type, supplier_verified = coalesce(p_supplier_verified,false),
    featured = coalesce(p_featured,false), shield_certified = coalesce(p_shield_certified,false),
    lifecycle_version = lifecycle_version + 1, updated_at = now()
  WHERE id = p_product_id
  RETURNING lifecycle_version INTO v_version;

  SELECT to_jsonb(p) INTO v_after FROM public.products p WHERE p.id = p_product_id;
  INSERT INTO public.product_audit_events(product_id,action,actor_user_id,actor_role,country,before_state,after_state,reason)
  VALUES(p_product_id,'update_draft',v_actor,v_role,p_country,v_before,v_after,nullif(btrim(coalesce(p_reason,'')),''));
  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_product_lifecycle(
  p_product_id uuid,
  p_expected_version integer,
  p_reason text DEFAULT 'Admin publish'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_before jsonb;
  v_after jsonb;
  v_version integer;
  v_country text;
  v_status text;
  v_deleted timestamptz;
  v_synthetic boolean;
  v_environment text;
  v_family text;
  v_fulfilment text;
  v_transaction text;
  v_supply text;
  v_supplier_verified boolean;
BEGIN
  v_role := public.product_lifecycle_session_role('products:write');
  IF p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'PRODUCT_VERSION_REQUIRED' USING ERRCODE='22023';
  END IF;

  SELECT to_jsonb(p), p.lifecycle_version, p.country, p.status, p.deleted_at,
         p.synthetic, p.marketplace_environment, p.marketplace_family,
         p.fulfilment_state, p.transaction_method, p.supply_type, p.supplier_verified
    INTO v_before, v_version, v_country, v_status, v_deleted,
         v_synthetic, v_environment, v_family, v_fulfilment, v_transaction,
         v_supply, v_supplier_verified
  FROM public.products p
  WHERE p.id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  IF v_deleted IS NOT NULL THEN RAISE EXCEPTION 'PRODUCT_ARCHIVED'; END IF;
  PERFORM public.product_lifecycle_actor_role(v_country, 'products:write');
  IF v_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'PRODUCT_VERSION_STALE'; END IF;
  IF v_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'PRODUCT_NOT_DRAFT'; END IF;
  IF v_synthetic IS DISTINCT FROM false THEN RAISE EXCEPTION 'PRODUCT_SYNTHETIC_BLOCKED'; END IF;
  IF v_environment IS DISTINCT FROM 'production' THEN RAISE EXCEPTION 'PRODUCT_ENVIRONMENT_BLOCKED'; END IF;
  IF v_family IS NULL OR v_family NOT IN ('drive','stay','fly','concierge','vip') THEN RAISE EXCEPTION 'PRODUCT_FAMILY_REQUIRED'; END IF;
  IF v_supply IS NULL OR v_supply NOT IN ('verified_local_partner','global_travel_partner','dir3com_managed') THEN
    RAISE EXCEPTION 'PRODUCT_SUPPLY_NOT_AUTHORITATIVE';
  END IF;
  IF v_supplier_verified IS DISTINCT FROM true THEN RAISE EXCEPTION 'PRODUCT_SUPPLIER_NOT_VERIFIED'; END IF;

  IF v_fulfilment IS NULL OR v_transaction IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_TRANSACTION_PATH_UNSUPPORTED';
  ELSIF v_fulfilment = 'live_bookable' AND v_transaction = 'instant_booking' THEN
    -- No canonical executable-supply binding exists in the current product
    -- schema. Publication must fail closed instead of treating metadata as proof.
    RAISE EXCEPTION 'PRODUCT_INSTANT_SUPPLY_UNPROVEN';
  ELSIF NOT (
    (v_fulfilment = 'verified_requestable' AND v_transaction = 'request_to_confirm')
    OR (v_fulfilment = 'verified_quote' AND v_transaction = 'request_quote')
    OR (v_fulfilment IN ('unavailable','availability_unknown') AND v_transaction = 'none')
  ) THEN
    RAISE EXCEPTION 'PRODUCT_TRANSACTION_PATH_UNSUPPORTED';
  END IF;

  UPDATE public.products SET
    status='published', lifecycle_version=lifecycle_version+1,
    published_at=now(), published_by=v_actor, updated_at=now()
  WHERE id=p_product_id
  RETURNING lifecycle_version INTO v_version;

  SELECT to_jsonb(p) INTO v_after FROM public.products p WHERE p.id=p_product_id;
  INSERT INTO public.product_audit_events(product_id,action,actor_user_id,actor_role,country,before_state,after_state,reason)
  VALUES(p_product_id,'publish',v_actor,v_role,v_country,v_before,v_after,nullif(btrim(coalesce(p_reason,'')),''));
  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.unpublish_product_lifecycle(
  p_product_id uuid,
  p_expected_version integer,
  p_reason text DEFAULT 'Admin unpublish'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_before jsonb;
  v_after jsonb;
  v_version integer;
  v_country text;
  v_status text;
  v_deleted timestamptz;
BEGIN
  v_role := public.product_lifecycle_session_role('products:write');
  IF p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'PRODUCT_VERSION_REQUIRED' USING ERRCODE='22023';
  END IF;

  SELECT to_jsonb(p),p.lifecycle_version,p.country,p.status,p.deleted_at
    INTO v_before,v_version,v_country,v_status,v_deleted
  FROM public.products p
  WHERE p.id=p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  IF v_deleted IS NOT NULL THEN RAISE EXCEPTION 'PRODUCT_ARCHIVED'; END IF;
  PERFORM public.product_lifecycle_actor_role(v_country, 'products:write');
  IF v_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'PRODUCT_VERSION_STALE'; END IF;
  IF v_status IS DISTINCT FROM 'published' THEN RAISE EXCEPTION 'PRODUCT_NOT_PUBLISHED'; END IF;

  UPDATE public.products SET status='draft', lifecycle_version=lifecycle_version+1, updated_at=now()
  WHERE id=p_product_id RETURNING lifecycle_version INTO v_version;
  SELECT to_jsonb(p) INTO v_after FROM public.products p WHERE p.id=p_product_id;
  INSERT INTO public.product_audit_events(product_id,action,actor_user_id,actor_role,country,before_state,after_state,reason)
  VALUES(p_product_id,'unpublish',v_actor,v_role,v_country,v_before,v_after,nullif(btrim(coalesce(p_reason,'')),''));
  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_product_lifecycle(
  p_product_id uuid,
  p_expected_version integer,
  p_reason text DEFAULT 'Admin archive'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_before jsonb;
  v_after jsonb;
  v_version integer;
  v_country text;
  v_deleted timestamptz;
  v_request_count bigint;
  v_booking_count bigint;
BEGIN
  v_role := public.product_lifecycle_session_role('products:write');
  IF p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'PRODUCT_VERSION_REQUIRED' USING ERRCODE='22023';
  END IF;

  SELECT to_jsonb(p),p.lifecycle_version,p.country,p.deleted_at
    INTO v_before,v_version,v_country,v_deleted
  FROM public.products p
  WHERE p.id=p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  IF v_deleted IS NOT NULL THEN RAISE EXCEPTION 'PRODUCT_ARCHIVED'; END IF;
  PERFORM public.product_lifecycle_actor_role(v_country, 'products:write');
  IF v_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'PRODUCT_VERSION_STALE'; END IF;

  SELECT count(*) INTO v_request_count FROM public.marketplace_requests WHERE product_id=p_product_id;
  SELECT count(*) INTO v_booking_count FROM public.bookings WHERE product_id=p_product_id;

  UPDATE public.products SET
    status='draft', deleted_at=now(), archived_at=now(), archived_by=v_actor,
    lifecycle_version=lifecycle_version+1, updated_at=now()
  WHERE id=p_product_id RETURNING lifecycle_version INTO v_version;

  SELECT to_jsonb(p) INTO v_after FROM public.products p WHERE p.id=p_product_id;
  INSERT INTO public.product_audit_events(product_id,action,actor_user_id,actor_role,country,before_state,after_state,reason)
  VALUES(p_product_id,'archive',v_actor,v_role,v_country,v_before,v_after,
    coalesce(nullif(btrim(coalesce(p_reason,'')),''),'Admin archive') ||
    format(' [historical_requests=%s historical_bookings=%s]',v_request_count,v_booking_count));
  RETURN v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.update_product_draft_lifecycle(uuid,integer,text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,boolean,text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.publish_product_lifecycle(uuid,integer,text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.unpublish_product_lifecycle(uuid,integer,text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.archive_product_lifecycle(uuid,integer,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_product_draft_lifecycle(uuid,integer,text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_product_lifecycle(uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpublish_product_lifecycle(uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_product_lifecycle(uuid,integer,text) TO authenticated;

-- product_audit_events is an append-only ledger. App roles can only read rows
-- admitted by country RLS; lifecycle SECURITY DEFINER functions are the sole
-- insertion path.
ALTER TABLE public.product_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_audit_events FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.product_audit_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.product_audit_events TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_product_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PRODUCT_AUDIT_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS product_audit_events_reject_update_delete ON public.product_audit_events;
CREATE TRIGGER product_audit_events_reject_update_delete
BEFORE UPDATE OR DELETE ON public.product_audit_events
FOR EACH ROW EXECUTE FUNCTION public.reject_product_audit_event_mutation();

DROP TRIGGER IF EXISTS product_audit_events_reject_truncate ON public.product_audit_events;
CREATE TRIGGER product_audit_events_reject_truncate
BEFORE TRUNCATE ON public.product_audit_events
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_product_audit_event_mutation();

REVOKE ALL ON FUNCTION public.reject_product_audit_event_mutation() FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  v_owner name;
BEGIN
  SELECT pg_get_userbyid(c.relowner) INTO v_owner
  FROM pg_class c
  WHERE c.oid='public.product_audit_events'::regclass;
  IF v_owner IN ('anon','authenticated','service_role')
     OR pg_has_role('anon',v_owner,'MEMBER')
     OR pg_has_role('authenticated',v_owner,'MEMBER')
     OR pg_has_role('service_role',v_owner,'MEMBER') THEN
    RAISE EXCEPTION 'PRODUCT_AUDIT_UNSAFE_OWNER';
  END IF;
END;
$$;

-- New handoffs persist their exact external destination and message snapshot.
-- Historical rows remain immutable and nullable because the original delivery
-- payload cannot be reconstructed authoritatively after the fact.
ALTER TABLE public.marketplace_request_handoff_events
  ADD COLUMN IF NOT EXISTS whatsapp_destination text,
  ADD COLUMN IF NOT EXISTS message_snapshot text;

ALTER TABLE public.marketplace_request_handoff_events
  DROP CONSTRAINT IF EXISTS marketplace_request_handoff_delivery_snapshot_valid;
ALTER TABLE public.marketplace_request_handoff_events
  ADD CONSTRAINT marketplace_request_handoff_delivery_snapshot_valid CHECK (
    (whatsapp_destination IS NULL AND message_snapshot IS NULL)
    OR (
      whatsapp_destination ~ '^[0-9]{8,15}$'
      AND nullif(btrim(message_snapshot),'') IS NOT NULL
    )
  );

-- Refuse to hide or delete ambiguous historical handoffs before enforcing the
-- logical identity. Existing history must already be internally consistent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.marketplace_request_handoff_events
    WHERE handoff_type='whatsapp'
    GROUP BY request_id, handoff_type HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'MARKETPLACE_HANDOFF_DUPLICATE_HISTORY';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.marketplace_request_handoff_events e
    JOIN public.marketplace_requests r ON r.id=e.request_id
    WHERE e.handoff_type='whatsapp'
      AND (
        e.product_id IS DISTINCT FROM r.product_id
        OR r.handoff_type IS DISTINCT FROM 'whatsapp'
        OR r.handoff_reference IS DISTINCT FROM e.handoff_reference
        OR r.handoff_started_at IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'MARKETPLACE_HANDOFF_INCONSISTENT_HISTORY';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.marketplace_requests r
    WHERE r.handoff_type='whatsapp'
      AND NOT EXISTS (
        SELECT 1 FROM public.marketplace_request_handoff_events e
        WHERE e.request_id=r.id AND e.handoff_type='whatsapp'
      )
  ) THEN
    RAISE EXCEPTION 'MARKETPLACE_HANDOFF_INCONSISTENT_HISTORY';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_request_handoff_whatsapp_unique
ON public.marketplace_request_handoff_events(request_id, handoff_type)
WHERE handoff_type='whatsapp';

-- The handoff ledger is written only by the SECURITY DEFINER transition RPC.
-- Direct app-role writes could otherwise forge a canonical replay result.
ALTER TABLE public.marketplace_request_handoff_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_request_handoff_events FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.marketplace_request_handoff_events FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS marketplace_request_handoff_events_reject_truncate ON public.marketplace_request_handoff_events;
CREATE TRIGGER marketplace_request_handoff_events_reject_truncate
BEFORE TRUNCATE ON public.marketplace_request_handoff_events
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_marketplace_request_handoff_event_mutation();

DO $$
DECLARE
  v_owner name;
BEGIN
  SELECT pg_get_userbyid(c.relowner) INTO v_owner
  FROM pg_class c
  WHERE c.oid='public.marketplace_request_handoff_events'::regclass;
  IF v_owner IN ('anon','authenticated','service_role')
     OR pg_has_role('anon',v_owner,'MEMBER')
     OR pg_has_role('authenticated',v_owner,'MEMBER')
     OR pg_has_role('service_role',v_owner,'MEMBER') THEN
    RAISE EXCEPTION 'MARKETPLACE_HANDOFF_UNSAFE_OWNER';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_partner_marketplace_requests(
  p_actor_user_id uuid,
  p_request_id uuid DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_status text;
  v_deleted timestamptz;
  v_partner_status text;
BEGIN
  SELECT p.role,p.status,p.deleted_at INTO v_role,v_status,v_deleted
  FROM public.profiles p
  WHERE p.id=p_actor_user_id
  FOR SHARE;
  IF NOT FOUND OR v_role IS DISTINCT FROM 'partner'
     OR v_status IS DISTINCT FROM 'active' OR v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'PARTNER_REQUEST_ACTOR_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT partner.status INTO v_partner_status
  FROM public.partners partner
  WHERE partner.id=p_actor_user_id
  FOR SHARE;
  IF NOT FOUND OR v_partner_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'PARTNER_REQUEST_ACTOR_DENIED' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id',r.id,
    'request_reference',r.request_reference,
    'product_id',r.product_id,
    'request_type',r.request_type,
    'status',r.status,
    'requested_for',r.requested_for,
    'traveller_count',r.traveller_count,
    'marketplace_family',r.marketplace_family,
    'supplier_name',r.supplier_name,
    'service_name',r.service_name,
    'fulfilment_method',r.fulfilment_method,
    'transaction_method',r.transaction_method,
    'handoff_type',r.handoff_type,
    'handoff_reference',r.handoff_reference,
    'handoff_started_at',r.handoff_started_at,
    'next_action',r.next_action,
    'created_at',r.created_at,
    'updated_at',r.updated_at,
    'products',jsonb_build_object(
      'name_ar',p.name_ar,'name_en',p.name_en,'slug',p.slug,
      'city',p.city,'country',p.country
    ),
    'timeline',jsonb_build_array(jsonb_build_object(
      'type','request_submitted','at',r.created_at
    )) || coalesce((
      SELECT jsonb_agg(event ORDER BY event->>'at')
      FROM (
        SELECT jsonb_build_object(
          'type','status_updated','at',a.created_at,
          'previousStatus',a.previous_status,'status',a.new_status
        ) AS event
        FROM public.marketplace_request_audit_logs a
        WHERE a.request_id=r.id
        UNION ALL
        SELECT jsonb_build_object(
          'type',coalesce(e.handoff_type,'handoff') || '_handoff_started',
          'at',e.created_at,'status',e.request_status_at_handoff
        ) AS event
        FROM public.marketplace_request_handoff_events e
        WHERE e.request_id=r.id
      ) timeline_events
    ),'[]'::jsonb)
  )
  FROM public.marketplace_requests r
  LEFT JOIN public.products p ON p.id=r.product_id
  WHERE (p_request_id IS NULL OR r.id=p_request_id)
    AND EXISTS (
      SELECT 1 FROM public.product_availability pa
      WHERE pa.product_id=r.product_id
        AND pa.partner_id=p_actor_user_id
    )
  ORDER BY r.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_partner_marketplace_requests(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_partner_marketplace_requests(uuid,uuid) TO service_role;

DROP FUNCTION IF EXISTS public.start_partner_marketplace_request_handoff(uuid,uuid,text);

CREATE FUNCTION public.start_partner_marketplace_request_handoff(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_whatsapp_destination text
)
RETURNS TABLE(
  request_id uuid,
  request_reference text,
  product_id uuid,
  initiated_by_partner_user_id uuid,
  handoff_type text,
  handoff_reference text,
  request_status_at_handoff text,
  whatsapp_destination text,
  message_snapshot text,
  created_at timestamptz,
  replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_profile_status text;
  v_deleted timestamptz;
  v_partner_status text;
  v_request_status text;
  v_product_id uuid;
  v_request_reference text;
  v_service_name text;
  v_requested_for timestamptz;
  v_traveller_count integer;
  v_reference text;
  v_destination text := nullif(btrim(coalesce(p_whatsapp_destination,'')), '');
  v_message text;
  v_availability_id uuid;
  v_event public.marketplace_request_handoff_events%ROWTYPE;
BEGIN
  SELECT p.role,p.status,p.deleted_at INTO v_role,v_profile_status,v_deleted
  FROM public.profiles p
  WHERE p.id=p_actor_user_id
  FOR SHARE;
  IF NOT FOUND OR v_role IS DISTINCT FROM 'partner'
     OR v_profile_status IS DISTINCT FROM 'active' OR v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'PARTNER_HANDOFF_ACTOR_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT partner.status INTO v_partner_status
  FROM public.partners partner
  WHERE partner.id=p_actor_user_id
  FOR SHARE;
  IF NOT FOUND OR v_partner_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'PARTNER_HANDOFF_ACTOR_DENIED' USING ERRCODE='42501';
  END IF;

  SELECT r.status,r.product_id,r.request_reference,r.service_name,r.requested_for,r.traveller_count
    INTO v_request_status,v_product_id,v_request_reference,v_service_name,v_requested_for,v_traveller_count
  FROM public.marketplace_requests r
  WHERE r.id=p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  v_reference := 'WA:' || v_request_reference;

  SELECT pa.id INTO v_availability_id
  FROM public.product_availability pa
  WHERE pa.product_id=v_product_id AND pa.partner_id=p_actor_user_id
  ORDER BY pa.id
  LIMIT 1
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_PARTNER_SCOPE_DENIED'; END IF;

  SELECT e.* INTO v_event
  FROM public.marketplace_request_handoff_events e
  WHERE e.request_id=p_request_id AND e.handoff_type='whatsapp';

  IF FOUND THEN
    IF v_event.initiated_by_partner_user_id IS DISTINCT FROM p_actor_user_id
       OR v_event.product_id IS DISTINCT FROM v_product_id
       OR v_event.handoff_reference IS DISTINCT FROM v_reference THEN
      RAISE EXCEPTION 'REQUEST_HANDOFF_CONFLICT' USING ERRCODE='23514';
    END IF;
    IF v_event.whatsapp_destination IS NULL OR v_event.message_snapshot IS NULL THEN
      RAISE EXCEPTION 'REQUEST_HANDOFF_REPLAY_UNAVAILABLE' USING ERRCODE='55000';
    END IF;
    RETURN QUERY SELECT
      v_event.request_id,v_request_reference,v_event.product_id,
      v_event.initiated_by_partner_user_id,v_event.handoff_type,
      v_event.handoff_reference,v_event.request_status_at_handoff,
      v_event.whatsapp_destination,v_event.message_snapshot,
      v_event.created_at,true;
    RETURN;
  END IF;

  IF v_destination IS NULL OR v_destination !~ '^[0-9]{8,15}$' THEN
    RAISE EXCEPTION 'WHATSAPP_DESTINATION_INVALID' USING ERRCODE='22023';
  END IF;

  v_message := format('DIR3COM %s',v_request_reference)
    || CASE WHEN nullif(btrim(coalesce(v_service_name,'')),'') IS NOT NULL
         THEN E'\nService: ' || v_service_name ELSE '' END
    || CASE WHEN v_requested_for IS NOT NULL
         THEN E'\nRequested for: ' || to_char(v_requested_for AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') ELSE '' END
    || E'\nTravellers: ' || coalesce(v_traveller_count,1)::text
    || E'\nCurrent status: ' || v_request_status;

  UPDATE public.marketplace_requests SET
    handoff_type='whatsapp', fulfilment_method='whatsapp_handoff',
    handoff_reference=v_reference, handoff_started_at=coalesce(handoff_started_at,now()),
    next_action='await_partner_response', updated_at=now()
  WHERE id=p_request_id;

  INSERT INTO public.marketplace_request_handoff_events(
    request_id,product_id,initiated_by_partner_user_id,
    handoff_type,handoff_reference,request_status_at_handoff,
    whatsapp_destination,message_snapshot
  ) VALUES (
    p_request_id,v_product_id,p_actor_user_id,
    'whatsapp',v_reference,v_request_status,v_destination,v_message
  ) RETURNING * INTO v_event;

  RETURN QUERY SELECT
    v_event.request_id,v_request_reference,v_event.product_id,
    v_event.initiated_by_partner_user_id,v_event.handoff_type,
    v_event.handoff_reference,v_event.request_status_at_handoff,
    v_event.whatsapp_destination,v_event.message_snapshot,
    v_event.created_at,false;
END;
$$;

REVOKE ALL ON FUNCTION public.start_partner_marketplace_request_handoff(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_partner_marketplace_request_handoff(uuid,uuid,text) TO service_role;

-- Canonical CEO authority requires the pinned Auth UUID and the same active,
-- non-deleted profile invariant used by application guards.
CREATE OR REPLACE FUNCTION public.is_ceo_actor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=auth.uid()
      AND auth.uid()='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid
      AND p.role='admin'
      AND p.status='active'
      AND p.deleted_at IS NULL
  )
$$;

REVOKE ALL ON FUNCTION public.is_ceo_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ceo_actor() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_team_access_grant(
  p_user_id uuid,p_email text,p_job_title text,p_access_level text,
  p_country_scope text[],p_permissions text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_email text:=public.normalize_team_email(p_email);
  v_auth_email text;
  v_auth_ids uuid[];
  v_name text;
  v_ids uuid[];
  v_grant public.team_access_grants%ROWTYPE;
  v_role public.profiles.role%TYPE;
  v_target_deleted timestamptz;
  v_result uuid;
BEGIN
  PERFORM 1 FROM public.profiles
  WHERE id=v_actor
    AND id='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid
    AND role='admin' AND status='active' AND deleted_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_ACCESS_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_user_id IS NULL OR v_email IS NULL OR v_email='' OR position('@' in v_email)=0
    OR p_job_title IS NULL OR btrim(p_job_title)='' OR length(p_job_title)>120
    OR p_access_level IS NULL OR p_access_level NOT IN ('global_admin','scoped_staff')
    OR p_country_scope IS NULL OR cardinality(p_country_scope)>20
    OR array_position(p_country_scope,NULL) IS NOT NULL OR p_permissions IS NULL
    OR array_position(p_permissions,NULL) IS NOT NULL
    OR NOT p_permissions <@ ARRAY['admin:full','operations:read','operations:write','customers:read','customers:write','partners:read','partners:write','products:read','products:write','finance:read','finance:write','verification:read','verification:write']::text[]
  THEN RAISE EXCEPTION 'TEAM_ACCESS_INVALID_INPUT' USING ERRCODE='22023'; END IF;
  IF p_user_id=v_actor AND p_access_level<>'global_admin' THEN
    RAISE EXCEPTION 'TEAM_ACCESS_CEO_PROTECTED' USING ERRCODE='42501';
  END IF;

  SELECT public.normalize_team_email(email),
         coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name',split_part(v_email,'@',1))
    INTO v_auth_email,v_name
  FROM auth.users WHERE id=p_user_id FOR SHARE;
  IF NOT FOUND OR v_auth_email IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'TEAM_ACCESS_IDENTITY_CONFLICT' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(id) INTO v_auth_ids FROM auth.users
  WHERE public.normalize_team_email(email)=v_email;
  IF coalesce(cardinality(v_auth_ids),0)<>1 OR v_auth_ids[1]<>p_user_id THEN
    RAISE EXCEPTION 'TEAM_ACCESS_IDENTITY_CONFLICT' USING ERRCODE='22023';
  END IF;

  SELECT deleted_at INTO v_target_deleted FROM public.profiles WHERE id=p_user_id FOR SHARE;
  IF FOUND AND v_target_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'TEAM_ACCESS_PROFILE_DELETED' USING ERRCODE='42501';
  END IF;

  LOCK TABLE public.team_access_grants IN SHARE ROW EXCLUSIVE MODE;
  SELECT array_agg(id) INTO v_ids FROM public.team_access_grants
  WHERE invited_user_id=p_user_id OR public.normalize_team_email(email)=v_email;
  IF cardinality(v_ids)>1 THEN RAISE EXCEPTION 'TEAM_ACCESS_IDENTITY_CONFLICT' USING ERRCODE='22023'; END IF;
  IF cardinality(v_ids)=1 THEN
    SELECT * INTO v_grant FROM public.team_access_grants WHERE id=v_ids[1];
    IF v_grant.invited_user_id IS NOT NULL AND v_grant.invited_user_id<>p_user_id THEN
      RAISE EXCEPTION 'TEAM_ACCESS_IDENTITY_CONFLICT' USING ERRCODE='22023';
    END IF;
    UPDATE public.team_access_grants SET
      email=v_email,invited_user_id=p_user_id,job_title=p_job_title,
      access_level=p_access_level,country_scope=p_country_scope,
      permissions=CASE WHEN p_access_level='global_admin' THEN ARRAY['admin:full'] ELSE p_permissions END,
      status='active',updated_at=now()
    WHERE id=v_grant.id RETURNING id INTO v_result;
  ELSE
    INSERT INTO public.team_access_grants(email,invited_user_id,job_title,access_level,country_scope,permissions,status,created_by)
    VALUES(v_email,p_user_id,p_job_title,p_access_level,p_country_scope,
      CASE WHEN p_access_level='global_admin' THEN ARRAY['admin:full'] ELSE p_permissions END,'active',v_actor)
    RETURNING id INTO v_result;
  END IF;
  IF p_access_level='global_admin' THEN v_role:='admin'; ELSE v_role:='staff'; END IF;
  INSERT INTO public.profiles(id,email,full_name,role,status)
  VALUES(p_user_id,v_email,v_name,v_role,'active')
  ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,role=EXCLUDED.role,status=EXCLUDED.status
    WHERE public.profiles.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_ACCESS_PROFILE_DELETED' USING ERRCODE='42501'; END IF;
  RETURN v_result;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'TEAM_ACCESS_IDENTITY_CONFLICT' USING ERRCODE='22023';
END;
$$;

REVOKE ALL ON FUNCTION public.save_team_access_grant(uuid,text,text,text,text[],text[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_team_access_grant(uuid,text,text,text,text[],text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_team_access_status(p_email text,p_status text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_ids uuid[];
  v_grant public.team_access_grants%ROWTYPE;
  v_role public.profiles.role%TYPE;
  v_status public.profiles.status%TYPE;
BEGIN
  PERFORM 1 FROM public.profiles
  WHERE id=v_actor
    AND id='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid
    AND role='admin' AND status='active' AND deleted_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_ACCESS_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('active','inactive') THEN
    RAISE EXCEPTION 'TEAM_ACCESS_INVALID_INPUT' USING ERRCODE='22023';
  END IF;
  LOCK TABLE public.team_access_grants IN SHARE ROW EXCLUSIVE MODE;
  SELECT array_agg(id) INTO v_ids FROM public.team_access_grants
  WHERE public.normalize_team_email(email)=public.normalize_team_email(p_email);
  IF coalesce(cardinality(v_ids),0)=0 THEN RAISE EXCEPTION 'TEAM_ACCESS_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF cardinality(v_ids)<>1 THEN RAISE EXCEPTION 'TEAM_ACCESS_IDENTITY_CONFLICT' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_grant FROM public.team_access_grants WHERE id=v_ids[1];
  IF v_grant.invited_user_id=v_actor AND (p_status<>'active' OR v_grant.access_level<>'global_admin') THEN
    RAISE EXCEPTION 'TEAM_ACCESS_CEO_PROTECTED' USING ERRCODE='42501';
  END IF;
  IF v_grant.access_level='global_admin' THEN v_role:='admin'; ELSE v_role:='staff'; END IF;
  IF p_status='active' THEN v_status:='active'; ELSE v_status:='inactive'; END IF;
  UPDATE public.team_access_grants SET status=p_status,updated_at=now() WHERE id=v_grant.id;
  IF v_grant.invited_user_id IS NOT NULL THEN
    UPDATE public.profiles SET status=v_status,role=v_role
    WHERE id=v_grant.invited_user_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_ACCESS_PROFILE_UNAVAILABLE' USING ERRCODE='22023'; END IF;
  END IF;
  RETURN v_grant.id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_team_access_status(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_team_access_status(text,text) TO authenticated;

COMMIT;
