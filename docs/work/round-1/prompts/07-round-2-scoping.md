# 07 — Round-2 Scoping

> **Wave D (planning).** Blocked by Batch 6. Planner scope. **Plans only;
> does not implement.** Round-2 implementation is out of round-1 scope.

## Read first

- All round-1 outputs (especially Batch 5 `docs/release/0.2.0/round-2-scope.md`
  placeholder).
- Round-0 prompt B4 (SOAP and environments) for the deferred parts.
- `docs/release/0.2.0/`.

## Why this exists

Round 0 + round 1 ship a fully observable, fully tested, deterministic
service that runs end-to-end against the SOAP stub. The next round
takes the service to **real eSocial connectivity** — qualification
sandbox first, restricted-production later. That work requires
explicit owner authorization and a different risk profile (real
certificates, real personal data, real government endpoints, real
financial regulatory consequences).

This prompt produces the **round-2 plan and prompts**, mirroring the
round-0 / round-1 structure. It does not run round 2.

## Tasks

1. **Owner identification.** List the owners required:
   - Real eSocial credentials / portal account.
   - Real qualification certificate provisioning.
   - Restricted-production deployment authorization.
   - Real-PII test data authorization (or: explicit "no real PII" path
     using synthetic-but-validated payloads).
   - SRE on-call coverage during the connectivity window.
   - Legal sign-off on data movement.
2. **Round-2 closure target.** Define what "round-2 done" looks like:
   - Real qualification round-trip for a representative DTO per
     family or per category.
   - Real certificate rotation drill against Secrets Manager + KMS.
   - Restricted-production deployment with a documented rollback.
   - Live response-classification table updated with the codes
     observed in qualification.
   - Operator runbooks updated to reflect real fault modes (e.g.,
     known regulatory rejections).
3. **Round-2 plan.** Produce `docs/work/round-2/plan.md` mirroring the
   round-0 / round-1 layout: closure target, batches, exit criteria,
   risks, hand-off. Batches likely include:
   - **R2-A**: Real SOAP client wiring + production allowlist; pinned
     cert thumbprints from gov.br.
   - **R2-B**: Real qualification credentials in Secrets Manager;
     end-to-end qualification round-trip per category.
   - **R2-C**: Restricted-production deployment under operator
     authorization.
   - **R2-D**: Live regulatory-code coverage; gap-flag follow-up.
   - **R2-E**: Operator runbook update against real fault modes.
   - **R2-F**: Round-2 evidence bundle under `docs/release/0.3.0/`.
4. **Round-2 prompts.** Produce
   `docs/work/round-2/prompts/<batch>.md` per batch — self-contained
   briefs the same way round-1 prompts are. Each prompt:
   - States explicit owner authorization required.
   - Bans real PII unless the legal/owner sign-off is referenced.
   - Requires kill-switch / circuit-breaker behavior demonstrable
     before any real submission.
5. **Round-2 risk register.**
   - Real submission accidentally fired during testing → mitigation:
     stage-isolated deployment; integration tests cannot reach
     production endpoints by construction; explicit operator command
     to enable production transport.
   - Real PII landing in logs → mitigation: round-1 redaction policy
     plus Round 2 adds a dry-run replay against captured production
     traffic to assert redaction holds.
   - Cert provisioning fails on rotation → mitigation: rotation
     drill (Batch 6) is the round-2 prerequisite, not a discovery.
   - Regulatory-rejection codes round-1 didn't model → mitigation:
     gap-flag in returns processor (round-0 design) is the entry
     point; round-2 closes gaps observed in real responses.
6. **Round-2 prerequisites checklist.** A document inside the round-2
   plan listing the round-1 closure items that must be green before
   round 2 starts. At minimum:
   - All 15 round-1 closure items PASS.
   - Round-1 evidence bundle complete.
   - Lifted tree retired.
   - Observability parity for all 39 families.
   - Operator runbooks reference real implemented endpoints.
   - DLQ replay endpoint authenticated and tested.

## Primary write scope

- `docs/work/round-2/plan.md` (new)
- `docs/work/round-2/README.md` (new)
- `docs/work/round-2/prompts/**` (new)
- `docs/release/0.2.0/round-2-scope.md` (replace the placeholder from
  Batch 5 with a pointer to `docs/work/round-2/plan.md`)

## Do not touch

- Round-2 implementation. This prompt plans only.
- Round-0 or round-1 evidence bundles.

## Exit criteria

- `docs/work/round-2/plan.md` exists with closure target, batches,
  risks, hand-off, prerequisites.
- `docs/work/round-2/prompts/` has one prompt per batch, each
  self-contained.
- Round-2 owners are named and recorded.
- Round-2 cannot start until every round-1 closure item is PASS — the
  plan asserts this prerequisite explicitly.

## Verification

```text
ls docs/work/round-2/
wc -l docs/work/round-2/plan.md docs/work/round-2/prompts/*.md
```

Report: round-2 batches planned, owners named, prerequisites listed,
and any open round-1 items that round-2 depends on (so round-1 close
can sequence them last).
