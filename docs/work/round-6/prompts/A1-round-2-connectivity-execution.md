# A1 — Real eSocial Qualification Round-Trip

> **Wave A (foundation).** SRE / connectivity. Unblocks Wave B.

## Authorization required

- ☐ Real eSocial qualification certificate provisioned for a synthetic
  CNPJ.
- ☐ gov.br qualification acceptable-use agreement signed.
- ☐ Restricted-production AWS account funded.
- ☐ Round-2 connectivity scope (originally drafted in
  `docs/work/round-2/`) approved by named owner.

Record all four in `docs/release/1.3.0/authorizations/A1.md` before
starting. **The prompt fails if any checkbox is unchecked.**

## Read first

- [`../plan.md`](../plan.md) — closure item 1.
- `docs/work/round-2/plan.md` — scope drafted but never executed.
- Round-3 `B4-soap-and-environments.md` — `SoapClientTransport`
  already wired with `rejectUnauthorized: true`.

## Tasks

1. **Restricted-production deploy** of the existing CDK stacks under
   the `restricted-production` stage. Migrations applied; secrets
   provisioned with the real cert reference (B1 lands rotation; A1
   accepts the initial provisioning).
2. **Real-endpoint allowlist**: production allowlist registered in
   the typed config (R3 A3) and verified by an integration test
   against gov.br qualification URL.
3. **Round-trip per category** — at least one DTO each:
   - Table: S-1000.
   - Periodic: S-1299.
   - Worker: S-2200.
   - SST: S-2220.
   - TS-V: S-2300.
   - Benefit: S-2410.
   - Exclusion: S-3000.
   - Return: S-5001 (consumed from gov.br response).
4. **Capture**: real protocol + receipt + response code per
   submission. Persist in `event_record`. Audit row + spool envelope
   emitted.
5. **Response-classification gap-flag**: if a regulatory code arrives
   that is not in the seeded `esocial.response_classification` table,
   add a row + audit gap-flag. R4 D1 drift cron picks it up.
6. **Evidence** under `docs/release/1.3.0/qualification/<family>/`:
   redacted request, response, hashes, status-update envelope. CNPJs
   and serials masked; full evidence retained in audit-anchor account
   only.
7. **Rollback rehearsal**: tear restricted-production back down with
   one command; verify queues drain; verify no in-flight messages
   stranded.

## Primary write scope

- `docs/release/1.3.0/qualification/`
- `docs/release/1.3.0/authorizations/A1.md`
- `infra/cdk/config/restricted-production.json` (real endpoints / ARNs)
- `tests/integration/qualification/`
- `infra/migrations/<next>-response-classification-seed.sql` if new
  codes encountered

## Do not touch

- Production stage (still gated by `ESOCIAL_PROD_CONFIRM=1`; not in R6).
- Lower-stage configurations.
- Other waves' work.

## Exit criteria

- One DTO per category round-trips against gov.br qualification.
- All hashes + protocol + receipt persisted.
- Any new regulatory codes seeded into
  `response_classification`.
- Evidence redacted and committed.
- Rollback rehearsed.

## Verification

```text
ls docs/release/1.3.0/qualification/
psql … -c "select event_class, count(*) from esocial.event_record where environment='restricted_production' group by 1;"
```

Report: families round-tripped, regulatory codes encountered (new vs
seeded), rollback time observed.
