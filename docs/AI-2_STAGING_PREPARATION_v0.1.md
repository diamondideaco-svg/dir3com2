# AI-2 Staging Preparation v0.1

## Environment Scope
- Target environment: `dir3com-staging` only.
- Production deployment remains prohibited.

## Preparation Checklist

### 1) Provider Secret Readiness
- Stage-only provider keys configured in staging secret store.
- Secret names standardized per AI-2 contracts.
- Rotation policy defined before activation.

### 2) Vector Store Readiness (Conditional)
- Provisioning plan only; activation requires explicit approval.
- Data residency and encryption posture documented.
- Namespace strategy aligned with knowledge domain boundaries.

### 3) Monitoring Hooks
- Request ID propagation.
- Retrieval metrics hooks.
- Fallback reason telemetry.
- Provider health counters.

### 4) Logging Policy
- No secrets or tokens in logs.
- No raw credentials.
- No sensitive user payload storage beyond policy allowances.

### 5) Deployment Protection
- Keep deployment protection enabled for protected slices.
- Keep controlled login gates for pilot UI surfaces.

## Guardrails
- No production alias promotion for AI-2 preparation artifacts.
- No write-path activation for booking/payments/tools.
- No bypass of controlled pilot authentication.

## Exit Conditions
- Staging-only readiness checklist complete.
- Security review confirms no secret leakage risk.
- Observability hooks validated in staging dry runs.

## Status
Prepared for Infrastructure & DevOps review under EO-055.