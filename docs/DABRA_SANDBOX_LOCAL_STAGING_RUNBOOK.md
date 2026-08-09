# DABRA Local/Staging Synthetic Sandbox Runbook

## Scope Lock
- Local and staging only.
- Runtime/UI is local (`localhost`) and synthetic database target can be staging when local Supabase is unavailable.
- Production is explicitly blocked by scripts and API guards.
- WhatsApp/Meta flows are untouched in this track.
- Synthetic rows are tagged with:
  - `synthetic=true`
  - `environment=local|staging`
  - `reference_code` prefixed with `TEST-`

## Preview
- DABRA Pilot UI: http://localhost:3001/ai/pilot
- Sandbox API endpoint: http://localhost:3001/api/ai2/sandbox

## Test Credentials
- No fixed reusable passwords are shipped in this repository.
- Optional user provisioning is disabled by default.
- If `SANDBOX_PROVISION_USERS=1` is enabled, ephemeral random passwords are generated at seed time and are not logged by scripts.

## Test Images
- Synthetic images use external placeholder URLs (`picsum.photos`) for visual testing only.
- They are external placeholders, not licensed production assets.

## Required Environment Variables
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SANDBOX_TARGET_ENV=local|staging`
- `SANDBOX_INTERNAL_TOKEN=<strong-random-token>`
- `SANDBOX_ALLOW_STAGING=1` (required only when target is staging)
- Optional for endpoint checks:
  - `SANDBOX_BASE_URL=http://localhost:3001`

## Safe Commands
1. Generate evaluation corpus (100 customer + 30 partner/provider + 20 injection):
   - `npm run eval:sandbox:generate`
2. Seed synthetic inventory/bookings:
   - `npm run seed:sandbox`
3. Reset synthetic inventory/bookings:
   - `npm run reset:sandbox`
4. Purge all synthetic rows:
   - `npm run purge:synthetic`
5. Run DABRA sandbox chain test:
   - `npm run sandbox:e2e`
6. Run evaluation suite:
   - `npm run eval:sandbox`

## PASS/NO-GO Policy
- PASS requires:
  - `npm run sandbox:e2e` returns `pass: true`
  - `npm run eval:sandbox` returns `decision: PASS`
  - report generated at `docs/AI2_SANDBOX_EVAL_REPORT.md`
- If either fails, decision is NO-GO and report failure reasons are used to tune retrieval/prompts only.

## OTA Adapter Readiness (Post-PASS Only)
After PASS only, prepare adapter layer contracts for Booking.com/Expedia/Airbnb in disabled mode, with no external activation until CEO approval.
