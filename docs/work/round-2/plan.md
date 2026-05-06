# Round 2 - Real Connectivity Closure Plan

> Objective: move the standalone eSocial runtime from deterministic local
> stubs to owner-authorized qualification and restricted-production evidence
> without weakening Round 1 contracts, tenant isolation, idempotency, audit, or
> observability guarantees.

Round 2 is not another broad builder-promotion round. It is the controlled
transition from sandboxed proof to real eSocial connectivity. Real certificates,
real endpoints, and any real personal data require explicit owner approval
before use.

## Start Gate

Round 2 **cannot start** until every Round 1 closure item is `PASS`. Current
recorded blockers from the live repository are:

| Gate | Current status | Required before R2 |
| --- | --- | --- |
| All 15 Round 1 closure items | Blocked until release owner records final PASS evidence. | `docs/release/0.2.0/release-checklist.md` has no open item. |
| Round 1 evidence bundle | Present, but final owner-accepted release state is not complete. | `docs/release/0.2.0/` contains CI URL, release decision, and owner approvals. |
| Lifted tree retired | Product code retired; retained XSD bundle remains under `packages/domain/src/sgp-lifted/esocial-worker/xsd/`. | Move the XSD bundle into active XML ownership or record a release-owner exception before real connectivity. |
| Observability parity for all 39 families | Active families are covered by emitted fields and alarms; owner-blocked families remain explicit exceptions. | Observability matrix includes all active and explicitly retired/deferred families. |
| Operator runbooks reference implemented endpoints | Implemented local/runtime endpoints are documented. | Real endpoint, certificate, replay, DLQ, and outage runbooks are updated from R2 evidence. |
| DLQ replay endpoint authenticated and tested | Batch 6 local evidence passed. | Auth evidence is included in the 0.2.0 release bundle and stays green. |
| `@esocial/contracts@1.1.0` publication | Blocked at `1.1.0-rc.0`. | SGP owner accepts idempotency/version enforcement and release owner approves final tag/publish, or records that Round 2 proceeds on the RC contract. |
| S-1030/S-1040/S-1060 | Owner-blocked table DTOs with `round1Pending: true`. | eSocial regulatory owner either supplies/binds current XSDs or explicitly retires these families before they enter real qualification. |
| Real-service authorization | Not granted in repository evidence. | Named owner approvals are recorded for qualification, certificates, restricted production, PII policy, SRE coverage, and legal sign-off. |

## Required Owners

Every row below must have a named accountable person and approval reference
before the first real-service command runs.

| Decision | Owner role | Current recorded owner | Approval artifact |
| --- | --- | --- | --- |
| Real eSocial credentials and portal account | eSocial portal/account owner | Release owner to name person | Ticket or signed approval linked from `docs/release/0.3.0/owners.md`. |
| Real qualification certificate provisioning | Certificate custody owner | Security/certificate owner to name person | Secrets Manager/KMS change record plus certificate fingerprint. |
| Restricted-production deployment authorization | Release owner | Release owner to name person | Change-management approval with rollback window. |
| Real-PII test data or no-real-PII path | Legal/data owner | Legal owner to name person | Written authorization or explicit synthetic-only decision. |
| Connectivity-window support | SRE owner | SRE owner to name person | On-call roster and escalation channel. |
| Legal sign-off on data movement | Legal owner | Legal owner to name person | Legal sign-off reference and retention limits. |
| S-1030/S-1040/S-1060 leiaute decision | eSocial product/regulatory owner | eSocial regulatory owner | Decision to bind current XSDs or retire the families. |
| SGP contract acceptance | SGP integration owner | SGP owner | Acceptance of `@esocial/contracts@1.1.0` or RC exception. |

## Round 2 Closure Target

Round 2 is done only when every item below is proven from CI, release evidence,
or owner-signed operational evidence:

1. All Round 1 closure items are `PASS` and linked from the Round 2 evidence.
2. The retained XSD bundle is moved into the active XML package or has a
   release-owner exception that expires before production cutover.
3. Real SOAP endpoint routing uses an explicit per-stage allowlist and denies
   `gov.br` targets unless the stage is owner-authorized for real connectivity.
4. TLS verification is `rejectUnauthorized: true`; endpoint thumbprints or CA
   pins are recorded from owner-approved source material and checked in tests.
5. Secrets Manager and KMS hold only certificate material references in runtime
   state; no certificate bytes or private keys are committed.
6. Qualification round trip succeeds for one representative DTO per active
   event category: table, non-periodic worker, SST, periodic, benefit/process,
   exclusion, and return/totalizer.
7. Certificate rotation drill succeeds against Secrets Manager plus KMS and
   proves old and new fingerprints in audit without leaking material.
8. Restricted-production deploy succeeds under owner authorization and rollback
   is demonstrated from the deployed artifact.
9. Live response classification table is updated with every code observed in
   qualification; unknown codes open a named follow-up and fail closed.
10. Operator runbooks are updated from real observed fault modes: portal auth,
    certificate expiry, TLS failure, SOAP timeout, throttling, regulatory
    rejection, malformed return, DLQ replay, and rollback.
11. Kill switch and circuit breaker are demonstrably active before any real
    submission and are exercised in evidence.
12. No real PII is used unless the legal/data owner approval is linked; if real
    PII is approved, retention and redaction evidence is attached.
13. `docs/release/0.3.0/` contains owners, command output, redacted payload
    hashes, logs, metrics, traces, IAM diff, runbook updates, and hand-off.

## Batch Plan

| Batch | Prompt | Objective | Exit criteria |
| --- | --- | --- | --- |
| R2-A | [`prompts/R2-A-soap-client-allowlist-pinning.md`](prompts/R2-A-soap-client-allowlist-pinning.md) | Prepare the runtime for real endpoint routing without sending data. | XSD bundle is active or exceptioned; stage allowlist and TLS pinning tests pass; real submission remains disabled. |
| R2-B | [`prompts/R2-B-qualification-credentials-roundtrip.md`](prompts/R2-B-qualification-credentials-roundtrip.md) | Use owner-authorized qualification credentials for representative round trips. | One redacted qualification evidence record per active category; kill switch tested before and after the window. |
| R2-C | [`prompts/R2-C-restricted-production-deployment.md`](prompts/R2-C-restricted-production-deployment.md) | Deploy to restricted production with rollback proof. | Deployed artifact, smoke result, rollback result, IAM diff, and owner approvals are recorded. |
| R2-D | [`prompts/R2-D-regulatory-code-coverage.md`](prompts/R2-D-regulatory-code-coverage.md) | Fold observed official response codes into classification. | Classification table/tests/docs updated; unknown code follow-ups are named and fail closed. |
| R2-E | [`prompts/R2-E-operator-runbooks-real-faults.md`](prompts/R2-E-operator-runbooks-real-faults.md) | Update operations docs from real observed failure modes. | Runbooks map each observed fault to detection, triage, replay, rollback, and owner escalation. |
| R2-F | [`prompts/R2-F-evidence-bundle-0.3.0.md`](prompts/R2-F-evidence-bundle-0.3.0.md) | Assemble the 0.3.0 evidence and hand-off package. | Evidence bundle complete; Round 3 go-live preconditions and open risks are explicit. |

## Risk Register

| Risk | Mitigation |
| --- | --- |
| Real certificate material leaks into git, logs, fixtures, or audit rows. | Store only references and fingerprints; run secret scans; attach redaction proof; block commits containing key/cert markers. |
| Official endpoint receives unintended payloads. | Require kill switch, circuit breaker, explicit stage allowlist, owner-approved window, and synthetic payload policy before any real submission. |
| Real PII is used without legal authorization. | Default to synthetic data; require legal/data owner approval reference before any real PII fixture or submission. |
| S-1030/S-1040/S-1060 remain unresolved and confuse contract closure. | Keep them out of real qualification unless the regulatory owner binds current XSDs or explicitly retires them. |
| Qualification accepts behavior that restricted production rejects. | Capture official response codes separately per environment and require R2-C smoke plus rollback evidence. |
| Certificate rotation breaks in-flight submissions. | Run rotation drill with old/new fingerprints, idempotency replay, and circuit breaker evidence before restricted-production deploy. |
| Unknown official rejection code maps to a misleading SGP status. | Fail closed as regulatory gap, publish canonical status, and add classification only through R2-D tests. |
| Operators cannot triage live failures from local-stub runbooks. | R2-E updates runbooks only from observed live evidence and links detection metrics/traces. |
| IAM scope widens during real-service wiring. | Keep the scoped IAM assertion in CI and attach synthesized diff evidence to 0.3.0. |
| Contract publication and SGP acceptance lag connectivity work. | Require SGP owner acceptance or recorded RC exception before R2-B sends representative DTOs. |

## Hand-Off

Round 2 hands off to the go-live round only after `docs/release/0.3.0/` proves:

- Round 1 closure prerequisites were green before real connectivity started.
- Real qualification round trips covered every active category.
- Restricted-production deployment and rollback were exercised.
- Certificate custody and rotation were proven with no material leakage.
- Observed official response codes are classified or fail closed with owners.
- Operators have runbooks for the real fault modes observed.
- Remaining production blockers are named with owners, dates, and explicit
  authorization requirements.

Round 3 may then prepare controlled production onboarding. Round 2 itself does
not authorize production submissions.
