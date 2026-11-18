# DABRA Plugin V2 readiness — 2026-11-18

## Identity and scope

- Package version: `2.0.0`
- Branch: `codex/dabra-plugin-public`
- V2 baseline before commit: `ff341f44fff927fe4071bdd3279903cbd3b5bfd0`
- Remote DABRA branch inspected: `ff341f44fff927fe4071bdd3279903cbd3b5bfd0`
- Remote `master` inspected: `9990f2401e44dc191a193c261f78b29bee9fa71a`; it no longer contains the public plugin route or package, so current internal DABRA evolution is not represented as a public-plugin capability.
- Public MCP runtime commit: `26aa9871938ec27013776e7fccffc18df343ebdc`
- Public MCP: `https://dabra-dir3com-public.vercel.app/api/dabra/mcp`
- Scope remains the same four read-only tools. V2 adds no booking, payment, cancellation, refund, account, private-data, document, or database-write capability.

## OpenAI requirements checked

- Official submission flow: <https://developers.openai.com/plugins/deploy/submission>
- Remote MCP review: <https://developers.openai.com/plugins/deploy/app-review>
- Plugin guidelines: <https://developers.openai.com/plugins/plugin-guidelines>
- Submission errors and final gates: <https://developers.openai.com/plugins/deploy/submission-errors>

The V2 manifest includes the required listing URLs, exactly five positive and three negative cases, expected tool names and observable behaviors for positive cases, release notes, an accessible demo recording, Arabic listing text, non-commerce disclosure, and the unchanged public MCP URL.

## Corrections from V1 package metadata

- Bumped the package version from `1.0.0` to `2.0.0`.
- Added `supportURL`.
- Reduced the default subtitle to the 30-character submission limit.
- Added `extensions.com.openai.review` and `extensions.com.openai.publication`.
- Added the five positive and three negative cases in current manifest format.
- Added Arabic listing translation and V2 release notes.
- Replaced the Vercel privacy and terms URLs, which returned HTTP 500 on 2026-11-18, with the canonical DIR3COM URLs; both canonical URLs returned HTTP 200 without authentication.
- Normalized `.mcp.json` to the current Codex remote MCP example without changing the endpoint.

## Verification evidence

| Check | Result |
| --- | --- |
| Local DABRA MCP tests | PASS — 10/10 |
| Public MCP initialize | PASS |
| Public tools/list and four calls | PASS |
| Tool annotations and refusal | PASS |
| Public risk matrix | PASS — 26/26 |
| Website | PASS — HTTP 200 |
| Support | PASS — HTTP 200 |
| Canonical privacy | PASS — HTTP 200 |
| Canonical terms | PASS — HTTP 200 |
| Demo video | PASS — HTTP 200, `video/mp4` |
| Domain challenge endpoint | PASS — HTTP 200, `text/plain`; a new draft must still verify its exact current portal token |
| ChatGPT Web V1 submitted cases | Historical PASS — 8/8 on runtime `26aa9871` |
| Connected DABRA direct tool-call receipt | PASS — P1-P5 and N1-N3 assertions 8/8 using synthetic inputs; this is not a Mobile, chat tool-selection, UI, V2-installation, or OpenAI-scan result |
| Actual ChatGPT Mobile V2 cases | BLOCKED — no actual mobile client is available; desktop viewport emulation is not accepted as Mobile evidence |

### Connected DABRA direct tool-call receipt

The connected DABRA tool surface was exercised with synthetic inputs on 2026-11-18. The eight assertions passed:

- P1 and P5 returned the five English and Arabic service families with `source_unavailable` and `verifiedRecordCount: 0`; the separate Drive catalog contained 30 request-to-confirm records with `verifiedAvailability: false`.
- P2 returned zero verified Stay results for Riyadh with `source_unavailable` and did not substitute catalog or fallback inventory.
- P3 returned the canonical Stay service with source `DIR3COM_CANONICAL_CATALOG`.
- P4 preserved Jeddah, two travelers, `durationDays: 3`, food and culture interests, a visible `3 days` title, and `planning_brief_only` status.
- N1 and N2 returned `refused_write_action` for the submitted booking/payment and cancellation/refund text.
- N3 returned `refused_sensitive_data_request` for the submitted secrets/internal-inventory text.
- Positive-case `generatedAt` values ranged from `2026-11-18T19:43:21.607Z` through `2026-11-18T19:43:25.536Z`.

This receipt proves direct tool behavior only. It does not prove model tool selection inside a ChatGPT conversation, Mobile rendering or interaction, the V2 skill/package installation, or an OpenAI portal scan. No controllable phone surface or `adb`, emulator, or `scrcpy` path was available, so the Mobile gate remains blocked and the tool calls must not be relabeled as Mobile PASS.

The Plugin Management surface finds a connected app named `DABRA (dir3com)` and its read-only tools are callable. The legacy ChatGPT app ID `plugin_asdk_app_6a8efb101a348191a6e1b126ef1ca1dc` and the submission app ID `plugin_asdk_app_6a8f0d7a1ad0819188f5b45666d037f7` are not reported as installed packages for the active user; therefore this connection is not evidence that the V2 package is installed.

The OpenAI portal was inspected after the original report was written. It showed only version `1.0.0`, review status `Changes required`, publication `Not published`, domain verification completed during the inspection, and MCP `Scan unavailable` with Reconnect, Rescan, and diagnostics disabled. No V2 upload or submission occurred.

Current prepared package artifact: `C:\Users\dell\Desktop\dir3com2\.tmp\DABRA_PLUGIN_V2_2.0.0_2026-11-18_mobile-observable.zip`, SHA-256 `213659E61CD96058CCEB2764491676278ECA1B6C1F9C237148DC6E10124A4B50`.

## Submission gate

V2 is package-ready but not submission-ready. Before submission, the exact V2 ZIP must pass the portal upload and skill scan, the production MCP must receive a successful current tool scan, the portal's current domain challenge must pass, and P1-P5 plus N1-N3 must pass on an actual ChatGPT Mobile client. No V2 upload, review submission, or publication is claimed by this report.
