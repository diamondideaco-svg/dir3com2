BEGIN;

-- Preserve the Phase0 fail-closed default for every direct INSERT while
-- allowing only the canonical, session-authorized lifecycle RPC to create a
-- non-synthetic production draft. The transaction-local marker is necessary
-- but deliberately insufficient: the INSERT must also be executing with the
-- SECURITY DEFINER owner's effective role.
CREATE OR REPLACE FUNCTION public.phase0_force_new_product_draft_staging()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_lifecycle_owner oid;
  v_trusted_lifecycle_create boolean := false;
BEGIN
  SELECT p.proowner
    INTO v_lifecycle_owner
  FROM pg_catalog.pg_proc p
  WHERE p.oid = pg_catalog.to_regprocedure(
    'public.create_product_draft_lifecycle(text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,boolean,text)'
  );

  v_trusted_lifecycle_create :=
    pg_catalog.current_setting('dir3com.lifecycle_create_path', true)
      = 'create_product_draft_lifecycle:v1'
    AND v_lifecycle_owner IS NOT NULL
    AND current_user = pg_catalog.pg_get_userbyid(v_lifecycle_owner);

  NEW.status := 'draft';
  NEW.verified := false;
  NEW.shield_certified := false;
  NEW.featured := false;
  NEW.environment := 'staging';

  IF v_trusted_lifecycle_create THEN
    NEW.synthetic := false;
    NEW.marketplace_environment := 'production';
  ELSE
    NEW.synthetic := true;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.phase0_force_new_product_draft_staging()
  FROM PUBLIC, anon, authenticated, service_role;

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

  PERFORM pg_catalog.set_config(
    'dir3com.lifecycle_create_path',
    'create_product_draft_lifecycle:v1',
    true
  );

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

  PERFORM pg_catalog.set_config('dir3com.lifecycle_create_path', '', true);

  SELECT to_jsonb(p) INTO v_after
  FROM public.products p
  WHERE p.id = v_id;

  IF (v_after->>'status') IS DISTINCT FROM 'draft'
     OR (v_after->>'synthetic')::boolean IS DISTINCT FROM false
     OR (v_after->>'marketplace_environment') IS DISTINCT FROM 'production'
     OR (v_after->>'verified')::boolean IS DISTINCT FROM false
     OR (v_after->>'shield_certified')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'PRODUCT_LIFECYCLE_CREATE_TRUTH_FAILED';
  END IF;

  INSERT INTO public.product_audit_events(
    product_id, action, actor_user_id, actor_role, country,
    before_state, after_state, reason
  ) VALUES (
    v_id, 'create_draft', v_actor, v_role, p_country,
    '{}'::jsonb, v_after, nullif(btrim(coalesce(p_reason,'')), '')
  );
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_product_draft_lifecycle(
  text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,boolean,text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_product_draft_lifecycle(
  text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,boolean,text
) TO authenticated;

COMMIT;
