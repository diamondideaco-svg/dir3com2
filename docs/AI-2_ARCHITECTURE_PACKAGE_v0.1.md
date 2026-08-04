# AI-2 Architecture Package v0.1

## Reference
- EO-055 — AI-2 Foundation Preparation
- Baseline Commit: `92aeabc42da6520b8518b28db42332ad95bcf6ba`
- DGR-054: CLOSED
- DGR-055: OPEN (Preparation)

## Executive Scope
This package defines AI-2 preparation only. It does not modify AI-1 runtime behavior,
does not enable production AI traffic, and does not add booking or payment execution paths.

## Baseline Lock
- AI-1 is locked as the accepted baseline.
- AI-2 assets are additive and forward-only.
- No AI-2 contract may import or alter AI-1 live handlers by default.

## Multi-Knowledge Architecture
AI-2 separates knowledge into independently versioned domains:
- `core-policy`: governance, scope, and non-operational rules.
- `pilot-operations`: controlled pilot status, environment restrictions, acceptance state.
- `service-catalog`: curated service descriptions and non-transactional details.
- `support-playbooks`: verified response procedures for support flows.

Each domain entry includes:
- `sourceId`
- `sourceName`
- `language`
- `updateState`
- `knowledgeVersion`
- `lastReviewedAt`
- `tags`

## RAG Expansion Strategy
AI-2 RAG remains restricted and deterministic during preparation:
- Stage 1: lexical retrieval over approved knowledge collections.
- Stage 2: optional vector index contract (design and hooks only).
- Stage 3: controlled hybrid retrieval after separate DGR approval.

Hard constraints:
- No open-web retrieval.
- No unapproved corpus ingestion.
- Retrieval output must include source trace metadata.

## Tool Registry Contract
AI-2 defines a tool registry contract with explicit authorization states:
- `disabled`
- `pilot-readonly`
- `staging-approved`
- `production-approved`

Initial preparation rule:
- All tools default to `disabled`.
- Booking, payments, and operational write tools remain disallowed.

## Conversation Context Strategy
Context model for AI-2 preparation:
- Request scope: single request execution context.
- Session scope: browser/session bounded context window.
- Long-term scope: design-only contract (not active).

Priority order:
- Source-grounded context first.
- User text second.
- System fallback templates last.

## Knowledge Versioning
Versioning rules:
- Each source keeps monotonic `knowledgeVersion`.
- Deprecated entries are retained with `updateState = archived` (future state).
- Retrieval should prefer latest approved version.

## Prompt Versioning
Prompt contracts use semantic versions:
- `promptFamily` + `promptVersion`
- Change classes:
  - `patch`: clarity/no-behavior shift
  - `minor`: additive behavior
  - `major`: policy or response contract change

## AI Observability
Preparation observability model:
- Request ID
- Retrieval source IDs
- Grounding status
- Fallback reason
- Latency buckets
- Provider availability status

No sensitive logging:
- No raw secrets
- No access tokens
- No full personal payload dumps

## Future Agent Readiness
AI-2 prepares extension points for future orchestration without enabling agents now:
- Planner contract
- Tool policy evaluator
- Execution audit envelope
- Kill switch and environment gates

## Compatibility Requirements
- AI-2 files must be additive and isolated under dedicated namespaces.
- AI-1 endpoint contracts stay unchanged unless a new DGR explicitly authorizes change.
- Existing controlled pilot behavior must remain stable.

## Out of Scope
- Production AI traffic
- Booking writes
- Payments
- Tool execution enablement
- Long-term memory activation
- Unrelated refactors

## Approval State
Prepared for architecture review under EO-055.