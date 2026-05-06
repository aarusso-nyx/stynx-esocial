# R2-C - Restricted-Production Deployment

> This batch deploys to restricted production only under explicit release-owner
> authorization and a named rollback window.

## Preconditions

- R2-B qualification evidence is accepted by release owner.
- Restricted-production deployment authorization is recorded.
- SRE on-call coverage and rollback owner are named.
- Legal/data decision remains valid for the deployment smoke payload.
- Kill switch and circuit breaker are enabled before deploy.

## Primary Write Scope

- `infra/cdk/**`
- generated deployment templates and deployment tests
- `docs/release/0.3.0/restricted-production/**`
- `docs/operations.md`
- `docs/release-checklist.md`

## Do Not Touch

- Production deployment stages.
- Real PII or unredacted SOAP payloads.
- Round 1 evidence except for references.

## Tasks

1. Synthesize restricted-production infrastructure with the exact artifact to
   deploy.
2. Assert IAM remains scoped: no wildcard `Resource: "*"` and no wildcard
   actions.
3. Deploy within the owner-approved window.
4. Run a restricted-production smoke check using the approved payload policy.
5. Capture redacted evidence:
   - artifact hash
   - synthesized template hash
   - IAM diff
   - endpoint route
   - status/audit/log/metric/trace identifiers
   - response hashes
6. Execute rollback using the approved rollback plan and prove the previous
   version is restored or the service is safely disabled.
7. Re-enable the kill switch after the window unless owner policy says
   otherwise.

## Verification

Run:

```bash
npm run cdk:synth
node scripts/assert-cdk-iam-scoped.mjs
npm test
npm run integration:localstack
```

Record deployment and rollback command output under
`docs/release/0.3.0/restricted-production/commands.md` with secrets redacted.

## Exit Criteria

- Restricted-production deploy and rollback evidence is complete.
- Kill switch, circuit breaker, and IAM scope are proven.
- No production submission occurs.
- Any restricted-production-specific fault mode is recorded for R2-E.

## Report

Report artifact hashes, IAM result, smoke result, rollback result, kill-switch
state, owner approvals, and newly observed fault modes.
