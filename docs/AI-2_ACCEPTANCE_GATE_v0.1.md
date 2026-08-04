# AI-2 Acceptance Gate v0.1

## Purpose
Define the minimum acceptance gate for AI-2 preparation while preserving AI-1 baseline behavior.

## Gate Categories

### 1) Backward Compatibility with AI-1
- AI-1 API contracts remain unchanged.
- AI-1 pilot behavior remains stable.
- No regression in accepted AI-1 runtime checks.

### 2) Knowledge Accuracy
- Knowledge records must map to approved sources only.
- Version metadata must be present for each source.
- Unknown claims must produce explicit fallback behavior.

### 3) RAG Retrieval Quality
- Retrieval returns deterministic ranked candidates.
- No open-web retrieval in preparation stage.
- Retrieval output includes source traceability fields.

### 4) Source Attribution
- Every grounded answer must carry at least one approved source reference.
- Fallback answers must not fabricate sources.
- Source fields must include `sourceId` and update status.

### 5) Context Isolation
- Session context must not leak across independent sessions.
- Long-term persistence must remain disabled unless explicitly approved.
- Prompt context must remain scoped to approved contracts.

### 6) Performance Baseline
- Retrieval must remain bounded by deterministic limits.
- Response payloads must avoid unnecessary source bloat.
- Observability hooks must not degrade baseline latency beyond agreed thresholds.

### 7) Regression Against AI-1
- Re-run AI-1 acceptance matrix whenever AI-2 runtime integration is proposed.
- Any AI-1 regression blocks AI-2 promotion.

## Pass Criteria
- All gate categories pass.
- No security leak of secrets, tokens, or restricted provider metadata.
- No policy violations against booking/payment/tool restrictions.

## Fail Criteria
- Any AI-1 behavior change without approval.
- Any unapproved retrieval source.
- Any context persistence beyond allowed scope.

## Status
Draft gate for Development & QA Advisor review.