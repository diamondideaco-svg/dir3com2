# Task166 current-state notice, local candidate

This is a source-only follow-up to merged PR215. It does not enroll a recipient,
activate a gate, backfill an event, change a request or contact a provider.
The implementation contains no production request, account or phone identifiers.

## Contract

`prepare_kapso_current_state_notice` is service-only. It accepts exactly one
existing request in EG at version0/request_submitted, two explicit subscriptions,
the approved sender/webhook/template identities, approval reference and expiry.
Subscription consent, verified contact, customer ownership and current Operations
country grant are required. A request phone is not subscription authorization.

Preparation keeps capture/send OFF and creates one immutable intent and one
shared outbox row per party, atomically. The semantic unique key excludes the
approval ID, so different approvals cannot duplicate a notice. Changed binding
parameters conflict. Both original outbox dedup keys remain in force. The real
created event is read-only provenance, never a new lifecycle cause or timestamp.
The separate action is `current_state`; no lifecycle row is inserted or changed.

`open_kapso_current_state_window` derives a target from the intent, never from an
arbitrary phone or body. Windows run serially through the existing singleton,
with the original intent deadline, at most nine minutes from preparation. No
operation enables send. An actual operator activation remains a separate gate.

The targeted claim and `begin_kapso_current_state_notice` recheck bindings and
eligibility. Begin also matches the actual configured template. The existing
lease, global daily budget, durable intent, finish/WAMID and signed-webhook chain
remain authoritative. NOWAIT request/context/subscription/profile/grant locks
fence conflicting mutations without introducing a settings/lifecycle deadlock.
No lock is held over provider HTTP. A confirmed stale binding stops the intent;
it cannot be repaired or rebound automatically.

One network intent per party is permitted. Accepted/unknown outcomes, lost
completion and expiry never authorize resend. Late receipts require an exact
recorded WAMID/sender/recipient match, or the existing bounded early-receipt
mechanism. They update evidence only and cannot stop another active target.

General claim/lease housekeeping, legacy Twilio and provider-query cannot claim,
begin or repurpose notice rows. Twilio's action/template contract is unchanged.
Only the Kapso targeted parser accepts the new closed variant.

## Stop and operational limits

`stop_kapso_current_state_notice` preserves intent, rows and receipts. The existing
window expiry/stop fence closes the active send gate. All claim/begin/open paths
enforce hard TTL even if a process dies; no scheduler was added. Physical flag-OFF
and webhook deactivation must still be read back during a later authorized live
cleanup. Runtime expiry is not a claim that an unattended SQL flag updates itself.

This source does not create/enable subscriptions or alter verified_at/consent.
It does not verify provider-approved template text, real delivery or actual
provider billing. A live bundle must separately authorize exact recipients,
templates/text/languages, sender/webhook, combined consumption ceiling and stop.
Historical Task199 approvals and rows do not transfer to this notice.

## Local verification

`node scripts/test-kapso-current-state-local.mjs` uses an already installed
postgres:17 image, a task-owned tmpfs cluster, dedicated Docker bridge and
127.0.0.1-only port54339. No image pull, host mount, remote DB or provider call.
The wrapper verifies its own resource identities and removes only those resources.
The existing database guard is retained and scope=current_state skips the accepted
247/519 suites. Real independent PG sessions exercise concurrency and revocation.

`node --import tsx --test tests/kapso-current-state-notice.test.ts` covers the
closed type/config/target branch. Relevant legacy parser/transport tests run by
name selection, not the old unrelated full matrix. Final counts and immutable
SHA belong in the private handoff after verification, not guessed in this plan.

Migration is a new SOURCE forward only, registered as not production-authorized.
Previous applied migrations and the accepted6b source remain unchanged. No push,
PR, CI/Sandbox, merge, deployment or production acceptance is implied. Independent
functional and security reviews must evaluate the future fixed local SHA; prior
PR215 receipts do not approve this delta.
