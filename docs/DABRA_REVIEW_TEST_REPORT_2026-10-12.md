# DABRA OpenAI review verification — 2026-10-12

## Scope and versions

- Branch: `codex/dabra-plugin-public`
- Runtime commit: `26aa9871938ec27013776e7fccffc18df343ebdc`
- Public MCP: `https://dabra-dir3com-public.vercel.app/api/dabra/mcp`
- Vercel deployment: `dpl_C8vUCJNfHagcdbFyNd34nDjVVNT9`
- Preview tested before aliasing: `https://dabra-dir3com-public-mukjk1q31-dir3com.vercel.app`
- ChatGPT Web evidence: `https://chatgpt.com/c/6accea49-4eec-83eb-b959-cd1e30fde0d0`
- Production DIR3COM website: unchanged.

## Test surfaces

| Surface | Result | Evidence |
| --- | --- | --- |
| TypeScript | PASS | `npm run typecheck` |
| Targeted ESLint | PASS | DABRA MCP, marketplace server, tests, and matrix files |
| Production build | PASS | `npm run build` |
| Local Node test runner | BLOCKED | `tsx` stopped before loading tests: `uv_os_get_passwd returned ENOMEM`; zero tests executed |
| Preview MCP smoke | PASS | initialize, tools/list, calls, annotations, refusal |
| Preview risk matrix | PASS | 26/26 |
| Public MCP risk matrix | PASS | 26/26 after alias assignment |
| Independent review | PASS | exact runtime SHA `26aa9871`; no findings |
| ChatGPT Web submitted cases | PASS | P1–P5 and N1–N3: 8/8 |
| ChatGPT Web context-resistance | PASS | misleading P1 and P2 context was rejected in favor of current tool results |
| ChatGPT Web other-user data | PASS after fix | Initial wording implied latent authorized access; final response states DABRA V1 has no administrative retrieval endpoint and disclosed no data |
| Actual ChatGPT Mobile | BLOCKED | No actual mobile client was available; viewport emulation was not counted |

## Risk matrix coverage (26 cases)

The 26 direct MCP cases are counted once. Smoke checks and ChatGPT Web checks are separate surfaces and are not added to produce an inflated unique-case total.

- Submitted positives: P1–P5.
- Submitted negatives: N1–N3, plus Arabic N3.
- Privacy boundary: N4 other-user booking data.
- Source and classification: zero results, no fabrication, catalog-versus-verified classification.
- Invalid input: missing destination, missing travelers, zero travelers, unknown property, impossible calendar date, invalid date format, travelers above maximum, non-integer travelers, invalid language, and too many interests.
- Repeatability: repeated P1 and P2 preserve source classification and result counts.
- Bilingual behavior: English and Arabic service discovery and Arabic refusal.

## Controlled source-outage fixture

`getMarketplaceSnapshot` accepts an optional test-only reader while retaining the production reader as its default. The isolated fixture injects a reader that throws and verifies the existing safe classification:

- `sourceHealth = unavailable`
- `source = fallback`
- `hasRealData = false`

No production source was disabled or modified.

## Findings and fixes

1. Runtime input validation originally normalized missing or invalid trip-brief arguments. Fixed by enforcing required fields, ranges, date validity, language, interests, and unknown-property rejection.
2. The original matrix under-asserted P3–P5. Fixed to match the submitted expected result shapes.
3. Other-user-data requests were not explicitly covered. Added bilingual refusal matching and direct MCP coverage.
4. ChatGPT Web initially refused disclosure but implied DABRA could retrieve authorized booking data. Fixed MCP instructions and the bilingual Skill to state that V1 has no access to private profiles, reservation history, customer records, or administrative data, even when authorization is claimed.

## Release gate

Code, MCP, public endpoint, and ChatGPT Web are PASS. Submission remains blocked until the eight submitted cases pass on an actual ChatGPT Mobile client. No OpenAI submission was made.
