# Task217 public dialogue — local implementation candidate

Base: 339ebc6df325a7505bbde1a4f2c96dc47d5a144c. Owner: Codex — ChatGPT Work Mode, session 01a17779-3102-7065-8f92-dac28c6b9011. Branch: codex/task217-public-dialogue-budget. PR231 is merged; no new PR or source publication is authorized in this phase.

| Requirement | Existing source | Reused foundation | This delta | Evidence / remaining work |
| --- | --- | --- | --- | --- |
| Local persona and topic repair | conversation-renderer.ts, platform-assistant.ts | central personality copy, Core facts and user-only preferences | current-turn identity/social/repair/explanation and explicit topic boundary | local regression and actual POST cases; browser AR/EN still pending |
| Active logged-in accounts, local guests | agent-context.ts, agent-contract.ts | canonical active profile and unchanged customer/partner/operator authority | public-dialogue-policy.ts eligibility; no role conversion or private tool widening | role/unit tests; isolated runtime integration pending |
| Budget and quotas | dialogue-funding-store.ts, durable-authority, private pilot ledger | same account evidence, exact binding, protected adapters and advisory-lock order | separate public authority and append-only admissions; USD25 monthly total, USD0.25/account,100/month,10/day | source forward only; real PostgreSQL boundary/concurrency tests still required |
| Preserve historical liability | existing grants/admissions | conservative greater counter/ledger holdings | aggregate month includes historical pilot rows and unmatched holds; no refunds/resets | migration baseline pass; live data untouched |
| Professional bounded model dialogue | agent-handoff.ts, output-contract.ts | single checked provider dispatch, fresh pricing, exact model/key, strict result validation | distinct platform-dialogue-v2 prompt/parser/cases; bounded owned-trip projection | parser/privacy tests; genuine model measurement and independent semantic acceptance not performed |
| One model call per message | route.ts, agent-dialogue.ts | existing discover and admission path | public policy bypasses optional classifier, no vendor broadcast or retry | needs mocked runtime/POST regression; no paid calls |
| Economy first | agent-capabilities.ts | qualified measured profiles | cost-first selection; economy authorities only | no fixed provider split, five-Sonnet allowance or inferred stronger-model authorization; evidence-based escalation trigger remains closed |
| Services/actions/continuity roadmap | Core tools, marketplace APIs, continuity-chat-server.ts | ownership, role/country grants, explicit transaction approval, saved-trip read | only bounded read projection and post-await ownership recheck | new booking/payment actions, autonomous tools and expanded memory are outside P0 |

## Release boundaries

Source-only policy selection is DABRA_DIALOGUE_FUNDING_POLICY=dabra-public-monthly-v1. This environment value has NOT been written. The migration installs no enabled control or authority, profile, acceptance or funding. Existing platform-units acceptances cannot qualify dialogue-v2. Missing account evidence, fresh tariff, identity, profile/contract or durable reservation returns the existing local Core reply. A failed/unknown reservation is never retried or refunded.

Asia/Riyadh calendar windows are an explicit engineering assumption reusing the current convention; the database clock is authoritative. A calendar boundary starts a new period without deleting history. Account quotas measure admitted provider attempts, not all chat messages. The aggregate monthly reservation includes other DABRA pilot/qualification liabilities, not unrelated vendor account activity. Provider invoices, taxes, FX, funding and total reasoning tokens still require truthful provider-specific evidence.

The new SQL functions are service-role-only and new private tables force RLS. No public diagnostic endpoint or raw-error logging is introduced. Live migration/ACL changes require separate review and human authorization.

## Local verification checkpoint

The first isolated conversation repair is e4a2de3034cef9a635563dc04a210469aff39e0f; the integrated candidate additionally repairs general topic inheritance, room refinements and progressive clarification. Affected legacy authorization/funding/contract/continuity group:237/237. Final local/public behavior group before the added single-expired-profile case:86/86. Full ESLint:0 errors,23 warnings. Final exact-artifact checks and independent functional/security judgments remain separate.

Real PostgreSQL integration cases are prepared in tests/dabra-public-dialogue-postgres.integration.test.ts with mandatory loopback/disposable database guards, migration/old-history/ACL checks, account period caps, idempotency, immutable unknown holds and two-worker daily admission. They have NOT executed: installed PostgreSQL17 lacks share/postgres.bki, so initdb could not start the disposable cluster. Docker availability read did not complete and its own probe was cancelled. No system installation, trust/ACL change or production fallback was used.

The initial default build failed because an existing dependency junction pointed outside Turbopack's project root. Only this task's verified junction was removed; exact-lockfile dependencies were installed from the existing offline D cache (967packages), preserving the old dependency directory. A TypeScript attempt made during that incomplete install failed on missing library files and is not a source PASS. The final typecheck/build results must be recorded after installation.

The fixed new contract still needs a supported guarded measurement recipe and genuine independent semantic acceptance before any public authority is installed. The old platform-units measurement permit does not approve the new cases. No new recipe is executed by this local source phase. Strong-model escalation remains closed pending a demonstrated need/quality rule; there is no automatic expensive fallback or fixed split. Browser desktop/mobile AR/EN and real PostgreSQL execution remain required release evidence. Overall IN_PROGRESS/PARTIAL, not public activation.

## Final source-only handoff checkpoint

After the task-owned dependency layout was corrected, npm run typecheck PASS and the default npm run build (Next16.3.3/Turbopack) PASS. The earlier missing-dependency and new-PG-fixture quoting/typing failures are retained as earlier attempts, not represented as successful checks. No product source changed after that successful build; the final PG-test unused import cleanup and this evidence note are non-product changes.

Affected local evidence is kept separate: legacy authorization/funding/dialogue/continuity/contracts237/237; combined behavior86/86; latest public runtime18/18 including the additional stale-profile isolation; final manifest provenance and PG target guard2/2. These overlap and are not added into a fictional total. Full lint0 errors/23 existing warnings; final affected lint0 errors. Migration manifest/archive integrity and registered forward SHA pass. No database SQL body or browser acceptance is inferred from these results.

The PostgreSQL integration suite is prepared but unexecuted. Real atomic monthly/day/account limits, cross-worker concurrency, source-grant/hold preservation and live ACL/RLS remain mandatory independent execution evidence. No live migration, authorization, provider call, environment change, PR/publication, merge or deployment occurred. The independent reviewer is assigned and acknowledged; no source verdict is claimed for this new candidate.
