# R2-F - Evidence Bundle 0.3.0

> This batch assembles Round 2 evidence and hand-off. It does not perform new
> official submissions.

## Preconditions

- R2-A through R2-E exit criteria are complete.
- Release owner approves assembling the 0.3.0 evidence package.
- All included logs and payload evidence are redacted.

## Primary Write Scope

- `docs/release/0.3.0/**`
- `docs/release-checklist.md`
- `docs/README.md`
- `README.md`

## Do Not Touch

- Runtime implementation.
- Raw official payloads, private keys, certificate bytes, real `.env` files, or
  unredacted personal data.
- Round 0 or Round 1 evidence except for cross-links.

## Tasks

1. Create `docs/release/0.3.0/README.md` with:
   - release status
   - owner approvals
   - start-gate proof
   - round-trip matrix
   - deployment/rollback matrix
   - open blockers
2. Add or verify subdirectories:
   - `owners/` or `owners.md`
   - `qualification/`
   - `restricted-production/`
   - `regulatory-codes/`
   - `runbooks/`
   - `security/`
   - `observability/`
3. Attach redacted command transcripts and hashes for:
   - qualification round trips
   - certificate rotation
   - restricted-production deploy
   - rollback
   - kill switch
   - circuit breaker
   - IAM scoped synthesis
4. Record `@esocial/contracts` release state and SGP acceptance or RC
   exception.
5. Record S-1030/S-1040/S-1060 decision: active, retired, or still blocked
   with a reason that prevents production go-live.
6. Produce Round 3 hand-off: go-live prerequisites, risks, rollback controls,
   data-retention policy, and owner approval list.

## Verification

Run:

```bash
npm test
npm run lint
npm run build
npm run coverage
npm run test:integration
npm run integration:localstack
npm run cdk:synth
node scripts/assert-cdk-iam-scoped.mjs
npm audit --omit=dev --audit-level=high
```

If package publication is authorized, verify the release workflow result and
record it. Do not tag or publish without explicit release-owner request.

## Exit Criteria

- `docs/release/0.3.0/` is complete, redacted, and linked from top-level
  release docs.
- Round 2 closure target is marked PASS or each miss has an owner and blocks
  Round 3.
- Production submissions remain unauthorized until Round 3 approval.

## Report

Report evidence bundle contents, command results, owner approvals, contract
release state, remaining blockers, and Round 3 hand-off.
