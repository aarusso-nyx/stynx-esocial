# R2-A - SOAP Client Allowlist, Pinning, and XSD Ownership

> Planning scope from Round 2. This batch prepares real-service safety controls
> but must not submit to official eSocial endpoints.

## Preconditions

- Every Round 1 closure item is `PASS`.
- `docs/work/round-2/plan.md` owner table has named people and approval
  artifacts for release, security/certificate, SRE, legal/data, SGP, and
  eSocial regulatory decisions.
- Real-service submission remains disabled by default.

## Primary Write Scope

- `packages/domain/src/xml/**`
- `packages/pki-pades/**`
- `services/submission/**`
- SOAP/XSD/security tests under `tests/**`
- `docs/architecture.md`
- `docs/release/0.3.0/owners.md` only for owner references created by this
  batch

## Do Not Touch

- Real certificate files, private keys, production payloads, real `.env` files.
- Round 0 or Round 1 evidence bundles except for links from the new 0.3.0
  evidence.
- SGP schemas, SGP database URLs, or browser-facing SGP routes.

## Tasks

1. Move or copy the retained XSD bundle from
   `packages/domain/src/sgp-lifted/esocial-worker/xsd/` into active XML
   ownership, or record a release-owner exception with expiration.
2. Update all active `xsdBinding` metadata to the active XSD path.
3. Add explicit per-stage SOAP endpoint allowlists:
   - qualification
   - restricted-production
   - production
4. Keep official `gov.br` hosts denied unless the stage and owner approval
   explicitly allow real connectivity.
5. Add TLS policy tests:
   - `rejectUnauthorized: true`
   - TLS 1.2 or higher
   - certificate pin or CA thumbprint check hook
   - pin mismatch fails before payload submission
6. Demonstrate kill switch and circuit breaker behavior before any official
   endpoint can be reached.
7. Prove no active source imports remain from `sgp-lifted` except an approved
   XSD-retention exception.

## Verification

Run:

```bash
npm test
npm run lint
npm run build
npm run test:integration
npm run integration:localstack
```

Also run the boundary canary and any scoped IAM/template checks that cover
endpoint configuration.

## Exit Criteria

- Real endpoint routing is guarded by stage allowlists, owner approval checks,
  kill switch, and circuit breaker.
- XSD ownership is active or explicitly exceptioned by release owner.
- Tests prove TLS pin mismatch and unauthorized `gov.br` routing fail closed.
- No official submission is performed in this batch.

## Report

Report the XSD decision, endpoint allowlist changes, TLS pinning evidence, kill
switch evidence, and remaining owner approvals required before R2-B.
