# Release 182: bounded DABRA correction

Owner: Codex Desktop. Task: #182. Base: `fae48a92a98da0507960b5deb108b62e295428fc`.
Independent functional reviewer: ChatGPT / Codex reviewer, Task comment 5919534280 (not a VS Code alias).
Final approvals and deployment evidence belong to the exact-SHA Task/PR record, not this implementation note.

## Product path

`/api/ai2/chat` retains deterministic, server-owned answers and role-scoped read tools.
The optional classifier now supports OpenAI, Gemini, Anthropic, xAI, DeepSeek, Qwen and Mistral through the existing transports.
It selects a read tool only; it cannot return facts, prices, URLs, SQL, permissions or transactions.
Only an authenticated ambiguous discovery message enters classification. Explicit service searches and guest discovery remain deterministic.
Only the current message (up to 500 characters) reaches the provider, never request rows or chat history.
This is seven-provider **intent classification**, not seven generative personalities or autonomous booking agents.

Server-only opt-in configuration:

- `DABRA_INTERNAL_AI_ENABLED=true`; otherwise existing deterministic behavior remains active.
- `DABRA_AI_PROVIDER`: one of the seven lower-case identifiers; defaults to `openai`.
- Existing provider API key and explicit `DABRA_<PROVIDER>_MODEL` are required. OpenAI also accepts the existing `DABRA_INTERNAL_AI_MODEL` priority override.
- Existing Gemini and Qwen credential aliases are retained. No keys or model discovery run in the client.
- `DABRA_PROVIDER_FALLBACK_ENABLED=true` opts into at most one configured alternative, only on timeout/upstream failure.
- Per attempt: six seconds; overall: twelve seconds. One concurrent classifier request and twenty provider attempts/hour **per process**. This is not a fleet-wide spend cap; provider account budgets remain necessary.
- Auth, quota, invalid response, unconfigured provider and unsafe tool output do not fan out to other providers. Safe deterministic answers remain available.

No configuration is enabled on Production by this commit. Public answer provenance remains `local` because facts come from DIR3COM; understanding-provider metadata is separate.

## Context and truth

Explicit negative book/pay/cancel/refund constraints no longer override discovery intent.
Bounded user-only context carries dates, city, party size, rooms, currency and catalogue refinements. Explicit new-trip resets and latest destination corrections win.
Dates are validated, date-only input never invents a pickup time, and unsupported destinations never inherit Egypt rates as local supply.
AR/EN switching preserves the conversation while identity changes still clear private state and cancel stale streams.
An explicit chat currency updates the existing currency selector and request consistently; supplier catalogue amounts are unchanged.
Generated hotel links preserve room count. Execution parameters remain outside the link allowlist.

## Evidence boundaries

- Live provider verification used the actual POST handler with an isolated authenticated Customer fixture and real upstream transports. All seven returned valid intent in AR and EN; this is not proof of browser authentication or Production configuration.
- xAI initially returned non-JSON output despite HTTP 200; strict structured-output mode corrected it. Validation still rejects extra fields and unknown tools.
- Existing matrix tooling is labelled direct/legacy-only, clears both Gemini key aliases, restores environment, and exits non-zero if any required cell is not PASS.
- Browser verification uses the locally built app and ordinary controls. Anonymous UI checks do not imply authenticated model routing.
- Accepted Drive TEST/QA and Stay sandbox evidence in Task #182 is retained, not repeated. No new request, booking, payment, supplier contact, outbound message or data migration is part of this correction.
- Final Preview, CI, Sandbox, governance and independent security/functional evidence must be recorded separately. This note is not release approval.
