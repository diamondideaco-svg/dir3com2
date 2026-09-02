## Scope

Describe the user-visible or system behavior changed.

## Risk

- [ ] Authentication or authorization
- [ ] Tenant isolation or RLS
- [ ] Payment, booking, cancellation, or refund
- [ ] Admin or privileged action
- [ ] Uploads, customer data, or secrets
- [ ] Supplier or external integration
- [ ] Database schema or migration
- [ ] None of the above

## Evidence

List the exact commands run and their results.

- [ ] Focused tests pass
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] Arabic flow checked when applicable
- [ ] English flow checked when applicable
- [ ] Desktop/mobile checked when applicable
- [ ] Preview/browser QA checked when applicable

Skipped or blocked checks, with reason:

## Data and Environment

- [ ] No secrets, credentials, or private customer data are included
- [ ] No synthetic/fallback inventory reaches public production paths
- [ ] Sandbox evidence is not represented as production capability
- [ ] Environment-variable or migration changes are documented

## Review and Release

- [ ] Implementation review completed
- [ ] Independent security review completed when risk requires it
- [ ] Unresolved risks are listed below
- [ ] This PR does not assume CI PASS authorizes merge or production deployment

Unresolved risks:

Final status: <!-- PASS / PARTIAL / BLOCKED / FAIL -->
