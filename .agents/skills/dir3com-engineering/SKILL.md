---
name: dir3com-engineering
description: Implement, review, test, or diagnose changes in the DIR3COM repository while preserving its assigned Codex surface role, shared-core architecture, tenant isolation, human approval gates, bilingual experience, and evidence-based PASS criteria.
---

# DIR3COM Engineering

Read the repository-root `AGENTS.md` before acting; it is authoritative for surface identities, ownership, cross-review, architecture, security, verification, and release boundaries.

## Identify the surface

At the start of an engineering handoff, state one assigned identity:

- **Codex Desktop — Engineer A / Primary Implementation**
- **VS Code Codex — Engineer B / Secondary Implementation and Cross-Review**
- **VS Code Chat — Lightweight Assistant**

Also state the task, branch, PR, implementation owner or reviewer role, and target commit SHA. If the identity or ownership is unclear, remain read-only and ask the Control Tower conversation named **مهندس المشروع** for assignment.

VS Code Chat is limited to small, bounded, low-cost tasks. It must hand complex features, broad audits, long-running checks, migrations, and release-critical ownership back to Control Tower.

## Route the task

- For implementation, own a separate branch/worktree, inspect the affected code and tests, make the smallest coherent change, and verify it.
- For diagnosis or review, remain read-only unless Control Tower explicitly reassigns implementation ownership.
- Never have two surfaces modify the same PR. The PR owner applies reviewer findings.
- Review an exact SHA. Any code change invalidates earlier review approval.
- For authentication, tenant isolation, payments, uploads, admin access, or external-provider changes, include a separate security-focused review.
- If TAC/Codex Security is unavailable, record the coverage limitation and do not claim specialized security PASS.
- For UI changes, verify Arabic and English plus relevant desktop and mobile layouts.
- For database work, inspect migrations and RLS together; never treat application checks as a substitute for database policy.
- For supplier integrations, keep sandbox/test evidence distinct from production capability and never invent availability or transactions.

## Preserve the system

- Reuse DIR3COM Core APIs and shared contracts across Web, Mobile, and DABRA.
- Keep DABRA optional and require human approval for booking, payment, cancellation, refund, supplier communication, and irreversible admin actions.
- Preserve provider identifiers, source URLs, environment, transaction method, fulfilment state, and availability certainty where applicable.
- Do not introduce customer-visible fallback or synthetic inventory.
- Keep privileged credentials and authorization logic server-side.

## Produce evidence

Run focused checks first, then the applicable repository gates. Do not call a result PASS when a required check is skipped, blocked, flaky, or unrun.

End with:
- surface identity and owner/reviewer role;
- branch, PR, and exact SHA;
- scope completed;
- files changed;
- commands and results;
- unresolved risks or blockers;
- status: PASS, PARTIAL, BLOCKED, or FAIL.

Never merge, deploy production, mutate live data, or perform an irreversible external action solely because checks passed. Obtain explicit authorization for that action.
