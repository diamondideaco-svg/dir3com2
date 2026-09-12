# Task #136: protected Preview LiteAPI activation

Owner: Codex Desktop — Engineer A. Policy: BR86 / PR #115.

This activation reuses the merged Marketplace implementation. No application,
database, catalogue, transaction or provider integration code is changed.

## Binding contract

Vercel project `dir3com2`, target **Preview only**, Git branch
`feat/marketplace-preview-liteapi` only:

- `LITEAPI_TEST_API_KEY`: existing authorized local process secret, sensitive;
  never store its value in source, evidence, or command arguments.
- `LITEAPI_ENV`: sandbox.
- `DIR3COM_PROVIDER_PROOF_ENABLED`: true.
- `DIR3COM_PROVIDER_PROOF_PROVIDERS`: liteapi.

Vercel Authentication must remain enabled for the Preview deployment. The
existing project policy is `all_except_custom_domains`; do not attach a custom
domain to this proof. Application feature flags are not user authentication.
Verify an anonymous request is rejected by deployment protection before demo.

Production remains unconditionally denied by the existing proof gate even if
flags are present. No Production or Development variable is modified. No other
provider is enabled. Sandbox details expose no transaction action.

## Verification and rollback

Run focused Marketplace/LiteAPI tests, typecheck, lint, build and diff checks.
Record the exact Preview SHA, anonymous protection, authorized AR/EN desktop
and 390px search/card/detail proof, plus Production proof API denial in #136.
Unit-test data stays in tests and is never customer inventory.

Independent functional and security reviews must name the final commit SHA.
Do not infer independent approval from owner checks.

To disable the demo, an authorized operator disables/removes the branch-scoped
Preview proof flag and replaces the Preview deployment; retain protection on
old deployments because changing environment bindings does not change them.
Never promote this Preview or change Production. Merge requires separate CEO
authorization. Control Tower authorization permits the normal Preview build
needed to consume these bindings, not a Production deployment.
