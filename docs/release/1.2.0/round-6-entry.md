# Round 6 Entry

Round 5 is locally scaffolded but not fully closed for production entry.

## Ready Locally

- Stryker installed and domain mutation config added.
- Seven deterministic chaos scenarios are covered by `npm run test:chaos`.
- k6 scripts have static smoke checks through `npm run test:load`.
- Threat model, attack tree, DPIA, PII catalog, SOC 2 matrix, and reference site
  artifacts exist.
- KMS rotation and generated alarm assertions can be checked from deterministic
  templates.
- Audit-chain verification scaffold is executable.

## Blocking Round 6 Promotion

- Mutation score evidence must come from a full `npm run mutation` run and meet
  the accepted threshold.
- DSR APIs and retention sweeper are not implemented.
- Tamper-evident audit is scaffolded but not enforced by database trigger or
  external anchoring.
- S-1030, S-1040, and S-1060 are not active promoted families yet.
- External AWS evidence for Secrets Manager rotation, CloudTrail, Cost Explorer,
  and alarm subscriptions is not present.

Use `npm run round6:readiness -- --allow-blocked` to regenerate the machine
readiness report without failing on the known blocked items.
