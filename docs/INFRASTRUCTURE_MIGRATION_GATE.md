# Infrastructure Migration Gate for Core Synthetic Columns

## Decision
CODE APPROVED - INFRASTRUCTURE MIGRATION GATE REQUIRED

## Mandatory Rollout Order
1. Infrastructure applies `supabase/migrations/20260810102000_dgr071_core_synthetic_compatibility.sql`.
2. Infrastructure runs read-only verification using:
   - `npm run sandbox:core-schema:verify`
   - `docs/sql/core_synthetic_predeploy_checks.sql`
3. QA runs public marketplace smoke checks and confirms only non-synthetic rows appear.
4. Only after steps 1-3 pass, deployment of code paths that depend on DB-level `synthetic=false` is allowed.

## Operational Safety Notes
- Migration is additive: it only adds/normalizes `synthetic` columns and indexes in four tables.
- Backfill statements update rows where `synthetic IS NULL`; execution time scales with table size.
- PostgreSQL versions that support metadata-only `ADD COLUMN ... DEFAULT false` still require validation of null backfill and constraints in target environment.
- Use row-count and null-count queries before/after migration to estimate impact and verify completion.

## Forward-Fix and Rollback Policy
- Do not run destructive rollback on production data.
- If migration verification fails, use forward-fix migrations only.
- Staging rollback script is non-destructive by design and must not be used as a production rollback pattern.
- Data cleanup is separate from schema rollback and requires ownership markers.
