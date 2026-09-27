# DIR3COM UCP Lodging: offline contract POC

Task #165. Owner: Codex — ChatGPT Work Mode. Date: 2026-09-27.
Branch: `feat/ucp-lodging-contract-poc`.
Base: `c8c91f33f3ea017bf09f0d4ee32747c0aae425b9`.

## What this proves

The existing canonical `StaySearchInput` / `StaySearchResult` can produce a
single-room proposed UCP create-request mapping without replacing LiteAPI or
creating another backend. The experiment checks dates, exact money conversion,
occupancy, source associations and stable local handles. It creates REST/MCP
**descriptors**, not executable clients or servers. It does not advertise a UCP
capability, create a session, contact Google, hold inventory or invoke prebook.

All fixture inventory is synthetic and confined to tests. No live provider
response was fetched or represented as fresh evidence. This is not a Google
certification, full schema-conformance pass or end-to-end booking proof.

## Pinned source

- Upstream: https://github.com/Universal-Commerce-Protocol/ucp
- Commit: `1b4e7bbdb718828120cf5eb6b0dc336737f1a488` (2026-09-25)
- Capability: `dev.ucp.lodging.booking`, draft; pin before later implementation.
- Booking schema: `source/schemas/lodging/booking.json`
- Type schemas: `source/schemas/lodging/types/{stay,occupancy,property,rate_plan,accommodation_type,guest_assignment}.json`
- Common types: `source/schemas/common/types/{date_interval,location_summary}.json`
- Bindings: `source/services/lodging/{rest.openapi,mcp.openrpc}.json`
- https://ucp.dev/draft/specification/lodging/booking/
- https://developers.google.com/hotels/ucp/faq

The request projection follows `ucp_request` annotations, not the complete
response schema: response-only property names, titles, totals and status are
not sent. Full generated-schema validation and transport/profile negotiation
remain future work, not claimed by these tests. MCP `meta` is intentionally
listed as missing rather than fabricated. No protocol version is invented.

## Mapping and evidence gaps

| Existing DIR3COM value | POC handling | Commercial requirement |
| --- | --- | --- |
| Provider/hotel ID | Business-local example property handle | Catalog lookup/registry, Google eligibility |
| Room/rate ID | Separate hashed room/rate/stay handles | Revalidated binding and commercial supplier access |
| Check-in/out | Property-local date interval | Property timezone and availability checks |
| One-room occupancy | Adults, explicit child ages, session-local guest references | Confirmed per-unit allocation for multi-room bundles |
| Selling/offer/rate amount | Exact minor-unit provisional observation | Authoritative all-in total, taxes, fees and schedules |
| Refundable flag/deadline | Unverified policy observation only | Binding penalties, policy links and applicability |
| Guest identity | Omitted; no guessed name, contact or primary role | Consented booker/lead guest and minimal requested PII |
| Merchant/legal links | Explicit gap | Approved merchant-of-record model and terms |

No tax amount, zero-fee assertion, cancellation penalty, payment schedule or
guest identity is invented. Unsupported currencies, ambiguous room bindings,
multi-room bundles and invalid dates/ages fail closed. Supported minor-unit
precisions are intentionally bounded, not a claim to support every currency.

`readiness: blocked` is a local assessment, **not** a UCP session status.
Provisional search data cannot justify `ready_for_complete` or `completed`.
No stateful Create/Get/Update/Cancel service is implemented. Complete, payment,
REQ and all execution attempts through the experiment guard always throw
`UCP_POC_TRANSACTION_DISABLED`; no flag or credential can enable them.
UCP Cancel Booking Session concerns a pre-completion session, not refunding a
confirmed reservation.

## Actual Google onboarding blocker

Verified from the official interest form on 2026-09-27:
https://services.google.com/fb/forms/ucp_for_lodging_interest_form/

Initial rollout requires US-based properties and a US bank account. The form
says the integration is early-planning and not available in the near future.
Neither DIR3COM US-property eligibility nor a US bank account is established.
It also requests property count, Hotel Center ID (optional), a contact, an
implementation commitment within 30 days after selection and terms acceptance.

No form was submitted, agreement accepted, property count invented or account
linked. A signed-in Google OAuth account is not Hotel Center/UCP onboarding.

Prepared truthful positioning for a future interest submission:

> dir3com is an Arabic/English travel platform focused on Egypt and Saudi
> Arabia. We have an existing supplier abstraction and LiteAPI Sandbox hotel
> search/detail proof. We are evaluating UCP Lodging through an offline contract
> POC. We do not currently claim live UCP booking, US rollout eligibility or
> commercial hotel transaction readiness. Please advise on eligibility for a
> future regional pilot.

Do not submit until the business confirms contact details, geographic/banking
eligibility and willingness to accept the program commitments. A waitlist
submission, even if accepted by the form, is not a connected Google channel.

## Run

```sh
node --import tsx --test tests/ucp-lodging-contract-poc.test.ts
```

Tests cover valid projection, privacy minimization, decimal precision, gaps,
invalid/ambiguous source associations, date/occupancy errors, stable bindings,
REST/MCP descriptor parity, blocked transactions and production-import isolation.
No database, environment variables, provider quota or customer session needed.

## Release boundaries

No application route imports this experiment. No dependency, migration,
environment, Marketplace, payment, DABRA routing or Production changes.
POC test PASS and actual Google connection are separate verdicts. Independent
review is not claimed. PR #115 governance currently excludes the Work Mode
owner identity and requires a separate reviewer; those gates remain unchanged.

Once eligibility and commercial readiness exist, use the same core backend:
resolve catalog handles server-side; revalidate authoritative terms; implement
authenticated session persistence/idempotency and expiry; validate pinned
schemas; add negotiated REST/MCP bindings; obtain independent review and
Google onboarding. Only a separately authorized commercial release can enable
completion/payment. Do not expose this experiment as a public endpoint.
