# Changelog

## DIR-80 Public Visual Consolidation
- Resolved shared Arabic/English direction, public header grouping, mobile marketplace width, localized feature/story labels, legal-page containment, and home-media proportion issues.
- Connected homepage and shared public “Ask DABRA” controls to the canonical floating assistant without changing their visual presentation.
- Corrected Header search, weather, currency, theme, and accessibility-panel behavior against their real public runtime targets.

## Trust and Privacy Integration
- Aligned bilingual public privacy, terms, and support pages with currently supported account, booking, session, authentication, and DABRA behavior without adding unsupported legal commitments.
- Verified existing footer legal links, public AI safety refusals, and secret-safe provider error handling locally.

## Partner portal real-trial readiness

- Prevented partners from self-selecting profile approval states or publishing product states while preserving explicit review submission.
- Added partner logout and restored readable mobile form text without changing provider or public branding surfaces.
- Added the local product review status migration required for draft-to-review service submission.

## Partner portal upload QA closure

- Reused the existing upload validator in partner-portal clients to reject unsupported, empty, and oversized files before an upload request.
- Routed private partner-media previews through an authenticated short-lived signed URL without changing bucket privacy or stored object paths.
- Localized the verified raw document and review status values in Arabic presentation only.

## DIR-74 reconciliation preparation

- Added a forward-only reconciliation migration for the missing `public.customers` and `public.partner_assignments` runtime relations.
- Added focused local schema and RLS tests covering admin workflows and negative customer, partner, cross-tenant, and anonymous access cases.

## RC1 Hardening
- Added production-oriented documentation set
- Aligned lint configuration with current Next.js stack
- Added structured notes for architecture, database, security, performance, and business rules
