# Booking Create Contract (Core Design)

## 1. Purpose

Define one safe, enforceable Core booking-create contract for future web and mobile use.

This document is design-only. It does not implement runtime booking creation.

## 2. Non-negotiable architecture rules

- One shared DIR3COM Core backend for web and mobile.
- Mobile and web must call the same protected create contract.
- Server owns authentication, ownership, canonical item resolution, pricing authority, availability authority, status, and booking reference.
- Client-submitted total values are never trusted.
- Client-submitted user or ownership values are never trusted.
- Booking creation requires idempotency.
- Booking creation must not imply payment success.

## 3. Existing unsafe create behavior

Current create flow risks:
- Booking create currently uses cookie-auth only in POST route, not shared bearer-or-cookie request auth context.
- Request shape currently accepts client-controlled product_name and total_price.
- No canonical item resolver from a validated public identifier to authoritative server entity.
- No category-aware availability enforcement.
- No idempotency and no duplicate conflict semantics.
- Response returns raw inserted row.

## 4. Target authentication contract

### Supported caller authentication
- Authorization: Bearer token (mobile)
- Authenticated cookie session (web)

### Required server helper
- Future create must use the shared request helper pattern that supports bearer and cookie in one path.
- Standardized unauthenticated response: 401 with code AUTH_REQUIRED.

### 401 response rule
- Do not expose auth internals.
- Return customer-safe message plus stable error code.

## 5. Canonical item resolver

### Canonical client identifier
- Primary identifier to submit: item_slug (validated public slug).
- Optional fallback identifier for server optimization only: product_id.
- If both are sent, server must verify they map to the same canonical product.

### Authoritative entity
- products table is the authoritative bookable item source.
- product_categories resolves category.

### Eligibility rules
- Product must exist.
- Product slug must be valid.
- Product status must be published/active/featured.
- Product category must resolve.

### Failure behavior
- Stale/deleted/unpublished/unresolvable product: 404 ITEM_UNAVAILABLE.
- Invalid identifier format: 400 INVALID_ITEM.

## 6. Request schema and explicit allowlist

The create endpoint must reject unknown fields.

### Canonical transport
- Canonical idempotency transport: Idempotency-Key header.
- Body idempotency_key is not accepted in final contract.

### Base request fields

| Field | Required | Type | Validation | Category applicability |
|---|---|---|---|---|
| item_slug | yes | string | lowercase slug pattern, max 120 | all |
| arrival_date | yes | string (YYYY-MM-DD) | strict parse, valid calendar date | all except pure concierge requests if no fixed date |
| departure_date | conditional | string (YYYY-MM-DD) | strict parse, must be greater than arrival when required | hotels, apartments, multi-day experiences |
| guests | conditional | integer | min 1, max category limit | hotels, apartments, experiences, concierge |
| quantity | conditional | integer | min 1, max category limit | cars, airport-transfers, some experiences |
| city | conditional | string | max 120, safe text | category and item policy dependent |
| guest_name | yes | string | trimmed, min 2, max 80 | all |
| guest_phone | yes | string | normalized phone, max 20 | all |
| guest_email | optional | string | email format, max 254 | all |
| notes | optional | string | sanitized message, max 1000 | all |
| category_data | optional | object | strict category schema by category slug | category-specific |

### Category_data examples (design-only)
- cars: pickup_time, pickup_point, dropoff_point, vehicle_class
- hotels/apartments: room_preference, checkin_time_preference
- airport-transfers: flight_number, terminal, transfer_direction
- experiences: session_id or start_time, attendee_breakdown
- concierge: request_type, service_window
- offers: blocked from create until dedicated contract

## 7. Rejected client-controlled fields

Must always be rejected when present:
- product_name
- total_price
- product_price
- status
- user_id
- profile_id
- provider_id
- booking_reference
- payment_status
- partner assignment fields
- arbitrary extra fields

Recommended response for these fields:
- 400 INVALID_REQUEST with field-level details.

## 8. Category-specific request extensions

Server must load a category-specific validator after canonical resolver.

- cars: require pickup/dropoff semantics and time window.
- hotels: require stay range and occupancy constraints.
- apartments: require stay range and occupancy constraints.
- airport-transfers: require transfer timing and airport context.
- experiences: require session/timeslot context.
- concierge: allow flexible service window with manual confirmation path.
- offers: blocked until offer eligibility and pricing rules become authoritative.

## 9. Server validation rules

### General
- Reject unknown fields.
- Normalize and sanitize all text.
- Validate dates with strict parser and timezone policy.
- Enforce integer bounds for guests and quantity.
- Enforce category-specific required fields.

### Date policy
- Dates parsed server-side only.
- Canonical timezone: item city timezone if available, otherwise Asia/Riyadh baseline until per-item timezone exists.
- arrival_date must be today or future in canonical timezone.
- departure_date must be strictly after arrival_date where required.
- Maximum duration policy should be category-specific and explicit.

### Quantity policy
- guests min 1; category max from item/category policy.
- quantity min 1; category max from item/category policy.

## 10. Price authority

### Current state
- public item detail includes starting_price and currency only.
- product_prices exists but is not integrated into booking create.

### Contract policy
- Server computes authoritative final amount.
- starting_price is informational only.
- No client totals accepted.
- Currency must be explicit in response.

### Selected design implication
- Because categories are uneven, create returns pricing_status and may return pending amount for manual-confirmation categories.
- confirmed_amount is returned only when category path can compute final authoritative amount.

## 11. Availability authority

### Current state
- product_availability exists but booking create currently does not enforce availability.
- no per-category concurrency control in create path.

### Contract policy
- Server must run availability validation before create success.
- For categories without real-time authoritative checks, create can only proceed as pending confirmation.
- No confirmed availability claim in response unless authoritative check passes.

## 12. Idempotency contract

### Canonical mechanism
- Required header: Idempotency-Key

### Format
- string length 16..128
- recommended charset: A-Z a-z 0-9 - _ :

### Scope
- scoped to: authenticated user + endpoint + normalized request fingerprint

### Retention recommendation
- 24 hours minimum, 72 hours preferred

### Behavior
- same key + same normalized payload:
  - return previous result with same booking identifier and response envelope
- same key + different normalized payload:
  - 409 IDEMPOTENCY_CONFLICT

### Concurrency
- first writer wins per scope
- concurrent same key requests must serialize around idempotency store

### Schema support status
- no current idempotency persistence schema detected
- migration likely required later (do not implement in this batch)

## 13. Duplicate prevention

Beyond idempotency:
- detect duplicate intent within window for same user + same canonical item + same date range + same primary contact
- recommended behavior: 409 DUPLICATE_BOOKING with safe guidance
- race handling: duplicate check performed inside transaction boundary with idempotency resolution

## 14. Booking reference policy

- Reference generation is server-only.
- Must remain globally unique.
- Existing random timestamp format is not sufficient for high-concurrency guarantees alone.
- Recommended: deterministic prefix + entropy source with uniqueness retry on collision.
- Keep database unique constraint on booking_reference.

## 15. Initial status/lifecycle policy

- No client status input accepted.
- Initial customer-visible status should be Pending.
- availability_status and pricing_status should be explicit response fields.
- For manual-confirmation categories, status remains Pending with MANUAL_CONFIRMATION_REQUIRED code when applicable.
- payment_status must remain pending/unpaid until payment flow confirms separately.

## 16. Safe success response

### Design response envelope

```ts
interface CreateBookingSuccess {
  ok: true;
  data: {
    booking_id: string;
    booking_reference: string;
    customer_status: 'Pending' | 'Confirmed';
    pricing_status: 'PENDING_CONFIRMATION' | 'CONFIRMED';
    availability_status: 'PENDING_CONFIRMATION' | 'CONFIRMED';
    confirmed_amount?: number;
    currency?: string;
    next_route: {
      key: 'bookingDetail';
      booking_id: string;
    };
  };
}
```

### Must not return
- raw booking row
- provider or partner identifiers
- internal assignment metadata
- finance internals
- raw database errors

## 17. Safe error response and codes

### Envelope

```ts
interface CreateBookingError {
  ok: false;
  error: {
    code:
      | 'AUTH_REQUIRED'
      | 'INVALID_REQUEST'
      | 'INVALID_ITEM'
      | 'ITEM_UNAVAILABLE'
      | 'INVALID_DATE_RANGE'
      | 'INVALID_GUEST_COUNT'
      | 'CATEGORY_DATA_REQUIRED'
      | 'IDEMPOTENCY_CONFLICT'
      | 'DUPLICATE_BOOKING'
      | 'AVAILABILITY_CONFLICT'
      | 'MANUAL_CONFIRMATION_REQUIRED'
      | 'INTERNAL_ERROR';
    message: string;
    field_errors?: Record<string, string>;
    retryable?: boolean;
  };
}
```

### HTTP mapping
- 400 INVALID_REQUEST, INVALID_ITEM, INVALID_DATE_RANGE, INVALID_GUEST_COUNT
- 401 AUTH_REQUIRED
- 404 ITEM_UNAVAILABLE
- 409 IDEMPOTENCY_CONFLICT, DUPLICATE_BOOKING, AVAILABILITY_CONFLICT
- 422 CATEGORY_DATA_REQUIRED, MANUAL_CONFIRMATION_REQUIRED
- 500 INTERNAL_ERROR

## 18. Category readiness matrix

| Category | Status | Reason |
|---|---|---|
| cars | MANUAL-CONFIRMATION ONLY | no authoritative final pricing+availability path proven in create flow |
| hotels | MANUAL-CONFIRMATION ONLY | stay rules and inventory confirmation not enforced in create flow |
| apartments | MANUAL-CONFIRMATION ONLY | stay rules and inventory confirmation not enforced in create flow |
| airport-transfers | MANUAL-CONFIRMATION ONLY | transfer timing/flight validation and capacity checks not enforced |
| experiences | MANUAL-CONFIRMATION ONLY | session capacity and schedule authority not enforced |
| concierge | MANUAL-CONFIRMATION ONLY | inherently operations-driven fulfillment and pricing confirmation |
| offers | BLOCKED | promotion validity and authoritative discounted pricing contract not ready |

## 19. Web migration plan

Web must migrate to the same Core contract:
- stop client-trusting product_name, product_price, total_price
- submit only allowed customer inputs and item_slug
- use same endpoint contract for cookie-auth callers
- update UI wording to avoid guaranteed price/availability until confirmed

Backward compatibility risks:
- existing web form payload fields will be rejected by strict allowlist
- frontend must update before strict mode enforcement becomes hard fail in production rollout

## 20. Future mobile flow

Target sequence:
- bookingIntent screen
- collect validated customer inputs
- optional quote or direct pending path by category policy
- explicit customer confirmation step
- idempotent protected create request
- server resolves canonical item, pricing, availability, ownership, reference
- safe response
- navigate to booking detail

No runtime implementation in this batch.

## 21. Schema/migration prerequisites

Likely required later:
- idempotency records table with key scope, request fingerprint, response snapshot, expiry
- optional quote table/token if quote mode is introduced for selected categories
- optional normalized booking request audit table for safe observability

Not implemented here.

## 22. Security checklist

- no client-trusted price
- no client status
- no client ownership
- no client booking reference
- no arbitrary fields
- no raw row response
- no raw internal errors
- no direct mobile Supabase writes
- no create without idempotency
- no create without canonical item validation
- no confirmed availability claim without authority
- no payment success mutation during create

## 23. Implementation phases

### Phase A
- bearer-aware shared POST authentication
- strict request parser and unknown-field rejection
- customer-safe response and error envelope

Prerequisite: none
Blocker: none

### Phase B
- canonical item resolver with publication and category checks
- item-unavailable handling standardization

Prerequisite: Phase A
Blocker: category edge-case mapping decisions

### Phase C
- idempotency storage and conflict handling
- replay behavior and request fingerprinting

Prerequisite: Phase A
Blocker: schema migration for idempotency

### Phase D
- category-specific price and availability contracts
- conflict semantics per category

Prerequisite: Phase B and C
Blocker: operations policy and inventory authority gaps

### Phase E
- web migration off client-trusted total/product_name fields
- compatibility transition and rollout safety

Prerequisite: Phase A through D minimum baseline
Blocker: coordinated web payload migration

### Phase F
- mobile booking form and create integration
- idempotent create handling and safe post-create navigation

Prerequisite: Phase A through E
Blocker: category-specific UX requirements and policy sign-off

## 24. Definition of done

Contract is considered ready for implementation when:
- request allowlist and rejected fields are finalized
- canonical item resolver policy is finalized
- auth behavior is standardized for bearer and cookie callers
- idempotency schema and behavior are approved
- category readiness matrix is approved
- success/error response envelopes are approved
- web migration plan and rollout order are approved

Until then, runtime booking creation remains blocked for mobile.
