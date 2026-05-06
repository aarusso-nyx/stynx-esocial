# Round 7 — Post-1.0 Platform Expansion

## Objective

Expand the standalone eSocial product from a release-ready service bus into an
operated platform: on-call, customer onboarding, multi-account isolation,
continuous compliance, capacity automation, and post-release operator surfaces.

## Prerequisites

- Round 4 quick wins pass or have explicit evidence gaps.
- Round 5 greenfield-internal hardening is complete.
- Round 6 owner-blocked authorization work is complete or its deferrals are
  routed here.
- `docs/release/1.1.0/blocked-artifacts.json` has no orphaned blockers.

## Closure Target

1. SRE on-call rotation is documented, staffed, and connected to
   PagerDuty/Opsgenie.
2. Blue-green deploy automation rolls back automatically on SLO burn.
3. Customer onboarding provisions tenants, SDK credentials, LGPD agreement
   records, queues, and certificate-custody placeholders.
4. Multi-account isolation design is implemented through AWS Organizations /
   Control Tower patterns.
5. Continuous compliance checks cover AWS Config, CIS benchmark controls, and
   evidence export.
6. Capacity planning automation projects queue depth, SOAP latency, DB storage,
   and certificate expiry.
7. Operator console ships for replay, DLQ triage, status search, and audit
   extraction.
8. Reference site publishes contract, SDK, and runbook examples.
9. DR and multi-region drills from `blocked-artifacts.json` are executed or
   explicitly deferred with owner approval.

## Batches

| Batch | Prompt | Owner |
| --- | --- | --- |
| A1 | [prompts/A1-sre-on-call.md](prompts/A1-sre-on-call.md) | Platform SRE Owner |
| A2 | [prompts/A2-blue-green-auto-rollback.md](prompts/A2-blue-green-auto-rollback.md) | Release Engineering Owner |
| B1 | [prompts/B1-customer-onboarding.md](prompts/B1-customer-onboarding.md) | Customer Platform Owner |
| B2 | [prompts/B2-multi-account-isolation.md](prompts/B2-multi-account-isolation.md) | Cloud Platform Owner |
| C1 | [prompts/C1-continuous-compliance.md](prompts/C1-continuous-compliance.md) | Compliance Owner |
| C2 | [prompts/C2-capacity-planning.md](prompts/C2-capacity-planning.md) | SRE Capacity Owner |
| D1 | [prompts/D1-operator-console.md](prompts/D1-operator-console.md) | Operator Experience Owner |
| D2 | [prompts/D2-reference-site.md](prompts/D2-reference-site.md) | Developer Experience Owner |
| E1 | [prompts/E1-internationalization-scouting.md](prompts/E1-internationalization-scouting.md) | Product Strategy Owner |

## Risks

| Risk | Mitigation |
| --- | --- |
| R6 deferrals keep moving. | `blocked-artifacts-lint` target dates force explicit owner review. |
| Platform scope outruns current service maturity. | Gate R7 on R4/R5/R6 evidence rather than starting by calendar. |
| Operator console bypasses bus boundaries. | Console actions must call service APIs or publish authorized envelopes only. |
| Multi-account isolation increases operational complexity. | Start with account vending and evidence export before customer migration. |

## Hand-Off

Round 7 produces a platform expansion evidence bundle under
`docs/release/1.2.0/` and a decision about whether internationalization remains
research or becomes a separate product line.
