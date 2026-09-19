# Public Stay Sandbox — Production controls

This release exposes real LiteAPI **Sandbox** hotel search to anonymous Marketplace visitors. It never enables prebook, booking, payment or Marketplace REQ creation.

## Independent gates

Production is fail-closed unless every gate is true:

1. `DIR3COM_STAY_SANDBOX_ENABLED=true`
2. `DIR3COM_STAY_SANDBOX_PROVIDERS=liteapi`
3. `LITEAPI_ENV=sandbox`
4. server-only `LITEAPI_TEST_API_KEY` begins with `sand_`
5. `DIR3COM_STAY_SANDBOX_PRODUCTION_ENABLED=true`
6. server-only `DIR3COM_STAY_SANDBOX_RATE_SALT` is at least 32 characters
7. `private.stay_sandbox_runtime_control.enabled=true`

The environment flag is the deployment-level hard gate. The database row is the immediate operational kill switch and can be disabled without exposing or rotating the provider credential.

## Global controls

Migration `20260919013000_public_stay_sandbox_global_controls.sql` creates state in the non-exposed `private` schema and three atomic, service-role-only RPCs. No table or RPC is executable by `anon` or `authenticated`.

- Anonymous subject: HMAC-SHA256 of the first Vercel-forwarded address using the dedicated rate salt. Raw addresses are never persisted or logged by this feature.
- Rate limit: 30 requests per anonymous subject per UTC hour.
- Provider budget: 200 actual LiteAPI provider searches per UTC day across every Vercel instance.
- Cache: normalized results only, 60 seconds, keyed by SHA-256 of the canonical validated search.
- Coalescing: a 20-second distributed query lease prevents cross-instance provider stampedes.
- Local process coalescing remains for Preview/local, but Production always traverses the distributed gate.
- Database/RPC failure, invalid cached data, missing subject, missing configuration, non-Sandbox provider truth or disabled switch fails closed with zero cards.

Limits live in the singleton control row and remain bounded by database constraints. Changes to them are Production data operations and require an audit note.

## Activation order

1. Merge exact reviewed SHA.
2. Apply the migration. It inserts the operational switch as `enabled=false`.
3. Bind the six server-only Production environment values; never use `NEXT_PUBLIC_*`.
4. Deploy and verify that Stay remains closed while the database switch is false.
5. Set only `private.stay_sandbox_runtime_control.enabled=true`.
6. Verify AR/EN on Desktop and 390px: search → 20-or-fewer provider cards → detail; permanent Sandbox notice; no login; no booking/payment/REQ action.
7. Verify runtime logs contain successful GETs and no 5xx or credential material.

## Rollback

First set `private.stay_sandbox_runtime_control.enabled=false`; this is the immediate kill switch. If a deployment rollback is required, also set `DIR3COM_STAY_SANDBOX_PRODUCTION_ENABLED=false` and redeploy. Do not delete cache or counters during an incident; retain them for diagnosis, then clean them under a separate authorized operation.
