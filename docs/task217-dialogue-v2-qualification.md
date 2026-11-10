# Task217 dialogue-v2 qualification route

This source change adds a measurement recipe, not provider qualification or authority to spend. No profile, acceptance, grant, public policy or credential is installed by it.

## Explicit recipe selection

- Existing `--measure-first-profile` and `--measure-platform-units` behavior remains separate.
- `--measure-platform-dialogue` selects only `platform-dialogue-v2` and requires a stored `task217-platform-dialogue-measurement-v2` permit. A units-v1 permit cannot be reused, relabeled or selected by this command.
- The existing `DABRA_DIALOGUE_FUNDING_POLICY`, measurement subject and plan ID selectors still apply. The command does not load dotenv, provision credentials or authorize a plan from environment values.
- The loader pins the selected recipe through every authority refresh. The runner also rejects a mismatched plan kind, schema, source, input digest or output contract.

## Canonical inputs and results

The eight existing synthetic dialogue cases cover initial planning, follow-up, topic change and privacy boundaries in Arabic and English. Their provider messages are generated with the actual server payload projection and prompt. Each selected language requires all four cases in canonical order with distinct request IDs. Input hashes, complete contract digests and the unchanged case-set hash are bound into the financial authority tuple.

The runner uses the existing reservation and transport boundaries, retains unknown holds, and stops on an uncertain admission/send without retry. Replies pass through the actual closed dialogue-v2 parser and the guidance options supplied for that case. Successful measurements remain `qualified: false` with independent semantic review required. They do not automatically become accepted profiles or public authority.

## Financial and compatibility boundaries

The non-renewing task envelope, per-provider lifetime ceilings, daily limits, source and credential checks, pricing refresh and conservative holds are unchanged. A new permit is not a new allowance. The existing SQL admission preflight must reject a complete selected case group that no longer fits. In particular, a bilingual eight-case plan cannot fit the current per-provider limits, and four fresh cases may not fit a provider with historical admissions. No counter reset, refund or larger envelope is part of this change.

The forward migration preserves the merged migration bytes and every historical manifest tuple. It appends the eight exact dialogue input definitions and extends only the qualification validator's explicit recipe selection and per-language case count. Existing financial validation, binding digest calculation, admission functions, ACLs and RLS remain unchanged. Its registry entry denies Production application.

## Verification and operational handoff

- Focused offline tests exercise canonical inputs, strict permit parsing, explicit loader/CLI selection, four-case AR/EN measurement, legacy compatibility, changed authority/source/credential, unknown holds, invalid output and SQL source preservation.
- The public-dialogue disposable PostgreSQL suite includes a focused forward test for historical state and function ACL preservation, both recipes in each language combination, and rebound malformed permits. It requires the existing loopback-only disposable database target. Source checks are not SQL execution evidence.
- Before live use: obtain exact-source review and applicable repository/isolated PostgreSQL checks; separately authorize source publication, SQL application and any new measurement authority or financial scope needed. Check actual remaining capacity and provider/account evidence. Run only explicitly approved complete cases and preserve unknown outcomes.
- Genuine independent semantic acceptance and explicit public authority remain separate steps. This route never opens stronger-model selection or enables the public monthly policy.
