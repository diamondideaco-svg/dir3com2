# DIR3COM Business Rules

## Booking Flow
1. Customer creates a booking request.
2. Assignment engine evaluates partner eligibility.
3. Finance engine handles escrow and settlement logic.
4. Verification status can affect shield and eligibility.

## Finance Guardrails
- Pending settlements should be reviewed before release.
- Refunds should be tracked centrally through operations.
- Escrow and wallet movement should be auditable.
