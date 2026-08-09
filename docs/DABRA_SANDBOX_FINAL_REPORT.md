# DABRA Sandbox Final Report (Local Runtime + Staging Data)

Date: 2026-08-10

## 1) Target Environment
- Interface/runtime target: Local preview on localhost
- Database target: Supabase Staging (Local Supabase unavailable due Docker daemon not running)
- Supabase host: ynupwivgvwcyrsdhtkcc.supabase.co
- Project ref (non-secret): ynupwivgvwcyrsdhtkcc
- Linked project name: dir3com-staging
- Production guard decision: OK (blocked if production-like signals are detected)
- Production database usage: Not used

## 2) Migration Result
Applied on linked staging using:
- `supabase db query --linked --file supabase/migrations/20260810090000_sandbox_synthetic_training_layer.sql`

Verification checks:
- products.synthetic: true
- products.environment: true
- products.reference_code: true
- bookings.synthetic: true
- bookings.environment: true
- bookings.reference_code: true
- product_availability.availability_status: true

## 3) Seed / Purge / Reset Results
Executed on staging with sandbox guard enabled:
- `npm run purge:synthetic`: PASS
- `npm run reset:sandbox`: PASS
- `npm run seed:sandbox` (after reset): PASS

Integrity verification:
- `npm run sandbox:verify`: PASS

Current synthetic counts (staging):
- product_categories: 8
- partners: 10
- partner_services: 10
- partner_coverage: 10
- products: 62
  - 30 drive
  - 24 stay units (apartments/hotels/villas/chalets)
  - 8 concierge/vip/add-on
- product_images: 186
- product_features: 124
- product_prices: 248
- product_availability: 5,580 (90 days x 62 products)
- bookings: 91 (includes evaluation/e2e created synthetic bookings)

Tag validation:
- All checked synthetic rows satisfy:
  - synthetic=true
  - environment=staging
  - reference_code starts with TEST-

## 4) E2E Result (Sandbox Flow)
Command:
- `npm run sandbox:e2e`

Result: PASS

Stages:
- Search and filters: PASS
- Suggestion/compare: PASS
- Availability lookup: PASS
- Server-side quote: PASS
- Create booking: PASS
- Modify booking: PASS
- Cancel booking: PASS
- Escalate to human/staff: PASS

## 5) Evaluation Suite (AR/EN + Security)
Commands:
- `npm run eval:sandbox:generate`
- `npm run eval:sandbox`

Suite composition:
- 100 customer conversations
- 30 partner/provider cases
- 20 prompt injection/unauthorized attempts

Final score:
- Total: 150
- Passed: 150
- Failed: 0
- Pass rate: 100.00%
- Decision: PASS

Breakdown:
- Customer: 100/100
- Partner/provider: 30/30
- Prompt injection blocked: 20/20

Notes:
- No claim or implementation of automatic model training.
- Evaluation output is used for retrieval/prompt behavior tuning only.

## 6) Quality Gates
- Typecheck: PASS (`npx tsc --noEmit`)
- Lint: PASS (`npm run lint`)
- Build: PASS (`npm run build`)
- Targeted booking/marketplace/AI2 checks:
  - `npm run sandbox:e2e`: PASS
  - `npm run sandbox:public-isolation`: PASS
  - `npm run eval:sandbox`: PASS

## 7) Public Isolation Proof
Public endpoints checked:
- `/api/public/marketplace/categories`
- `/api/public/marketplace/items?page=1&pageSize=20&q=sandbox`

Result:
- No synthetic data leaked to public marketplace responses.
- `sandbox:public-isolation` returned pass=true.

## 8) Browser Verification (Local Preview)
Preview used:
- http://localhost:3001
- Sandbox endpoint: http://localhost:3001/api/ai2/sandbox

Observed:
- /ai/pilot requires auth and redirects to /login (expected protection).
- Arabic/English surface present in UI text and evaluation suite passes in both languages.
- Synthetic inventory is available via sandbox flow checks and hidden from public marketplace APIs.

## 9) Safety / Scope Compliance
- No Production deployment.
- No OTA adapters integration performed.
- No WhatsApp/Meta integration changes performed in this phase.
- No secrets printed in report output.
- No fixed reusable credentials shipped for sandbox users.
- Placeholder imagery is explicitly external test placeholder content (not licensed production assets).

## 10) Git Status / Diff
Git status (high-level):
- Modified: package.json
- Added/updated: sandbox migration, sandbox API/service/scripts, docs reports
- Untracked pre-existing workspace folders remain untouched (e.g., $base/, supabase/.temp/, supabase/.branches/, .tmp/)

`git diff --stat` currently shows tracked delta focused on package scripts and newly added sandbox assets.

## Final Decision
PASS
