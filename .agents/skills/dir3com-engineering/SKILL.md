---
name: dir3com-engineering
description: Implement, review, test, or diagnose changes in the DIR3COM repository while preserving its shared-core architecture, tenant isolation, human approval gates, bilingual experience, and evidence-based PASS criteria.
---

# DIR3COM Engineering

Read the repository-root `AGENTS.md` before acting; it is authoritative for architecture, security, verification, and release boundaries.

## Route the task

- For implementation, inspect the affected code and tests, make the smallest coherent change, and verify it.
- For diagnosis or review, remain read-only unless the user explicitly asks for a fix.
- For authentication, tenant isolation, payments, uploads, admin access, or external-provider changes, include a separate security-focused review.
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
- scope completed;
- files changed;
- commands and results;
- unresolved risks or blockers;
- status: PASS, PARTIAL, BLOCKED, or FAIL.

Never merge, deploy production, mutate live data, or perform an irreversible external action solely because checks passed. Obtain explicit authorization for that action.
