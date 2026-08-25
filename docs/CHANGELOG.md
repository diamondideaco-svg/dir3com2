# Changelog

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
