# AI-1 IMPLEMENTATION CONTRACT v1.0

## Reference
- EO-AI-001
- DIR3COM Central Reference
- DGR-054: OPEN
- AI FOUNDATION: EXECUTE

## Purpose
Authorize the smallest safe AI foundation slice for DIR3COM without enabling production AI, booking writes, payments, agents, or long-term memory.

## Contract Status
- Foundation scaffold accepted.
- Next engineering slice approved only within EO-AI-001.
- Commit `79323a2` remains preserved as the baseline scaffold.

## Approved Domains
This contract now covers the nine EO-AI-001 domains below:
- AI Core Architecture
- DABRA Prompt Contract
- Approved Knowledge Sources
- Restricted RAG
- Memory Isolation
- Tool Authorization
- Grounding & Anti-Hallucination
- Arabic/English Behaviour
- Source Attribution & Traceability

## In Scope
- AI Core Architecture:
	- Stable server-side AI foundation entry points.
	- Deterministic fallback behavior when AI is unavailable.
- DABRA Prompt Contract:
	- Single assistant identity for controlled pilot use.
	- Safety-first instructions and scope boundaries.
- Approved Knowledge Sources:
	- DIR3COM-approved operational and policy sources only.
	- Explicit source approval and update-state tracking.
- Restricted RAG:
	- Retrieval limited to approved sources and scoped contexts.
	- No open-web or uncontrolled corpus expansion.
- Memory Isolation:
	- Session-scoped context only for the foundation slice.
	- No long-term memory persistence in this phase.
- Tool Authorization:
	- Read-only usage only.
	- No booking, payment, or write-capable tools in this slice.
- Grounding & Anti-Hallucination:
	- Refuse unsupported claims.
	- Prefer explicit uncertainty over fabrication.
- Arabic/English Behaviour:
	- Support Arabic-first responses with English compatibility.
	- Preserve natural phrasing and avoid literal translation style.
- Source Attribution & Traceability:
	- Surface source names and update status where applicable.
	- Preserve auditability of AI foundation outputs.
- AI Core skeleton:
	- Existing foundation endpoint and pilot surface.
- Secret protection and non-leakage guards:
	- No secret exposure, token leakage, or environment dumping.

## Out of Scope
- Booking writes
- Payments
- Long-term memory
- Tool calling
- Agents
- Production AI
- Unrelated refactors
- Database migrations
- OAuth changes
- Search foundation rewrites
- Production AI enablement
- Unapproved data-source ingestion
- Any agent framework or autonomous orchestration
- Any UI or API expansion outside the foundation slice

## Engineering Constraints
- Use only the minimum files required.
- Keep production AI disabled.
- Keep staging/controlled-pilot only for any AI secret wiring.
- Do not expose secrets, tokens, environment values, or provider credentials.
- Do not alter existing search or marketplace behavior.
- Prefer deterministic fallbacks when AI is unavailable.
- Treat the current code as a foundation scaffold, not a live conversational AI.
- Keep the API and pilot UI non-destructive and non-operational.

## Required Acceptance Conditions
- The AI foundation slice must compile cleanly.
- The server endpoint must return a safe, non-secret payload.
- The pilot UI must render the foundation status without enabling writes.
- The contract must explicitly cover all nine EO-AI-001 domains.
- The contract must preserve commit `79323a2` and remain compatible with the existing scaffold.
- The contract must not expand beyond EO-AI-001.

## Approval
AI-1 IMPLEMENTATION CONTRACT — COMPLETE & APPROVED FOR NEXT ENGINEERING SLICE