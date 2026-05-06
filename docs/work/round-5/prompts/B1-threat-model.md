# B1 — Threat Model + Attack Tree

> **Wave B (gating).** Security. Run before B2/B3/B5 finalize.

## Read first

- [`../plan.md`](../plan.md) — closure item 4.
- Round-3 prompt `C1-threat-model-and-pentest.md` — pen-test parts
  ship in **Round 7** (owner-blocked).

## Tasks

1. **STRIDE threat model** at `docs/security/threat-model.md`, per
   major component:
   - HTTP gateway (DLQ replay, LGPD DSR endpoints).
   - Submission Lambda + queues.
   - Returns Lambda + status publisher.
   - Certificate custody service.
   - PKI signing path.
   - SOAP transport (deterministic stub + real client).
   - RDS / autonomous schema (RLS + tenants).
   - Audit log (Merkle tamper-evidence — coordinate with B5).
   - Operator console (Round 6 deferral noted).
   For each: Spoofing, Tampering, Repudiation, Info disclosure, DoS,
   Elevation of privilege. Mitigations cited to existing code /
   migrations / CDK constructs.
2. **Trust boundaries** diagrammed:
   - SGP ↔ eSocial (queue-only).
   - eSocial ↔ gov.br (real SOAP — Round 7 territory).
   - eSocial ↔ AWS (Secrets Manager, KMS, queues).
   - Operator ↔ HTTP gateway.
3. **Attack tree** for the highest-impact compromise: forged
   regulatory submission. Walk every step from entry to signed XML;
   show what stops them.
4. **Issue triage SLA** formalized in `docs/operations.md`:
   - Critical < 7 days.
   - High < 30 days.
   - Medium < 90 days.
   The R4 D2 vuln-triage workflow already enforces; B1 documents the
   policy.
5. **Review**: ≥ 2 engineers sign off in PR.
6. **Pen test** is **Round 7** scope (vendor selection + execution
   require owner authorization). B1 records pen-test prerequisites
   so Round 7 can run faster.

## Primary write scope

- `docs/security/threat-model.md`
- `docs/security/attack-tree.md`
- `docs/operations.md` — SLA section
- `docs/release/1.2.0/security/`

## Do not touch

- Production code semantics. Findings drive B2/B4/B5 PRs and Round 7
  pen-test execution.

## Exit criteria

- Threat model committed and reviewed by ≥ 2 engineers.
- Attack tree committed.
- SLA documented.
- Pen-test prerequisite list ready for Round 7.

## Verification

```text
test -f docs/security/threat-model.md
git log --grep="threat-model" docs/security/
```

Report: components covered, identified mitigations, Round 7 pen-test
prereqs.
