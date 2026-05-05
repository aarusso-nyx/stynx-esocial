# 06 — Activate XSD, XML Security, Signing, and SOAP Sandbox

> **Phase 6 of [`../plan.md`](../plan.md).** Wave 2, runs after Phase 5
> begins (does not require all families promoted, only the first batch).
> Owns the `PKI/SOAP worker` scope.

## Context

Read first:

- [`../inv.md`](../inv.md) — "PKI package: Stub. … Actual lifted signing
  code exists under `packages/domain/src/sgp-lifted/.../signature/`, not as
  the standalone package boundary."
- [`../diag.md`](../diag.md) — "Production-Use Risks" calls out the security
  gap; "Test Diagnostics" notes there are no active XSD/signing/SOAP tests.
- [`../plan.md`](../plan.md) — Phase 6 task list and exit criteria.
- `docs/templates/wsdl/` — committed WSDL fixture.
- `docs/references/` — leiaute and certificate references.

Today, `packages/pki-pades/src/index.ts` is a placeholder describing a
future signing boundary. Real signing code lives in the lifted tree, and
no XSD validation, XML hardening, or SOAP test runs in CI. This phase
moves PKI into a clean package boundary and turns XSD/signing/SOAP into
real, sandbox-only gates.

## Operating principles

- No real certificates, real endpoints, production payloads, or production
  personal data without explicit owner authorization. Generate test
  certificates locally via the test fixtures.
- Tests cannot reach `gov.br` endpoints. Enforce this with a network
  allowlist or a SOAP client transport stub that rejects external hosts.
- XML parsing must be hardened: no DTD resolution, no external entity
  expansion, no network fetches. XXE attempts on input must fail
  deterministically.
- Certificate bytes are never stored in the database. Only encrypted-secret
  references (e.g., AWS Secrets Manager ARN) plus custody metadata, per
  the Phase-3 schema.
- Every signed/submitted message persists hashes: request XML hash,
  signed payload hash, SOAP request hash, SOAP response hash.

## Tasks

1. **Promote signing into the PKI boundary.** Move signing code from
   `packages/domain/src/sgp-lifted/.../signature/` into
   `packages/pki-pades/src/`. The package exposes a small interface:
   `sign(xmlBytes, certificateRef) -> { signedBytes, signatureHash }` and
   a verification function. No database access from the package; it
   takes a resolved certificate handle.
2. **Certificate custody service.** Wire `services/certificado/` to:
   - Resolve a certificate reference (tenant + label) to a handle.
   - Pull the encrypted secret from Secrets Manager (or a LocalStack stub
     in test).
   - Track validity, rotation, and revocation against the Phase-3
     `tenant_certificate` table.
   - Audit every certificate access (append-only audit log).
3. **XML parser hardening.** Whichever parser you use (`libxmljs2`,
   `fast-xml-parser`, `xmldom`), configure it to disable DTDs and external
   entities. Add a test that submits a known XXE payload and asserts it
   is rejected.
4. **XSD validation gate.** Before signing and before submission, validate
   the canonical XML against the family's bound XSD (the metadata test
   from Phase 5 declares the binding). On failure:
   - Persist a row in `esocial.xsd_validation_failure` with payload hash
     and offending node path.
   - Transition the event to `validation_failed`.
   - Emit a status update with the failure category.
5. **SOAP sandbox stub.** Build a deterministic local SOAP/WSDL stub from
   `docs/templates/wsdl/`. The submission/return code path uses the stub
   in test/dev. Add a transport guard that rejects non-allowlisted hosts
   when `NODE_ENV !== 'production'`.
6. **Environment-bound routing.** Three configurations: `qualification`,
   `restricted-production`, `production`. Routing config lives in env or
   config file (do not hard-code endpoints). Add tests that assert each
   env routes to the correct endpoint set, and that test mode never
   resolves to production endpoints.
7. **Persist hashes.** On every signed/submitted message:
   - Request XML hash → `event_record` (or audit log).
   - Signed payload hash → audit log.
   - SOAP request hash → audit log.
   - SOAP response hash → audit log.
   These hashes are surfaced in audit/status outputs.

## Primary write scope

- `packages/pki-pades/` (becomes a real package, with deps and tests)
- XML/XSD services under `packages/domain/`
- `services/certificado/`
- SOAP transport adapters and the WSDL stub harness under `tests/soap/`
  or `services/submission/src/transport/`
- `docs/references/` (only to fix stale paths or add operational notes)

## Do not touch

- `packages/contracts/` — Phase 2 owns it.
- `infra/migrations/` for `tenant_certificate` shape — Phase 3 owns it.
  If you need a column, request a forward migration from Phase-3 worker.
- Builders themselves — Phase 5 owns DTO/XML output shape. This phase
  validates and signs what builders produce.
- Status semantics — Phase 7 owns return parsing and final state mapping.

## Exit criteria

- Signing tests use only generated/local fixtures. No real certificates
  in the repo.
- SOAP tests cannot hit `gov.br` endpoints in test mode (verified by a
  guard test).
- Invalid XML cannot be signed: signing rejects unsigned XML that fails
  XSD or hardening.
- XXE/DTD payloads are rejected with a dedicated test.
- Request, signed, SOAP-request, and SOAP-response hashes are persisted
  and exposed in audit/status outputs.
- `packages/pki-pades/` is the only home for signing logic; no signing
  imports from the lifted tree remain in active code.

## Verification commands

```text
npm run build
npm run lint
npm test
npm run test:integration   # SOAP stub round-trip
npm run coverage
grep -R "gov.br" packages services tests   # only references in docs/refs and config tables
```

Report: certificate custody flow (one paragraph), XSD failures captured
during testing, and the SOAP stub's coverage of submit/return operations.
