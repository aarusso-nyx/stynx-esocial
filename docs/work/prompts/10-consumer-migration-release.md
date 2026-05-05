# 10 — SGP Consumer Migration and Release Evidence

> **Phase 10 of [`../plan.md`](../plan.md).** Wave 3, runs last. Owns the
> `Docs/runbook worker` scope and the contract publication metadata.

## Context

Read first:

- [`../inv.md`](../inv.md) — "Documentation is useful and honest about
  gaps, but there is no operations runbook, no consumer SDK reference,
  no sandbox evidence."
- [`../diag.md`](../diag.md) — "Diagnostic Conclusion" frames the
  pre-runtime state at the assessment commit; this phase is the inverse:
  the release-readiness sign-off.
- [`../plan.md`](../plan.md) — Phase 10 task list and exit criteria.
- [`../../consumers.md`](../../consumers.md) — what SGP consumes today.

By this phase, the runtime is real. This phase produces the artifacts SGP
needs to integrate and the evidence operators need to ship.

## Operating principles

- The contract package is the **only** integration surface for SGP. SGP
  must not need to read eSocial internals. If SGP needs information that
  is not on the wire, the wire is wrong — fix it via Phase 2 ownership.
- Sandbox evidence first, restricted-production evidence only with
  explicit owner authorization. Do not use real production data.
- Release evidence is reproducible: every claim in the checklist points
  at a CI artifact, a runbook, a test, or a logged decision.

## Tasks

1. **Publish the contract package.** Configure `packages/contracts/` for
   versioned publication (npm registry or internal artifactory — pick
   one and document). Tag a `v1.0.0`. Include:
   - Type definitions for every envelope.
   - JSON schema files for each envelope (generated from the types).
   - Example payloads for every event class (drawn from the contract
     fixtures locked in Phase 2).
   - A `CHANGELOG.md` listing the surfaces shipped.
2. **SGP migration notes.** Add `docs/sgp-migration.md` covering:
   - Request DTOs per event class — what SGP must send.
   - Status update consumer behavior — how SGP handles the spool topic.
   - Idempotency expectations — including replay safety.
   - Error handling — per category from `consumers.md`.
   - Retry/DLQ operator process — what's automatic vs. operator-driven.
   - Cutover steps — order of operations to switch SGP from the
     historical path to the new bus, including rollback.
3. **End-to-end sandbox evidence.** Run a deterministic, fixture-based
   round trip across the full surface (submit → sign → SOAP stub →
   parse return → publish status). Capture the artifacts in a release
   evidence folder under `docs/release/<version>/`:
   - Input envelopes.
   - Generated XML.
   - Signed payload hashes.
   - SOAP stub request/response.
   - Status/spool envelopes published.
   - DB state diff.
4. **Restricted-production evidence (gated).** Only after explicit owner
   authorization, run the same flow against the qualification/restricted
   environment. Capture the same artifact set. Redact any PII. Do **not**
   commit real personal data.
5. **Release readiness checklist.** Add `docs/release-checklist.md`
   covering at minimum:
   - Security: certificate custody, KMS, IAM least privilege, XXE/DTD
     hardening, no secrets in repo.
   - Data protection: PII handling, RLS verified, audit append-only.
   - Observability: structured logs, metrics, traces, alarms, dashboards
     wired and named per Phase 8.
   - Migrations: forward-only, runnable from zero, deploy hook tested.
   - Rollback: how to revert a deployment, how to drain queues, how to
     restore DB to last-known-good.
   - Evidence retention: how long sandbox artifacts and audit logs are
     kept, where.
   Each item points at a runbook section, test, or commit hash.

## Primary write scope

- `packages/contracts/package.json` (publication metadata)
- `packages/contracts/CHANGELOG.md` (new)
- `docs/consumers.md` (final pass for SGP-facing accuracy)
- `docs/sgp-migration.md` (new)
- `docs/release-checklist.md` (new)
- `docs/release/<version>/` (evidence)

## Do not touch

- Runtime code in `services/` and `packages/domain/` — this phase is
  evidence and documentation. If a runtime change is needed, raise it
  via the appropriate phase owner.
- Infrastructure — Phase 9 owns it. If a stage config is missing, raise
  it as a Phase-9 follow-up.

## Exit criteria

- SGP can integrate solely through backend-produced envelopes and status
  events. No SGP code reads eSocial internals.
- eSocial owns operational dashboards and certificate/DLQ/replay
  workflows.
- Release evidence proves contract, runtime, database, infra,
  operations, and sandbox behavior.
- A tagged contract package version is publishable from CI.
- Restricted-production evidence is either captured (with authorization)
  or explicitly deferred with a named owner and a date.

## Verification commands

```text
npm run build
npm run lint
npm test
npm run test:db
npm run test:integration
npm run integration:localstack
npm run templates:check
# Generate a fresh evidence bundle:
node scripts/release-evidence.mjs --version <semver>   # implement if missing
```

Report: contract package version published, SGP migration step count,
evidence artifacts captured, and the open items deferred from the
release checklist with named owners.
