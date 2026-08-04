# AI-1 IMPLEMENTATION CONTRACT v1.0

## Reference
- EO-AI-001
- DIR3COM Central Reference
- DGR-054: OPEN
- AI FOUNDATION: EXECUTE

## Purpose
Authorize the smallest safe AI foundation slice for DIR3COM without enabling production AI, booking writes, payments, agents, or long-term memory.

## In Scope
- AI Core skeleton
- DABRA system prompt contract
- Initial knowledge base
- Server-side AI foundation endpoint
- Initial pilot UI surface
- Secret protection and non-leakage guards

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

## Engineering Constraints
- Use only the minimum files required.
- Keep production AI disabled.
- Keep staging/controlled-pilot only for any AI secret wiring.
- Do not expose secrets, tokens, environment values, or provider credentials.
- Do not alter existing search or marketplace behavior.
- Prefer deterministic fallbacks when AI is unavailable.

## Required Acceptance Conditions
- The AI foundation slice must compile cleanly.
- The server endpoint must return a safe, non-secret payload.
- The pilot UI must render the foundation status without enabling writes.
- The contract must not expand beyond EO-AI-001.

## Approval
AI-1 IMPLEMENTATION CONTRACT — APPROVED FOR ENGINEERING