# R2-B - Qualification Credentials and Round Trips

> This batch may call real eSocial qualification endpoints only after explicit
> owner authorization is recorded.

## Preconditions

- R2-A exit criteria are complete.
- Real qualification credentials and portal account are approved by the named
  eSocial portal/account owner.
- Certificate custody owner approves Secrets Manager plus KMS use.
- Legal/data owner approves either synthetic-only data or a specific real-PII
  test-data policy.
- SRE owner confirms on-call coverage during the connectivity window.
- Kill switch and circuit breaker are tested immediately before the window.

## Primary Write Scope

- `services/submission/**`
- `services/retorno/**`
- qualification integration tests and fixtures under `tests/**`
- `docs/release/0.3.0/qualification/**`
- `docs/release/0.3.0/owners.md`

## Do Not Touch

- Production endpoint configuration.
- Real personal data without the legal/data owner approval reference.
- Raw certificate bytes, private keys, or unredacted SOAP payloads in git.

## Tasks

1. Create or update Secrets Manager references for qualification credentials and
   certificate material without committing secret values.
2. Record certificate fingerprint, KMS key reference, Secrets Manager ARN, and
   owner approval in `docs/release/0.3.0/owners.md`.
3. Execute a real qualification round trip for one representative DTO per active
   category:
   - table
   - non-periodic worker
   - SST
   - periodic
   - benefit/process
   - exclusion
   - return/totalizer path
4. Capture only redacted evidence:
   - request hash
   - signed XML hash
   - SOAP request hash
   - SOAP response hash
   - protocol/receipt where allowed
   - status/audit/log/metric/trace identifiers
5. Verify idempotency by replaying one approved synthetic payload and proving
   it does not create a second regulatory submission.
6. Exercise kill switch after the window and prove real submissions are blocked.

## Verification

Run:

```bash
npm test
npm run test:integration
npm run integration:localstack
npm run coverage
```

Attach the real qualification command transcript to
`docs/release/0.3.0/qualification/commands.md` with secrets redacted.

## Exit Criteria

- Qualification round-trip evidence exists for every active category.
- No real PII appears in committed evidence unless legal approval is linked and
  the evidence is redacted.
- Certificate references and fingerprints are recorded without material leakage.
- Unknown official codes fail closed and are queued for R2-D classification.

## Report

Report categories covered, credential/certificate references, response-code
summary, idempotency result, kill-switch result, and any blocked families.
