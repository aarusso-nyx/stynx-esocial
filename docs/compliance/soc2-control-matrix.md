# SOC 2 Control Matrix

| Control | Trust Service Criterion | Evidence | Current Status |
| --- | --- | --- | --- |
| SOC2-SEC-BOUNDARY | Security | `AGENTS.md`, `docs/architecture.md`, `scripts/check.mjs` | Implemented locally |
| SOC2-SEC-RLS | Security | `infra/migrations/080-autonomous-database.sql`, `npm run test:db` | Implemented locally |
| SOC2-SEC-SECRETS | Security | `npm run secrets:assert-rotation`, generated templates | Partial: local template evidence only |
| SOC2-SEC-AUDIT | Security | `npm run audit:verify`, append-only migration grants | Partial: Merkle enforcement scaffolded |
| SOC2-AVAIL-SLO | Availability | `npm run slo:assert`, `docs/release/1.2.0/slo/alarm-assertions.json` | Partial: burn-rate alarms not complete |
| SOC2-AVAIL-CHAOS | Availability | `npm run test:chaos` | Implemented locally for 7 deterministic scenarios |
| SOC2-PRIV-LGPD | Privacy | `docs/compliance/lgpd-dpia.md`, `docs/compliance/pii-catalog.md` | Partial: DSR APIs blocked |
| SOC2-CONF-PII | Confidentiality | redaction policy, PII catalog | Partial: export enforcement pending |
| SOC2-CC-CHANGE | Change Management | CI workflows and release evidence | Partial: external branch protection evidence absent |
