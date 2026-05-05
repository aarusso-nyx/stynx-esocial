# 01 — Remaining Table Events (Batch 1)

> **Wave B (promotion).** Blocked by [`00-round-0-fixups.md`](00-round-0-fixups.md).
> Worker scope: XML/event (tables sub-domain).

## Read first

- [`../plan.md`](../plan.md), [`../assessment.md`](../assessment.md)
- [`../../round-0/prompts/B2-builders-five-families.md`](../../round-0/prompts/B2-builders-five-families.md) for builder conventions.
- `packages/domain/src/builders/s1000/`, `s1010/` — active conventions.
- `packages/domain/src/sgp-lifted/esocial-worker/builders/` — evidence
  source.
- `docs/templates/golden/builders/` — fixtures.

## Scope

Promote the seven remaining table families:

| Event | XSD | Status |
| --- | --- | --- |
| S-1005 | `evtTabEstab.xsd` | Promote |
| S-1020 | `evtTabLotacao.xsd` | Promote |
| S-1030 | `evtTabCargo.xsd` (missing) | **Blocked** — leiaute decision |
| S-1040 | `evtTabFuncao.xsd` (missing) | **Blocked** — leiaute decision |
| S-1050 | `evtTabJornada.xsd` | Promote |
| S-1060 | `evtTabAmbiente.xsd` (legacy) | **Blocked** — retire legacy or bind current |
| S-1070 | `evtTabProcesso.xsd` | Promote |

The four unblocked families (S-1005, S-1020, S-1050, S-1070) are the
mandatory scope of this prompt. The three blocked families must either
be unblocked by an owner-named XSD/leiaute decision **before** Batch 2
proceeds **or** explicitly deferred to a Batch-1B follow-on prompt
created in this same change. Do not let blockers stall the unblocked
promotions.

## Operating principles

- DTOs contain **opaque source ids** and primitive fields; no SGP table
  reads in any active code path.
- Goldens are byte-equal. If an existing golden is wrong, fix the
  golden in a separate, reviewer-flagged change with reason logged in
  `docs/release/0.2.0/golden-changes.md`.
- Each promoted family **deletes its lifted source in the same PR.**
- Each promoted family adds at minimum: golden test (byte-equal),
  metadata test, invalid-DTO test, dispatcher entry, integration suite
  inclusion.

## Tasks per family (apply to S-1005, S-1020, S-1050, S-1070)

1. **DTO**: replace `EsocialRound1PendingDto` for the family in
   `packages/contracts/src/dtos/round1-pending.ts`. Move to
   `packages/contracts/src/dtos/<family>.ts` with explicit fields.
   Update barrel export and the `round1Pending` flag.
2. **JSON Schema**: regenerate via
   `packages/contracts/src/schema-generation/write-schemas.mjs`. Commit
   `packages/contracts/schemas/v1/<family>.json`.
3. **Example payload**: add
   `packages/contracts/examples/v1/requests/<family>.json` matching the
   golden's input.
4. **Builder**: `packages/domain/src/builders/<family>/builder.ts` —
   pure function `build(dto, ctx) -> { xml, metadata }`. Reuse helpers
   from S-1000/S-1010 layout (e.g., `mapDtoToXmlNodes`, common header
   builders) but do not import from `sgp-lifted/`.
5. **Builder export**: add to `packages/domain/src/builders/index.ts`.
6. **Dispatcher**: add entry to `SUBMISSION_DISPATCHERS` in
   `packages/domain/src/submission/submission-dispatcher.ts` calling
   the active builder. Remove the placeholder for this family.
7. **Golden test**:
   `tests/golden/<family>.test.ts` (vitest, post-batch-00 conversion).
   Loads the DTO fixture from
   `tests/golden/fixtures/<family>.dto.json`, calls the builder,
   asserts byte-equal against
   `docs/templates/golden/builders/<family>.golden.xml`.
8. **Metadata test**: assert `eventCode`, `leiauteVersion`, `xmlRoot`,
   `xsdBinding`, dependencies match `docs/events.md`.
9. **Invalid-DTO test**: pass DTO missing required fields; assert
   `DtoValidationError` with field paths.
10. **Integration suite inclusion**:
    `tests/integration/soap-submission-pipeline.test.ts` includes the
    family in its parameterized cases. The integration asserts
    DTO → build → XSD → sign → SOAP-stub → persist → publish.
11. **Lifted-source deletion**: delete
    `packages/domain/src/sgp-lifted/esocial-worker/builders/<family>.builder.ts`
    and any matching tests under `tests/sgp-lifted/`.
12. **Docs**:
    - `docs/events.md`: per-family DTO + metadata reference.
    - `docs/consumers.md`: status table updated; `round1Pending` removed.
    - `docs/sgp-migration.md`: per-family DTO surface.

## Tasks for blocked families (S-1030, S-1040, S-1060)

For each blocked family:

1. Determine the leiaute version that matches the golden under
   `docs/templates/golden/builders/`.
2. Locate or fetch the matching XSD from the project's reference
   corpus (`docs/references/`). If the XSD is not present, document
   the gap in
   `docs/work/round-1/leiaute-blockers.md` (create) with: family,
   golden version, missing XSD path, owner needed, decision
   options (retire / bind to legacy / fetch newer XSD), and a
   target date.
3. Create `prompts/01b-blocked-table-events.md` (a Batch-1B follow-on
   prompt) that covers the blocked families once the leiaute decision
   is made. The follow-on prompt is a copy of this prompt's per-family
   tasks scoped to the three families.
4. Do **not** mark the blocked families' `round1Pending` flags as
   resolved. They remain pending until 1B lands.

## Primary write scope

- `packages/contracts/src/dtos/<family>.ts` (×4)
- `packages/contracts/src/dtos/round1-pending.ts` (remove promoted)
- `packages/contracts/src/dtos/index.ts`
- `packages/contracts/schemas/v1/<family>.json` (×4)
- `packages/contracts/examples/v1/requests/<family>.json` (×4)
- `packages/domain/src/builders/<family>/` (×4)
- `packages/domain/src/builders/index.ts`
- `packages/domain/src/submission/submission-dispatcher.ts` (entries
  only — coordinate with other promotion batches landing concurrently)
- `tests/golden/<family>.test.ts` (×4)
- `tests/golden/fixtures/<family>.dto.json` (×4)
- `tests/integration/soap-submission-pipeline.test.ts`
- Lifted-source deletions for the four promoted families
- `docs/events.md`, `docs/consumers.md`, `docs/sgp-migration.md`
- `docs/work/round-1/leiaute-blockers.md` (new, only if blockers)
- `docs/work/round-1/prompts/01b-blocked-table-events.md` (new, only
  if blockers)

## Do not touch

- Round-0 builder code or tests.
- Round-0 evidence bundle under `docs/release/0.1.0/`.
- Migrations.
- Other batches' families.
- Round-0 fixups (Batch 0 owns those).
- The 5 no-op service handlers (Batch 6 owns those).

## Exit criteria

- Four families fully ACTIVE_FULL.
- Three families either ACTIVE_FULL (if leiaute resolved in this
  change) or quarantined to Batch 1B with a documented blocker file.
- `EsocialRound1PendingDto` no longer covers S-1005, S-1020, S-1050,
  S-1070.
- Lifted source for the four promoted families is gone.
- `npm run build`, `npm run lint`, `npm run coverage` (with thresholds
  from Batch 0), `npm run test:db`, `npm run test:integration`,
  `npm run integration:localstack` all green.
- `grep -R "from .*sgp-lifted" packages/domain/src/builders` returns
  no hits.

## Verification

```text
npm run build
npm run lint
npm run coverage
npm run test:integration
ls packages/domain/src/builders | sort
# expect: index.ts s1000 s1005 s1010 s1020 s1050 s1070 s1200 s1299 s2200
ls packages/domain/src/sgp-lifted/esocial-worker/builders/ | grep -E "^s100[5057]"
# expect: empty (or only s1030/s1040/s1060 pending Batch 1B)
```

Report: families promoted, families deferred (with blocker reason and
named owner), lifted-source files deleted, dispatcher entries added.
