# DABRA internal agent — role readiness

Date: 2026-09-28. Task #172 / Draft PR #173. Owner: Codex — ChatGPT Work Mode.
Branch: `fix/drive-pricing-dabra-internal`.
Scope extension is recorded in Task #172. No other implementation owner or Desktop/VS Code execution is claimed.

## What runs

The public chat and floating assistant share `/api/ai2/chat`. The new internal agent can select and run read tools. Identity comes from the existing verified Supabase session, active canonical profile, pinned CEO identity and fresh Operations grant. Neither a chat persona nor model output grants access. No new role, schema, privileged client or write path is introduced.

| Role/use case | Implemented behavior | Remaining limit |
| --- | --- | --- |
| Concierge | Internal Drive model/budget search, original and display prices, dates, six-hour guidance, links into the existing REQ flow; Stay discovery handoff | Stay remains Sandbox. Fly and commercial Concierge remain Coming Soon. No new supplier search is invoked by chat. |
| Customer service | Reads own recent requests or exact REQ, recorded quote and currency, current lifecycle state, expired-quote warning, support guidance | Authenticated browser validation needs an isolated QA session; no Production test request was created. |
| Call center | Prepares a record-backed reply draft for a specific authorized REQ; distinguishes drafts from sent messages | This is call preparation, not a telephone agent. Telephony/WhatsApp delivery integration is absent in this repository path and approved sender/receiver/webhook evidence is missing. |
| Admin / scoped staff | Reads latest 20 managed Drive requests through the existing Egypt Operations permission and RLS; exact-reference reply drafts | Egypt managed Drive scope only. Other countries and unrelated business tables are not silently included. No quote/status/publish action is executed from chat. |
| CEO | Summarizes states of the authorized recent Egypt Drive requests using the pinned active CEO identity | A bounded operational snapshot, not a full finance dashboard or revenue report. |

## Model understanding and external search

The existing legacy runtime couples model answers to web-search adapters, and some old search adapters are mock-only. They are not presented as active capabilities.

The optional `agent-planner.ts` uses the existing OpenAI-compatible runtime at the fixed OpenAI API host, without web/search tools. It accepts exactly one allowlisted tool name, never an answer, price, URL, SQL, identity or scope. The server supplies the final facts. It receives only the current bounded user message, never request rows or history.

It is called only for authenticated ambiguous messages when `DABRA_INTERNAL_AI_ENABLED=true`, an existing `OPENAI_API_KEY`, and an explicit `DABRA_INTERNAL_AI_MODEL` are configured. The model call has a six-second timeout, zero retries, one in flight and at most 20 calls/hour **per process**. This is not a distributed quota; provider account budget must be set before broad enablement. No settings were changed or paid model calls made in this delta. No approved model credentials exist in this execution environment; live inference is therefore not verified. Core internal tools keep working without inference.

## Connected utility tools

DABRA now routes explicit currency-conversion requests to the existing FX service (source/target/amount and dated rate, never a transfer), Cairo weather to the existing Open-Meteo-backed weather tool, and maps to the existing internal destination-map UI. Another city is not silently replaced with Cairo. No external web-search tool is introduced.

## Privacy and transaction boundaries

- Customer queries retain explicit `user_id` ownership plus RLS.
- Operations queries require `operations:read`, Egypt scope and the joined context country filter before reading rows. No service-role client is used.
- CEO access uses the pinned server identity; `user_metadata` and typed role claims cannot elevate access.
- Revocation is re-read on the next request. Error, forbidden and empty results are distinct.
- Replies expose allowlisted reference/status/quote fields, no customer contact, private notes or arbitrary DB links.
- Private replies stay in the current conversation and are removed from browser history persistence. Account changes clear/abort the floating session too.
- REQ state is never translated to paid/booked. Drafts are not sent. No booking, payment, supplier communication, request acceptance or other mutation is added.
- UI links use an explicit local path allowlist. No competitor referrals or external search fallback.

## Verification scope

Use `tests/dabra-internal-agent.test.ts` for intent, roles, state truth, prices, drafts and safe output. Use `tests/dabra-agent-authorization-runtime.test.ts` with `--conditions=react-server` for the real Supabase query builder and canonical authorization functions over an isolated test transport (no network/database mutation). It verifies owner filters, country restriction, grant revocation, inactive/deleted profiles, pinned CEO and model payload validation. These tests do not substitute for an authenticated database/browser journey.

Existing voice, WhatsApp, family, commerce and streaming regression tests remain applicable. Voice UI/TTS is not proof of a working telephone number; a wa.me handoff is not message delivery.

## Consolidated release blockers

1. Independent functional/security review of the final delta is required by BR86. This owner cannot self-approve. No separate reviewer was started or impersonated.
2. Authenticated role browser QA requires an approved isolated Auth/DB session. The local executor has no such session. Anonymous Preview tests are reported separately; 390px is not claimed when viewport control is unavailable.
3. Live optional model understanding requires approved model/key/config and account spend control; values must use the secret mechanism, not chat. Current implementation is a bounded internal tools agent, not unrestricted autonomous AI.
4. Real phone/WhatsApp operation needs an approved business sender/number plus inbound/outbound delivery integration and callbacks. Task #166/#171 channel work is not silently marked complete or replaced with handoff links.
5. The previously prepared car-price migration and coordinated application release are still pending; no Production price/config/data change is part of this role delta.

No Production release, message delivery, real transaction, mobile pixel PASS, live model PASS, or independent Security PASS is claimed by this document.

## Local delta verification

- Focused role, commerce, currency, channel-boundary, voice, family and stream tests: 114/114 PASS.
- Canonical authorization + real Supabase query-builder transport and constrained model-payload tests: 14/14 PASS.
- The 128 tests above are distinct. No Production DB/model/provider writes or communications were used.
- Typecheck PASS. Final build/lint and exact-SHA cloud/Preview results are recorded in the Task/PR completion comment.
