# R2-A Foundation Evidence

## Scope

Local-only execution of the R2-A foundation tasks. This evidence does not
authorize official eSocial endpoint calls, real certificates, real PII, or
restricted-production deployment.

## Changes

- Copied the retained S-1.3 XSD bundle into
  `packages/domain/src/xml/xsd/bundle/`.
- Updated active builder metadata from
  `packages/domain/src/sgp-lifted/esocial-worker/xsd/*.xsd` to
  `packages/domain/src/xml/xsd/bundle/*.xsd`.
- Removed the compatibility mapping in
  `packages/domain/src/xml/xsd-validation.ts`; validation now reads active
  metadata paths directly.
- Removed `packages/domain/src/sgp-lifted/` from the package tree.
- Removed the `src/sgp-lifted/**` TypeScript exclusion.
- Kept the boundary canary that fails any active `sgp-lifted/` import.

## Start Gate Result

| Gate | Result |
| --- | --- |
| Round 1 release checklist has no open item | FAIL: owner-blocked items remain. |
| Owner approvals recorded | FAIL: `docs/release/0.3.0/owners.md` records none. |
| Real-service submission disabled by default | PASS for this local batch: no official endpoint commands were run. |
| XSD bundle in active ownership | PASS pending verification gates. |

## Blocked Batches

- R2-B qualification round trips remain blocked until owners approve real
  credentials, certificate custody, legal/data policy, and SRE coverage.
- R2-C restricted-production deployment remains blocked until release-owner
  authorization and rollback window are recorded.
- R2-D, R2-E, and R2-F remain blocked for official-response/runbook evidence
  until R2-B/R2-C produce redacted official artifacts.

## Local Verification

Commands run from repository root on 2026-05-05 America/Sao_Paulo:

| Command | Result |
| --- | --- |
| `pwd` | PASS: `/Users/aarusso/Development/stech/stynx-esocial`. |
| `git status --short --branch` | PASS: clean start on `main...origin/main [ahead 6]`. |
| `npm test` | PASS: 88 tests. |
| `npm run build` | PASS. |
| `npm run lint` | PASS. |
| `npm run lint:boundaries` | PASS. |
| `npm run test:integration` | PASS: 20 tests. |
| `npm run integration:localstack` | PASS: local queue/event/PostgreSQL round trip completed. |
| `npm run cdk:synth` | PASS: qualification and restricted-production stacks synthesized. |
| `node scripts/assert-cdk-iam-scoped.mjs` | PASS: 175 IAM statements scanned; wildcard actions/resources: 0. |

No official eSocial host, real certificate, or real PII fixture was used.
