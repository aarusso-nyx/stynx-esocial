# B3 — PKI Wiring and XML Security

> **Wave B, step 3.** PKI/SOAP worker. Blocked by A2 + A4. Blocks B4.

## Read first

- [`../assessment.md`](../assessment.md) — security findings (XXE, certificate
  bytes in DB, missing XSD-before-sign).
- [`../../plan.md`](../../plan.md) — Phase 6.
- `packages/pki-pades/src/index.ts` — already implements signing primitives.
- A4's `tenant_certificate` schema.
- `docs/templates/wsdl/` and XSDs under
  `packages/domain/src/sgp-lifted/esocial-worker/xsd/`.

## Why this exists

Signing primitives exist but are never invoked. Certificate custody is not
wired. XSD validation is framework-only. The lifted XSD validator does not
harden against XXE. Round 0 wires real signing into the pipeline behind a
hardened XSD gate.

## Tasks

1. **Certificate custody service.** `services/certificado/src/handler.ts`
   becomes a real implementation:
   - `resolveCertificate(tenantId, environment, label)` →
     `CertificateHandle`.
   - Read the row from `esocial.tenant_certificate`.
   - Pull the encrypted material from AWS Secrets Manager using the
     `secret_ref` ARN (LocalStack-backed in dev/test).
   - Validate `not_before <= now < not_after` and `revoked_at IS NULL`.
   - Cache with a short TTL (e.g., 5 min) keyed on tenant+env+label.
   - Append to `audit_event_log` on every resolution (kind:
     `certificate.access`).
   - Throw a typed `CertificateUnavailableError` on miss.
2. **Sign-in-pipeline.** Extend the dispatcher from B1/B2:
   - After `build(dto)`, run XSD validation.
   - If XSD passes, persist `signed` status row, sign via
     `packages/pki-pades` with the resolved `CertificateHandle`,
     persist signed payload hash + signature hash + cert fingerprint
     into the event record (or audit log per A4 design).
   - If XSD fails, write `xsd_validation_failure` row, transition to
     `validation_failed`, publish status update with category `schema`.
3. **XSD enforcement.** `packages/domain/src/xml/xsd-validation.ts`:
   - Bind to the XSD declared in the builder's metadata.
   - Use `libxmljs2` (or whichever parser the project picks) with
     **explicit hardening**: no DTD, no entities, no stylesheet, no
     external IDs, no network fetches.
   - Add an XXE-rejection test: a payload with `<!DOCTYPE>` and an
     external entity must fail with a typed error before reaching the
     validator.
   - The XSD files move under `packages/domain/src/xml/xsd/<family>/`
     for the round-0 families. The lifted XSD set stays untouched
     until round 1.
4. **Hardening parity for parsers.** Returns parser at
   `packages/domain/src/returns/parsers.ts` already exists; verify it
   uses a hardened parser config too. Add the same XXE-rejection test
   on the returns side.
5. **Forbid certificate bytes in DB.** Add a runtime guard that rejects
   any payload looking like `-----BEGIN` before persisting (already
   enforced in A4 schema; round-0 mirrors it in code).
6. **Tests.**
   - `packages/pki-pades/__tests__/sign.test.ts` — signs a B2-built
     XML with a generated test key; verifies signature; asserts hash
     fields.
   - `services/certificado/__tests__/resolve.test.ts` — uses
     LocalStack Secrets Manager + ephemeral Postgres; resolves a cert,
     hits cache, audit row appears.
   - `packages/domain/src/xml/__tests__/xxe.test.ts` — DOCTYPE +
     entity + stylesheet payloads all rejected with typed errors.
   - `packages/domain/src/xml/__tests__/xsd.test.ts` — invalid-by-XSD
     XML fails; valid XML passes.
7. **No real certificates.** Test fixtures generate keys at runtime via
   `node-forge` or the chosen toolkit. Never commit `.pem`/`.pfx`/`.p12`/
   `.key`/`.crt`. CI fails if any of those extensions is committed.

## Primary write scope

- `packages/pki-pades/src/**`, `__tests__/**`
- `packages/domain/src/xml/**`, `__tests__/**`
- `services/certificado/src/**`, `__tests__/**`
- `packages/domain/src/returns/parsers.ts` (only the parser-config
  hardening — coordinate with B5)
- `tests/golden/fixtures/` (test certs only generated, never committed)

## Do not touch

- Builders themselves — B2 owns their output. B3 validates and signs;
  it does not modify build output.
- Contracts — A3 owns it.
- Migrations — A4 owns it. If a column is missing, raise to A4.
- SOAP transport — B4 owns it.

## Exit criteria

- An end-to-end build → XSD → sign cycle works for the five round-0
  families. Hashes are persisted.
- XXE/DOCTYPE/external-entity payloads are rejected with typed errors
  in a dedicated test.
- Certificates are loaded from Secrets Manager via reference; no bytes
  touch the database; no `*.pem` / `*.pfx` files in the repo.
- Failed XSD validation creates an `xsd_validation_failure` row and
  transitions to `validation_failed` (NOT `signed`).
- `services/certificado` writes a `certificate.access` audit row per
  resolution.
- Lifted signing/XSD code in `sgp-lifted/.../signature/` and
  `sgp-lifted/.../xsd/` is **not** imported by any active code.

## Verification

```text
npm run build
npm run lint
npm test
npm run test:db
npm run test:integration  # B4 wires this; for B3 standalone, run targeted suites
find . -type f \( -name "*.pem" -o -name "*.pfx" -o -name "*.p12" -o -name "*.key" -o -name "*.crt" \) -not -path "*/node_modules/*"
# Expected: nothing committed
```

Report: families with full build → XSD → sign cycle (5/5 expected),
XXE rejection paths, certificate cache hit rate from the integration test,
and any gaps that pushed work to round 1.
