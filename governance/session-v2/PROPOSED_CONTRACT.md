# Verified-session governance v2

This evolves PR86 and PR115/Task116. PR68 product/auth/request code is outside scope. Surface strings are observed provenance, never review authorization. There is no Task196 exception path.

## Trust contract

Task/PR declare version2, implementer/independent-reviewer roles, full session UUIDs, truthful surfaces, exact repo/Task/PR/branch/base/head SHA, bounded scope and receipt IDs. These declarations remain untrusted until bound by a certificate signed by an independently enrolled authority. Review certificates include independently observed session provenance, SHA256 of runtime evidence, all known implementation/fix participants, and independently performed scoped PASS receipts. Governance/security-policy edits require separate functional and security-policy reviewer sessions; neither may be an author. Scope must come from the GitHub changed-file query plus approved-base policy, not solely PR text.

Authority enrollment is a trust decision, not a display-name correction. Its private signing capability must remain outside PR-author/implementation-agent/shared-GitHub-account control and outside repository/CI. The certifier verifies actual session ownership, runtime observation and participation audit before signing. A signature authenticates the certifier's statement; it does not magically prove an honest audit. If no independently controlled certifier/session evidence exists, the system remains BLOCKED. UUID inequality, a shared GitHub comment author, app names and human nicknames are insufficient. Public-key enrollment must receive independent security/policy review and explicit activation authorization.

The approved-base policy `.github/policies/codex-governance-trust.json` contains version2, requiredScopes and authority records: id, purpose=session-review, publicKey (Ed25519 SPKI PEM), repositories and optional revoked=true. This candidate intentionally ships `authorities: []`, so no current artifact can pass merely by installing it. No production private key was created or provisioned. Tests generate ephemeral synthetic keys in memory only.

## Canonical evidence format

A Task comment carries canonical JSON (exact `JSON.stringify` representation) with keyId, payload and signature. Payload and Ed25519 signature use canonical base64. The signature covers exact payload UTF8 bytes; decoded payload must be canonical JSON, excluding duplicate-key ambiguities. The fetched proof comment must match its numeric ID and Task API URL. Payload includes:

- version2, repository, task `#N`, pr number, sha, baseSha, branch and exact scope;
- ownerSession and authorSessions (all implementers/fix participants, normalized UUIDs);
- issuedAt/expiresAt, valid now with at most30-day lifetime;
- sessions: id, verified=true, surface, observed source and runtimeEvidenceHash;
- reviews: unique scope, verified session, exact receipt ID/bodySha256, role=independent reviewer, authorship=none, verdict=PASS.

The primary functional session and receipt match Task/PR reviewer fields. Each scoped receipt is independently fetched from the same Task and hashed exactly as its API body. It has unique bullets for Governance version, Task, PR, Target SHA, Evidence scope, Implementation session, Reviewer session, Reviewer role, Reviewer authorship and Review verdict. Missing, modified, foreign, expired, unproved or scope-mismatched input fails closed. Revoking the authority prevents future validation; approved trust updates must follow the protected publication process.

## Deployment and migration

Workflow token scopes/events remain read-only/unchanged. Checkout explicitly selects the event's immutable base SHA; candidate PR keys or validator are not loaded. Adapter independently checks current PR head/base against the event before reading Task/receipt/file APIs. The module retains original v1 logic only behind `mode: historical`, with decision HISTORICAL_ONLY and releaseAuthorized=false. Default legacy validation fails current approval. Historical receipts/records are never rewritten as v2 certificates or new-SHA approvals. Templates require session proof across all surfaces, not only Work Mode.

Local candidate tests do not establish an activated trustworthy repository check. Workflow code in a candidate PR can itself be modified; base checkout within it is not by itself a cryptographic protection of the entire runner. Publication must ensure that the required workflow/validator/policy are the independently approved versions on the protected base and that repository enforcement prevents a candidate from replacing its own authoritative check. This is a live deployment/enforcement prerequisite, explicitly unresolved here; no branch protection, workflow permissions, credentials or security settings are changed by this local task. Do not trust a candidate-provided successful status as activation evidence. If the host cannot supply this trusted execution boundary without separately approved configuration, keep publication/activation blocked.

The new workflow cannot bootstrap its own new module/authority from the candidate PR; old-base/unavailable policy is not an authorization path. Transition requires an independently reviewed, explicitly authorized publication sequence while keeping the old live gate enabled. Existing v1 fixture replay preserves old behavior for historical interpretation only. Fresh v2 evidence must be gathered for a new artifact; Task196 technical reviews and owner exception remain scoped to3be8518 and are not a signature/enrollment grant.

## Decisions and limitations

Success means REVIEW_PROVEN only, never merge/Production permission (`releaseAuthorized=false`). Explicit human merge and Production decisions remain separate and must bind the intended artifact/actions under PR86/115 rules. No role or receipt PENDING is approval. A formally authorized local BUILD can have PENDING review assignment; publishing requires independent functional/security-policy review of the immutable candidate.

The system depends on truthful trusted authority enrollment and a complete authorship audit. A compromised/agent-controlled signer, false audit, unrecorded author, or untrusted workflow enforcement defeats that boundary. Do not describe signed statements as omniscient proof or claim specialized TAC coverage. This local implementation makes unresolved trust visible and fails closed instead of accepting fabricated independence.

## ES-module and missing-base transition

Current validation is codex-governance.mjs with codex-session-proof.mjs; the Actions CommonJS bridge uses dynamic import and does not require lint exceptions. The historical cjs API never approves current review. Missing approved-base policy/loader/module emits BASE_TRUST_UNAVAILABLE and a BLOCKED summary before API receipt reads. Invalid/empty approved-base policy emits BASE_TRUST_INVALID/BASE_AUTHORITY_UNENROLLED. No candidate files or old surface gate can turn those states into PASS. A legacy base such as78805415542f6609bfa135daa1a1148fadecd6e4 therefore remains deliberately blocked pending separately authorized trust/activation.
