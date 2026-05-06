# D3 — Local Dev One-Command + Family Codegen

> **Wave D.** DX worker. Parallel with D1, D2, D4, D5.

## Read first

- [`../plan.md`](../plan.md) — closure item 18.
- Round-0 prompt C3 (LocalStack harness) — D3 extends it.

## Tasks

1. **`npm run dev:up`**:
   - Boots `docker compose` with: Postgres, LocalStack (SQS,
     EventBridge, Secrets Manager, KMS), the operator console
     (D2), and a deterministic SOAP stub.
   - Loads migrations.
   - Seeds a test tenant + cert.
   - Pushes a sample envelope per round-0 family to demonstrate
     the pipeline runs.
   - Prints URLs for: HTTP gateway, operator console, reference
     site (E3), Pino-pretty log stream.
2. **`npm run dev:down`** tears it cleanly.
3. **`npm run dev:family <S-XXXX>`** — codegen for new families:
   - Scaffolds `packages/contracts/src/dtos/<family>.ts` with
     placeholders.
   - Scaffolds `packages/domain/src/builders/<family>/builder.ts`
     with a TODO body and metadata.
   - Scaffolds `tests/golden/<family>.test.ts` and
     `tests/golden/fixtures/<family>.dto.json`.
   - Adds the family to the dispatcher with a `// TODO` import.
   - Prints next-step checklist.
4. **`npm run dev:reset`** — drops + recreates DB and queues.
5. **Pino log streaming**: `npm run dev:logs` tails structured logs
   with PII redaction visible.

## Primary write scope

- `docker-compose.dev.yml`
- `scripts/dev-{up,down,reset,logs}.mjs`
- `tools/codegen/family/**`
- `package.json` scripts
- `docs/operations.md` — local-dev runbook
- README quick-start section

## Do not touch

- Production code semantics.
- Other waves' resources.

## Exit criteria

- `dev:up` boots cleanly on a fresh clone in < 5 min.
- `dev:family S-1099` (made-up) scaffolds a valid promotion target.
- `dev:reset` returns the env to clean state.

## Verification

```text
npm run dev:up
curl http://localhost:3000/healthz
npm run dev:family S-1099
ls packages/domain/src/builders/s1099
npm run dev:down
```

Report: boot time, scaffolded files per family, environment
variables required, contributor onboarding time delta.
