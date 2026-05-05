# eSocial MQ Handler Diagnostics

## Verdict

The repository is not yet usable as a full eSocial MQ handler. It is currently a
boundary skeleton plus a large SGP lift-out evidence corpus. The fast checks are
green, but they mostly prove file presence and forbidden-string canaries, not
runtime correctness.

The intended product boundary is sound: eSocial should own XML generation, XSD
validation, signing, SOAP submission, return parsing, retry/DLQ, audit/status
publication, and operational evidence while SGP remains the HR/payroll system of
record. The current implementation does not yet satisfy that boundary.

## Current Runtime Path

Active submit path:

1. `services/submission/src/handler.ts` reads `event.Records`.
2. Each record body is parsed as JSON.
3. `SubmissionProcessor.process()` returns a deterministic `OK` response with
   synthetic protocol and receipt values.
4. A `SpoolUpdateEnvelope` is returned in memory.

What this path does not do:

- No contract/schema validation of the incoming record.
- No idempotency lookup or deduplication.
- No database writes.
- No queue publish to response, spool, audit, or DLQ topics.
- No XML builder dispatch.
- No XSD validation.
- No certificate lookup or signing.
- No SOAP call or sandbox adapter.
- No return/totalizer parsing.
- No retry classification or backoff.
- No observability beyond returned data.

## Gate Diagnostics

The command names currently overstate the evidence they provide:

| Gate | Current implementation | Diagnostic |
| --- | --- | --- |
| `npm test` | `node --test tests/contract/*.test.mjs` | Four structural assertions across two files. Useful smoke test, not runtime evidence. |
| `npm run lint` | `node scripts/check.mjs lint` | Required path and migration string checks. No ESLint. |
| `npm run build` | `node scripts/check.mjs build` | Same structural checker. No TypeScript compilation. |
| `npm run coverage` | `node scripts/check.mjs coverage` | Same structural checker. No coverage. |
| `npm run test:db` | `node scripts/check-migrations.mjs test:db` | Regex check for RLS/audit/forbidden primitives. No PostgreSQL execution. |
| `npm run migrate:dev` | Same migration checker | Does not migrate a database. |
| `npm run integration:localstack` | Same migration checker | Does not start or verify LocalStack. |
| `npm run test:integration` | Same migration checker | No integration test execution. |
| `npm run cdk:synth` | Custom JSON writer | Produces static queue/event bus skeletons, not CDK synthesis. |

## Boundary Diagnostics

### Direct SGP Coupling Remains

The hard boundary forbids direct SQL, shared schemas, cross-database coupling,
and shared DB URLs with SGP. The lifted tree still contains direct SGP database
access patterns:

- 52 files under `packages/domain/src/sgp-lifted/esocial-worker/` reference
  `public.*`, `hr.*`, `payroll.*`, or `saude.*`.
- Submission, retry, status-sync, exclusion, worker, and queue-adapter code
  update or read `public.esocial_event` directly.
- Event builders read SGP-owned domain tables such as `hr.employee`,
  `hr.company`, `payroll.payroll_run`, `payroll.employee_payroll_item`,
  `saude.aso_record`, `saude.cat_emission`, and related tables.

This is acceptable as migration evidence only. It is a release blocker for a
standalone eSocial MQ handler.

### Database Shape Does Not Match Code

Migrations currently create only:

- `esocial.submission_message`
- `esocial.submission_batch`
- `esocial.event_record`

The lifted runtime references many additional `esocial` relations and types,
including but not limited to:

- `esocial.tenant_certificate`
- `esocial.endpoint_circuit_state`
- `esocial.event_retry_schedule`
- `esocial.response_classification`
- `esocial.s1xxx_dispatch_state`
- `esocial.s1200_emission_state`
- `esocial.s1202_emission_state`
- `esocial.s1210_emission_state`
- `esocial.s1299_emission_state`
- `esocial.s2200_emission_state`
- `esocial.s2205_pending_alteration`
- `esocial.s2210_pending`
- `esocial.s2220_pending`
- `esocial.s2230_pending`
- `esocial.s2240_pending`
- `esocial.s2298_event`
- `esocial.s2299_pending`
- `esocial.s2306_event`
- `esocial.s3000_request`
- `esocial.esocial_totalizer`
- `esocial.xsd_validation_failure`
- `esocial.v_competence_periodics_pending`
- `esocial.v_event_failures`

The code cannot run against the current migration set.

### Lifted Runtime Is Not Compileable Standalone

The repository has no root `tsconfig`, no lockfile, and no real dependency set.
Lifted source imports dependencies and local SGP modules that are not present as
standalone packages:

- External dependencies: `@nestjs/*`, `pg`, `libxmljs2`, `soap`,
  `xml-crypto`, `node-forge`, `class-validator`, and AWS queue-related modules.
- Missing local modules: `../../database`, `../../common`, `../../audit`,
  `../../auth`, `../../documents`, `../../esocial-spool`,
  `../../folha-pagamento`, and `../../integrations/stynx-esocial/contracts`.
- Lifted tests under `tests/sgp-lifted/backend/` still import
  `../../backend/src/...`, which does not exist in this repository.

The active gates avoid this by not compiling these files.

## Contract Diagnostics

Contracts are useful but not complete enough for a production bus:

- `EsocialRelayEventClass` is currently only `'S-1299'`, while docs list the
  full S-1xxx, S-12xx, S-22xx, S-23xx, S-24xx, S-2501, S-3000, and S-50xx
  surface.
- Queue response status is `OK | RETRY | DEAD_LETTER`, while consumer docs
  describe accepted, rejected, retry, timeout, dead-lettered, failed, and
  richer status flows.
- `SpoolUpdateEnvelope` does not model all documented states such as
  `BUILDING`, `VALIDATION_FAILED`, `SIGNED`, `TIMEOUT`, and `EXCLUDED`.
- Error category taxonomy in docs is not enforced in exported types.
- There is no published versioned SDK/client artifact for SGP.

## Infrastructure Diagnostics

Current infrastructure is a static skeleton:

- Event bus: `esocial-events`.
- Queues: submit request FIFO, submit response FIFO, submit DLQ FIFO.
- Stages: `dev` and `qa`.

Missing for intended use:

- Lambda/service definitions for all handlers.
- IAM policies, queue policies, encryption, redrive policies, alarms, and
  retention.
- EventBridge rules for audit/status.
- RDS/schema migration deployment.
- Secrets/certificate storage and rotation plumbing.
- LocalStack-backed integration environment.
- Environment separation for qualification, restricted production, and
  production.

## Test Diagnostics

Current test assets are valuable but not active:

- 2 active contract test files.
- 154 copied SGP backend test files under `tests/sgp-lifted/backend/`.
- 41 lifted domain `*.spec.ts` files under `packages/domain/src/sgp-lifted/`.
- 54 golden XML files under `docs/templates/golden/`.

The active test command only runs the two `tests/contract/*.test.mjs` files.
Therefore the repository currently has no executable evidence for:

- TypeScript compilation.
- XML builder correctness by event family.
- XSD validation.
- Signing/certificate behavior.
- SOAP stub behavior.
- Retry/DLQ behavior.
- Real database migration and tenant RLS.
- SQS/EventBridge integration.
- Return/totalizer ingestion.

## Production-Use Risks

| Risk | Severity | Reason |
| --- | --- | --- |
| False green CI | Critical | `build`, `coverage`, DB, and integration commands pass without executing their named responsibilities. |
| SGP boundary violation | Critical | Lifted code still reads/writes SGP schemas directly. |
| Non-runnable runtime | Critical | Missing dependencies, local modules, tsconfig, and migration coverage prevent standalone execution. |
| Contract undercoverage | High | Only S-1299 submit is typed in the active relay contract. |
| Database mismatch | High | Runtime references many relations absent from migrations. |
| Operational opacity | High | No metrics, traces, dashboards, alarms, runbooks, replay, or DLQ handling. |
| Infra incompleteness | High | Static queue skeleton does not deploy the service. |
| Security gap | High | PKI/certificate custody is not implemented as a standalone package/service boundary. |
| Documentation drift | Medium | Reference docs contain at least one stale `docs/refs` path and docs describe behavior not yet enforced by tests. |

## Diagnostic Conclusion

Current status is pre-production and pre-runtime. The repository is a good
starting shell for the standalone eSocial bus, with a large amount of useful
lifted source and evidence. To become a full MQ handler, the next work must
convert the current structural gates into real executable gates, remove SGP DB
coupling, implement the autonomous `esocial` data model, and wire the queue path
through contract validation, XML/XSD, signing, SOAP/sandbox, return parsing,
retry/DLQ, and status/audit publication.
