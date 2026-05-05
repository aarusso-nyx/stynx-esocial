# 02 — Lock Versioned Bus Contracts

> **Phase 2 of [`../plan.md`](../plan.md).** Wave 1, runs in parallel with
> Phase 3 once Phase 1 has landed. Owns the `Contracts worker` scope from
> the worker split.

## Context

Read first:

- [`../inv.md`](../inv.md) — "Contracts package: Partial. … Runtime
  event-class coverage is currently narrowed to `EsocialRelayEventClass =
  'S-1299'`."
- [`../diag.md`](../diag.md) — "Contract Diagnostics" section. Status
  taxonomy is `OK | RETRY | DEAD_LETTER`; docs describe accepted, rejected,
  retry, timeout, dead-lettered, failed, plus building/validation_failed/
  signed/excluded.
- [`../plan.md`](../plan.md) — Phase 2 task list and exit criteria.
- [`../../consumers.md`](../../consumers.md) — the documented consumer
  contract surface SGP integrates against.

The active contract package today (`packages/contracts/src/`) has
`envelope.ts`, `kinds.ts`, `audit-envelope.ts`, `spool-envelope.ts`, and
`payloads/submit.ts`. Coverage is narrow; documentation describes a richer
surface than the exported types enforce. SGP is intended to integrate
**only** through this package — it is the public boundary.

## Operating principles

- Do not keep compatibility shims for wrong pre-production names. Rename
  types and update every call site (including services, domain, tests, and
  docs) in the same change.
- Contracts are documentation in code. Every exported type must have a
  matching example in `tests/contract/` and a matching mention in
  `docs/consumers.md`.
- `docs/consumers.md` and exported types must agree at the end of this
  phase. If a doc statement does not match the code, fix one of them — do
  not leave both.
- Versioning is forward-only: add new types with explicit version markers,
  do not silently mutate existing envelopes.

## Tasks

1. **Define versioned envelopes** for every transport family used in the
   plan: request, response, spool, audit, retry, DLQ, replay. Each envelope
   carries an explicit `version` discriminator (e.g., `"v1"`) and stable
   field names.
2. **Expand event taxonomy.** Replace `EsocialRelayEventClass = 'S-1299'`
   with the full surface from `docs/events.md` and `docs/consumers.md`:
   - Tables: `S-1000`, `S-1005`, `S-1010`, `S-1020`, `S-1030`, `S-1040`,
     `S-1050`, `S-1060`, `S-1070`.
   - Periodic: `S-1200`, `S-1202`, `S-1207`, `S-1210`, `S-1298`, `S-1299`.
   - Worker/SST/TSV: `S-2200`, `S-2205`, `S-2206`, `S-2210`, `S-2220`,
     `S-2230`, `S-2240`, `S-2298`, `S-2299`, `S-2300`, `S-2306`, `S-2399`.
   - Benefits/process/exclusion: `S-2400`, `S-2405`, `S-2410`, `S-2416`,
     `S-2418`, `S-2420`, `S-2501`, `S-3000`.
   - Returns: `S-5001`, `S-5002`, `S-5011`, `S-5012`, `S-5013`.
3. **Normalize statuses** across docs and code. The canonical state set is
   `pending`, `building`, `validation_failed`, `signed`, `sent`, `accepted`,
   `rejected`, `retry`, `timeout`, `dlq`, `excluded`, `failed`. Export it
   as a discriminated union; no synonyms (`OK`, `DEAD_LETTER`, etc.).
   Rename consumers everywhere.
4. **Encode error categories** from `docs/consumers.md` as exported types
   (validation, schema, signing, transport, regulatory, configuration,
   authentication, internal, etc. — match the doc).
5. **Define idempotency keys** for each family. Per the plan, the key
   includes: tenant, environment, event class, source event/entity ids,
   competence (where applicable), payload hash, and rectification/exclusion
   markers. Export a typed key shape and a deterministic builder.
6. **Add contract fixture tests.** Under `tests/contract/`, validate
   representative JSON envelopes per event class for each direction
   (request, response, spool, audit, retry, DLQ, replay). Use real example
   payloads from `docs/templates/golden/` where applicable, but trim to
   the contract surface — these are envelope tests, not XML tests.
7. **Add a versioning policy** as a dedicated document section in
   `docs/consumers.md`: how new versions are introduced, how consumers
   negotiate compatibility, deprecation cadence, and how SGP discovers
   schema changes.

## Primary write scope

- `packages/contracts/src/` (all files, including new ones)
- `packages/contracts/package.json` (only to add dependencies the contract
  surface needs — `zod` or similar runtime validation if you adopt it)
- `tests/contract/` (expand)
- `docs/consumers.md` (full alignment)
- `docs/events.md` (only if event-class names changed)

## Do not touch

- `services/submission/` runtime — Phase 4 owns it. You may, however,
  update its `submit-envelope` import path or type name if you are renaming
  a contract type.
- `infra/migrations/` — Phase 3 owns it.
- Lifted code under `packages/domain/src/sgp-lifted/`.
- Builder/parser code — Phases 5/7 own it.

## Exit criteria

- `npm test` validates the full contract taxonomy and at least one sample
  fixture per family per direction.
- `docs/consumers.md` and exported contract types agree (no drift).
- `EsocialRelayEventClass` is the full set above. No `'S-1299'`-only
  narrowing remains.
- Status union has 12 canonical members; old `OK`/`RETRY`/`DEAD_LETTER`
  names are gone everywhere.
- An idempotency-key builder exists, is exported, and is exercised by a
  contract test (collision-free for distinct inputs, stable for identical
  inputs).
- A versioning policy section exists in `docs/consumers.md`.

## Verification commands

```text
npm run build          # contracts must still compile
npm run lint
npm test               # contract suite must cover the new surface
grep -R "OK\\|RETRY\\|DEAD_LETTER" packages services tests   # should match only renamed identifiers in tests, never as status values
```

Report: how many event classes are now exported, how many envelope
fixtures land in `tests/contract/`, and the diff of statuses removed vs.
added.
