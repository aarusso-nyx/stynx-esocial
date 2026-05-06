# Round 6 — Owner-Blocked Items

> **Scope:** the 7 owner-blocked items from the round-3 punch list — work
> that **requires explicit owner authorization, real certificate
> provisioning, real eSocial endpoints, deployed cloud infrastructure, or
> external vendor engagement.**
>
> **Prerequisites:** rounds 4 and 5 closed; R5 E1 verified every R6
> prerequisite is signed off.

---

## What "owner-blocked" means here

Every item in this round depends on a step that the engineering team
cannot do unilaterally:

- **Real cert provisioning** — a tenant onboarding flow with the
  Brazilian government PKI.
- **Real eSocial connectivity** — qualification endpoint usage requires
  a real cert + real CNPJ + acceptable-use agreement.
- **Restricted-production deployment** — needs operator sign-off and a
  budget allocation.
- **External pen test** — vendor selection, scope statement, NDA, fee.
- **Multi-region drill** — needs deployed restricted-production stack.
- **npm publish** — release-engineering authorization.

Every prompt in this round names the **specific authorization required**
at the top. Workers cannot start a prompt without that authorization
recorded in `docs/release/1.3.0/authorizations/`.

---

## Closure target ("done means")

A green CI pipeline + signed-off evidence proving:

1. **Real eSocial qualification round-trip** for at least one DTO per
   category (table, periodic, worker, SST, TS-V, benefit, exclusion,
   return). Real cert; real endpoint; real response codes captured;
   spool / audit envelopes published.
2. **Real cert provisioning + rotation automation** — `services/cert-rotator/`
   exercised against a real tenant cert with 30 / 7 / 0-day alarms.
3. **External pen-test report** attached at `docs/release/1.3.0/pentest/`;
   critical / high findings closed per the round-5 SLA.
4. **Multi-region active-passive failover drill** executed against
   restricted-production with logged RTO ≤ 1 h, RPO ≤ 5 min, and a
   tested failback.
5. **Synthetic monitoring canaries** running every 5 min in
   qualification + restricted-production. Drift detection demonstrated.
6. **`@esocial/contracts@1.1.0` published** to the npm registry; tag
   `contracts-v1.1.0`; SBOM + provenance attestation attached to the
   GitHub Release.
7. **`@esocial/sdk@1.0.0` published** to the npm registry; tag `sdk-v1.0.0`;
   SBOM + provenance attestation attached.

---

## Worker waves

R6 is **dependency-ordered** more than parallel. The deployment of real
infrastructure unblocks subsequent items.

### Wave A — Real-connectivity foundation (1)

| # | Prompt | Effort | Authorization required |
| --- | --- | --- | --- |
| A1 | [`prompts/A1-round-2-connectivity-execution.md`](prompts/A1-round-2-connectivity-execution.md) | 2 wk | Real cert, real CNPJ, gov.br acceptable-use, restricted-production deploy budget |

### Wave B — Cert + drills (3 parallel after A1)

| # | Prompt | Effort | Authorization required |
| --- | --- | --- | --- |
| B1 | [`prompts/B1-real-cert-provisioning-rotation.md`](prompts/B1-real-cert-provisioning-rotation.md) | 1 wk | Real cert provisioning agreement |
| B2 | [`prompts/B2-multi-region-dr-drill.md`](prompts/B2-multi-region-dr-drill.md) | 1.5 wk | Restricted-production multi-region budget |
| B3 | [`prompts/B3-synthetic-monitoring-deployment.md`](prompts/B3-synthetic-monitoring-deployment.md) | 1 wk | Owner approves canary scope per stage |

### Wave C — External engagement (1; can start in parallel with B)

| # | Prompt | Effort | Authorization required |
| --- | --- | --- | --- |
| C1 | [`prompts/C1-pen-test-execution.md`](prompts/C1-pen-test-execution.md) | 2 wk | Vendor selection + NDA + budget |

### Wave D — Releases (2 parallel; depend on R5 closure + R6 A1 stability)

| # | Prompt | Effort | Authorization required |
| --- | --- | --- | --- |
| D1 | [`prompts/D1-contracts-ga-publish.md`](prompts/D1-contracts-ga-publish.md) | 0.5 wk | Release-engineering sign-off |
| D2 | [`prompts/D2-sdk-ga-publish.md`](prompts/D2-sdk-ga-publish.md) | 0.5 wk | Release-engineering sign-off |

**Total**: ~5–8 engineer-weeks pure execution, but **calendar elapsed
time is dominated by external dependencies** (vendor scheduling, deploy
windows, owner approvals). Realistic calendar: **~4 weeks** with parallel
external work in flight.

---

## Operating principles

- **Authorization-by-default.** No prompt starts without the
  authorization recorded in `docs/release/1.3.0/authorizations/`.
- **Real PII handling.** Round-1 redaction policy + round-5 LGPD
  surface apply. Restricted-production never logs unredacted PII.
- **Reversibility.** Every deployment that touches restricted-production
  is reversible by a single command (R5 SLO burn alarms + R6 B2 failover
  cover the rollback paths).
- **No production-shape data leaks back to lower stages.** The bus is
  one-way restricted-production → audit; lower stages use synthetic
  fixtures.
- **Workers stay in scope.** Cross-cutting changes route through Wave A
  (foundation) before later waves.
- **Evidence redaction.** Real-cert serial numbers, employer CNPJs, etc.
  redacted in committed evidence; full evidence retained in the
  audit-anchor account only.

---

## Worker assignment

- **Eng 1 (SRE)**: A1 → B2.
- **Eng 2 (PKI)**: B1 → B3.
- **Eng 3 (Security)**: C1.
- **Eng 4 (Release)**: D1 → D2.

---

## Risk register

| Risk | Mitigation |
| --- | --- |
| Real cert delivery slips | A1 / B1 unblocked separately; A1 can run against a self-issued test cert in restricted-production while B1 negotiates the production cert path. |
| gov.br qualification endpoint outage during connectivity test | A1 retries with circuit breaker; SLO under chaos (R5 A2) covers the soft-failure mode. |
| Pen-test critical finding lands late | C1 vendor selection + scope kicks off in parallel with A1 so reports return before D1/D2 publish. |
| Multi-region drill exposes data-residency issue | B2 documents the issue in DPIA (R5 B2); failover deferred to R7 if unfixable in R6. |
| npm publish fires accidentally | D1 / D2 require manual `workflow_dispatch` plus `ESOCIAL_RELEASE_CONFIRM=1`; per-tag protection in GitHub. |

---

## Hand-off

- Round 5 → Round 6: R5 E1 verified all R6 prereqs.
- Round 6 → Round 7: R6 closure + any deferrals fold into the R7 plan
  drafted in R4 E1.

## Blocked Artifact Routing

Round 4 added owner/date/decision metadata to
`docs/release/1.0.0/blocked-artifacts.json` and copied the current lifecycle
view to `docs/release/1.1.0/blocked-artifacts.json`.

Round 6 owns:

- restricted-production
- real certificates
- official eSocial endpoint calls
- SDK publish

DR and multi-region drills route to Round 7 unless Round 6 B2 receives a
production-like infrastructure authorization early enough to execute the drill
inside Round 6.
