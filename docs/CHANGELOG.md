# Changelog

## 2026-08-30 — DIR-121 provider-sourced visual marketplace preview

- Reworked the gated Marketplace Preview around LiteAPI stays for Riyadh/Cairo and official Ticketmaster Saudi events while retaining exactly the five canonical family filters.
- Added provider item IDs, source URLs where supplied, environment, retrieval time, transaction method, and fulfilment state to every provider-derived preview item and PDP.
- Kept LiteAPI sandbox or non-transactional results explicitly non-bookable, routed eligible Ticketmaster events only to official provider checkout, and added graceful provider-image fallbacks without substitute inventory.
- Made retrieval timestamps deterministic between Vercel SSR and browser hydration, and reserved the DIR-121 mobile hero footprint for the existing floating DABRA launcher without changing desktop positioning or provider truth.
- Enabled the public DIR-121 page and read API in Production while retaining fail-closed provider availability, sandbox labeling, and non-transactional supply boundaries.

- Closed the remaining DIR-120 audit-provenance boundary: marketplace request transitions now derive human actors from the signed Supabase session, record service-only calls as an explicit system actor, remove the caller-supplied actor overload, and deny direct service-role audit insertion.

## 2026-08-30 — DIR-120 request audit schema dependency closure

- Added a canonical, append-only `marketplace_request_audit_logs` ledger for atomic Marketplace request transitions, with request/actor/status/source/metadata traceability and no customer or partner write path.
- Retargeted the existing DIR-120 transition RPC through a follow-up migration without rewriting merged migration history; CI now applies the historical and corrective migrations in order on a disposable PostgreSQL database that has no global `audit_logs` table.

## 2026-08-30 — DIR-120 authoritative confirmation evidence and CI closure

- Replaced free-text-only confirmation proof with a server-only, request/customer/product/supplier-bound evidence ledger and fail-closed validation for supplier, payment, and accepted quote evidence.
- Added a real 20-case PostgreSQL safety suite to the normal PR workflow using a disposable database, covering authoritative evidence, tenant/context mismatch, atomic rollback, stale/no-op/terminal transitions, quotes, and legacy reconciliation.

## 2026-08-30 — PR #68 Preview auth and operations timestamp remediation

- Kept OAuth callbacks on the initiating, trusted dir3com-owned Vercel Preview host instead of relying on a branch-specific alias.
- Added the persisted marketplace request `updated_at` value to the guarded Admin Operations queue alongside `created_at`.

## 2026-08-29 — Marketplace request authentication handoff

- Kept public Marketplace/PDP browsing open while moving authentication to the durable Request to Confirm action boundary.
- Preserved the product, PDP, family, and request intent through the existing safe Login/OAuth callback return mechanism without automatically creating or replaying a request.

## 2026-08-29 — Drive customer-surface remediation

- Replaced the non-rendering Drive fallback image request with the existing platform vehicle icon, removed internal seed/review language at the customer presentation boundary, and kept stored Drive products in vehicle taxonomy across cards and PDP.
- Removed the false empty-products panel from request-to-confirm PDPs without changing inventory, fulfilment, authorization, or transaction gates.

## 2026-08-28 — Customer claim truth and DABRA response-language enforcement

- Consolidated service-page descriptions onto the existing canonical family copy and replaced unsupported superiority, verification, availability, count, and response-time claims across active customer-facing service and Marketplace sources with neutral Arabic/English descriptions.
- Added server-side n-gram DABRA response-language identification that positively identifies Arabic or English, fails closed on foreign or low-confidence conversational output, permits bounded travel identifiers, and performs at most one locale repair before using a deterministic fallback.

## 2026-08-28 — Customer journey and DABRA locale continuity

- Restored the global family navigation to the dedicated Fly, Stay, Drive, Concierge, and VIP service journeys while keeping Marketplace as its own destination and adding family-filtered Marketplace calls to action on each service page.
- Made each dedicated journey initialize the existing shared search with that family's truthful field model instead of defaulting every service page to Drive.
- Bound DABRA interface copy, request context, response validation, speech recognition, and text-to-speech to the customer-selected Arabic or English locale so prior messages and proper nouns cannot silently switch the active language.

## 2026-08-28 — Marketplace production schema contract closure

- Aligned public browsing, request, quote, and booking eligibility with the canonical production `products.status` and `products.deleted_at` lifecycle instead of the nonexistent `products.is_active` column.
- Kept all customer paths fail-closed for hidden, inactive, deleted, synthetic, sandbox, fallback, non-production, and transaction-ineligible inventory, including direct UUID lookups.

## 2026-08-28 — Customer marketplace truth foundation

- Added one fail-closed marketplace truth contract separating family, fulfilment, transaction method, environment, supplier type, and verification state.
- Added the canonical `/marketplace` surface with exactly Drive, Stay, Fly, Concierge, and VIP, plus truthful empty/error states that never substitute fallback inventory.
- Gated instant booking, request-to-confirm, and quote creation against server-verified production truth; added an owner-scoped request/payment lifecycle with server-authoritative mutations.
- Grounded DABRA and public marketplace reads in the same customer-safe inventory gate so sandbox, test, synthetic, fallback, and pilot-labelled records cannot masquerade as verified supply.
- Completed Arabic/English localization for the new marketplace, product-detail, transaction, and account request surfaces using the existing platform language context without changing truth or CTA gates.
- Closed mutation/publication parity so hidden products cannot be requested, quoted, or booked by UUID, and corrected airport ground transfers to the canonical Drive family while preserving VIP handling and true air-travel classification.
- Aligned request and quote mutations with active/non-deleted public eligibility and made strong flight identity take precedence over overlapping airport-transfer category wording.

## 2026-08-27 — Platform navigation full-experience closure

- Restored the previously approved Terms, Privacy, and Support routes so global footer and consent links no longer lead to 404 pages.
- Made `/dabra` the canonical public DABRA navigation destination while retaining the protected `/ai/pilot` route.
- Wired existing audit, events, notifications, Shield, and VIP partner configuration pages into the admin shell.
- Reused one shared logout control across the public header and admin shell.

## 2026-08-27 — Partner portal operational security closure

- Removed direct partner document review-state mutations and tightened Partner tables to least-privilege authenticated grants.
- Made product-image replacement and deletion row-safe with a durable private-storage cleanup queue, preserving deterministic missing-object handling.
- Aligned committed Partner persistence migrations with the authoritative Supabase migration history.
- Kept privileged Partner administration operational through the server-only service client after revoking broad authenticated access to sensitive partner records.

## 2026-08-26 — DABRA Chat & Commerce final QA remediation

- Wired attachment validation, marketplace search/filter/sort controls, and result-state quick actions on `/dabra`.
- Added scoped hotel replacement that preserves unrelated trip-cart selections, transparent missing-component reporting, and verified-savings boundaries.
- Added bounded identity startup and ignored the Supabase initialization notification so early chat turns cannot disappear while retaining immediate detach on real auth transitions.
- Expanded focused Chat & Commerce coverage for controls, voice interruption, cart transparency, result sorting, and context preservation.

## 2026-08-26 - DABRA chat stream contract

- Added an explicit text-only stream contract for DABRA Chat & Commerce while preserving the existing JSON response for non-stream callers.
- Restricted rendered, persisted, announced, and spoken assistant content to the approved customer-facing `answer` field, with safe fallbacks for malformed or failed responses.

## 2026-08-26 - DABRA Professionalization Lab V1

- Added a deterministic, seeded DABRA conversation evaluation harness covering travel orchestration, confirmation-gated sandbox actions, payment and security boundaries, provider failures, Trip Guardian, scoped memory, Saudi-light character, and evidence-based Marketplace recommendations.
- Added machine-readable JSON results, Markdown scorecards, and checkpointed 6-hour/24-hour endurance runners with controlled provider failures.
- Recorded the approved current-release endurance closure policy: the completed extended soak is accepted as PASS, while the nominal 24-hour run is explicitly waived/stopped before completion and must not be represented as a 24-hour PASS.
- Kept all execution local/sandbox-only and preserved the shared DIR3COM Core, existing DABRA Orchestration V1, Marketplace Provider Pipeline V1.1, and production mutation boundaries.

## 2026-08-26 - Marketplace provider security remediation

- Disabled the HTTP local-preview route because the Route Handler runtime does not expose a trusted peer address, while preserving explicitly enabled non-public preview execution.
- Replaced header-presence authentication inference with validated Supabase user resolution and retained provider resource caps for authenticated searches.
- Derived Marketplace provenance metadata from the final returned page so off-page inventory cannot affect response truth signals.

## 2026-08-25 - DABRA Character & Conversation V1

- Advanced the centralized DABRA prompt contract to `dabra-character-conversation-v1` with a natural Saudi-light Arabic voice, selective approved phrase family, anti-overuse guardrails, and a canonical behavioral acceptance matrix shared by all seven AI providers.
- Preserved truthfulness, safety, execution refusal, internal/global mission separation, provider fallback, deadline, and sanitization boundaries.

## 2026-08-25 - DABRA traveler-count security boundary

- Added shared finite, safe-integer, and conservative party-size validation at intent and provider boundaries to prevent attacker-sized allocations before travel-provider requests.

## 2026-08-25 - DABRA Agentic Travel Orchestration V1

- Extended the existing AI2/DABRA foundation with normalized bilingual travel intent, scoped Travel Memory, Trip Plans, capability orchestration, comparison/replanning, confirmation-gated sandbox actions, a payment boundary, Trip Guardian event guidance, and context-preserving human handoff.
- Reused shared Duffel/LiteAPI Travel contracts, failed closed for blocked CarTrawler/Viator access, and isolated synthetic VIP data from public inventory.
- Added an authenticated `travel-plan` mode to the existing `/api/ai2/chat` route without changing the canonical UI or ordinary chat behavior.
- Added focused orchestration, security, ownership, provider-blocking, idempotency, Arabic, and English tests.

## 2026-08-25 — Final canonical UI legacy purge

- Recorded the frozen pre-DABRA canonical UI baseline for public, account, partner, and administration surfaces.
- Removed unreferenced legacy service-page component chains and an abandoned admin layout text copy while preserving Git history.
- Consolidated Drive presentation onto the shared canonical service-page component and removed the superseded `/drive` design-specific route.
- No provider contract, booking behavior, production data, or DABRA orchestration was changed.

## LiteAPI optional HMAC authentication

- Preserved the verified sandbox `X-API-Key` flow and added an explicit server-only HMAC SHA-512 mode for non-sandbox reads.
- Added strict credential checks, canonical authorization parsing, constant-time signature verification, and five-minute timestamp replay protection.

## Travel provider final hardening

- Made Duffel booking mutations fail closed outside explicitly normalized test or sandbox modes and required validated idempotency keys.
- Hardened Duffel offer, price, currency, slice, timeout, health, and provider-error normalization behavior.
- Replaced process-local Duffel webhook replay authority with signed-timestamp validation and atomic durable Supabase event claims.

## Partner portal tenant isolation

- Bound onboarding assets, media, and contracts to the authenticated partner identity instead of the shared portal category.
- Denied partner access to the internal review queue and rejected missing, forged, or inconsistent tenant associations.
- Preserved explicit admin/staff review access and localhost-only password authentication for isolated QA.

## Partner portal upload QA closure

- Reused the existing upload validator in partner-portal clients to reject unsupported, empty, and oversized files before an upload request.
- Routed private partner-media previews through an authenticated short-lived signed URL without changing bucket privacy or stored object paths.
- Localized the verified raw document and review status values in Arabic presentation only.

## DIR-74 reconciliation preparation

- Added a forward-only reconciliation migration for the missing `public.customers` and `public.partner_assignments` runtime relations.
- Added focused local schema and RLS tests covering admin workflows and negative customer, partner, cross-tenant, and anonymous access cases.

## LiteAPI / Nuitee sandbox stay provider POC

- Added product-agnostic normalized Stay contracts behind the shared DIR3COM Travel Provider layer.
- Added a server-only LiteAPI stay adapter for search, rates, prebook, sandbox booking, retrieval, and cancellation.
- Added fail-closed sandbox mutation guards, bounded read retries, booking replay protection, safe provider-error mapping, and focused regression tests.

## RC1 Hardening
- Added production-oriented documentation set
- Aligned lint configuration with current Next.js stack
- Added structured notes for architecture, database, security, performance, and business rules
# 2026-08-25 — VIP local Egypt partner test-ready engineering

- Added a server-side local `DIR3 VIP` provider adapter with synthetic, explicitly unverified Egypt fixtures.
- Added search, quote, revalidation, request, confirmation, cancellation, idempotency, retry safety, audit, and provider status.
- Added an admin-only editable configuration form and isolated local-test persistence schema; production signals fail closed.
- No credential, live booking, payment, production write, merge, or deployment was performed.
# 2026-08-25 — Canonical Travel provider consolidation

- Consolidated approved Fly (Duffel), Stay (LiteAPI), Drive (CarTrawler), Concierge (Viator Basic), and local Egypt VIP adapters behind the shared Travel contracts.
- Extended provider health output with Drive, Concierge, and explicitly unverified local-test VIP capability states.
- Preserved fail-closed live mutation controls; no live booking, payment, production write, UI redesign, merge, or deployment was performed.
# 2026-08-27

- Hardened Partner/Provider portal authorization to trust only the authoritative server profile role, and fixed DIR-93 so missing private product-image objects return a deterministic 404 while real storage outages remain sanitized 500 responses.
- Replaced ephemeral Partner/Provider onboarding state with owner-scoped PostgreSQL persistence and completed private document preview, replacement, deletion, and reload wiring.

# 2026-08-28 — Global travel supply Preview activation

- Added a server-only Ticketmaster Discovery integration with strict response normalization, official-domain redirect allowlisting, truthful external-checkout semantics, and no invented pricing.
- Unified Preview supply across Duffel Fly sandbox results, LiteAPI Stay sandbox results, and Ticketmaster Concierge discovery while retaining all five canonical marketplace families and truthful empty states.
- Grounded DABRA in the same bounded provider results and preserved explicit sandbox/production and native/external transaction distinctions in Arabic and English.
- Moved existing testable booking, request, sandbox, and request-context helpers out of Next.js Route Handler modules so the unchanged controls satisfy the Next.js 16 export contract and production builds remain type-safe.
- Removed unsupported comparative, verification, and quality claims from the five customer service-family pages, replacing them with neutral bilingual service descriptions.

# 2026-08-28 — Post-PR61 production UAT hotfix

- Bound the approved Home hero and CTA copy to the active Arabic/English locale without changing the approved visual composition.
- Added a bilingual Rooms input to Stay search with a minimum/default of one and preserved it in the existing search query contract.
- Replaced unsupported premium discovery and generic premium-service wording on active customer marketplace surfaces with neutral descriptive copy.
- Enforced Stay Rooms as an integer minimum of one at the submission boundary and removed the remaining unsupported Arabic quality phrase from the rendered offers feature strip.

## 2026-08-29 — Marketplace family context hotfix

- Synchronized the visible and accessible Marketplace family context with its canonical URL parameter and replaced internal integration-roadmap copy with neutral customer guidance.

## 2026-08-29 — Preview OAuth callback return-state closure

- Kept OAuth callbacks on the stable Vercel branch preview origin so Supabase can consume the authorization code in Preview instead of falling back to the production Site URL.
- Preserved the validated internal marketplace return destination across Google sign-in without changing local or production callback behavior.
## 2026-08-29 — DIR-118 revenue launch traceability

- Persisted customer, product, supplier, family, fulfilment, transaction, and controlled-handoff truth on marketplace requests before any external transition.
- Added truthful request lifecycle visibility to My Bookings and an admin-authorized operations queue without promoting requests to confirmed bookings.
- Kept provider checkout and WhatsApp as optional temporary rails; no production inventory, payment, booking, or supplier settlement capability was fabricated.
## 2026-08-30 — DIR-118 request persistence traceability remediation

- Backfilled existing marketplace request snapshots from their authoritative product record so legacy Request-to-Confirm references remain visible through the unified Admin Operations and customer read contract.
- Made Admin Operations fail explicitly on request-query/schema errors instead of silently presenting a false empty queue.

## 2026-08-30 — DIR-120 production revenue safety hotfix

- Prevented category-less marketplace products from issuing invalid UUID category lookups while preserving the fail-closed PDP contract.
- Moved admin marketplace-request transitions and their audit record into one stale-state-protected database operation.
- Required supplier/provider and verified-payment evidence before a request can claim confirmation, with quote evidence required for quote requests.
- Bound the operations status selector to the persisted current state instead of an unsafe fixed default.

# 2026-08-31 — Partner product image replacement recovery

- Added bounded recovery for transient Supabase Storage upload failures while reusing the same server-generated tenant/product object path.
- Reconciles an ambiguous upload response against that exact path before retrying, so a 520 cannot create duplicate replacement objects.
- Preserves the existing upload → association → durable old-image cleanup order and fails closed before any database mutation when the replacement upload cannot be proven successful.
