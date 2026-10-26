# Task166 bounded customer notifications

Owner session: 01a03b33-7379-7f40-882c-975a4052a573.
Base: a6915daddcb075731e2ee55cd876f79b340a4b23.

## Contract

An operator arms exactly one future natural lifecycle event while send and capture
are OFF. Approval binds the customer, verified subscription/contact, request
reference, expected version, action, language, sender, signed-webhook identity,
expiry and preallocated outbox identity. The existing lifecycle trigger alone
captures the matching new event. No retrospective capture or fabricated event is
provided. For `created`, the request reference is the existing deterministic
reference for the customer's idempotency key; the request must not exist at arm.

Other actions require the existing owned request and current context version.
The natural transition must advance that version exactly once. Atomic capture
creates one shared outbox row and one shared execution window. Customer windows
are webhook-only, at most nine minutes, and retain one durable send intent.

Claim and begin recheck the immutable approval, actual event and current
eligibility. Consent/contact/language changes, stale state, expiry, disabled
gates, replay and concurrent workers must fail closed. Generic claims must never
pick bounded customer rows, including after a later mode change. Stop/expiry
disable capture and sending but retain evidence. Operations-only provider-query
behavior and historical windows remain unchanged.

## Implementation and verification

One forward migration owns binding/capture/claim/begin/stop checks. The existing
shared sender and signed receipt implementation remain authoritative. Tests use
natural synthetic request/review/quote/customer-accept RPCs and a provider stub
that cannot access the network. Real PostgreSQL concurrency is a separate gate;
in-memory tests cannot substitute for it.

Rejected alternatives: enabling general dispatch could claim old rows; widening
only the window category does not capture a new event safely; manually inserting
an outbox row loses the atomic lifecycle boundary.

## Release boundary

This source repair authorizes no Production SQL, credentials, enrollment,
switches, webhook subscription, real provider call or message. Actual template
readiness and precise recipient/content/purpose require separate acceptance.
Rollback is gates OFF with records retained, never replay or queue broadening.
