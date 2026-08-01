# Booking Entry Boundary (Mobile)

## Scope

This boundary defines what must be true before mobile can safely start and submit booking creation from a public marketplace item.

This document is contract-first and does not introduce runtime booking creation.

## Current Booking Entry Reality

Observed from current repository contracts:
- Public marketplace item detail is read-only and exposes item `id` and `slug`.
- Mobile protected booking flow currently supports read-only list/detail.
- Booking creation endpoint exists at `POST /api/bookings`.
- Current booking create contract trusts several client-supplied fields, including total amount fields.

## Non-Negotiable Rules

Mobile must never:
- trust a displayed public price as final booking amount;
- generate booking reference values;
- assign booking lifecycle status;
- assign provider/partner;
- mark payment success;
- write directly to Supabase tables;
- send raw public marketplace objects as booking payload.

Server must always:
- own pricing authority;
- own availability authority;
- own booking reference generation;
- own ownership assignment from authenticated session;
- own status assignment.

## Item-to-Booking Mapping Boundary

Required canonical input for mobile booking start:
- validated public item slug and/or stable item id only.

Required server behavior for create:
- resolve canonical bookable entity server-side;
- verify publication/active eligibility server-side;
- reject unknown or invalid identifiers.

Disallowed create behavior:
- trusting client `product_name` as authoritative;
- trusting client `total_price` as authoritative;
- creating bookings from unresolved/malformed identifiers.

## Authentication Transition Boundary

Required flow:
- unauthenticated user taps Start Booking;
- app routes to sign-in;
- validated booking intent (item slug/id only) is preserved;
- after sign-in, app returns to a protected booking-intent boundary route.

Required constraints:
- no personal data or totals in pending route state;
- no external redirect;
- no token leakage.

## Booking Request Contract (Future Required)

### Required fields (minimum)
- item identifier (slug or id as approved)
- arrival/start date
- departure/end date (if category requires)
- guest/quantity count
- city/location context (if category requires)
- customer contact allowlist fields

### Optional fields
- notes
- special requests
- category-approved passenger/traveler metadata

### Must not be accepted as authority from client
- final total amount
- booking reference
- status
- payment status
- user_id/customer_id/provider_id

## Validation Ownership

Server-side validation must enforce:
- strict field allowlist;
- unknown field rejection;
- date parse/range validity;
- guest/quantity bounds;
- category-specific required fields;
- canonical item eligibility;
- ownership assignment from authenticated session only.

Client-side validation is UX-only and non-authoritative.

## Price Authority Boundary

Required before runtime create:
- server recomputes final price from canonical pricing inputs;
- currency handling is explicit;
- category pricing unit semantics are explicit;
- client-visible starting price is informational only.

## Availability Authority Boundary

Required before runtime create:
- server performs category-appropriate availability validation before create;
- availability semantics are documented per category;
- conflict behavior is defined;
- no client-side availability claims are treated as authoritative.

## Idempotency and Duplicate Prevention

Required before runtime create:
- idempotency key requirement at create boundary;
- duplicate submission handling policy;
- deterministic duplicate response semantics;
- safe retry behavior that does not create duplicate bookings.

## Safe Booking Create Response (Future Required)

Response should return only:
- booking id
- booking reference
- customer-visible booking status
- final confirmed amount/currency (if authoritative)
- safe next route

Response must not return:
- raw inserted booking rows
- provider/internal metadata
- internal validation internals
- raw database errors

## Post-Create Mobile Behavior

Required future behavior:
- navigate to protected booking detail route;
- refresh My Bookings from protected API;
- show clear success/failure states;
- no payment success assumption.

## Category Compatibility Boundary

Current state indicates category-specific semantics are not unified enough for one generic runtime create form.

Category compatibility status for generic runtime create right now:
- cars: partial
- hotels: partial
- apartments: partial
- airport-transfers: partial
- experiences: partial
- concierge: partial
- offers: no

Implication:
- generic runtime booking creation is blocked until category contracts are explicitly normalized or safely segmented.

## Product Decisions Required Before Runtime Booking Entry

1. Canonical item identifier for booking create (`id`, `slug`, or both).
2. Booking create auth model for mobile (bearer-aware protected API behavior).
3. Authoritative pricing contract and server recomputation inputs.
4. Category-specific availability semantics and validation policy.
5. Idempotency key policy and duplicate handling semantics.
6. Minimal safe response contract for mobile.
7. Category compatibility decision:
   - one-category first
   - or normalized generic contract.

## Proposed Minimal Next Runtime Step (Not Implemented Here)

Safest next runtime step is an authenticated booking-intent boundary only:
- preserve validated item identifier through sign-in;
- render protected intent screen with informational public data;
- no booking submission.
