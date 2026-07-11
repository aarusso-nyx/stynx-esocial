# Release-Critical Mutation Scope

## Decision

The required mutation gate is `npm run mutation:release-critical`. It exercises
`packages/domain/src/builders/**/*.ts`, the code which turns versioned eSocial
event DTOs into XML that is validated, signed, submitted, and made auditable.
The harness covers every active promoted event builder against committed golden
XML, production environment encoding, invalid DTO rejection, and dispatcher
routing. Its Stryker break threshold is 70%.

This scope is release-critical because an undetected change can alter a
regulatory XML payload or dispatch the wrong event family. It is deliberately
separate from the broader domain module so the threshold describes executable
coverage of the release contract rather than a mixed implementation-debt
metric.

## Full-domain evidence

`npm run mutation:full` remains the scheduled/manual full-domain evidence lane.
Its 2026-07-11 baseline is 24.35% and does not satisfy the 70% full-domain
threshold. The workflow records that condition as an explicit GitHub Actions
warning and uploads `summary.json` plus the Stryker reports, but does not fail
the evidence job. That score is retained as visible hardening debt; it is
neither treated as a passing gate nor hidden by lowering the full-domain
threshold.

The full report is uploaded by the `mutation` workflow. A future expansion of
the release-critical scope must add focused tests first and continue to meet
the same 70% Stryker break threshold.
