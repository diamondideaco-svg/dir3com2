# DIR3COM Codex Operations

This document extends the governance introduced by PR #86 and PR #115. It is the operating procedure for ChatGPT Control Tower, Codex Desktop, VS Code Codex, assigned Codex Work Mode implementation, and VS Code Chat.

## One source of work truth

Every engineering change starts from exactly one GitHub issue created with the **Codex Task** issue form. That issue is the unified task record. A pull request number is not a valid substitute.

The record must contain:

- mission and scope;
- implementation owner;
- independent reviewer;
- branch and pull request;
- current exact commit SHA;
- evidence and unresolved blockers;
- task verdict: `PLANNED`, `IN_PROGRESS`, `REVIEW`, `PASS`, `FAIL`, or `BLOCKED`.

Chats are working surfaces, not the permanent system of record. Important decisions and handoffs must be copied to the issue or pull request.

## Fixed roles

| Surface | Fixed responsibility |
| --- | --- |
| ChatGPT — Control Tower | prioritizes, assigns owner and reviewer, prevents overlap, consolidates evidence, and recommends the final action |
| Codex Desktop — Engineer A | primary complex implementation and fixes on its own branch |
| VS Code Codex — Engineer B | separate implementation or independent review of a fixed Desktop SHA |
| Codex — ChatGPT Work Mode | explicitly assigned implementation on its own task branch/worktree; requires a different independent reviewer |
| VS Code Chat — Lightweight Assistant | small bounded reads, explanations, focused checks, and low-cost support only |
| Codex Security | specialized security review when access is available; never silently assumed |

One pull request has one implementation owner. The owner and reviewer must be separate non-author sessions; identical surface labels are insufficient to establish or refute session independence.

Work Mode uses the literal implementation identity `Codex — ChatGPT Work Mode`, not a Desktop/IDE alias. Its assignment must be recorded in the Task. Control Tower may coordinate that work but may not count coordination or the owner's self-checks as independent review. Functional review may use Desktop/VS Code or an explicitly assigned separate Work Mode session; security coverage is recorded separately. Work Mode reviewers may truthfully use `Codex - ChatGPT Work Mode`, `Codex — ChatGPT Work Mode`, or the displayed `ChatGPT Work Model`. This is a naming/role correction, not evidence that two labels identify the same session or that a session is independent.

### Work Mode identity amendment — 2026-09-28

For Task #167 / PR #168, the CEO instructed continuation after the documented proposal to admit the actual Work Mode implementation identity. This amendment adds that one owner to the workflow, issue form and PR template. It does not waive a failed check, change the reviewer allowlist, grant merge/Production authority, or turn earlier reviews into approval of a later SHA. The policy change itself requires an independent delta review. All existing Task/PR/branch/full-SHA matching and owner/reviewer separation checks remain enforced.

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

## Conversation recovery protocol

When a chat is full, replaced, compacted, or loses context, the incoming surface must not reconstruct the task from memory. It must:

1. Read `AGENTS.md`, this procedure, the active Codex Task, the linked PR, and the current branch/HEAD/status.
2. Emit the Mandatory continuity bootstrap record from `AGENTS.md`.
3. Compare the Task and PR values for owner, reviewer, branch, base SHA, target SHA, worktree, last verified result, next action, and verdict.
4. Treat repository/runtime evidence as newer than chat narrative. Preserve explicit approved decisions unless current evidence disproves them.
5. Stop on missing or contradictory state. Correct the authoritative Task/PR record before any implementation or review.

A handoff is complete only when the receiving surface acknowledges the same Task, branch, exact HEAD, scope, and next action. Writing an instruction in another chat does not prove receipt. Until an acknowledgement or repository evidence exists, the receiving surface is `UNVERIFIED` and no work may be attributed to it.

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

- the Task is not a verifiable GitHub issue whose title starts with `[Codex Task]`, or it points to a pull request;
- owner, reviewer, branch, target SHA, or verdict is missing;
- the implementation owner is not exactly `Codex Desktop`, `VS Code Codex`, or `Codex — ChatGPT Work Mode`, or the reviewer is outside Desktop/VS Code/Codex Security or the explicitly assigned separate Work Mode review role;
- owner and reviewer are identical surfaces, except that matching Work Mode labels require distinct concrete session IDs and the non-author receipt checks below;
- the declared branch differs from the actual pull request branch;
- the target SHA differs from the actual pull request head;
- the PR verdict is not exactly `IN_PROGRESS`, `REVIEW`, `PASS`, `FAIL`, or `BLOCKED`.

The task issue may also use `PLANNED` before a pull request exists. The separate PR **Gate result** records the overall evidence outcome as `PASS`, `PARTIAL`, `BLOCKED`, or `FAIL`.

The gate validates traceability. It does not replace tests, browser QA, security review, CEO authorization, or branch protection.

### Work Mode independent-review identity correction — 2026-10-04

The owner explicitly requested correction of the existing reviewer naming mismatch (user instruction at 2026-10-04T21:37:48Z; Task186 receiving ACK comment 5984603348). No technical equivalence or independence is inferred from a display name. Control Tower must assign the actual review role and record the receiving session's truthful identity.

When the reviewer uses a Work Mode name, Task and PR must both contain `Implementation session`, `Reviewer session` (full session UUIDs), and `Reviewer receipt` (numeric Task comment ID). The sessions must differ, including case-insensitive comparison. GitHub fetches that receipt from the same repository/Task; PR text alone cannot supply it. The receipt must contain exactly one bullet for `Independent reviewer`, `Implementation session`, `Reviewer session`, `Target SHA`, `Reviewer role: independent reviewer`, and `Reviewer authorship: none`, matching the assignment/artifact. Missing, duplicate, mismatched, foreign-Task, unavailable or stale receipts fail closed. A receipt acknowledging prior authorship cannot qualify. The current free-form receiving ACK must be supplemented with these exact fields before this automated gate can pass; its publication alone is not approval.

The receipt is a traceability/non-authorship attestation, not cryptographic proof of runtime identity or truthful independence. Control Tower verifies actual separate-session participation; label normalization alone never satisfies this requirement. Implementation/fix participants cannot review their own artifact under another name. Review findings stay read-only; owner applies fixes and each later commit requires fresh exact-artifact review. Functional and distinct security coverage remain separate, and no build, QA, merge or Production requirement is waived. Old Task186/Task187 exceptions do not transfer.

## Merge boundaries

A green workflow is evidence, not permission. The following remain prohibited without explicit authorization:

- merging or enabling auto-merge;
- production deployment or migration;
- credential rotation;
- mutation of production customer, partner, supplier, inventory, booking, or payment data;
- self-approval by the implementation owner.

## Daily operating rule

The CEO provides the goal and approves sensitive or irreversible actions. Control Tower handles routing and returns only decisions, blockers, and evidence that require CEO attention.
