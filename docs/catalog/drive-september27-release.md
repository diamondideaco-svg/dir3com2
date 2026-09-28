# Task #167 / PR #168 — Drive catalogue release record

Updated 2026-09-28 (UTC). Owner: Codex — ChatGPT Work Mode, directly assigned by the CEO. Independent reviewer requested: Codex Desktop. No direct Desktop receipt or completed independent review is claimed.

Branch `feat/drive-catalog-september27`; base `c8c91f33f3ea017bf09f0d4ee32747c0aae425b9`; this correction starts at `633494c2f7ae7cc78de9b9d3cc4c5617d05ea533`. Final SHA is recorded in Task #167 and PR #168 after push. Same branch/PR and isolated worktree.

## Authoritative customer instruction and result

The CEO explicitly accepts **every supplied vehicle and every model year**, including 2020/2021 and unspecified years. This supersedes the earlier 2025 and 2022 eligibility minima. **All 27 source rows are accepted; zero rows withheld.** Six existing offers are repriced and twenty-one added; with three financially unchanged offers, the catalogue contains **30 offers**.

E200 preserves the legible 2021/2022; a clipped final year is not guessed. Land Cruiser 2020/2021 is a distinct offer from the later Land Cruiser. H1 and Hiace remain accepted with unspecified years. Raw source names/years remain in the register. Editorial normalization reads Carval as Carnival, Tuycan as Tucson, and the blank Nissan row as continuation of Patrol from the preceding row. These are explicit inferences from the submitted table, not a new supplier confirmation. K4 source years 2022/2023 remain unchanged; its image is a current model-family representation, not independent authentication of those years. CN7 retains its previously documented normalization to Elantra.

Daily USD = higher source row price × 1.10 once. Airport reception = 50% of the final daily rate. The 27 reconciled daily services include 24 hours, driver, fuel and 120km. Continuous driver duty, excess charges and a final trip total are not invented. AMG Line, T1 and the existing full-size Range Rover 2025 retain their previous financial/service terms. All 30 current offers use the unrestricted-year request policy. Egypt Operations coordinates the new rates; supplier identity is not guessed. Abu Al-Hana products and WhatsApp #166 are untouched.

## Images and source limits

The CEO rejected the covered-vehicle placeholder. It has been removed from both public files and catalogue mappings. **All 30 listings now have 30 distinct uncovered images.** Ten assets were replaced or added during this visual correction: Carnival, K4, Tucson, Patrol Y63, Egyptian Sunny N17, E200, E200 AMG Line, G-Class, T1 and T2. Remaining assets were reviewed together and retained. All images face left in a front three-quarter view on a transparent background; each is 1536×1024, fully decodable, with positive subject margins. Distinct Range Rover/Sport colors and generations remain.

Patrol and K4 draft geometry was corrected using manufacturer shape references; an invented engine badge was removed. Egyptian Sunny uses N17 rather than the newer global N18. Model names inferred from spelling/table continuation are recorded in the source register. The K4 source-year discrepancy is retained as supplied rather than being silently rewritten; its image is representative of the model family, not proof of an exact 2022/2023 unit.

Evidence: `drive-image-quality-2026-09-28.json` records generation IDs, prompts and reference URLs; `drive-image-audit-2026-09-28.{json,jpg}` records all 30 local files, hashes, transparency/dimensions and the visual contact sheet. Manufacturer reference photos were used for shape checking, not shipped as public assets. Generated catalogue art does not guarantee exclusive rights or an exact physical vehicle's year, trim or color; “or similar” and Operations confirmation remain.

## Request and database integrity

Catalogue version `managed-eg-20260928-v3`. Application JSON and the guarded unpublished migration contain all 27 identical price pairs. Historical migrations are untouched; the forward-registry hash matches. Baseline protection covers all nine existing catalogue rows; collisions or unexpected prior values stop the migration before overwrite. Six are repriced, three receive only the new catalogue version, and twenty-one are inserted. Existing requests, quotes, partners, products, bookings and payments are not rewritten.

- New requests store explicit JSON null for both year constraints: no year eligibility floor or finite year allowlist. Missing year does not prevent request or Operations confirmation. A supplied year is validated only as a four-digit integer.
- Operations can enter any year or leave it unspecified for these new requests.
- Historical requests preserve their saved year promise and original price. Older 2025–2027 requests cannot be silently downgraded. Compatibility with the intermediate 2022–2027 request shape is retained.
- Replay returns the saved request before the current-version check; an old price cannot create a new request silently.
- Six-hour eligibility, authenticated customer ownership, country-scoped Operations authority, audit uniqueness and no-booking/payment boundaries remain.

## Verification

Current delta: 22/22 focused catalogue/request tests; Typecheck PASS; Lint 0 errors/23 existing warnings; Build and Diff PASS. Migration baseline/cutover/target checks 55/55 and manifest verification PASS. Previously accepted unchanged public-entry/retry evidence is retained without broad repetition.

The actual migration and create/review RPCs executed in isolated in-memory PostgreSQL (PGlite): 30 offers, 27 exact price pairs, stale-version rejection, old/new replay, new request confirmations for 1990/2020/2021 and an unspecified year, invalid year syntax rejection, one event per confirmation and no booking/payment. Historical 2025 promises remain enforced. The isolated fixture stubs operational authority; it is not full Supabase RLS coverage. The repository Docker/Postgres harness is updated and remains a cloud gate.

The all-years frozen-build local public browser evidence is recorded separately in `drive-browser-all-years-2026-09-28.json`: AR/EN at 1440/390, all 30 cards/images, Land Cruiser 2020/2021 and unspecified-year H1 details, zero overflow/page errors. Land Cruiser 2020 daily385/airport192.50 USD; H1 daily165/airport82.50 USD. No authenticated browser request, provider call or business mutation was performed.

The image/name-only final browser follow-up passed AR/EN at1440/390: all30 unique image paths loaded, no covered asset, no overflow/page errors, and detail/airport amounts unchanged. Evidence: `drive-browser-image-final-2026-09-28.json` and `drive-card-final-{ar,en}-390.png`. Final focused22/22, typecheck/lint/build/diff also passed. database/RPC evidence is reused because SQL and request logic did not change. Independent review and exact-SHA CI/Preview/Sandbox remain separate release gates. Self-checking is not independent approval. Governance currently accepts only Desktop/VS Code implementation identities; actual Work Mode ownership is recorded and that workflow has not been weakened or bypassed.

## Coordinated publication and recovery

1. Complete exact-SHA independent review/cloud gates and resolve the honest ownership/governance mismatch.
2. Record the nine current catalogue rows/version read-only in the authorized release window; verify reviewed SQL/hash.
3. Apply only this reviewed migration and promote its matching app. Version checks reject stale new requests during transition.
4. Verify all 27 price pairs, three unchanged financial contracts, 30 displayed offers, unrestricted new-request years, historical request promises and images.
5. Recovery is a reviewed forward change: deactivate new offers without deleting referenced rows, restore the nine snapshotted prior catalogue rows/version and matching app; preserve additive RPC compatibility and historical requests/quotes.

**Production migration / business-data mutation / merge / deploy: NONE.** Prepared SQL and local proof are not a Production publication claim.

## Follow-up: direction correction after CEO observation

The prior claim that all30 images faced left was incorrect: Jetour X90 and the beige/green full-size Range Rovers faced right. Only these three image assets were re-rendered facing left, preserving paint/model/trim with readable non-mirrored lettering. All30 images were visually reviewed again in the updated contact sheet; alpha,1536×1024 dimensions, unique hashes and positive subject margins verified. No application/SQL/pricing changes. Prior browser evidence covers layout/loading before this asset-only delta; no new Browser PASS is claimed. Final review target is updated on Task/PR after push.
