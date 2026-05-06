# Documentation Index

This tree documents the standalone eSocial runtime, its SGP integration
contract, operational evidence, and round-by-round closure work.

| Document | Purpose |
| --- | --- |
| [architecture.md](architecture.md) | Product boundary, runtime stack, service surface, data flow, and database rules. |
| [adrs/README.md](adrs/README.md) | Accepted architecture decisions and ADR template. |
| [consumers.md](consumers.md) | Producer/consumer contract for SGP and future backend integrations. |
| [events.md](events.md) | Event-family inventory, coverage, and source locations. |
| [operations.md](operations.md) | Local dev, CI, replay/DLQ, drift, vulnerability triage, and incident runbooks. |
| [sgp-migration.md](sgp-migration.md) | DTO cutover, status consumption, error categories, retry/DLQ, and rollback. |
| [onboarding.md](onboarding.md) | Two-day contributor ramp and command cheat sheet. |
| [glossary.md](glossary.md) | eSocial and service-bus terminology. |
| [release-checklist.md](release-checklist.md) | Release readiness checklist and deferred evidence gates. |
| [templates/README.md](templates/README.md) | Golden XML, WSDL fixture, and byte-sensitive fixture custody. |
| [references.md](references.md) | Local legal/reference corpus routing. |

## Release Evidence

| Bundle | Meaning |
| --- | --- |
| [release/1.0.0/](release/1.0.0/) | Round 3 production-slice evidence and blocked artifacts. |
| [release/1.1.0/](release/1.1.0/) | Round 4 quick-win evidence: coverage gap, property/e2e/perf, governance, SBOM, and DX. |

## Work Rounds

| Round | Scope |
| --- | --- |
| [work/round-0/](work/round-0/) | Initial production-grade closure plan. |
| [work/round-1/](work/round-1/) | Builder promotion and active runtime expansion. |
| [work/round-2/](work/round-2/) | Owner-authorized real-service readiness planning. |
| [work/round-3/](work/round-3/) | Local-safe hardening scaffolds. |
| [work/round-4/](work/round-4/) | Quick wins now being materialized. |
| [work/round-5/](work/round-5/) | Greenfield-internal follow-up. |
| [work/round-6/](work/round-6/) | Owner-blocked authorization work. |
| [work/round-7/](work/round-7/) | Post-1.0 platform expansion scope. |
