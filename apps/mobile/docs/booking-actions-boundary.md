# Booking Actions Boundary (Mobile)

## Scope

This document defines the customer booking-action boundary for DIR3COM mobile.

Principles:
- Mobile is a client of shared DIR3COM Core APIs only.
- Mobile does not own booking lifecycle transitions.
- Ownership, eligibility, and authorization are enforced server-side.
- Mobile must never directly update booking status or operational workflow state.

## Current Customer Booking Experience

Implemented:
- Protected booking list read.
- Protected booking detail read.
- Safe deep-link routing to booking detail.
- Session-aware unauthorized handling and protected route boundaries.

Not implemented in mobile:
- Cancellation actions.
- Review submission actions.
- Booking assistance request actions.
- Booking notes mutation actions.

## Candidate Actions and Boundary Decision

### 1) Booking assistance / support request

Status: BLOCKED FOR NOW.

Reason:
- Existing contact API is generic and not booking-scoped.
- No booking-owned server contract was found that validates booking ownership and status eligibility for assistance requests.

Required future contract:
- Authenticated booking-scoped endpoint.
- Server-side ownership verification by booking identifier.
- Explicit request payload allowlist.
- Generic safe errors only.

### 2) Booking review submission

Status: BLOCKED FOR NOW.

Reason:
- Existing review flows are not yet aligned with a minimal, booking-scoped, lifecycle-safe mobile boundary.
- Current review API behavior includes nontrivial side effects and mixed response semantics.

Required future contract:
- Ownership-safe authenticated review endpoint.
- Completed-booking eligibility enforced server-side.
- Duplicate submission prevention.
- Explicitly documented side effects approved by product policy.

### 3) Booking cancellation request

Status: BLOCKED FOR NOW.

Reason:
- No explicit customer cancellation-request contract found.
- No evidence that direct customer status mutation is allowed.

Required future contract:
- Cancellation request workflow separate from final cancellation status.
- Server-side eligibility matrix and approval path.
- No direct client status mutation.

### 4) Customer note / special assistance request on booking

Status: BLOCKED FOR NOW.

Reason:
- No booking-scoped, ownership-safe endpoint currently available.

Required future contract:
- Authenticated booking-scoped note/request endpoint.
- Allowed fields and length constraints.
- Server-side ownership and eligibility enforcement.

## Status Eligibility Rules (Boundary)

Until explicit contracts are implemented:
- Mobile must not infer action eligibility as policy.
- Mobile may display booking status read-only.
- Any future actionable state must be validated server-side, not client-side.

## Authorization Requirements (Mandatory for Future Actions)

Any future customer booking action API must:
- Require authenticated session.
- Resolve user identity server-side.
- Verify booking ownership in the action query itself.
- Reject malformed identifiers.
- Return generic safe errors without internal leakage.

## Explicitly Prohibited from Mobile

- Direct booking status mutation.
- Assignment, operations, partner, settlement, or finance workflow actions.
- Payment/refund state mutation.
- Using customer-provided user_id/profile_id for authorization decisions.
- Passing raw internal booking records to the UI.

## Product / Backend Decisions Required Before Action Implementation

Required decisions:
1. Which single customer booking action is approved first (assistance, review, or cancellation request).
2. Action eligibility by booking status.
3. Whether action is read-only request vs lifecycle mutation.
4. Idempotency and duplicate-submission policy.
5. Customer-visible success and unavailable semantics.

## Implementation Note

This milestone intentionally defines boundaries only.
No functional booking-action button was added in mobile, and no backend booking-action endpoint was introduced in this batch.
