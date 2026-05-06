# D5 — OpenAPI 3.1 + AsyncAPI 3.0 Specifications

> **Wave D.** API docs worker. Parallel with D1–D4. Feeds E3.

## Read first

- [`../plan.md`](../plan.md) — closure item 15.
- `@esocial/contracts@1.x` — source of truth for envelopes / DTOs.
- HTTP gateway routes (DLQ replay, LGPD DSR, audit verify).

## Tasks

1. **OpenAPI 3.1** at `packages/contracts/openapi.yaml` (or
   generated from code via `@asteasolutions/zod-to-openapi` /
   `tspecclient`):
   - All HTTP gateway routes:
     - `POST /dlq/{id}/replay`
     - `GET /dlq` (list)
     - `POST /lgpd/access`
     - `POST /lgpd/erase`
     - `POST /lgpd/export`
     - `GET /audit/verify`
   - Auth schemes documented (IAM SigV4 / OIDC, per the round-1
     decision).
   - Error responses with the canonical error-category union.
   - Examples per route.
2. **AsyncAPI 3.0** at `packages/contracts/asyncapi.yaml`:
   - Channels for: request, response, spool, audit, retry, dlq,
     replay (the seven envelope families).
   - Per-channel: bindings (SQS / EventBridge), message schemas
     (link to existing JSON Schemas under
     `packages/contracts/schemas/v1/`).
   - Versioning policy (round-1 versioning rules apply here).
3. **Generation**:
   - Specs generated from code at build time. CI fails if specs
     drift from code.
   - Schema files referenced rather than inlined.
4. **Validation**:
   - `spectral lint` runs in CI on both specs.
   - `openapi-typescript` derives client types as a sanity check
     against the SDK (D1).
5. **Publication**: specs published as part of the contracts
   release; reference site (E3) renders them.

## Primary write scope

- `packages/contracts/openapi.yaml`, `asyncapi.yaml`
- `packages/contracts/src/spec-generation/**`
- `.spectral.yaml`
- CI workflow additions
- `docs/release/1.0.0/specs/`

## Do not touch

- HTTP route handlers (specs reflect them).
- Queue topology (specs document it).

## Exit criteria

- Both specs valid (spectral pass).
- Code-spec drift detection on every PR.
- SDK client (D1) derived types align with OpenAPI types.

## Verification

```text
npx spectral lint packages/contracts/openapi.yaml
npx spectral lint packages/contracts/asyncapi.yaml
npx openapi-typescript packages/contracts/openapi.yaml -o tests/spec-drift/openapi.d.ts
diff -q tests/spec-drift/openapi.d.ts <(node scripts/types-from-code.mjs)
```

Report: routes documented, channels modeled, drift-check status,
spec-version pin.
