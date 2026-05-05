# C2 — Observability

> **Wave C, step 2.** Ops worker. Blocked by B1 + B4 + B5. Parallel with C1, C3.

## Read first

- [`../../plan.md`](../../plan.md) — Phase 8 (observability portion).
- [`../assessment.md`](../assessment.md) — observability gaps.

## Why this exists

There is no logger, no metrics, no traces. Production operability is
impossible. C2 introduces structured logging with correlation, named
metrics, OTel traces, alarms, and PII redaction.

## Tasks

1. **Logger.** Adopt `pino`. Single shared logger factory at
   `packages/domain/src/observability/logger.ts`. Required fields per
   line:
   - `requestId`, `correlationId`, `tenantId`, `eventClass`, `batchId`,
     `protocol`, `receipt`, `idempotencyKey`, `attempt`, `stage`.
   - Levels: `debug | info | warn | error`. Default `info` in
     production, `debug` in qualification.
2. **Adoption.** Wire the logger through every active service
   (`submission`, `retorno`, `certificado`, `http-gateway`, `tabelas`,
   `trabalhador`, `folha`, `fechamento`, `exclusao`). Log at every
   stage transition: ingress → idempotency-lookup → build → xsd → sign →
   submit → parse-return → publish. One `info` line per stage.
3. **PII redaction.** A redaction policy:
   - Never log full XML payloads.
   - Never log certificate fingerprints in full (last 8 chars only).
   - Never log CPF, CNPJ in full (mask middle digits).
   - Never log salaries.
   - A test that asserts a known PII fixture does not appear verbatim
     in the captured log stream.
4. **Metrics.** CloudWatch EMF (or chosen library) emitting:
   - Counters: `accepted`, `rejected`, `retry`, `dlq`, `timeout`,
     `validation_failed`, `parser_failures`, `circuit_open_events`.
   - Histograms: `soap_latency_ms`, `xsd_latency_ms`, `sign_latency_ms`,
     `queue_age_ms`.
   - Document every name in `docs/operations.md`.
5. **Traces.** OpenTelemetry SDK with explicit spans around: handler,
   ingress validation, idempotency lookup, build, xsd, sign, soap,
   parse-return, persist, publish. Correlation id propagated as the
   trace's baggage and via SQS message attributes.
6. **Alarms (declared, deployed by C3).** A canonical alarm registry in
   `infra/cdk/src/alarms.ts` that C3 references:
   - `RejectedRateAlarm`: rejected/min > X.
   - `DlqGrowthAlarm`: DLQ depth > X.
   - `SoapLatencyP99Alarm`: p99 > X ms.
   - `CertificateExpiringAlarm`: any tenant cert with `not_after - now < 30 days`.
   - `CircuitOpenAlarm`: any endpoint state `open` for > X min.
7. **Dashboards.** Declared as code in `infra/cdk/src/dashboards.ts`.
   Top-line panel: throughput, DLQ depth, rejected rate, p99 SOAP
   latency, circuit state per endpoint.

## Primary write scope

- `packages/domain/src/observability/**`
- Hooks in every `services/*/src/handler.ts`
- `infra/cdk/src/alarms.ts`, `dashboards.ts` (declarations consumed by C3)
- `docs/operations.md` — metric/log dictionary

## Do not touch

- Retry/DLQ behavior — C1 owns it. C2 instruments what C1 emits.
- CDK stack composition — C3 owns it. C2 only declares alarm/dashboard
  constructs that C3 instantiates.
- Contracts / migrations / builders / signing.

## Exit criteria

- Every active handler logs at every named stage with all required
  fields.
- PII redaction test passes.
- Metrics list in `docs/operations.md` matches code emissions exactly
  (a CI grep verifies).
- Alarm registry compiles and is consumed by C3's stacks.
- Trace spans appear in `npm run test:integration` runs (assert via
  in-memory exporter).

## Verification

```text
npm run build
npm run test:integration
grep -R "console\\.log" services packages --include="*.ts" | grep -v sgp-lifted | grep -v "test"
# Expected: nothing — Pino only
```

Report: log fields per stage (table), metric names list, PII redaction
checks, and the alarm registry size.
