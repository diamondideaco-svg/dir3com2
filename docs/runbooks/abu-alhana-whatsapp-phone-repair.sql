-- DH-WA-001: Production data repair template. DO NOT run as part of the code PR.
-- Run first as a dry-run in an explicitly authorized Production SQL session.
-- Replace the UUID after the identification query proves the exact single partner.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

SELECT id, company_name, name, phone, status, deleted_at, country, synthetic, updated_at
FROM public.partners
WHERE lower(company_name) = lower('Abu Al hana Drive')
   OR lower(name) = lower('الهنا جروب')
ORDER BY created_at;

-- Guarded, idempotent repair. Replace the sentinel UUID only after the SELECT
-- above returns exactly one active, non-synthetic Egypt partner.
UPDATE public.partners
SET phone = '+201556006410', updated_at = clock_timestamp()
WHERE id = '00000000-0000-0000-0000-000000000000'::uuid
  AND country = 'Egypt'
  AND status = 'active'
  AND deleted_at IS NULL
  AND synthetic IS FALSE
  AND phone IN ('01117507795', '+201556006410');

SELECT id, company_name, phone, status, country, synthetic, updated_at
FROM public.partners
WHERE id = '00000000-0000-0000-0000-000000000000'::uuid;

-- Dry-run always ends here. Expect UPDATE 1 on first execution or UPDATE 1
-- with the already-correct number; any other target/count is a hard stop.
ROLLBACK;

-- After separate Production approval: repeat the exact transaction with the
-- proven UUID, capture before/after evidence, and replace ROLLBACK with COMMIT.
