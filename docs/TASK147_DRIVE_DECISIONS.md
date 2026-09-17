# Task #147 — implementation decisions and reconciliation

Owner: Codex Desktop. Functional reviewer: VS Code Codex. Security reviewer: Codex Security.
Base: `74d597fa1d261c669e6857f00cb82ecd4f2ddb77`.

## CEO decision

The CEO selected option 1 in the implementation conversation: display the nine
Safeerat Al Arab managed offers in the new Drive journey. Preserve all thirteen
Abu Al Hana product records, ownership, original prices and historical requests
unchanged. No alias between these suppliers is authorized or assumed.
Decision recorded in Task #147 comment 5706118409.

## Read-only reconciliation before schema design

Source: public `GET /api/services?family=dir3-drive&pageSize=30`, 2026-09-16 UTC,
13 results. Signed image URLs and credentials are deliberately not retained.

| Existing product | Model | Original amount | New model mapping only |
| --- | --- | --- | --- |
| 86ed339b-8945-40fa-bc04-4a142c5d755e | Hyundai cn7 2021 | SAR 170 | Outside new catalog |
| 0a2f5f91-c53c-49e7-9b27-bb4e8728faf0 | Mercedes E200 | USD 250 | E200; not same supplier offer |
| 2de05514-e1f9-4182-b119-341d1233167a | T2 Green | SAR 300 | T2 |
| ec0a1b39-685a-455f-9247-e77227f10a8d | G500 | USD 400 | G-Class family; no exact-unit claim |
| e65694b7-09f4-4bd0-875a-4b239187e402 | Range Rover Sport | SAR 750 | No exact generic/2025 mapping |
| 39b5beba-b875-4c9b-a5e5-c9a3276c85c8 | T2 White | SAR 750 | T2 |
| dba01f1d-cd4b-40d9-9b95-2d978ac6f74a | Kia Carnival Gray | SAR 750 | Outside new catalog |
| 55bf6423-9623-4181-a2bb-9946a71585c7 | T2 Gray A | SAR 750 | T2; unit identity unconfirmed |
| 6bbf035f-7d7b-4cf3-8ccd-b82570e37b21 | T2 Gray B | SAR 750 | T2; unit identity unconfirmed |
| 6d0b1992-9bdd-4ff9-b141-84b07a3c5a5f | Kia Sportage | SAR 750 | Outside new catalog |
| 5326200a-a0ce-4021-9c0f-77a9756f3365 | Kia Carnival White/Silver | SAR 750 | Outside new catalog |
| 75a81586-0b41-48f7-9c5b-70947bd038c8 | Hyundai Elantra | SAR 750 | Outside new catalog |
| 06c334a0-d4a9-49ad-bc19-3018a24e8c0c | T2 Dark/Black | SAR 750 | T2 |

The five T2 rows are not evidence of five units of the new supplier. No record is
deleted, reassigned, repriced, merged or relabelled. E200/G500 were returned as
`verified=false` / `verified_quote`; their state is not upgraded by this task.
Legacy Phase Zero descriptions are not reused as managed-catalog authority.

## Price and specifications

Authority is the nine-row rate sheet in Task #147. Internal source spelling
`EMG E200` maps to E 200 AMG Line. Daily rounding, excess distance, cancellation,
seats, luggage and exact model guarantee have not been supplied: do not invent
them. Final totals are confirmed by Operations; the public rate is not a charged
amount. FX uses the shared currency service only when its result is authoritative.
All customer-facing payment interactions remain disabled.

## Local verification (2026-09-18)

Isolated application: loopback port 3025; isolated Auth/PostgREST gateway: 19142.
No Production credentials, data writes, deployment or supplier messages were used.
The browser exercised Arabic/English at 1449px and 390px: nine unique offers,
vehicle details, customer details/review, one request, Operations review and
confirmation, then customer checkout review with a disabled payment control.
One local request remained `awaiting_customer_acceptance` / `awaiting_payment`,
with three private audit events. These are QA results, not actual fulfilment.
No active payment fields, booking or supplier communication were exercised.

The first local request attempt returned 503 because the isolated PostgREST
schema cache had not loaded the newly applied RPC. Reloading that cache and
retrying the same intent produced one request, not two. The forward migration
notifies PostgREST to reload its schema. Local development compilation also
exceeded bounded fetch timeouts; explicit retry recovered without fake cards.

Verified search recovery after invalid return dates, native date keyboard input,
URL round-trip, language preservation, model filtering, original USD display
when EGP conversion was unavailable, and no horizontal overflow. Correcting a
search back to its prior valid values now reloads that search and clears its
previous validation error; an actual component-runtime test covers this case.

Application suite: 1180/1180 passed before the final isolated search-retry fix.
The subsequent database phase correctly failed without TEST_DATABASE_URL. All
remaining database and server-only phases then passed on a dedicated loopback
PostgreSQL 17 container, stopped afterward. The final focused Drive suite is
18/18. The protected-operations PostgreSQL harness passed 50 checks including
the new rollback-isolated Drive RPC/RLS scenarios. Final build/lint/typecheck
and exact-SHA external reviews are recorded in the PR, not assumed here.

## Comparison boundary

Public [Booking.com Cars](https://www.booking.com/cars/index.html) and
[Expedia Cars](https://www.expedia.com/Cars) were inspected for conventional
location/date search structure. Rentalcars.com could not be retrieved and is
not claimed as verified. No commercial policies, supplier prices, ratings or
images were copied from those booking marketplaces. DIR3COM intentionally stops
at an Operations-confirmed request and disabled payment review.

Total-price sorting/ranges are explicitly unavailable while a deterministic
journey total is unknown. Capacity filters match only verified capacity values;
unknown specifications are never converted into guessed comparison values.

## Migration, threat boundaries and rollback

The forward adds a managed-offer reference alongside the existing product
reference (exactly one), server-authoritative offer prices, an owner-scoped
request context, and append-only country-scoped audit events. Authenticated
RPCs enforce actor identity, active profile/grants, Egypt Operations scope,
pickup validation, idempotency and optimistic version checks. Customer-supplied
prices, roles and country scope do not grant authority. No service-role client
is introduced in this journey. Legacy product/partner records are not rewritten.
The shared legacy request projection does not select the new column, so existing
customer request reads remain compatible before the new schema is activated.

Production activation/migration is NOT authorized by this task. If a later
authorized rollout is rejected, revert the application commit after review;
retain requests, contexts and audit records rather than drop tables or delete
business data. Any schema rollback is a separately reviewed forward migration.
No payment adapter is enabled, so rollback never assumes charge/refund actions.

Independent VS Code Codex functional review and Codex Security review must name
the final commit SHA. Owner tests are not independent approval. CI, Sandbox,
Governance and exact-SHA Preview must be recorded separately before a release
candidate is recommended; green local tests do not authorize merge or deploy.
