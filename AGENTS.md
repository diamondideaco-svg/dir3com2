<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## DIR3COM Product Architecture Principle

DIR3COM uses ONE shared core platform/backend.

Products:
1. DIR3COM Web Platform
2. DIR3COM Mobile App
3. DABRA AI
4. Future optional standalone DABRA App

Rules:
- Never create a separate backend for Mobile.
- Never create a parallel backend for DABRA.
- Never duplicate authentication, booking, marketplace, finance, wallet, profile, verification, partner, customer, or lifecycle logic across products.
- Web and Mobile must consume the same DIR3COM Core APIs and domain contracts.
- DABRA must be implemented as a reusable AI/service layer that can operate inside Web and Mobile.
- DABRA must remain architecturally separable so it can later become an independent app or commercial brand without rebuilding DIR3COM Core or its APIs.
- Shared contracts must remain product-agnostic where practical.
- Server secrets, privileged credentials, service-role access, and authorization logic remain server-side only.
- Mobile and DABRA clients receive client-safe contracts and configuration only.
- Future standalone DABRA must reuse DIR3COM Core APIs rather than creating a parallel platform.

## Mandatory Project Identity Check

Before any task involving Supabase, Vercel, Production, backups, migrations,
releases, or deployments, read `PROJECT_IDENTITY.md` in full first.

- No agent may infer environment identity from a project name, creation date,
  region, inactive status, or historical configuration.
- `UNKNOWN` and `UNVERIFIED` never mean Production.
- Run `npm run verify:project-identity` before every migration or deployment
  workflow.
- Production database writes and migrations remain blocked while
  `PRODUCTION_SUPABASE_REF = UNVERIFIED`.
- Never substitute the canonical Staging Supabase ref for Production.

Target architecture:

DIR3COM CORE
├── Web Platform
├── Mobile App
├── DABRA AI
└── Future DABRA Standalone App
