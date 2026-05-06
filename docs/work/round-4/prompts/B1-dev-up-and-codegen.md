# B1 — `npm run dev:up` + Family Codegen

> **Wave B.** DX worker. Parallel with B2, A, C, D.

## Read first

- [`../plan.md`](../plan.md) — closure item 5.
- Round-3 prompt `D3-local-dev.md`.
- `scripts/integration-localstack.mjs` — existing harness to lean on.

## Tasks

1. **`docker-compose.dev.yml`** with: Postgres 16, LocalStack
   (community) for SQS/EventBridge/SecretsManager/KMS, the
   deterministic SOAP stub (round-0 stub), and pino-pretty log tail.
2. **`scripts/dev-up.mjs`** that:
   - Runs `docker compose up -d`.
   - Waits for healthy.
   - Runs `migrate:dev` against local Postgres.
   - Seeds a synthetic tenant + cert (test material only).
   - Pushes a sample envelope per round-0 family to demonstrate the
     pipeline runs.
   - Prints URLs for: HTTP gateway, log stream.
3. **`scripts/dev-down.mjs`** — `docker compose down -v`.
4. **`scripts/dev-reset.mjs`** — drop + recreate DB and queues.
5. **`scripts/dev-logs.mjs`** — pino-pretty stream.
6. **`tools/codegen/family/`**:
   - `npm run dev:family <S-XXXX>` scaffolds:
     - `packages/contracts/src/dtos/<family>.ts`.
     - `packages/domain/src/builders/<family>/builder.ts` (TODO body).
     - `tests/golden/<family>.test.ts`.
     - `tests/golden/fixtures/<family>.dto.json`.
     - Dispatcher entry with `// TODO` import.
   - Prints next-step checklist.
7. **README quick-start** (coordinate with C1).
8. **Cold-start benchmark**: target < 5 minutes on a fresh clone.
9. **No real services**. Everything runs locally.

## Primary write scope

- `docker-compose.dev.yml`
- `scripts/dev-{up,down,reset,logs}.mjs`
- `tools/codegen/family/**`
- `package.json` scripts (`dev:up`, `dev:down`, `dev:reset`,
  `dev:logs`, `dev:family`)
- `docs/operations.md` — local-dev runbook section
- `docs/release/1.1.0/dx/`

## Do not touch

- Production code semantics.
- Other waves' resources.
- Round-0 / round-1 / round-3 evidence bundles.

## Exit criteria

- `dev:up` boots the full stack on a fresh clone in < 5 min.
- `dev:family S-1099` (made-up) scaffolds a valid promotion target.
- `dev:reset` returns the env to clean state.
- `dev:logs` streams pretty Pino with PII redaction visible.

## Verification

```text
npm run dev:up
curl http://localhost:3000/healthz
npm run dev:family S-1099
ls packages/domain/src/builders/s1099
npm run dev:down
```

Report: boot time, scaffolded files per family, env vars required.
