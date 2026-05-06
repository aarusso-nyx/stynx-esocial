# Round 5 — Greenfield (Internal)

> **Scope:** the 13 greenfield items from the round-3 punch list — work
> that is **internal** (no external authorization, no real cert
> provisioning, no deployed cloud resources required) but is more than
> a quick win. Each item is ≥ 1.5 engineer-weeks.
>
> **Prerequisites:** round 4 closed.

---

## What "greenfield-internal" means here

Each item builds something **new**, but every test passes against
ephemeral Postgres + LocalStack + the deterministic SOAP stub. Nothing
in this round needs an owner signature, a real certificate, an actual
gov.br endpoint, or a deployed cloud account.

Three items in the punch list (S-1030/S-1040/S-1060 promotion, multi-
region DR, real-cert rotation automation) sit at the boundary. Round 5
takes:

- **S-1030 / S-1040 / S-1060**: yes — XSD selection is an internal
  product decision; XSDs are publicly published by gov.br and can be
  fetched without authorization.

Round 5 defers (to round 7):

- Multi-region DR drill (needs deployed infra).
- Cert rotation automation (needs real-cert provisioning sign-off).

---

## Closure target ("done means")

A green CI pipeline proving:

1. **Mutation testing** (Stryker) ≥ 80 % score on builders, returns,
   submission, PKI, transport. Per-package configs; nightly job;
   PR-shard.
2. **Chaos suite expanded** to 7 named scenarios (publisher fail, DB
   transient, SOAP timeout, cert-expiry race, RLS-context missing,
   clock skew, partial-batch). Weekly job + smoke per PR. SLO under
   chaos documented.
3. **Load tests** (`tests/load/`) with k6 covering smoke, sustained
   1000 RPS, spike 100 → 5000 RPS, and 8 h soak. Capacity model in
   `docs/operations.md`. Nightly smoke run.
4. **Threat model + attack tree** committed at `docs/security/`.
   STRIDE per major component. Reviewed by ≥ 2 engineers.
5. **LGPD DPIA + DSR APIs + retention sweeper.** `docs/compliance/lgpd-dpia.md`.
   `POST /lgpd/{access,erase,export}` deployed (auth = same as DLQ
   replay). Retention sweeper Lambda runs nightly with audit trail.
6. **SOC 2 evidence pack** — control matrix at
   `docs/compliance/soc2-control-matrix.md` + `scripts/soc2-evidence.mjs`.
7. **Secrets / KMS rotation** — every CMK has annual auto-rotation;
   DB credentials, JWT/API signing keys rotated per schedule with
   rolling-overlap support.
8. **Tamper-evident audit log** — per-tenant Merkle hash chain in
   `audit_event_log`; hourly anchor Lambda writes to immutable S3
   bucket; verifier CLI + HTTP endpoint; tamper test passes.
9. **Cost-attribution schema + observability** — every CDK resource
   tagged; per-tenant cost rows in `esocial.cost_attribution`;
   CloudWatch dashboard + AWS Budgets alarms.
10. **SLO definitions + burn-rate alarms** — availability, freshness,
    latency, error-rate SLOs; fast-burn page + slow-burn ticket
    alarms; SLO dashboard.
11. **Reference site** — Docusaurus deployed at a stable URL with
    event catalog, OpenAPI/AsyncAPI rendered, runbooks, ADRs,
    onboarding, release notes. Per-PR preview.
12. **S-1030, S-1040, S-1060 ACTIVE_FULL** — XSDs sourced; goldens
    aligned; all 35/35 non-return classes ACTIVE_FULL.
13. **Round-6 entry verification** — local prerequisites are recorded,
    external blockers are routed to Round 7, and Round 6 is unblocked
    for immediate/local work.

---

## Worker waves

5 engineers ship round 5 in **~3 weeks calendar**.

### Wave A — Test depth (3 parallel)

| # | Prompt | Effort |
| --- | --- | --- |
| A1 | [`prompts/A1-mutation-testing.md`](prompts/A1-mutation-testing.md) | 1.5 wk |
| A2 | [`prompts/A2-chaos-suite-expanded.md`](prompts/A2-chaos-suite-expanded.md) | 1.5 wk |
| A3 | [`prompts/A3-load-tests.md`](prompts/A3-load-tests.md) | 2 wk |

### Wave B — Security & compliance (5 parallel; B1 first)

| # | Prompt | Effort |
| --- | --- | --- |
| B1 | [`prompts/B1-threat-model.md`](prompts/B1-threat-model.md) | 2 wk |
| B2 | [`prompts/B2-lgpd-dpia-dsr.md`](prompts/B2-lgpd-dpia-dsr.md) | 2 wk |
| B3 | [`prompts/B3-soc2-evidence.md`](prompts/B3-soc2-evidence.md) | 1.5 wk |
| B4 | [`prompts/B4-secrets-kms-rotation.md`](prompts/B4-secrets-kms-rotation.md) | 1 wk |
| B5 | [`prompts/B5-tamper-evident-audit.md`](prompts/B5-tamper-evident-audit.md) | 1.5 wk |

### Wave C — Operability & cost (2 parallel)

| # | Prompt | Effort |
| --- | --- | --- |
| C1 | [`prompts/C1-cost-attribution.md`](prompts/C1-cost-attribution.md) | 1 wk |
| C2 | [`prompts/C2-slo-burn-alarms.md`](prompts/C2-slo-burn-alarms.md) | 1 wk |

### Wave D — Coverage gap & docs (2 parallel)

| # | Prompt | Effort |
| --- | --- | --- |
| D1 | [`prompts/D1-reference-site.md`](prompts/D1-reference-site.md) | 1 wk |
| D2 | [`prompts/D2-s1030-s1040-s1060-promotion.md`](prompts/D2-s1030-s1040-s1060-promotion.md) | 1 wk |

### Wave E — Closure

| # | Prompt | Effort |
| --- | --- | --- |
| E1 | [`prompts/E1-round-6-entry-verification.md`](prompts/E1-round-6-entry-verification.md) | 0.5 wk |

**Total**: ~16 engineer-weeks; ~3 weeks calendar with 5 engineers.

---

## Operating principles

- No external services in CI (LocalStack, ephemeral Postgres,
  deterministic SOAP stub only).
- Forward-only migrations. B5 + C1 land schema; A2 + B2 + B4 land
  callers.
- Workers stay in scope. Cross-cutting changes route through Wave E.
- Every prompt produces an artifact under `docs/release/1.2.0/<area>/`.

---

## Worker assignment

- **Eng 1 (Quality)**: A1 → A2.
- **Eng 2 (SRE)**: A3 → C2.
- **Eng 3 (Security)**: B1 → B5.
- **Eng 4 (Compliance)**: B2 → B3.
- **Eng 5 (Infra)**: B4 → C1 → D2 → E1.
- D1 (reference site) handled by whoever finishes first.

---

## Hand-off

- Round 4 → Round 5: round-4 closure verified; greenfield foundations
  in place (dev:up, ADRs, drift cron, SBOM scanners).
- Round 5 → Round 6: E1 verifies local prerequisites and routes external
  blockers to Round 7 before Round 6 starts.
