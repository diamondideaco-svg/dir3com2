# Task #167 / PR #168 — Drive catalogue release record

Updated 2026-09-28 (Asia/Riyadh). Owner: Codex — ChatGPT Work Mode, directly assigned by the CEO. Independent reviewer requested: Codex Desktop; no review completion or direct Desktop delivery is claimed.

Branch `feat/drive-catalog-september27`; base `c8c91f33f3ea017bf09f0d4ee32747c0aae425b9`; this delta starts at `f7ce91f8c65124f68df935dd3d318bbb715b5c41`. Final SHA is recorded in Task #167 and PR #168 after push. Same branch/PR; no other workstream edited.

## Customer result

The CEO now accepts 2022, 2023 and 2024 as well as the existing newer years. Twenty source rows are reconciled: six existing offers repriced, fourteen new offers, plus three unchanged legacy offers = **23 offers**. Six additional rows were recovered by this year-policy update. Source years are not relabelled. E200 uses the legible 2022 only; the clipped final year is not guessed. CN7 is normalized to Hyundai Elantra, with an official Hyundai source recorded in the JSON register.

Daily USD = higher source row price × 1.10 once. Airport reception = 50% of that final price. Reconciled daily services cover 24 hours, driver, fuel and 120km. Continuous driver duty, excess charges and automatic final totals are not inferred. AMG Line, T1 and full-size Range Rover 2025 retain their prior rates/contract. The other full-size Range Rover and Range Rover Sport remain distinct listings/images. New rates are coordinated by Egypt Operations; supplier identity is not guessed. Abu Al-Hana products are untouched.

Seven rows remain separately recorded and do not block the twenty eligible rows: Kia “carval” (model spelling), Kia K4 2022/23 (model/generation), Hyundai “tuycan” (model spelling), unnamed Nissan 2026, Land Cruiser 2020/21 (below the newly approved minimum), H1 and Hiace (missing years). This is missing source information, not a reason to fabricate inventory.

Three new original transparent WebP images depict S500 W223, Elantra CN7 and Patrol Y62 model families. Fourteen generated images now supplement the retained approved assets. The latest three generation prompts/IDs are recorded. No rental-company photos copied; generated visualization is not proof of an exact physical vehicle, trim or color. Existing approved images remain unchanged.

## Request/data integrity

Catalogue version `managed-eg-20260928-v2`. The application JSON and the guarded SQL migration share the same twenty price pairs. The unpublished Task167 migration is updated in-place; historical migrations are untouched and the forward-registry hash matches.

The migration fails before overwriting independently modified baseline rates or colliding new IDs. It updates six offers and inserts fourteen; it does not modify products, partners, existing requests, quotes, bookings or payments. It expands permitted confirmation years but verifies each confirmation against the year contract already saved on that request.

- New requests from this catalogue carry minimum 2022 / accepted 2022–2027; the database validates the policy and version.
- Older requests retain their original 2025–2027 promise and original amount. Their retries return the existing request before current-version validation.
- The three unchanged legacy offers retain their original 2025–2027 policy.
- Stale new requests get `CATALOG_CHANGED`; no unseen updated price is silently accepted.
- Customer review and Operations derive their year labels/options from the saved request, not today's catalogue.
- Six-hour eligibility, authenticated/country-scoped authority, immutable audit and no-booking/payment boundaries remain enforced.

## Verification and limits

Focused catalogue/request/retry/public-entry baseline: 38/38 PASS, followed by 8/8 affected final tests (39 unique tests including the added saved-year test). Final Typecheck PASS; Lint 0 errors/23 existing warnings; Build and Diff PASS. Migration baseline/cutover/target 55/55 and manifest check PASS.

The actual migration and create/review RPCs executed in isolated in-memory PostgreSQL (PGlite): 23 offers, twenty exact daily/airport rate pairs, 24-hour metadata, stale-version rejection, old/new replay, old 2025 request rejecting 2022/23/24, new request accepting 2022, 2021 rejection, one event per confirmation and no booking/payment. The fixture stubs operational authority; full Supabase RLS coverage is not claimed. The repository Docker/Postgres harness is updated for the new version/policy and remains a cloud gate.

Frozen-build public browser AR/EN × 1440/390 PASS: 23 cards and 23 images loaded, Patrol detail/year labels, no horizontal overflow, zero page errors. Patrol daily440 USD and airport220 USD. Evidence: `drive-browser-years-2026-09-28.json` and `drive-years-detail-{ar,en}-390.png`. An earlier start before build completion failed; the completed-build verification above is the accepted run. No authenticated request, provider search or commercial transaction was performed in browser QA.

Self-review used the React checklist for deterministic derived year labels/options, unchanged hook order, authenticated server action and SQL authority. This is not independent approval. Exact-SHA CI/Preview and independent functional/security review must be recorded separately. Governance currently accepts only Desktop/VS Code implementation identities; Work Mode ownership is recorded honestly and the workflow is unchanged.

## Coordinated publication and recovery

1. Resolve the exact-SHA independent review/cloud gates and the honest ownership/governance mismatch.
2. In an authorized release window, record the six existing catalogue rows/version read-only, confirm reviewed SQL/hash and preserve the snapshot securely.
3. Apply only the reviewed Task167 migration, then promote its matching application. The version guard rejects stale-price requests during the transition.
4. Verify twenty price pairs, three unchanged offers, original currencies/service terms, year policies and images. Keep the six-hour and request-versus-booking boundaries.
5. Recovery must be a reviewed forward change: deactivate new offers without deleting referenced records, restore the six snapshotted prior offer values/version and matching app, keep additive RPC compatibility and historical request contracts. Do not rewrite existing quotes or requests.

**Production migration / business-data mutation / merge / deploy: NONE.** Prepared SQL and local proof are not a Production publication claim. WhatsApp #166 is separate and untouched.
