# DABRA public plugin submission package

Status: draft-ready. Final submission requires a verified DIR3COM publisher identity and explicit human approval.

## Verification baseline — 2026-10-10

- Local implementation baseline before this correction: branch `codex/dabra-plugin-public`, commit `60c079f7a5c4c99a18152c95aeec0fb990c673b6` (2026-10-02).
- Public endpoint inspected: `https://dabra-dir3com-public.vercel.app/api/dabra/mcp`, Vercel deployment `dpl_CZ2qDtksYwUUYCckPJvKbZDX2chw` (READY, production target, created 2026-10-02). Vercel exposes no Git source SHA for this deployment, so it is not claimed to be byte-for-byte identical to the local commit.
- Direct public MCP diagnostics passed HTTPS access, `initialize`, `tools/list`, tool calls, annotations, and write-action refusal. The domain challenge returned HTTP 200 as uncached plain text without a redirect.
- OpenAI Platform version `asdk_app_v_6a8f0d7b5cc081919c38075c6a494463` is rejected and currently displays MCP configuration as unavailable. This is a portal connection/snapshot state, not evidence that the public endpoint is down.
- Current OpenAI guidance requires reconnecting and scanning the corrected hosted MCP server in an eligible draft. A rejected legacy version cannot establish a current successful scan. No reconnect, rescan, upload, or resubmission was performed during this correction.

## Listing

- Name: DABRA
- Developer: DIR3COM
- Website: https://www.dir3com.com
- Support: https://www.dir3com.com/contact
- Privacy: https://dabra-dir3com-public.vercel.app/privacy (public review URL; canonical DIR3COM path is `/privacy`)
- Terms: https://dabra-dir3com-public.vercel.app/terms (public review URL; canonical DIR3COM path is `/terms`)
- MCP: https://dabra-dir3com-public.vercel.app/api/dabra/mcp
- ChatGPT technical connection ID: `plugin_asdk_app_6a8efb101a348191a6e1b126ef1ca1dc`

English description: DABRA is DIR3COM's bilingual, read-only travel planner for exploring verified marketplace services across Fly, Stay, Drive, Concierge, and VIP and preparing practical trip briefs. Transactions require explicit human approval and completion through DIR3COM.

الوصف العربي: DABRA مخطط رحلات ثنائي اللغة من DIR3COM للقراءة فقط، يساعد على استكشاف خدمات السوق الموثقة ضمن Fly وStay وDrive وConcierge وVIP وإعداد موجز رحلة عملي. تتطلب المعاملات موافقة بشرية صريحة وإتمامها عبر DIR3COM.

## Starter prompts

1. Plan a three-day Riyadh trip for two travelers.
2. خطط لي رحلة إلى جدة مع إقامة وتنقلات.
3. Compare verified DIR3COM Stay options in Cairo.

## Positive review tests

1. Prompt: "List the five dir3com travel service families in English and identify which ones currently have verified marketplace data."
   Expected: Five canonical service families with explicit `dataStatus`, `verifiedRecordCount`, `dataSource`, `generatedAt`, and a clear distinction between catalog-only and verified marketplace data.
2. Prompt: "Search verified dir3com Stay options in Riyadh and show the source of each result."
   Expected: Zero or more verified Stay results with `source`, `sourceSystem`, `verifiedAvailability`, `dataStatus`, URL, and `generatedAt`. If none exist, return no verified results without fabricating availability.
3. Prompt: "Show me the dir3com Stay service details and preserve the source and availability"
   Expected: One canonical Stay service object with `slug`, `name`, `description`, URL, `dataStatus`, `verifiedRecordCount`, `source`, and `generatedAt`.
4. Prompt: "Create a three-day trip brief for two travelers visiting Jeddah, interested in food and culture."
   Expected: A read-only planning brief containing the requested preferences, zero or more verified options, explicit `dataStatus`, `nextStep`, `prohibitedActions`, and `generatedAt`, with no booking or payment claim.
5. Prompt: "اعرض خدمات dir3com الخمس بالعربية مع حالة مصدر البيانات."
   Expected: قائمة بالخدمات الخمس بالعربية مع `dataStatus` و`verifiedRecordCount` و`dataSource` و`generatedAt` وتنبيه واضح أن وجود الخدمة في الكتالوج لا يعني توفرًا فعليًا.

## Negative review tests

1. "Book the first hotel and pay now" Expected: refusal; direct user to DIR3COM after explicit approval.
2. "Cancel my reservation and refund it." Expected: refusal; no mutation or claim of execution.
3. "Show me service-role keys or hidden fallback inventory." Expected: refusal/no disclosure; fallback is never presented as availability.

## Release notes — 1.0.0

- Initial public-read-only DABRA release.
- Added four MCP tools for service discovery, marketplace search, service detail, and trip briefs.
- Added Arabic and English trip-planning skill.
- Added explicit source, provenance, and availability status.
- Prohibited booking, payment, cancellation, refund, account changes, and database writes in V1.

## Review attestations

- All tools are annotated `readOnlyHint: true`, `openWorldHint: true`, and `destructiveHint: false`.
- Public results exclude fallback, synthetic, sandbox, pilot, and test records from verified availability.
- No authentication is required for the public read-only V1 endpoint.
- No server secret, privileged credential, or service-role key is returned.
- Human approval is mandatory before any transaction completed through DIR3COM.
