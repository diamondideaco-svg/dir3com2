# Task237: multi-grant selection and consent preparation

This source-only change does not create real decisions, notices, consents, grants,
authorities, credentials, a pilot configuration, or provider calls. The forward
migration is not authorized for production merely because it exists in source.

## One spending decision, multiple bound grants

`dabra-task-spending-v3` preserves the existing spending-v2 fields and adds
`grantBindings`: an array of 1–7 exact `{grantId, proofSha256}` objects. Grant IDs
are lowercase canonical UUIDs in strictly ascending order; proof hashes are
lowercase SHA-256 of the corresponding existing Core grant proof. `grantId` on
the spending document remains the existing anchor, and its array entry must match
the decision row's actual `funding_grant_id` and `funding_proof_sha256`.

Core resolves and locks each existing grant and requires it to remain enabled,
authorized, in bounded-account-charge mode, and exactly equal to the approved
proof hash. Every listed binding must remain current: a revoked, changed, missing,
or locked grant makes the selected policy unavailable, including reads of tasks
bound to that decision. This conservative all-bindings behavior is an explicit
availability tradeoff; it must not be presented as partial provider activation.

The selected authority must come from a bound grant and must retain its existing
model/profile/output-acceptance, proof, pricing and tier guards. The existing
one-attempt limit and account/platform liability counters are shared across all
bindings. V1 and V2 remain single-grant; V1 remains economy. The V3 bundle is
stored and revalidated on replay, completion, and read through the existing Core
decision resolution. V3 binds automatic selection into its task digest, so a
global provider pin cannot narrow its eligible bound grants. V1/V2 and legacy
routing retain the existing provider-setting behavior. Automatic selection picks
one qualified candidate before admission; it is not provider retry or fan-out.
For V3 only, before ranking, candidate profiles and their matching grants must fit
the decision's lease and token ceilings and their quote calculated from the
reviewed tariff and grant's all-in additional charge bound must fit its per-attempt
cost ceiling. Each candidate is a specific qualified profile, bound grant,
authority, output acceptance and currently matching server key; eligible pairs
are ranked by this quote, then deterministic tie-breakers. Repeated profiles on
other grants do not substitute their acceptance or key for the selected pair.
The estimate uses the same integer calculation as the later quote; it creates no
pricing observation. The selected provider's price is still refreshed and Core
checks the actual quoted cost and decision atomically at admission. The
measured profile cost ceiling remains an independent qualification bound, not the
decision's per-attempt quote. The request preparation timeout is separate from the
Core lease, which starts at reservation. V1/V2 retain their previous limits and
routing semantics. This is not a qualification or spending authorization.

## Consent preparation independent of execution

`DABRA_SUCCESSFUL_TASK_CONSENT_CONFIG` is an optional server-only value with exact
keys `schema`, `revision`, and `actorId`, where schema is
`dabra-successful-task-consent-pilot-v1`. It uses the same revision/account
validation as the execution configuration. Its absence retains the existing
consent behavior. An invalid value makes notice/grant unavailable.

The consent route alone reads this value; it never selects the task execution
path. If both consent and execution configurations are present, the actor and
revision must match. Status and withdrawal remain independent of those gates.
The actual account session, the four administrative decisions, and the approved
notice in Core remain required; displaying a notice is not consent. The account
must grant consent itself. Do not set the execution configuration until its
separate prerequisites are complete.
