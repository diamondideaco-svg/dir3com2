-- Preserve the legacy Al Hana guard while recognizing the active lifecycle state.
-- This does not publish products or grant any additional lifecycle permissions.
CREATE OR REPLACE FUNCTION public.phase0_enforce_alhana_product_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.product_availability pa
    JOIN public.partners p ON p.id = pa.partner_id
    WHERE pa.product_id = NEW.id
      AND p.slug = 'abu-al-anaq-drive'
      AND (p.deleted_at IS NOT NULL OR p.status IS NULL
           OR p.status NOT IN ('approved', 'active'))
  ) THEN
    NEW.status := 'draft';
    NEW.verified := false;
    NEW.shield_certified := false;
  END IF;
  RETURN NEW;
END;
$function$;
