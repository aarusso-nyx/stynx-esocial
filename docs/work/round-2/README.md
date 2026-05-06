# Round 2 - Owner-Authorized Connectivity

Round 2 is the first real-service connectivity round. It does not start from
local intent; it starts only after Round 1 closes and the named owners authorize
real qualification credentials, certificate custody, and restricted-production
deployment.

## Start Here

1. Read [`plan.md`](plan.md).
2. Confirm every Round 2 prerequisite in the plan is `PASS`.
3. Confirm each owner role in the plan has a named accountable person and
   approval reference.
4. Run the prompts in [`prompts/`](prompts/) in order.

## Prompt Order

| Batch | Prompt | Scope |
| --- | --- | --- |
| R2-A | [`prompts/R2-A-soap-client-allowlist-pinning.md`](prompts/R2-A-soap-client-allowlist-pinning.md) | Real SOAP endpoint allowlist, TLS pinning, and XSD bundle relocation. |
| R2-B | [`prompts/R2-B-qualification-credentials-roundtrip.md`](prompts/R2-B-qualification-credentials-roundtrip.md) | Owner-authorized qualification credentials and real qualification round trips. |
| R2-C | [`prompts/R2-C-restricted-production-deployment.md`](prompts/R2-C-restricted-production-deployment.md) | Restricted-production deployment, rollback, and smoke evidence. |
| R2-D | [`prompts/R2-D-regulatory-code-coverage.md`](prompts/R2-D-regulatory-code-coverage.md) | Live regulatory-code classification updates and gap tracking. |
| R2-E | [`prompts/R2-E-operator-runbooks-real-faults.md`](prompts/R2-E-operator-runbooks-real-faults.md) | Runbooks updated from real observed fault modes. |
| R2-F | [`prompts/R2-F-evidence-bundle-0.3.0.md`](prompts/R2-F-evidence-bundle-0.3.0.md) | Release evidence bundle under `docs/release/0.3.0/`. |

## Hard Stop

No prompt may send data to an official eSocial endpoint unless its owner
authorization, kill switch, circuit breaker, certificate reference, and
redaction policy are recorded before execution.
