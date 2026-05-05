# 01B — Blocked Table Events

> **Wave B follow-on.** Run only after the product/regulatory owner resolves
> the leiaute blockers in `../leiaute-blockers.md`.

## Scope

Promote the table families quarantined from Batch 1:

| Event | Blocker |
| --- | --- |
| S-1030 | `evtTabCargo.xsd` is absent for the golden's S-1.3 namespace. |
| S-1040 | `evtTabFuncao.xsd` is absent for the golden's S-1.3 namespace. |
| S-1060 | Golden uses legacy `evtTabAmbiente/v02_05_00`; current supported layout is undecided. |

## Tasks Per Family

1. Record the owner-approved leiaute decision in `docs/events.md`.
2. Add or bind the matching XSD under the active validation surface.
3. Replace the `EsocialRound1PendingDto` stub with an explicit DTO type under
   `packages/contracts/src/dtos/`.
4. Regenerate `packages/contracts/schemas/v1/dto-<family>.schema.json` and
   `packages/contracts/examples/v1/requests/<family>.request.json`.
5. Add `packages/domain/src/builders/<family>/builder.ts` with no
   `sgp-lifted` imports and no SGP database access.
6. Add the builder export and `SUBMISSION_DISPATCHERS` entry.
7. Add golden, metadata, invalid-DTO, XSD, and integration pipeline tests.
8. Delete the promoted lifted builder source and any matching
   `tests/sgp-lifted/` tests.
9. Update `docs/consumers.md` and `docs/sgp-migration.md`.

## Exit Criteria

- S-1030, S-1040, and S-1060 are ACTIVE_FULL or explicitly retired by owner
  decision.
- `EsocialRound1PendingDto` no longer covers any table family that remains in
  the public event taxonomy.
- `npm run build`, `npm run lint`, `npm run coverage`, `npm run test:db`,
  `npm run test:integration`, and `npm run integration:localstack` are green.
