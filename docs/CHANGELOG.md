# Changelog

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
