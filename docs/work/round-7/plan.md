# Round 7 — Deferred External Integrations

## Objective

Round 7 merges the previous owner-blocked work and deferred
external-evidence work into one external round. It exists because the
repository cannot close these items with local-only execution.

Round 7 starts after Round 6 closes its immediate/local target or after the
specific authorization needed for an independent Round 7 prompt is recorded.

## What Belongs Here

Every item in this round needs at least one external dependency:

- real tenant certificate or PKI process;
- real eSocial qualification or restricted-production endpoint;
- deployed AWS account, billing, CloudTrail, access-review, or CUR evidence;
- external vendor engagement;
- release-engineering approval to publish packages;
- owner sign-off for production-shaped traffic.
- official regulatory/schema source confirmation where the current gov.br XSD
  package omits an event family that the product plan previously assumed active.

No Round 7 prompt should fabricate evidence. If the dependency is unavailable,
the prompt remains blocked with owner/date/decision metadata.

## Closure Target

Round 7 is closed when signed-off evidence proves:

1. Real eSocial qualification round-trip for at least one DTO per category:
   table, periodic, worker, SST, TS-V, benefit, exclusion, and return.
2. Owner sign-off for real-endpoint traffic references the qualification
   evidence and pins reviewed hashes.
3. Real certificate provisioning and rotation automation is exercised against
   authorized certificate material, with 30 / 7 / 0-day alarms.
4. Multi-region active-passive failover drill runs against deployed
   restricted-production or equivalent owner-approved infrastructure.
5. Synthetic monitoring canaries run every 5 minutes in qualification and
   restricted-production, with drift detection demonstrated.
6. External pen-test report is attached; critical/high findings are closed
   before GA publication.
7. SOC 2 external evidence is pulled, redacted, and attached from real
   CloudTrail, PR-review, ticketing, and access-review sources.
8. Real CUR / Cost Explorer data validates per-tenant cost attribution within
   the accepted tolerance.
9. `@esocial/contracts@1.1.0` is published with tag, SBOM, provenance, and
   release evidence.
10. `@esocial/sdk@1.0.0` is published with tag, SBOM, provenance, and release
    evidence.
11. `S-1030`, `S-1040`, and `S-1060` receive an owner-approved schema/source
    decision: either official current XSDs are supplied and the families are
    promoted, or the product/regulatory owner records that they are out of the
    active service scope.

If any item is structural-only or uses synthetic evidence where real external
evidence is required, Round 7 is not closed.

## Batches

| Batch | Prompt | Owner | Authorization |
| --- | --- | --- | --- |
| A1 | [`prompts/A1-real-endpoint-roundtrip.md`](prompts/A1-real-endpoint-roundtrip.md) | SRE / connectivity owner | Real cert, real CNPJ, gov.br acceptable-use, deployed qualification path |
| A2 | [`prompts/A2-real-endpoint-sign-off.md`](prompts/A2-real-endpoint-sign-off.md) | Endpoint authorization owner | A1 evidence reviewed |
| B1 | [`prompts/B1-real-cert-provisioning-rotation.md`](prompts/B1-real-cert-provisioning-rotation.md) | PKI owner | Real certificate provisioning agreement |
| B2 | [`prompts/B2-multi-region-dr-drill.md`](prompts/B2-multi-region-dr-drill.md) | SRE owner | Restricted-production multi-region budget |
| B3 | [`prompts/B3-synthetic-monitoring-deployment.md`](prompts/B3-synthetic-monitoring-deployment.md) | SRE owner | Owner-approved canary scope per stage |
| C1 | [`prompts/C1-pen-test-execution.md`](prompts/C1-pen-test-execution.md) | Security owner | Vendor selection, NDA, budget |
| C2 | [`prompts/C2-soc2-external-evidence.md`](prompts/C2-soc2-external-evidence.md) | SOC 2 evidence owner | AWS/ticketing/access-review read grants |
| C3 | [`prompts/C3-cur-validation.md`](prompts/C3-cur-validation.md) | FinOps owner | Real CUR access and elapsed cost cycle |
| D1 | [`prompts/D1-contracts-ga-publish.md`](prompts/D1-contracts-ga-publish.md) | Release owner | Release-engineering sign-off |
| D2 | [`prompts/D2-sdk-ga-publish.md`](prompts/D2-sdk-ga-publish.md) | Release owner | Release-engineering sign-off |
| E1 | `prompts/E1-s1030-s1040-s1060-schema-decision.md` | Regulatory/product owner | Official current XSD package or retirement decision |

## Sequencing

1. A1 runs first because real endpoint evidence unblocks A2, C2, C3, and the
   GA publish decision.
2. B1 can start in parallel with A1 if certificate authorization is already
   recorded.
3. B2, B3, C1, C2, and C3 run after the deployed account/stage exists.
4. E1 can run whenever regulatory ownership can resolve the schema-source gap
   recorded in `docs/adrs/0013-s1060-current-leiaute-decision.md`.
5. D1 and D2 run last, after pen-test critical/high findings are closed and
   release-engineering sign-off is recorded.

## Risks

| Risk | Mitigation |
| --- | --- |
| Real certificate delivery slips. | Keep B1 blocked with owner/date metadata; do not use local test certificates as closure evidence. |
| gov.br endpoint outage blocks A1. | Capture outage evidence and retry under the approved window; do not synthesize responses. |
| External evidence contains PII. | Redact committed artifacts; keep full evidence only in the audit-anchor account. |
| CUR cycle has not elapsed. | C3 waits for real data; no mock CUR rows. |
| Pen-test critical/high finding lands late. | D1/D2 remain blocked until findings close under SLA. |
| npm publish fires accidentally. | D1/D2 require manual dispatch plus explicit release confirmation. |

## Hand-Off

Round 7 produces:

- Real external evidence under `docs/release/1.3.0/`.
- Resolved blocked-artifact records for real certificates, endpoints,
  restricted-production, external evidence, CUR, and publishing.
- A new follow-up round only if Round 7 discovers additional external blockers.
