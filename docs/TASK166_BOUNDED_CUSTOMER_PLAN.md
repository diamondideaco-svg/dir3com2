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

## Sandbox image prerequisite

The original job hid Docker stderr behind `GOTRUE_IMAGE_PULL_FAILED_WITHOUT_QUOTA`.
Read-only inspection on 26 October reproduced `manifest verification failed` for
the primary registry's compound `tag@digest` reference. The same registry's
canonical `repository@digest` returned the approved 1431-byte amd64 manifest;
SHA-256 computed from its raw bytes equals the existing pinned manifest digest,
and its config digest also matches the existing pin. No image version, registry,
digest, credentials or quota-only fallback rules change. Focused injected-command
regressions cover canonical pull/tag, verified cache, bounded quota fallback and
fail-closed nonquota errors. These regressions do not substitute for a successful
real Docker pull and complete hosted Sandbox run on the new exact head.

The first hosted attempt exposed a data-limit registry message and failed closed.
Its one normal retry reached post-pull verification instead, revealing an image
identity compatibility gap. Docker's containerd image-inspection implementation
returns the target manifest digest as `Id`, unlike legacy config-digest `Id`.
The shared verifier retains exact approved repository/manifest/platform checks
and accepts either the approved legacy config Id or the same approved single
manifest Id with its matching descriptor. No arbitrary manifest/index or new
digest is accepted. The manifest cryptographically binds the approved config and
layers. Both GoTrue and the existing PostgREST/Storage prerequisite use this
identity check so the same incompatibility does not recur at the next image.
Quota classification is unchanged; no registry credentials or skips are added.

Docker's containerd error translator may omit the OCI error code. The exact new
ECR data-limit renderer therefore triggers only a bounded, native, read-only
`docker manifest inspect` for the SAME pinned primary reference. It is not itself
quota evidence. Only the original strict `toomanyrequests: Data limit exceeded`
predicate returned by that probe corroborates quota. A successful read, missing
OCI code, auth/TLS/network error or mixed response stays fail-closed. Probe
diagnostics are redacted; no manifest output, token, new credential or registry
is introduced. Existing pull retry counts, delays, approved fallback and all
image/config/identity verification remain unchanged.
