# C5 — SGP Migration Notes and Round-0 Evidence Bundle

> **Wave C, step 5.** Docs worker. Blocked by C1 + C2 + C3 + C4.

## Read first

- [`../plan.md`](../plan.md) — round-0 closure target item 11.
- A3's frozen contract package (now `@esocial/contracts@1.0.0`).
- C2's metric/log dictionary in `docs/operations.md`.
- C3's deployment notes.
- C1's runbooks for retry/DLQ/replay.

## Why this exists

SGP is the consumer this whole service exists to serve. They cannot
integrate without versioned DTOs, status semantics, error handling,
retry/DLQ semantics, and a cutover playbook. Operators need runbooks
that describe behavior the code actually exhibits.

## Tasks

1. **`docs/sgp-migration.md`** covering:
   - Per-event-family DTO that SGP must send (round 0 details the five
     active families; round 1 fills the rest, but the document
     structure exists now).
   - Spool/status update consumer behavior. Sample envelopes per
     status. Idempotency expectations. Replay safety.
   - Error categories per `consumers.md` and what SGP should do for
     each (retry, surface, alarm).
   - Retry/DLQ operator process — automatic vs. operator-driven.
   - Cutover steps — order of operations to switch SGP from the
     historical path to the new bus, with rollback.
2. **`docs/release-checklist.md`** covering:
   - Security: certificate custody, KMS, IAM least-privilege, XXE/DTD
     hardening, no secrets in repo, SBOM attached.
   - Data protection: PII handling, RLS verified, audit append-only.
   - Observability: structured logs, metrics, traces, alarms,
     dashboards wired and named per C2.
   - Migrations: forward-only, runnable from zero, deploy hook tested
     in LocalStack.
   - Rollback: how to revert a deployment, how to drain queues, how to
     restore DB to last-known-good.
   - Evidence retention: how long sandbox artifacts and audit logs are
     kept; where.
   Each item points at a runbook section, test, or commit hash.
3. **`docs/operations.md`** runbooks (extend C1/C2/C3 sections):
   - **Replay** (DLQ → request topic).
   - **DLQ triage decision tree.**
   - **Certificate rotation** (Secrets Manager + `tenant_certificate`
     row + cache invalidation).
   - **Sandbox outage** response (SOAP transport failures > X).
   - **Official rejection investigation** (regulatory category +
     reconciliation views).
   - **Tenant incident scope-down** (RLS-enforced isolation; how to
     freeze a tenant).
   - **Audit evidence extraction** (SQL queries against
     `audit_event_log`).
   Each runbook references real commands/APIs that exist in code.
4. **Round-0 evidence bundle** under `docs/release/0.1.0/`:
   - Tagged contract version (`@esocial/contracts@1.0.0`).
   - Input DTO fixtures per round-0 family.
   - Generated XML.
   - Signed payload hashes (no real PII).
   - SOAP-stub request/response.
   - Spool / audit envelopes published.
   - DB-state diff (before / after).
   - LocalStack round-trip recording (capture STDOUT / event timeline).
   - CI run URL for the round-0 closing PR.
5. **Restricted-production gating note.** Document that round 0 ships
   only the deterministic SOAP transport path. Round 2 (with explicit
   owner authorization) onboards real eSocial qualification connectivity.
6. **README rewrite.** The repo's `README.md` should now reflect
   reality: a working bus-driven eSocial service with five round-0
   families, full S-50xx returns, real CI, an end-to-end LocalStack
   round-trip. Include status badges (C4) and pointers to the new docs.

## Primary write scope

- `docs/sgp-migration.md` (new)
- `docs/release-checklist.md` (new)
- `docs/operations.md` (extend)
- `docs/release/0.1.0/**` (new evidence bundle)
- `README.md`
- `docs/consumers.md` (final accuracy pass)

## Do not touch

- Runtime code in `services/`, `packages/`. If a runtime change is
  needed, raise it via the appropriate worker.
- Infrastructure code — C3 owns it. If a deploy step is missing, raise
  to C3.

## Exit criteria

- SGP can integrate solely through `@esocial/contracts@1.0.0` and the
  documented bus surface; nobody on the SGP side needs to read eSocial
  internals.
- Every operator runbook references commands/APIs that exist.
- The 0.1.0 evidence bundle is reproducible from the tagged commit.
- `docs/release-checklist.md` lines all link to a runbook, a test, or a
  commit hash.
- Restricted-production scope is explicitly named round 2 with a deferred
  owner note.

## Verification

```text
ls docs/release/0.1.0/
gh release view contracts-v1.0.0
npm view @esocial/contracts@1.0.0  # if a real registry was wired
```

Report: docs added, runbook count, evidence-bundle artifacts, and the
list of round-1 / round-2 deferrals with named owners.
