# Round 1 — Production-Grade Closure Plan (Revised)

> **Scope:** close the structural gaps round 0 left open, promote the
> remaining ~30 event families end-to-end along the round-0 pipeline, retire
> the lifted tree, and produce a release-ready 0.2.0 evidence bundle.
>
> **Inputs:**
> - [`./assessment.md`](./assessment.md) — round-1 entry audit synthesis.
> - [`../round-0/plan.md`](../round-0/plan.md) — round-0 charter and exit
>   criteria.
> - [`../round-0/prompts/`](../round-0/prompts/) — round-0 prompts (read for
>   conventions; do not re-execute).
> - `docs/release/0.1.0/` — round-0 evidence bundle.

This plan **supersedes** the prior round-1 plan in this directory. The
original batch model is preserved and extended. New batches were added at
both ends to address gaps surfaced by the round-0 closure audit.

---

## What changed vs. the prior round-1 plan

The prior plan ([git history: "Plan round 1 builder promotion"]) framed
round 1 as pure builder promotion. The audit found that:

- Round 0 missed 4 of its 11 closure items (cdk:synth, coverage ≥80 %,
  publish, partial CI).
- Several runtime/security gaps shipped through round 0 (DLQ auth,
  idempotency-not-invoked, envelope version not enforced, append-only not
  tested, lifted tree not shrunk).

Promoting 30 families on top of those gaps would compound risk. Round 1
therefore opens with **Batch 0 (round-0 fixups)** and closes with
**Batch 6 (hardening + closure)**. Builder-promotion batches 1–4 keep
their original scope but now also delete the corresponding lifted source as
they land, instead of deferring it to a final cleanup.

---

## Batch overview

| Batch | Purpose | Blocks | Prompt |
| --- | --- | --- | --- |
| 0 | Close round-0 structural gaps before promoting more code | 1–6 | [`prompts/00-round-0-fixups.md`](prompts/00-round-0-fixups.md) |
| 1 | Promote remaining table events (S-1005, S-1020, S-1050, S-1070; gated S-1030, S-1040, S-1060) | 2 | [`prompts/01-remaining-tables.md`](prompts/01-remaining-tables.md) |
| 2 | Promote remaining periodic events (S-1202, S-1207, S-1210, S-1298) | 3, 4 (S-1207 ↔ S-2410) | [`prompts/02-remaining-periodic.md`](prompts/02-remaining-periodic.md) |
| 3 | Promote worker / SST / TS-V events (S-2205, S-2206, S-2210, S-2220, S-2230, S-2240, S-2298, S-2299, S-2300, S-2306, S-2399) | 4 (S-2298 reintegration may interact with benefit reactivation) | [`prompts/03-worker-sst-tsv.md`](prompts/03-worker-sst-tsv.md) |
| 4 | Promote benefits / process / exclusion events (S-2400, S-2405, S-2410, S-2416, S-2418, S-2420, S-2501, S-3000) | 5 | [`prompts/04-benefits-process-exclusion.md`](prompts/04-benefits-process-exclusion.md) |
| 5 | Cleanup, evidence, docs alignment, contracts 1.1 release | 6 | [`prompts/05-cleanup-and-evidence.md`](prompts/05-cleanup-and-evidence.md) |
| 6 | Hardening pass: DLQ auth, TLS, redaction tests, RLS-deny tests, dead-code service handlers, observability completeness | release | [`prompts/06-hardening.md`](prompts/06-hardening.md) |
| 7 | Round-2 scoping (real eSocial connectivity) — planning only | round-2 | [`prompts/07-round-2-scoping.md`](prompts/07-round-2-scoping.md) |

Within batches 1–4, families with disjoint write scopes can be promoted in
parallel by separate workers. Batch 0, 5, 6, 7 are coordinator-scope and
must not run concurrently with each other.

---

## Round-1 closure target ("done means")

Round 1 is closed when **every** item below is provable from CI:

1. All 11 round-0 closure items pass (no PARTIAL/FAIL remains).
2. `npm run cdk:synth` exists, runs **real** CDK synthesis for `qualification`,
   `restricted-production`, and `production` stages. A CI step asserts no
   `Resource: "*"` and no wildcard actions in synthesized templates.
3. `npm run coverage` enforces ≥85 % statements / ≥80 % branches on
   `packages/contracts`, `packages/domain` (excluding `sgp-lifted/`),
   `packages/pki-pades`, and active services. The `node --test` suites are
   instrumented (vitest takes them over **or** a c8 wrapper aggregates both
   runners; either is acceptable).
4. **Every non-return event class is ACTIVE_FULL.** DTO, builder, golden,
   metadata test, invalid-DTO test, integration test, and dispatcher entry
   for all 30 remaining families. `EsocialRound1PendingDto` is removed.
5. `packages/domain/src/sgp-lifted/` is **empty** or contains only an
   explicitly documented evidence subset with a per-file reason and an
   exclusion entry in `tsconfig.json`. `tests/sgp-lifted/` is deleted.
6. **DLQ replay endpoint is authenticated.** IAM SigV4 (or API Gateway
   authorizer); test asserts unauthenticated `POST /dlq/:id/replay`
   returns 401/403. Audit row appended on every successful replay.
7. **Idempotency-key invoked at ingress.** Handler calls
   `buildEsocialIdempotencyKey`; envelope schema rejects messages without a
   key; test covers both rules.
8. **Envelope `version: 'v1'` enforced** at ingress with a typed rejection.
9. **Append-only mutation rejection tested.** A test attempts UPDATE/DELETE
   on `audit_event_log` and `event_status_history` under the worker role
   and asserts rejection.
10. **PII redaction tested.** A fixture containing CPF/CNPJ/salary/cert
    fingerprint flows through Pino; captured output asserts no verbatim
    leak.
11. **`rejectUnauthorized: true` explicit and tested** for the real SOAP
    client per stage.
12. **Five no-op services either implemented or removed.** `tabelas`,
    `trabalhador`, `folha`, `fechamento`, `exclusao` either become real
    routing surfaces or are deleted from CDK and the workspaces. No
    placeholder Lambdas in production templates.
13. `@esocial/contracts@1.1.0` published from CI on `main` merge or
    explicit owner approval; CHANGELOG updated; SBOM attached to release.
14. `docs/release/0.2.0/` evidence bundle exists with: contract version
    delta, full per-family DTO/golden/metadata index, CI run URL, IAM
    audit, coverage report, integration trace, redaction proof,
    DLQ-auth proof, append-only proof.
15. README and `docs/README.md` rewritten to reflect production state.
    Operator runbooks updated to match implemented behavior; round-2
    deferrals named with owners.

If any of those 15 items is structural-only or partial, round 1 is not
closed.

---

## Operating principles (round-wide)

- **Round-0 fixups land first.** No family promotion proceeds while
  round-0 closure-target items are FAIL/PARTIAL.
- **Each batch shrinks the lifted tree.** A family's lifted source is
  deleted in the same change that promotes it. Round 5 is alignment, not
  bulk deletion.
- **No structural-only gates.** Every claim must be CI-provable.
- **No SGP schema reads/writes.** Promoted code uses opaque source ids
  via DTO fields, not `hr.*` / `payroll.*` / `saude.*` /
  `public.esocial_event` reads. Round 0's scripts/check.mjs canary stays
  on; batch 6 adds a positive-assertion canary that no active code
  imports `sgp-lifted/`.
- **Idempotent and deterministic.** Same DTO → same XML bytes → same
  signed payload → same persisted state.
- **Append-only history.** No UPDATE/DELETE on
  `audit_event_log`/`event_status_history` from the worker role.
- **Forward-only migrations.** No mutating edits to landed migration
  files.
- **No real certificates / endpoints / production data.** The
  deterministic SOAP stub remains the only transport in CI. Real
  qualification/restricted-production connectivity is **round 2**.
- **Workers stay in scope.** Each prompt declares its **Primary write
  scope** and a **Do not touch** list. Cross-cutting changes route
  through Batch 0 or Batch 6.

---

## Per-family inventory (unchanged from prior round-1 plan)

The detailed per-family table — with lifted builder paths, direct SGP
table reads to remove, golden fixtures, XSD bindings, and inter-family
dependencies — remains valid and is referenced by batches 1–4. See the
`prompts/0X-…md` files for batch-scoped checklists. Three table families
need XSD/leiaute decisions before promotion (S-1030, S-1040, S-1060).
Two families need new copied goldens before promotion (S-2298, S-2306).

---

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Coverage instrumentation fix (Batch 0) breaks unrelated tests | Land in its own PR; require CI green before any Batch ≥1 work begins. |
| CDK `cdk:synth` script wiring discovers IAM wildcards in existing stacks | Treat as Batch 0 critical; do not defer to Batch 6. |
| Round-0 fixups touch the same files as Batch 1–4 promotions | Batch 0 is sequenced **before** all promotion batches; promotion workers rebase after Batch 0 lands. |
| Lifted source deletion in Batches 1–4 hides a runtime regression | Each promotion change must include the integration test that demonstrates the active builder/handler covers what the lifted source did. |
| S-1030 / S-1040 / S-1060 XSD blockers stall Batch 1 | Each family is independently shippable. Promote the unblocked ones; defer the blocked ones to a Batch-1B follow-on with an explicit owner for the leiaute decision. |
| Idempotency-key enforcement breaks SGP-side mocks | Coordinate with SGP integration owner; bump `@esocial/contracts` to 1.1.0 with a CHANGELOG note and a one-round overlap. |
| Removing 5 no-op services breaks CDK templates | Batch 6 owns deletion; CI synth gate (Batch 0) is in place by then to catch IAM/template regressions. |

---

## Hand-off

- **Round 0 → Round 1**: this plan + `assessment.md` + `prompts/`.
- **Round 1 → Round 2**: closure of all 15 items above + `prompts/07-round-2-scoping.md`
  with a real, owner-named scope for eSocial-sandbox connectivity, real
  certificate provisioning, and restricted-production deployment.

Round 2 is **not** part of round 1. Real-eSocial connectivity, real
certificates, and restricted-production deployment require explicit
owner authorization.
