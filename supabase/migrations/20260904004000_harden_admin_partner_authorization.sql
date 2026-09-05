BEGIN;

-- Canonical country normalization for database-enforced staff scope.
CREATE OR REPLACE FUNCTION public.normalize_admin_country_key(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE lower(btrim(coalesce(value, '')))
    WHEN 'eg' THEN 'EG'
    WHEN 'egypt' THEN 'EG'
    WHEN 'مصر' THEN 'EG'
    WHEN 'qa' THEN 'QA'
    WHEN 'qatar' THEN 'QA'
    WHEN 'قطر' THEN 'QA'
    WHEN 'sa' THEN 'SA'
    WHEN 'ksa' THEN 'SA'
    WHEN 'saudi arabia' THEN 'SA'
    WHEN 'السعودية' THEN 'SA'
    WHEN 'sy' THEN 'SY'
    WHEN 'syria' THEN 'SY'
    WHEN 'سوريا' THEN 'SY'
    WHEN 'lb' THEN 'LB'
    WHEN 'lebanon' THEN 'LB'
    WHEN 'لبنان' THEN 'LB'
    ELSE upper(btrim(coalesce(value, '')))
  END
$$;

REVOKE ALL ON FUNCTION public.normalize_admin_country_key(text) FROM PUBLIC, anon, authenticated, service_role;

-- Session-bound lifecycle authorization. Actor identity is auth.uid(), never caller input.
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
  v_status text;
  v_deleted timestamptz;
  v_grant public.team_access_grants%ROWTYPE;
  v_country text := public.normalize_admin_country_key(p_country);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_LIFECYCLE_AUTH_REQUIRED' USING ERRCODE='42501';
  END IF;

  SELECT p.role, p.status, p.deleted_at
    INTO v_role, v_status, v_deleted
  FROM public.profiles p
  WHERE p.id = v_actor;

  IF v_role IS NULL OR v_status <> 'active' OR v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'PRODUCT_LIFECYCLE_DENIED' USING ERRCODE='42501';
  END IF;

  IF v_role = 'admin' THEN
    RETURN 'admin';
  END IF;

  IF v_role <> 'staff' THEN
    RAISE EXCEPTION 'PRODUCT_LIFECYCLE_DENIED' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_grant
  FROM public.team_access_grants g
  WHERE g.invited_user_id = v_actor
    AND g.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_LIFECYCLE_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT (
    v_grant.access_level = 'global_admin'
    OR 'admin:full' = ANY(v_grant.permissions)
    OR p_permission = ANY(v_grant.permissions)
  ) THEN
    RAISE EXCEPTION 'PRODUCT_LIFECYCLE_PERMISSION_DENIED' USING ERRCODE='42501';
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

  RETURN 'staff';
END;
$$;

REVOKE ALL ON FUNCTION public.product_lifecycle_actor_role(text,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.product_lifecycle_actor_role(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_read_product_audit(p_country text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_status text;
  v_deleted timestamptz;
  v_grant public.team_access_grants%ROWTYPE;
  v_country text := public.normalize_admin_country_key(p_country);
BEGIN
  IF v_actor IS NULL THEN RETURN false; END IF;

  SELECT p.role, p.status, p.deleted_at INTO v_role, v_status, v_deleted
  FROM public.profiles p WHERE p.id = v_actor;

  IF v_role IS NULL OR v_status <> 'active' OR v_deleted IS NOT NULL THEN RETURN false; END IF;
  IF v_role = 'admin' THEN RETURN true; END IF;
  IF v_role <> 'staff' THEN RETURN false; END IF;

  SELECT * INTO v_grant
  FROM public.team_access_grants g
  WHERE g.invited_user_id = v_actor AND g.status = 'active';
  IF NOT FOUND THEN RETURN false; END IF;

  IF NOT (
    v_grant.access_level = 'global_admin'
    OR 'admin:full' = ANY(v_grant.permissions)
    OR 'products:read' = ANY(v_grant.permissions)
    OR 'products:write' = ANY(v_grant.permissions)
  ) THEN RETURN false; END IF;

  IF v_grant.access_level = 'global_admin' OR 'admin:full' = ANY(v_grant.permissions) THEN
    RETURN true;
  END IF;

  IF v_country = '' THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM unnest(v_grant.country_scope) AS c(country_value)
    WHERE public.normalize_admin_country_key(c.country_value) = v_country
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_read_product_audit(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_product_audit(text) TO authenticated;

DROP POLICY IF EXISTS product_audit_admin_read ON public.product_audit_events;
CREATE POLICY product_audit_admin_read
ON public.product_audit_events
FOR SELECT
TO authenticated
USING (public.can_read_product_audit(country));

-- Remove caller-attributed service-role lifecycle API.
DROP FUNCTION IF EXISTS public.assert_product_lifecycle_actor(uuid,text);
DROP FUNCTION IF EXISTS public.create_product_draft_lifecycle(uuid,text,text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,boolean,text);
DROP FUNCTION IF EXISTS public.update_product_draft_lifecycle(uuid,text,uuid,integer,text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,boolean,text);
DROP FUNCTION IF EXISTS public.publish_product_lifecycle(uuid,text,uuid,integer,text);
DROP FUNCTION IF EXISTS public.unpublish_product_lifecycle(uuid,text,uuid,integer,text);
DROP FUNCTION IF EXISTS public.archive_product_lifecycle(uuid,text,uuid,integer,text);

CREATE OR REPLACE FUNCTION public.create_product_draft_lifecycle(
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
  p_reason text DEFAULT 'Admin draft created'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_id uuid;
  v_after jsonb;
BEGIN
  v_role := public.product_lifecycle_actor_role(p_country, 'products:write');
  IF nullif(btrim(coalesce(p_name_ar,'')), '') IS NULL
     AND nullif(btrim(coalesce(p_name_en,'')), '') IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_NAME_REQUIRED';
  END IF;
  IF nullif(btrim(coalesce(p_country,'')), '') IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_COUNTRY_REQUIRED';
  END IF;

  INSERT INTO public.products (
    name_ar, name_en, slug, base_price, country, city,
    marketplace_family, fulfilment_state, transaction_method, supply_type,
    supplier_verified, marketplace_environment, synthetic,
    status, featured, verified, shield_certified, lifecycle_version
  ) VALUES (
    coalesce(p_name_ar,''), coalesce(p_name_en,''), p_slug, greatest(coalesce(p_base_price,0),0),
    p_country, nullif(btrim(coalesce(p_city,'')), ''),
    p_marketplace_family, p_fulfilment_state, p_transaction_method, p_supply_type,
    coalesce(p_supplier_verified,false), 'production', false,
    'draft', coalesce(p_featured,false), false, coalesce(p_shield_certified,false), 1
  ) RETURNING id INTO v_id;

  SELECT to_jsonb(p) INTO v_after FROM public.products p WHERE p.id = v_id;
  INSERT INTO public.product_audit_events(product_id, action, actor_user_id, actor_role, country, before_state, after_state, reason)
  VALUES (v_id, 'create_draft', v_actor, v_role, p_country, '{}'::jsonb, v_after, nullif(btrim(coalesce(p_reason,'')), ''));
  RETURN v_id;
END;
$$;

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
  SELECT p.country INTO v_current_country FROM public.products p WHERE p.id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  v_role := public.product_lifecycle_actor_role(v_current_country, 'products:write');
  PERFORM public.product_lifecycle_actor_role(p_country, 'products:write');

  SELECT to_jsonb(p), p.lifecycle_version, p.status, p.deleted_at
    INTO v_before, v_version, v_status, v_deleted
  FROM public.products p WHERE p.id = p_product_id FOR UPDATE;

  IF v_deleted IS NOT NULL THEN RAISE EXCEPTION 'PRODUCT_ARCHIVED'; END IF;
  IF v_version <> p_expected_version THEN RAISE EXCEPTION 'PRODUCT_VERSION_STALE'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'PRODUCT_NOT_DRAFT'; END IF;

  UPDATE public.products SET
    name_ar = coalesce(p_name_ar,''), name_en = coalesce(p_name_en,''), slug = p_slug,
    base_price = greatest(coalesce(p_base_price,0),0), country = p_country,
    city = nullif(btrim(coalesce(p_city,'')), ''), marketplace_family = p_marketplace_family,
    fulfilment_state = p_fulfilment_state, transaction_method = p_transaction_method,
    supply_type = p_supply_type, supplier_verified = coalesce(p_supplier_verified,false),
    featured = coalesce(p_featured,false), shield_certified = coalesce(p_shield_certified,false),
    lifecycle_version = lifecycle_version + 1, updated_at = now()
  WHERE id = p_product_id RETURNING lifecycle_version INTO v_version;

  SELECT to_jsonb(p) INTO v_after FROM public.products p WHERE p.id = p_product_id;
  INSERT INTO public.product_audit_events(product_id, action, actor_user_id, actor_role, country, before_state, after_state, reason)
  VALUES (p_product_id, 'update_draft', v_actor, v_role, p_country, v_before, v_after, nullif(btrim(coalesce(p_reason,'')), ''));
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
  v_actor uuid := auth.uid(); v_role text; v_before jsonb; v_after jsonb; v_version integer;
  v_country text; v_status text; v_deleted timestamptz; v_synthetic boolean;
  v_environment text; v_family text; v_fulfilment text; v_transaction text;
BEGIN
  SELECT p.country INTO v_country FROM public.products p WHERE p.id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  v_role := public.product_lifecycle_actor_role(v_country, 'products:write');

  SELECT to_jsonb(p), p.lifecycle_version, p.country, p.status, p.deleted_at,
         p.synthetic, p.marketplace_environment, p.marketplace_family,
         p.fulfilment_state, p.transaction_method
    INTO v_before, v_version, v_country, v_status, v_deleted,
         v_synthetic, v_environment, v_family, v_fulfilment, v_transaction
  FROM public.products p WHERE p.id = p_product_id FOR UPDATE;

  IF v_deleted IS NOT NULL THEN RAISE EXCEPTION 'PRODUCT_ARCHIVED'; END IF;
  IF v_version <> p_expected_version THEN RAISE EXCEPTION 'PRODUCT_VERSION_STALE'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'PRODUCT_NOT_DRAFT'; END IF;
  IF coalesce(v_synthetic,true) THEN RAISE EXCEPTION 'PRODUCT_SYNTHETIC_BLOCKED'; END IF;
  IF v_environment <> 'production' THEN RAISE EXCEPTION 'PRODUCT_ENVIRONMENT_BLOCKED'; END IF;
  IF v_family IS NULL THEN RAISE EXCEPTION 'PRODUCT_FAMILY_REQUIRED'; END IF;
  IF v_fulfilment IN ('catalog_only','test_sandbox') THEN RAISE EXCEPTION 'PRODUCT_FULFILMENT_NOT_READY'; END IF;
  IF v_transaction = 'none' THEN RAISE EXCEPTION 'PRODUCT_TRANSACTION_METHOD_REQUIRED'; END IF;

  UPDATE public.products SET status='published', lifecycle_version=lifecycle_version+1,
    published_at=now(), published_by=v_actor, updated_at=now()
  WHERE id=p_product_id RETURNING lifecycle_version INTO v_version;

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
  v_actor uuid := auth.uid(); v_role text; v_before jsonb; v_after jsonb;
  v_version integer; v_country text; v_status text; v_deleted timestamptz;
BEGIN
  SELECT p.country INTO v_country FROM public.products p WHERE p.id=p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  v_role := public.product_lifecycle_actor_role(v_country, 'products:write');

  SELECT to_jsonb(p),p.lifecycle_version,p.country,p.status,p.deleted_at
    INTO v_before,v_version,v_country,v_status,v_deleted
  FROM public.products p WHERE p.id=p_product_id FOR UPDATE;

  IF v_deleted IS NOT NULL THEN RAISE EXCEPTION 'PRODUCT_ARCHIVED'; END IF;
  IF v_version <> p_expected_version THEN RAISE EXCEPTION 'PRODUCT_VERSION_STALE'; END IF;
  IF v_status <> 'published' THEN RAISE EXCEPTION 'PRODUCT_NOT_PUBLISHED'; END IF;

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
  v_actor uuid := auth.uid(); v_role text; v_before jsonb; v_after jsonb;
  v_version integer; v_country text; v_request_count bigint; v_booking_count bigint;
BEGIN
  SELECT p.country INTO v_country FROM public.products p WHERE p.id=p_product_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_ARCHIVED'; END IF;
  v_role := public.product_lifecycle_actor_role(v_country, 'products:write');

  SELECT to_jsonb(p),p.lifecycle_version,p.country INTO v_before,v_version,v_country
  FROM public.products p WHERE p.id=p_product_id AND p.deleted_at IS NULL FOR UPDATE;
  IF v_version <> p_expected_version THEN RAISE EXCEPTION 'PRODUCT_VERSION_STALE'; END IF;

  SELECT count(*) INTO v_request_count FROM public.marketplace_requests WHERE product_id=p_product_id;
  SELECT count(*) INTO v_booking_count FROM public.bookings WHERE product_id=p_product_id;

  UPDATE public.products SET status='draft', deleted_at=now(), archived_at=now(), archived_by=v_actor,
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

REVOKE ALL ON FUNCTION public.create_product_draft_lifecycle(text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,boolean,text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.update_product_draft_lifecycle(uuid,integer,text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,boolean,text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.publish_product_lifecycle(uuid,integer,text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.unpublish_product_lifecycle(uuid,integer,text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.archive_product_lifecycle(uuid,integer,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_product_draft_lifecycle(text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product_draft_lifecycle(uuid,integer,text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_product_lifecycle(uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpublish_product_lifecycle(uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_product_lifecycle(uuid,integer,text) TO authenticated;

COMMIT;
