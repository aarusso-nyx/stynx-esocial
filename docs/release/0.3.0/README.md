# Release Evidence 0.3.0

Round 2 evidence for owner-authorized real connectivity.

## Status

- R2-A local foundation: started.
- Official eSocial endpoint calls: blocked.
- Real certificates: blocked.
- Real PII: blocked.
- Restricted-production deployment: blocked.

No real-service submission has been executed for this evidence bundle.

## Completed Local Evidence

- `packages/domain/src/sgp-lifted/` removed from the active package tree.
- Retained XSD bundle moved to `packages/domain/src/xml/xsd/bundle/`.
- Active builder metadata and docs now bind to the active XSD bundle path.
- `packages/domain/tsconfig.json` no longer needs a `src/sgp-lifted/**`
  exclusion.
- Boundary canary still rejects any active `sgp-lifted/` import.

## Owner Blocks

Round 2 real connectivity remains blocked until [`owners.md`](owners.md) has
named accountable people and approval artifacts for every required owner.

## Evidence Index

| Area | Path | Status |
| --- | --- | --- |
| Owners | [`owners.md`](owners.md) | Required approvals not recorded. |
| R2-A foundation | [`security/r2-a-foundation.md`](security/r2-a-foundation.md) | Local-only evidence in progress. |
| Qualification | [`qualification/`](qualification/) | Blocked by owner approvals. |
| Restricted production | [`restricted-production/`](restricted-production/) | Blocked by owner approvals. |
| Regulatory codes | [`regulatory-codes/`](regulatory-codes/) | Blocked until official responses exist. |
| Runbooks | [`runbooks/`](runbooks/) | Blocked until real fault modes exist. |
