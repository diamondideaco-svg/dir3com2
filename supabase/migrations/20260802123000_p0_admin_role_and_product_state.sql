BEGIN;

CREATE OR REPLACE FUNCTION public.is_admin_actor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND lower(p.role) = 'admin'
      AND p.status = 'active'
      AND p.deleted_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_actor() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_product_active_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.is_active := (NEW.status = 'active');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_product_active_state ON public.products;
CREATE TRIGGER sync_product_active_state
BEFORE INSERT OR UPDATE OF status ON public.products
FOR EACH ROW EXECUTE FUNCTION public.sync_product_active_state();

COMMIT;
