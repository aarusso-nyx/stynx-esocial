# A3 — Typed Configuration Layer

> **Wave A.** Configuration worker. Parallel with A1, A2, A4, A5.

## Read first

- [`../plan.md`](../plan.md) — closure item 4.
- [`../assessment.md`](../assessment.md) — config section.
- Current state: ~16 scattered `process.env` reads across active code.

## Tasks

1. **Single config module** at `packages/domain/src/config/index.ts`:
   - `loadConfig(env: NodeJS.ProcessEnv = process.env): EsocialConfig`.
   - Validates with `zod` (or equivalent) at the call site; throws a
     `ConfigurationError` with field-path on failure.
   - `EsocialConfig` is a deeply-typed object: stage, region,
     queue URLs, secret ARNs, log level, OTel endpoint, perf budgets,
     retry budgets, allowed SOAP hosts per stage, certificate cache
     TTL, etc.
   - Defaults are explicit; no silent fallbacks.
   - Sensitive values redacted in `toString()` / `inspect`.
2. **Single load point per service.** Every Lambda/handler calls
   `loadConfig()` once at module scope; downstream code accepts the
   typed object as a parameter, never reads `process.env` directly.
3. **Strip `process.env` reads** from every other location. Replace
   with config-object access.
4. **CI canary**:
   - `scripts/check.mjs` greps for `process.env\.` outside
     `packages/domain/src/config/`. Failure → CI fails.
5. **Config validation tests**:
   - Each required key missing → throws with the field path.
   - Bad value (e.g., non-URL queue URL, non-ARN secret) → throws.
   - Stage = `production` requires `ESOCIAL_PROD_CONFIRM=1`; else
     throws.
   - Stage = `production` with `http://` SOAP endpoint → throws.

## Primary write scope

- `packages/domain/src/config/**`
- All callers (signature update only)
- `scripts/check.mjs` (canary addition)
- Config validation tests under
  `packages/domain/src/config/__tests__/`

## Do not touch

- Migrations, builders, contracts (other than parameter signatures).
- CDK env-var wiring beyond renaming for clarity (B6 owns deeper
  CDK env-var work).

## Exit criteria

- `grep -R "process\\.env" packages services --include='*.ts' | grep -v sgp-lifted | grep -v "/config/"`
  returns no hits.
- All required keys are validated; tests cover each rejection path.
- Production-stage guards are tested.

## Verification

```text
npm run build
npm run lint                # canary fires on stray process.env
npm test
```

Report: process.env occurrences before / after, config keys defined,
and stage-specific guards added.
