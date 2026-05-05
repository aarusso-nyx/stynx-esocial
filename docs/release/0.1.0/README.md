# Round 0 Evidence 0.1.0

This bundle captures the deterministic Round 0 closure slice. It is intentionally
local-only evidence: no real certificate, production endpoint, restricted-
production endpoint, or production personal data is used.

Captured scope:

1. DTO fixtures for the five promoted event families: S-1000, S-1010, S-1200,
   S-1299, and S-2200.
2. Generated XML golden artifacts for the same five families.
3. Deterministic signed-payload hash metadata. Executable signing behavior is
   proven by `npm test` and the PKI tests; this bundle does not store key bytes.
4. SOAP-stub transcript for submit and return-query paths.
5. Response, spool, audit, retry, and DLQ sample envelopes.
6. Database before/after expectations for idempotency and status history.
7. LocalStack harness timeline for request queue, response queue, spool queue,
   audit bus, and `esocial.event_record` persistence.
8. CI workflow definitions and SBOM output for contracts plus active services.

Reproduce the executable evidence from the repository root:

```bash
npm ci
npm run build
npm run lint
npm test
npm run test:db
npm run test:integration
npm run integration:localstack
npm run templates:check
npm run sbom -- --out docs/release/0.1.0/sbom/contracts-active-services.cdx.json
```

Restricted-production evidence is deferred to Round 2 and requires explicit
owner authorization, named redaction rules, and a release window.
