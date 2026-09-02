<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# DIR3COM Engineering Operating Rules

These instructions apply to every Codex surface working in this repository: Desktop, IDE, CLI, cloud tasks, and code review.

## Product Architecture

DIR3COM uses one shared core platform/backend.

Products:
1. DIR3COM Web Platform
2. DIR3COM Mobile App
3. DABRA AI
4. Future optional standalone DABRA App

Rules:
- Never create a separate backend for Mobile or a parallel backend for DABRA.
- Never duplicate authentication, booking, marketplace, finance, wallet, profile, verification, partner, customer, or lifecycle logic across products.
- Web and Mobile consume the same DIR3COM Core APIs and domain contracts.
- DABRA is a reusable AI/service layer inside Web and Mobile and remains separable for a future standalone product.
- Shared contracts stay product-agnostic where practical.
- Secrets, privileged credentials, service-role access, and authorization logic remain server-side.
- Mobile and DABRA clients receive client-safe contracts and configuration only.

## Human and Product Rules

- Customer-facing output is human-first in Arabic and English; do not present AI as the operator of the whole experience.
- DABRA is optional and valuable, not a forced funnel.
- Preserve service families: Drive, Stay, Concierge, VIP, and Fly.
- Preserve availability certainty: Instant, Request to confirm, Quote, Sold out, or Availability unknown.
- Never fabricate supplier inventory, prices, availability, bookings, payment results, approvals, or production evidence.
- Booking, payment, cancellation, refund, supplier communication, and irreversible admin actions require explicit human approval immediately before the action.

## Tenant and Security Invariants

- Tenant identity comes from the authenticated actor and server-side ownership checks, never from a client-provided category or display field.
- Preserve RLS, child/parent association checks, and least-privilege service-role use.
- Do not expose secrets, tokens, private customer data, or supplier credentials in clients, logs, tests, fixtures, screenshots, commits, or PR text.
- Treat authentication, authorization, payments, uploads, partner isolation, admin access, and external integrations as security-sensitive.
- Synthetic data must remain isolated from public and production data.

## Work Discipline

Before editing:
- Read the relevant implementation, tests, and the local Next.js documentation for affected APIs.
- Check the current branch and working tree. Preserve unrelated user changes.
- State assumptions when the requested behavior is not established by code or tests.

During implementation:
- Keep changes scoped to the task and reuse existing architecture and contracts.
- Add or update tests for behavioral changes and regressions.
- Do not weaken validation, authorization, RLS, error handling, or tests just to obtain PASS.
- Do not add fallback/test data to customer-facing production paths.
- Do not silently change public contracts, database schemas, environment variables, or provider behavior.

Verification:
- Run the smallest relevant tests first.
- Then run `npm run lint`, `npm run typecheck`, and `npm run build` when the affected scope can influence them.
- Run relevant integration or PostgreSQL tests when their required isolated environment is available.
- Report each command and result honestly. A skipped, blocked, or unrun check is not PASS.
- For UI work, verify the relevant Arabic and English flows and desktop/mobile layouts.

## Branch, Review, and Release Gates

- Work on a task branch. Do not commit directly to `master`.
- One agent implements; a separate review pass evaluates correctness, regression risk, and security-sensitive changes.
- A green CI run is evidence, not permission to merge or deploy.
- Do not merge, enable auto-merge, deploy production, run production migrations, rotate credentials, or mutate live data without explicit authorization.
- Preview deployment and browser QA must pass before a release candidate is recommended.
- Final handoff must include scope, files changed, tests run, unresolved risks, and explicit status: PASS, PARTIAL, BLOCKED, or FAIL.
