# Round 7 — Owners

Owners for external-evidence closures that moved from the deferred follow-up
into the new Round 7.

| Sub-item | Owner | Source / how identified | Authorization required | Target start | Target close |
| --- | --- | --- | --- | --- | --- |
| **A2** real-endpoint sign-off | TBD — A1 owner | Identify from A1 evidence at `docs/release/1.3.0/qualification/`; if A1 has not run, name the security/SRE lead who would sign | Real-endpoint sign-off recorded in `docs/release/1.3.0/authorizations/A2.md` | Start + 2 weeks after A1 lands | Start + 4 weeks |
| **C2** SOC 2 external evidence | TBD — R5 B3 owner | Same owner as R5 B3 SOC 2 evidence pack where possible; identify from the R5 B3 PR / commit / `docs/compliance/soc2-control-matrix.md` author | AWS billing + CloudTrail + access-review read grants in restricted-production account | Start + 4 weeks after A1 | Start + 8 weeks |
| **C3** real CUR validation | TBD — R5 C1 owner | Identify from R5 C1 PR / `services/cost-aggregator/` author; if absent, name the FinOps / SRE lead | Real CUR access; one cycle elapsed (~24 h + tag propagation) | Start + 4 weeks after A1 | Start + 6 weeks |

## Identifying owners

If any "TBD" cannot be filled from git history or release artifacts:

1. Open a tracking issue: `Round 7 owner needed: <sub-item>`.
2. Tag the team / role responsible.
3. Update this file once the owner is named.
4. Block the corresponding R7 prompt from starting until owner is
   filled.

**Do not fabricate names.** R7 prompt entries say "TBD" until a real
human is named.

## Cross-references

- R5 B1 (threat model) — flagged "owner sign-off for real endpoint
  traffic" originally.
- R5 B3 (SOC 2 evidence pack) — C2 default owner source.
- R5 C1 (cost attribution) — C3 owner source.
- Round 7 A1 — A2 / C2 / C3 dependency.
- Deferred F6 prompts — merged into Round 7 A2 / C2 / C3.
