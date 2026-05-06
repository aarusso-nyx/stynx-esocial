# Round 6 — Immediate Closure + Platform Expansion

## Objective

Round 6 is the immediate execution round. It absorbs the former platform-expansion
platform-expansion plan plus the locally unblockable R4/R5 carryover work.

The boundary is explicit:

- **Round 6:** work the repository can advance with local code, CI, docs,
  deterministic tests, LocalStack/sandbox evidence, and internal operator
  workflows.
- **Round 7:** work that needs external authorization, real certificates,
  real eSocial endpoints, deployed restricted-production AWS infrastructure,
  external vendor engagement, npm publishing approval, or real account/billing
  evidence.

Round 6 must not route work to a later scratch round. Deferred/external work now lives in
[`../round-7/`](../round-7/).

## Prerequisites

- Round 4 quick wins shipped scaffolds; four R4 carryover items are tracked as
  Batch F1.
- Round 5 greenfield-internal hardening shipped most of its scope but left hard
  local blockers and partial internal-security work. Round 6 absorbs those as
  Batches F2-F5.
- External/owner-blocked R5 items and the previous owner-blocked plan are removed from this round and
  are now tracked in Round 7.

## Carryover Backlog

Round 6 absorbs seven immediate carryover items across five F-batches.

### Batch F1 — R4 Carryover

Owned by [`prompts/F1-round-4-carryover.md`](prompts/F1-round-4-carryover.md).

| # | Item | Current state | Desired state |
| --- | --- | --- | --- |
| F1.1 | Coverage targets | 78.97 % line / 70.98 % branch / 79.84 % function. CI gate at 70 %. | >= 95 % line / >= 95 % function / >= 90 % branch. CI gate at 95 / 90 / 95 with no override. |
| F1.2 | Onboarding doc dry-run | `docs/onboarding.md` written; no Day-1 dry-run evidence. | Dry-run evidence captured and friction fixes merged. |
| F1.3 | External scanner proof | OSV/Trivy workflow added but not proven. | One CI run green; SBOM artifacts attached. |
| F1.4 | Fresh-clone Docker cold-start | `dev:up` tooling exists; no timing evidence. | Fresh clone boots in < 5 min; timing recorded. |

### Batch F2 — R5 Mutation Testing

Owned by [`prompts/F2-mutation-testing-closure.md`](prompts/F2-mutation-testing-closure.md).

| # | Item | Current state | Desired state |
| --- | --- | --- | --- |
| F2.1 | Mutation score | `npm run mutation` executes but fails: 0 % score with 3902 survived mutants and 2218 compile/runtime errors. | Stryker config compiles cleanly and reaches the accepted mutation threshold across the target surface. |

### Batch F3 — S-1030 / S-1040 / S-1060 Promotion

Owned by [`prompts/F3-s1030-s1040-s1060-promotion.md`](prompts/F3-s1030-s1040-s1060-promotion.md).

| # | Item | Current state | Desired state |
| --- | --- | --- | --- |
| F3.1 | Leiaute table promotion | S-1030, S-1040, and S-1060 remain pending. | Typed DTOs, builders, schemas, goldens, metadata tests, and integration tests land; pending classification is removed for these families. |

### Batch F4 — LGPD Runtime

Owned by [`prompts/F4-lgpd-runtime-closure.md`](prompts/F4-lgpd-runtime-closure.md).

| # | Item | Current state | Desired state |
| --- | --- | --- | --- |
| F4.1 | DSR API | DPIA draft, PII catalog, and retention columns exist. No runtime DSR API. | DSR endpoints are reachable, auth-gated, audited, and tested. |
| F4.2 | Retention sweeper | Schema columns exist; no sweeper runtime. | Sweeper service runs deterministically, audits pending/deleted rows, and preserves tamper-evidence. |
| F4.3 | Destructive-retention approval | No approval surface. | In-process approval queue gates destructive retention; named-DPO gap remains explicit until assigned. |

### Batch F5 — Internal Security Closures

Owned by [`prompts/F5-security-internal-closures.md`](prompts/F5-security-internal-closures.md).

| # | Item | Current state | Desired state |
| --- | --- | --- | --- |
| F5.1 | DLQ replay authorization tests | Replay endpoint authenticated but negative authorization coverage is thin. | Negative-auth, role-escalation, and replay-clash tests cover every DLQ replay path. |
| F5.2 | Runtime network policy evidence | Allowlist guard exists; runtime evidence is partial. | LocalStack/sandbox evidence captures denied egress with request hash and timestamp. |

## Platform Expansion Batches

These are the former platform-expansion immediate platform-expansion prompts, now sequenced as
Round 6 work.

| Batch | Prompt | Owner |
| --- | --- | --- |
| A1 | [`prompts/A1-sre-on-call.md`](prompts/A1-sre-on-call.md) | Platform SRE Owner |
| A2 | [`prompts/A2-blue-green-auto-rollback.md`](prompts/A2-blue-green-auto-rollback.md) | Release Engineering Owner |
| B1 | [`prompts/B1-customer-onboarding.md`](prompts/B1-customer-onboarding.md) | Customer Platform Owner |
| B2 | [`prompts/B2-multi-account-isolation.md`](prompts/B2-multi-account-isolation.md) | Cloud Platform Owner |
| C1 | [`prompts/C1-continuous-compliance.md`](prompts/C1-continuous-compliance.md) | Compliance Owner |
| C2 | [`prompts/C2-capacity-planning.md`](prompts/C2-capacity-planning.md) | SRE Capacity Owner |
| D1 | [`prompts/D1-operator-console.md`](prompts/D1-operator-console.md) | Operator Experience Owner |
| D2 | [`prompts/D2-reference-site.md`](prompts/D2-reference-site.md) | Developer Experience Owner |
| E1 | [`prompts/E1-internationalization-scouting.md`](prompts/E1-internationalization-scouting.md) | Product Strategy Owner |

F1-F5 run in parallel with A-C. F1 finishes before D2 so the reference site
does not publish placeholder coverage, scanner, onboarding, or cold-start
claims.

## Closure Target

Round 6 is closed when CI and committed evidence prove:

1. SRE on-call rotation is documented and connected to local/owned escalation
   surfaces.
2. Blue-green deploy automation rolls back on SLO burn in deterministic tests.
3. Customer onboarding provisions tenants, SDK credentials, LGPD agreement
   records, queues, and certificate-custody placeholders.
4. Multi-account isolation design and guardrails are in repo-owned IaC/docs
   without requiring real AWS Organization execution.
5. Continuous compliance exports repository-local evidence.
6. Capacity planning automation projects queue depth, SOAP latency, DB storage,
   and certificate expiry.
7. Operator console covers replay, DLQ triage, status search, and audit
   extraction through service APIs.
8. Reference site publishes contracts, SDK examples, and runbooks.
9. F1.1-F1.4 close with real evidence.
10. F2.1 reaches the accepted mutation threshold.
11. F3.1 promotes S-1030, S-1040, and S-1060 to active full support.
12. F4.1-F4.3 ship LGPD runtime, sweeper, and approval queue.
13. F5.1-F5.2 add security tests and runtime-deny evidence.

If any item above is structural-only or partial at Round 6 close, Round 6 is
not closed.

## Deferred to Round 7

The following are not Round 6 closure items:

- Real eSocial qualification / restricted-production endpoint execution.
- Real tenant certificate provisioning and rotation against real material.
- External pen test execution.
- Multi-region DR drill against deployed restricted-production infrastructure.
- Synthetic monitoring against real deployed stages.
- npm package publication.
- SOC 2 external evidence from AWS/ticketing/access-review systems.
- Real CUR / Cost Explorer validation.
- Owner sign-off for real endpoint traffic.

They are tracked in [`../round-7/plan.md`](../round-7/plan.md).

## Risks

| Risk | Mitigation |
| --- | --- |
| Immediate and external scopes blur again. | Round 6 prompts must not require real certs, real endpoints, external vendors, npm publication, or real AWS account evidence. |
| Mutation closure dominates calendar. | Run F2 in parallel and shard by package; do not let it block independent A-C work. |
| S-1060 current XSD availability blocks F3. | If current leiaute material is unavailable, document the exact missing source and route only that external dependency to Round 7. |
| LGPD destructive workflow is risky. | Round 6 ships manual approval gating; no automatic destructive deletion without explicit approval rows. |

## Hand-Off

Round 6 produces:

- A locally executable platform-expansion and closure evidence bundle.
- Closed R4/R5 local blockers.
- A clean hand-off to Round 7 for external integrations, certificates, real
  endpoints, vendor evidence, publishing, and real-account validation.
