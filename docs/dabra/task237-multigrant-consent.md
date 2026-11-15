# Task237: multi-grant selection and consent preparation

This source-only change does not create real decisions, notices, consents, grants,
authorities, credentials, a pilot configuration, or provider calls. The forward
migration is not authorized for production merely because it exists in source.

The multigrant migration `20261114181805_task237_multigrant_successful_task.sql`
was applied once to DIR3COM Core and is recorded under version `20261114181805`.
On 2026-11-15 a read of the migration ledger returned the matching name and SQL
MD5 `17fdab200f46192d9a3f1d0089271c46`; the source SQL has the same MD5 and
SHA-256 `d7df82945cb7ddb2652ff26f33c0a0ba059a1766350efa9f91300df0df3a4324`.
The `production_apply_authorized: false` manifest field means the source record
alone grants no future production execution; it does not mean the recorded
historical application did not occur. Do not reapply the SQL or rewrite the
ledger. Supabase's migration history should cause a normal migration push to
skip this recorded version; this observation does not authorize any push.

The 2026-11-15 production catalog metadata read found one overload for each
function below. Each owner was `postgres`, each `proconfig` was
`search_path=""`, and exploded EXECUTE ACLs were as follows. This is a
metadata observation, not a comparison of complete function definitions.

| Function | Security | EXECUTE grantees |
| --- | --- | --- |
| `public.resolve_dabra_successful_task_decisions` | definer | postgres, service_role |
| `public.reserve_dabra_production_task` | definer | postgres, service_role |
| `public.get_dabra_production_task_policy` | definer | postgres, service_role |
| `private.dabra_production_task_terms` | invoker | postgres |
| `private.dabra_task_multigrant_current` | invoker | postgres |

The metadata query and `has_function_privilege` check showed no EXECUTE grant
to `PUBLIC`, `anon`, or `authenticated` on those functions. It did not read
or export their full definitions.

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

## Operations and incident boundaries

V3 fails the entire decision closed if any listed grant is missing, disabled,
changed or unavailable under its row lock. Removing a provider from the
approved set requires a genuine revised decision and matching current evidence;
simply disabling one listed grant makes the whole decision unavailable.

Selection is deterministic by the approved quote and tie-breakers. It has no
provider-health signal and makes one attempt: a selected provider failure does
not trigger another provider, and an admitted cost remains held even if the
attempt fails. An unusable cheaper provider can therefore consume repeated
approved attempts until operators intervene; stop the affected operation rather
than interpreting the cost cap as extra approval.

`DABRA_AI_PROVIDER` is deliberately ignored for V3 and is not an emergency
exclusion control. A server key that no longer matches a grant's bound credential
causes that pair to be rejected before admission; removing or rotating a key can
affect every use of the shared server configuration and requires the normal
credential-change authorization and deployment process. Verify the active
deployment and the intended scope before any such action. Never replace a
grant's proof or claim qualification to make another pair eligible.

The browser test's `google-chrome --version` preflight allows 20 seconds after
one observed five-second cold-start timeout; `chromedriver --version` remains
bounded at five seconds and the actual versions must still match. The earlier
`ECONNRESET` had no phase marker and its cause was not established. A later pass
does not prove that timeout adjustment fixed that failure; investigate a future
reproduction using the recorded phase diagnostics without provider calls.

Follow-up task: if the browser sandbox `ECONNRESET` recurs, preserve the raw
phase marker and logs, identify whether the reset occurred during Chrome startup,
WebDriver connection or application navigation, and fix the evidenced cause.
Do not mark the incident resolved based on the changed version-command timeout.
