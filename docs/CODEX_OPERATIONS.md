# DIR3COM Codex Operations

This document extends the governance introduced by PR #86. It is the operating procedure for ChatGPT Control Tower, Codex Desktop, VS Code Codex, and VS Code Chat.

## One source of work truth

Every engineering change starts from exactly one GitHub issue created with the **Codex Task** issue form. That issue is the unified task record.

The record must contain:

- mission and scope;
- implementation owner;
- independent reviewer;
- branch and pull request;
- current exact commit SHA;
- evidence and unresolved blockers;
- verdict: `PLANNED`, `IN_PROGRESS`, `REVIEW`, `PASS`, `FAIL`, or `BLOCKED`.

Chats are working surfaces, not the permanent system of record. Important decisions and handoffs must be copied to the issue or pull request.

## Fixed roles

| Surface | Fixed responsibility |
| --- | --- |
| ChatGPT — Control Tower | prioritizes, assigns owner and reviewer, prevents overlap, consolidates evidence, and recommends the final action |
| Codex Desktop — Engineer A | primary complex implementation and fixes on its own branch |
| VS Code Codex — Engineer B | separate implementation or independent review of a fixed Desktop SHA |
| VS Code Chat — Lightweight Assistant | small bounded reads, explanations, focused checks, and low-cost support only |
| Codex Security | specialized security review when access is available; never silently assumed |

One pull request has one implementation owner. The owner and reviewer must be different surfaces.

## Task lifecycle

1. **PLAN** — Control Tower opens or assigns one task record with bounded scope.
2. **BUILD** — The owner creates one branch and pull request.
3. **VERIFY** — The owner runs focused tests and applicable repository gates.
4. **HANDOFF** — The owner records the exact SHA and transfers review ownership.
5. **REVIEW** — The reviewer stays read-only and evaluates that exact SHA.
6. **FIX** — Findings return to the implementation owner. A new SHA invalidates prior approval.
7. **DECIDE** — Control Tower consolidates CI, review, QA, security, and blockers.
8. **MERGE** — Only after required gates pass and explicit merge authorization exists.
9. **RELEASE** — Production deployment, migrations, or live-data changes require separate explicit authorization.

## Handoff contract

Every handoff must include:

```text
TASK =
IMPLEMENTATION OWNER =
REVIEWER =
BRANCH =
PR =
TARGET SHA =
SCOPE =
FILES CHANGED =
TESTS AND RESULTS =
SECURITY COVERAGE =
UNRESOLVED RISKS =
NEXT OWNER =
VERDICT =
```

A handoff without a full 40-character SHA is incomplete. Review comments must name the reviewed SHA. Any later commit requires re-review.

## Automated governance gate

The **Codex Governance Gate** workflow validates pull request metadata without executing untrusted pull request text in a shell. It fails when:

- the task record is missing;
- owner, reviewer, branch, target SHA, or verdict is missing;
- owner and reviewer are identical;
- the declared branch differs from the actual pull request branch;
- the target SHA differs from the actual pull request head;
- the verdict is not one of the allowed lifecycle values.

The gate validates traceability. It does not replace tests, browser QA, security review, CEO authorization, or branch protection.

## Merge boundaries

A green workflow is evidence, not permission. The following remain prohibited without explicit authorization:

- merging or enabling auto-merge;
- production deployment or migration;
- credential rotation;
- mutation of production customer, partner, supplier, inventory, booking, or payment data;
- self-approval by the implementation owner.

## Daily operating rule

The CEO provides the goal and approves sensitive or irreversible actions. Control Tower handles routing and returns only decisions, blockers, and evidence that require CEO attention.
