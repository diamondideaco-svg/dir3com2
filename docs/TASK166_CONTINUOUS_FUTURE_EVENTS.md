# Task166 continuous future-event candidate

Local follow-up to the bounded current-state artifact in Draft PR216. This source
does not enable notifications or apply SQL. The original current-state migration
is unchanged. Its prior review does not approve this new candidate.

## Service contract

`prepare_kapso_continuous_service` accepts explicit existing subscription/action
scopes, sender, webhook, template map, approval reference and a message-count daily
limit. It snapshots consent reference, verification time, phone, language, actor,
country and actual template. No enrollment or consent mutation occurs. It creates
an inactive generation only. Exact repeated preparation converges; changed binding
parameters conflict. The limit is not a monetary-price estimate.

`activate_kapso_continuous_service` compares the expected active generation and
establishes a database-clock activation time once. It cannot renew a stopped or
previous generation. Replacement is atomic, with no global OFF/ON cycle. Active
bounded windows/authorizations prevent activation. Capture/send flags and budget
counters do not change during preparation or activation.

The natural Drive event trigger captures only transactions beginning after this
activation and only exact authorized recipient/action/language scopes. It does not
scan existing events or fabricate lifecycle events. Old requests can have genuine
NEW lifecycle events, but old events are not replayed. Request retry still uses
the original atomic event/outbox uniqueness. Current owner, active profile,
verified consent/contact and Operations country grant remain mandatory.

Rows carry their service scope and exact request version. Claim/begin validate the
active generation, unchanged subscription snapshot, owner, country, current state,
version, future pickup, quote expiry where applicable, sender and actual configured
template. NOWAIT locks fence concurrent lifecycle/consent/grant changes. No lock
spans HTTP. Ordinary general/Twilio/target/provider-query consumers cannot claim,
begin, reclaim or repurpose these rows, even after a later mode switch.

Subscription contact/consent/verification/enable changes, profile authority changes
and Operations grant changes permanently revoke the affected private scope. They
do not modify consent or global service gates. Restoring an old field or toggling
enabled back on cannot revive its old pending events. Other recipients remain
active; renewed authorized scopes require a new activation fence.

The existing server-only POST dispatch endpoint gains an explicit `continuous`
mode, signed-webhook-only and lifecycle-only. It processes one eligible row per
authenticated invocation through dedicated claim/begin RPCs, then reuses the
existing transport and finish path. No client controls the recipient or body.
The shared global daily budget and explicit generation daily allowance apply.
Each row allows one durable network intent. Unknown and accepted are never
resent. Pre-intent lease expiry and per-row 24-hour staleness remain enforced.

## Completion is not service shutdown

A message completion or callback does not stop the service. Legacy bounded-window
stop in continuous mode updates only that window/authorization/notice evidence.
It preserves global capture/send and does not request deactivation of a webhook
used by the active service. Legacy behavior outside continuous mode is retained.
The explicit service-stop RPC stops its generation, not another service's flags.
The existing global send kill switch remains authoritative before any intent.

Signed early receipts are bounded private evidence, not delivery attributed by
phone. Only the actual stored WAMID/sender/recipient match permits attribution.
An unmatched inbox is limited to eight rows per service/phone and never silently
purged or used to retry. Duplicate identity conflicts fail closed. Late receipts
can update a known row after a service stop without creating a new send.

`kapso_continuous_health` returns mode/gates, service state, last worker/receipt
times, shared and service limits, and pending/stale/unknown/failed/unmatched counts.
It exposes no phone, customer, request reference, secret or lease token. Private
tables use RLS and deny direct writes to caller roles. Public control RPCs are
service-role-only; private aliases have no direct caller EXECUTE privilege.

## Deployment and operational boundaries

Continuous means the authorized service stays available for new events; a new
inactive component is not a functioning service to be switched off as cleanup.
Do not remove deduplication, cost caps or an emergency kill switch. Use a reviewed
forward repair with sending safely controlled if a defect appears; never restore
weaker grants or delete attempts/receipts to produce a new send.

This candidate does not install a scheduler, purchase anything, add keys, change
enrollment, inspect current provider bodies, activate flags or send messages. An
authorized recurring invoker of the existing authenticated endpoint and monitored
failure response are still required to prove continuous LIVE operation. No running
invoker, delivery SLA, provider approval or recipient reply is claimed by source
or local synthetic transport tests.

Before live activation, separately verify exact source/deployment/database
bindings, recipient consent and contact, approved template text/components/order,
runtime mapping, sender/webhook, actual agreed consumption ceiling and operator
authority. Historical provider template observations are evidence of those
observations, not a live activation grant. No old trial spend limit transfers by
inference. Do not disable a working channel as routine trial cleanup.

## Local proof

`node scripts/test-kapso-current-state-local.mjs --scope=continuous` uses an owned
temporary PostgreSQL17 cluster and synthetic actors. It runs the new delta only,
including real independent connections and the actual request-create RPC, while
injecting external transport. It does not repeat the old 235/247/519 suites.

`node --import tsx --test tests/kapso-continuous.test.ts` checks closed config,
authenticated POST, dedicated intent, no resend and no shutdown calls. The
protected-Operations fixture additionally installs both new forwards AFTER the
shared notification prerequisites; none are skipped to obtain Sandbox PASS.
Exact counts, hash, commit, separate reviews and remaining limits belong in the
existing private handoff after the checks finish.
