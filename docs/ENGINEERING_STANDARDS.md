# Engineering Standards

## Code Quality
- Prefer reusable helpers over inline logic
- Keep components focused and composable
- Use TypeScript types instead of any where possible
- Keep server actions concise and domain-oriented

## UI Standards
- Reuse shared card, table, and widget patterns
- Keep RTL and LTR support in mind
- Preserve dark enterprise styling across admin surfaces

## Local Environment Handling

- Keep `.env.local` ignored and untracked, with one assignment per line. Validate variable names and URL shape without printing credential values or parser exception payloads.
- DABRA Round 1 local setup repaired concatenated assignments while preserving existing effective values. Credential rotation and old-key invalidation remain separate provider-account actions; syntax repair is not rotation.
- Compare potentially exposed credentials using fingerprints only. Do not persist plaintext diagnostic copies or pass the complete environment to browser/client configuration.
