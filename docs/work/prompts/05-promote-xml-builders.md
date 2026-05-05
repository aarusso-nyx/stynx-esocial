# 05 — Promote XML Builders Boundary-Cleanly

> **Phase 5 of [`../plan.md`](../plan.md).** Wave 2, runs after Phase 4.
> Owns the `XML/event worker` scope.

## Context

Read first:

- [`../inv.md`](../inv.md) — "Lifted SGP domain code: Evidence-rich but not
  product-ready. … 234 files, including 35 event builders, 53 XSD files…"
- [`../diag.md`](../diag.md) — "Direct SGP Coupling Remains" enumerates the
  hr/payroll/saude/public.esocial_event reads.
- [`../plan.md`](../plan.md) — Phase 5 task list, suggested promotion order,
  and exit criteria.
- `docs/events.md` and `docs/templates/golden/` — the byte-sensitive XML
  evidence.

The lifted builders under
`packages/domain/src/sgp-lifted/esocial-worker/builders/` cover the major
event families but read directly from SGP-owned tables (`hr.employee`,
`hr.company`, `payroll.payroll_run`, `payroll.employee_payroll_item`,
`saude.aso_record`, `saude.cat_emission`, etc.) and update
`public.esocial_event`. None of that survives standalone.

This phase promotes builders one event family at a time into a clean
location under `packages/domain/src/`, replacing direct DB reads with
**typed input DTOs** that SGP populates and sends through the bus.

## Operating principles

- A promoted builder takes a normalized DTO and returns canonical XML
  bytes plus metadata. It never queries a database. It never reaches
  outside its inputs.
- DTOs carry **opaque source ids** (string identifiers) that SGP supplies;
  the eSocial side never resolves them against SGP schemas.
- Goldens are byte-sensitive evidence. If a golden changes, the change is
  intentional, documented in the promotion PR, and accompanied by a
  reason (e.g., "leiaute S-1.2 vs S-1.3 update from
  `docs/references/...`").
- Promote in the order from `plan.md`: tables → periodic payroll → worker/
  SST/TSV → benefits/process/exclusion. Earlier families inform DTO
  conventions for later ones.
- Every promotion lands with a metadata test asserting event code, leiaute
  version, XML root element, XSD binding, and table-version dependency.

## Tasks

For **each event family**, in the suggested order:

1. **Define the input DTO.** A typed object with opaque source ids and
   primitive fields. No imports from `hr.*`, `payroll.*`, `saude.*`, or
   any SGP-owned module. Document the DTO in `docs/events.md` under the
   family.
2. **Refactor the builder** away from DB reads. Move the builder into its
   final location under `packages/domain/src/<area>/builders/<family>/`
   (pick a layout and apply it consistently). The lifted file under
   `sgp-lifted/` may be deleted in the same change once the promoted
   builder + tests cover it.
3. **Promote golden tests** for the family from
   `tests/sgp-lifted/backend/` and/or in-tree `*.spec.ts` files into the
   active suite. Wire them into `npm test`.
4. **Add a metadata test** asserting:
   - Event code (e.g., `S-1200`).
   - Leiaute version (matches the binding under `docs/references/`).
   - XML root element name and namespace.
   - The XSD file the family is bound to under
     `packages/domain/src/sgp-lifted/.../xsd/` (or the promoted location
     once Phase 6 moves XSDs).
   - Required table-version dependencies (e.g., S-1200 depends on
     S-1010 rubric versions; encode this).
5. **Add an invalid-DTO test** that asserts the builder rejects DTOs
   missing required fields, before signing/submission would be reached.
6. **Update the routing surface** from Phase 4 so the handler can dispatch
   the now-promoted family.

Promotion order (do not skip ahead — DTO conventions depend on earlier
families):

1. Tables: `S-1000`, `S-1005`, `S-1010`, `S-1020`, `S-1030`, `S-1040`,
   `S-1050`, `S-1060`, `S-1070`.
2. Periodic payroll: `S-1200`, `S-1202`, `S-1207`, `S-1210`, `S-1298`,
   `S-1299`.
3. Worker/SST/TSV: `S-2200`, `S-2205`, `S-2206`, `S-2210`, `S-2220`,
   `S-2230`, `S-2240`, `S-2298`, `S-2299`, `S-2300`, `S-2306`, `S-2399`.
4. Benefits/process/exclusion: `S-2400`, `S-2405`, `S-2410`, `S-2416`,
   `S-2418`, `S-2420`, `S-2501`, `S-3000`.

Each batch is shippable independently. Do not block the entire phase on
one stubborn family — defer it explicitly with a TODO that links to the
diagnostic and a follow-up issue.

## Primary write scope

- `packages/domain/src/sgp-lifted/esocial-worker/builders/` during
  migration only (delete-after-promotion, do not extend)
- Final production builder location under `packages/domain/src/`
- `docs/events.md` (per-family DTO contracts)
- `docs/templates/` (move/refresh as needed)
- Golden tests under `tests/golden/` (new) or `tests/contract/` extension

## Do not touch

- `packages/contracts/src/` — Phase 2 owns envelopes. The DTO is the
  builder input; if it doubles as a payload, it lives in `contracts/`
  and you coordinate via a Phase-2 follow-up.
- `infra/migrations/` — Phase 3 owns the schema.
- Signing / SOAP / XSD enforcement — Phase 6 owns it. This phase wires
  the metadata test for XSD *binding* (which file the family points at),
  not XSD validation execution.
- `services/submission/` handler logic — Phase 4 owns it. Update only the
  routing surface to dispatch promoted families.

## Exit criteria

- Active builders compile without SGP module/database imports.
- Golden tests cover every promoted event family.
- Invalid DTO tests fail fast, before signing/submission.
- `grep -R -E "from ['\\\"].*\\.\\./hr/|from ['\\\"].*\\.\\./payroll/|from ['\\\"].*\\.\\./saude/" packages/domain/src` returns no hits in promoted code (only in `sgp-lifted/`, which is excluded from the build).
- `docs/events.md` lists every promoted family's DTO and metadata.

## Verification commands

```text
npm run build
npm run lint
npm test
npm run coverage
# Quick boundary spot-check on promoted code only:
grep -R -E "hr\\.|payroll\\.|saude\\.|public\\.esocial_event" packages/domain/src --include="*.ts" | grep -v sgp-lifted
```

Report: families promoted in this run, families deferred (with reason),
any DTO-shape change that requires Phase-2 follow-up, and net file count
moved out of `sgp-lifted/`.
