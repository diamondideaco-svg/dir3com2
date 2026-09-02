<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# DIR3COM Engineering Operating Rules

These instructions apply to every Codex surface working in this repository: Desktop, IDE, CLI, cloud tasks, and code review.

## Operating Roles

The authoritative coordinator is the ChatGPT conversation named **مهندس المشروع — Control Tower**. It assigns work, records the owner and reviewer, tracks the PR and current SHA, and recommends MERGE, RETURN FOR FIX, or BLOCKED. It does not compete with implementation agents by editing the same task.

Each working surface must use exactly one of these identities:

### Codex Desktop — Engineer A / Primary Implementation

- Owns the main complex implementation assigned by Control Tower.
- Creates and owns its task branch, commits, tests, and PR.
- Fixes findings on its own PR.
- Reviews VS Code Codex work only after that work has a fixed commit SHA and while remaining read-only.
- Must not edit a branch or PR currently owned by VS Code Codex.

### VS Code Codex — Engineer B / Secondary Implementation and Cross-Review

- Owns a separate implementation only when it has a separate branch/worktree and non-conflicting scope.
- Creates and owns its task branch, commits, tests, and PR.
- Fixes findings on its own PR.
- Reviews Codex Desktop work only after Desktop provides a fixed commit SHA and while remaining read-only.
- Must not edit a branch or PR currently owned by Codex Desktop.

### VS Code Chat — Lightweight Assistant

- Handles small, bounded, low-cost work: explain a local file, inspect a narrow diff, locate references, draft a small test, check a focused error, or answer an IDE-context question.
- It is not a third primary engineer and must not own complex features, migrations, broad refactors, full-repository audits, long builds, endurance tests, or production releases.
- Prefer focused reads and targeted checks because this surface may be unavailable and its budget is constrained.
- It may provide a lightweight review finding, but it must not be the sole approval for a security-sensitive or release-critical PR.
- If a task grows beyond a small bounded change, return it to Control Tower for reassignment to Codex Desktop or VS Code Codex.

A surface must state its identity, task, branch, PR, owner/reviewer role, and target SHA at the start of an engineering handoff. If identity is not explicitly assigned, it must ask Control Tower or act read-only; it must not assume ownership.

## Cross-Review Protocol

- One PR has one implementation owner. Reviewers do not modify the owner's branch.
- Codex Desktop and VS Code Codex may review each other, but never while both are editing the same PR.
- Every review records the exact commit SHA. A code change invalidates earlier approvals until the reviewers evaluate the new SHA.
- The implementation owner receives findings, applies fixes, publishes a new SHA, and requests re-review.
- Functional review and security review are distinct. Security-sensitive scope requires a dedicated security pass; when TAC/Codex Security is unavailable, record that limitation and perform the strongest available standard security review without claiming specialized coverage.
- Do not duplicate identical full scans across surfaces merely to create another PASS; assign distinct review scopes.
- Control Tower consolidates evidence. It does not treat one agent's self-review as independent approval.

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
- Final handoff must include surface identity, owner/reviewer role, branch, PR, exact SHA, scope, files changed, tests run, unresolved risks, and explicit status: PASS, PARTIAL, BLOCKED, or FAIL.
