# B4 — SOAP Sandbox and Environment Routing

> **Wave B, step 4.** PKI/SOAP worker. Blocked by B3.

## Read first

- [`../assessment.md`](../assessment.md) — SOAP-sandboxed-only,
  HTTPS-not-enforced findings.
- [`../../plan.md`](../../plan.md) — Phase 6.
- `services/submission/src/transport/soap-sandbox.ts` — current stub.
- `docs/templates/wsdl/` — committed WSDL fixture.
- A3's environment enum (`qualification | restricted_production | production`).
- A4's `endpoint_circuit_state`.

## Why this exists

The current SOAP transport is a deterministic stub returning fake
protocols/receipts. Round 0 ships only against the deterministic stub
**but** introduces the real transport interface, environment-bound
routing, hardened TLS configuration, and a network allowlist that prevents
tests from reaching `gov.br`. Real-eSocial-sandbox connectivity is round 2.

## Tasks

1. **Define `SoapTransport` interface** in
   `packages/domain/src/transport/soap-transport.ts`:
   - `submit(operation, signedXml, ctx) -> SoapResult`.
   - `consultProtocol(protocol, ctx) -> SoapResult`.
   - `SoapResult`: `{ httpStatus, soapStatus, requestHash, responseHash, rawResponse }`.
2. **Two implementations**:
   - `DeterministicSandboxTransport` (round-0 default for dev/qa). Reads
     the WSDL fixture, returns deterministic protocols/receipts seeded
     by the request hash. Logs request/response hashes; never makes
     network calls. Used in CI.
   - `SoapClientTransport` (real client; not exercised in round 0).
     Built on the chosen SOAP library with explicit options:
     `rejectUnauthorized: true`, no insecure ciphers, request timeout,
     retry off (B-C1 owns retry).
3. **Environment routing.** A `transportFactory(environment)` returns:
   - `qualification` → `DeterministicSandboxTransport` in CI.
   - `restricted_production` → `SoapClientTransport` pointed at a
     placeholder URL **set via env var, never hardcoded**. Round 0 does
     not exercise this path; the test asserts the factory wires it.
   - `production` → `SoapClientTransport` pointed at production URL via
     env var. Round 0 fails synthesis if env vars are missing.
4. **Network allowlist.** A test-time interceptor (`undici` mock or
   `nock`) denies all outbound HTTP unless the host is explicitly
   allowlisted. The allowlist for tests is empty. Add a test that
   asserts a `gov.br` URL is rejected by the interceptor.
5. **TLS guard.** A startup check in `transportFactory`:
   - For non-qualification: URL must be `https://`. Throw on `http://`.
   - For qualification with `DeterministicSandboxTransport`: allowed.
6. **Pipeline wiring.** Connect B1 → B2 → B3 → B4:
   - After B3 signs, the dispatcher calls
     `SoapTransport.submit(operation, signedXml, ctx)`.
   - On `accepted` SOAP status: persist `sent` state, persist
     request/response hashes, return.
   - On retryable SOAP fault: persist hashes, raise typed error so C1's
     retry layer (round-0 minimal: queue redrive) can classify.
   - On terminal SOAP fault: persist hashes, transition to `failed`,
     publish DLQ event.
7. **`test:integration` is now real.**
   - Boots ephemeral Postgres (A4) and the deterministic SOAP transport.
   - Runs an end-to-end pipeline per round-0 family: DTO → build → XSD →
     sign → SOAP-stub → persist → publish via in-memory publishers.
   - Asserts: hashes persisted, status = `sent`, spool envelope emitted
     with `sent`.
   - Renames the script if it currently runs the regex linter.

## Primary write scope

- `packages/domain/src/transport/**`
- `services/submission/src/transport/**`
- `tests/integration/**` (new) — end-to-end-in-process suite
- `scripts/test-integration.mjs` (real harness)
- `package.json` (`test:integration` wiring)

## Do not touch

- Builders / signing — B2/B3 own them. B4 only invokes them.
- Returns — B5 owns the inbound side.
- CDK — C3 owns it.
- Migrations — A4 owns it.

## Exit criteria

- `npm run test:integration` boots Postgres + deterministic transport,
  runs all five round-0 families end-to-end, persists hashes, and
  asserts `sent` status.
- `gov.br` URL test rejection passes.
- TLS guard rejects `http://` for non-qualification.
- No production endpoints are hardcoded; env-var lookup is explicit.
- The deterministic transport never makes real network calls (verified
  by the allowlist test).
- `services/submission/src/transport/soap-sandbox.ts` is replaced by the
  factored `DeterministicSandboxTransport` and lives behind the new
  interface.

## Verification

```text
npm run build
npm run test:integration
grep -R "gov\\.br" packages services --include="*.ts" | grep -v "docs/" | grep -v "test"
# Expected: env-var indirection only, no hardcoded URL
```

Report: round-trip latency per family in CI, request/response hash
samples (zeroed for any PII), and any deferred work for round 2 (real
sandbox connectivity).
