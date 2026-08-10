# DIR3COM Canonical Project Identity

> READ THIS FILE FIRST before any task involving Supabase, Vercel, Production,
> backups, migrations, releases, or deployments.

## Canonical identity

| Asset | Canonical value | Status |
| --- | --- | --- |
| Application / brand | `dir3com` | Canonical brand name |
| GitHub repository | `diamondideaco-svg/dir3com2` | Canonical source repository |
| Default branch | `master` | Canonical branch; deployment behavior must still be verified in Vercel |
| Vercel project | `dir3com2` | Canonical application project |
| Vercel project ID | `prj_V2AquQE4YbkpKWoq5GNtT4ImxWon` | Verified with authenticated Vercel CLI |
| Vercel team ID | `team_ixPiuZYgyOtaR4vFoPxJQdqu` | Verified from the linked Vercel project |
| Production domains | `dir3com.com`, `www.dir3com.com` | Canonical desired production domains |
| Staging Supabase ref | `ynupwivgvwcyrsdhtkcc` | Verified `dir3com-staging`; never use as Production |
| Production Supabase ref | `UNVERIFIED` | Production database writes and migrations are blocked |

`PRODUCTION_SUPABASE_REF = UNVERIFIED`

The Vercel Production environments inspected for both `dir3com` and `dir3com2`
contained no Supabase environment variables. The inactive Supabase project is
not evidence of Production identity. Until a Production ref is positively
verified and this registry is reviewed and updated, Production database writes,
migrations, restores, and destructive operations are prohibited.

## Permanent identity rules

1. `UNKNOWN != Production` and `UNVERIFIED != Production`.
2. Never infer Production Supabase identity from a project name, creation date,
   region, inactive status, historical config, or proximity to a deployment.
3. Never silently substitute Staging for Production.
4. A Production database operation requires all of:
   - a non-null verified Production ref in `config/project-identity.json`;
   - an exact target-ref match;
   - the canonical GitHub repository;
   - the project-identity guard running immediately before the operation.
5. Any repository or Vercel project named `dir3com` that is not the canonical
   repository/project listed above is **LEGACY — DO NOT USE**.
6. Historical assets must not be deleted or reactivated without separate,
   explicit CEO/DevOps authorization and a verified asset map.

## Legacy identities — do not use

| Type | Identifier | Classification |
| --- | --- | --- |
| GitHub repository | `diamondideaco-svg/dir3com` | LEGACY — DO NOT USE; repository was not found in the connected GitHub account |
| Vercel project | `dir3com` | LEGACY — DO NOT USE |
| Vercel project ID | `prj_Opnf0pOAm1nsL3E7n7awjyEaKHm4` | LEGACY — DO NOT USE |
| Supabase project ref | `qbuhbgzyiaoseuegjkgf` | LEGACY — DO NOT USE; inactive and never positively verified as Production |

These entries are retention markers, not deletion authorization.

## Required invocation for sensitive operations

Run `npm run verify:project-identity` before any sensitive operation.

For an actual operation, set both variables explicitly:

```text
PROJECT_IDENTITY_OPERATION=production-migration
TARGET_SUPABASE_REF=<verified-production-ref>
```

Supported sensitive operation labels are `production-migration`,
`production-deployment`, `database-write`, `backup-restore`, and
`sandbox-migration`. Production operations fail closed while the Production ref
is unverified. Sandbox migration is allowed only for the canonical Staging ref.
