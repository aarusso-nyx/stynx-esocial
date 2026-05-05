# Round 0 — Assessment Synthesis

> Snapshot of the repository state at round-0 start. Compiled from four
> parallel deep inspections (feature completeness, code quality, architecture,
> security) on 2026-05-05. The full per-phase scope plan that this assessment
> drives is in [`./plan.md`](./plan.md).

## Verdict

**Pre-runtime skeleton with strong design intent and a large evidence corpus,
but no end-to-end XML → sign → SOAP flow on the active path.** Architecture is
sound. Implementation lands between Phase 2 and Phase 3 of
[`../plan.md`](../plan.md). Several gates are theatre — they pass without
executing their named work. The SGP boundary holds in active code; it is
grossly violated in [`../../packages/domain/src/sgp-lifted/`](../../packages/domain/src/sgp-lifted/),
which is excluded from any build that exists. There are critical security
gaps, all in lifted code or unwired infra rather than running production paths.

## Architectural ambiguity (round 0 must resolve)

`docs/architecture.md` says eSocial owns "XML build, XSD validate, sign, SOAP
submit." The active processor accepts a *pre-signed* envelope from SGP and
does none of those things. **Round 0 resolves this in favor of the documented
architecture**: eSocial accepts typed DTOs from SGP, builds, validates, signs,
submits, parses returns, and publishes status. SGP never sees XML.

## Inventory snapshot

### Contracts — strong (if the locked set is what's actually in `kinds.ts`)

The thorough inspection of `packages/contracts/src/kinds.ts` reports the full
documented surface present:

- 39 event classes (S-1000…S-1070, S-1200…S-1299, S-2200…S-2399, S-2400…S-2501,
  S-3000, S-5001…S-5013).
- 12-state status union.
- 11 error categories.
- 7 envelope families (request, response, spool, audit, retry, dlq, replay).
- Versioned idempotency-key builder.

Two of four audit passes reported the contract still narrowed to `'S-1299'`,
contradicting the inventory note. **Round-0 prompt A3 reconciles this against
the actual file before any downstream worker depends on it.**

### Builders — empty in active tree

| Family | Active builder | Goldens | Lifted-only | Still SGP-DB-coupled |
| --- | --- | --- | --- | --- |
| S-1000…S-1070 | No | 9 | Yes | Yes |
| S-1200…S-1299 | No | 6 | Yes | Yes |
| S-2200…S-2399 | No | 15 | Yes | Yes |
| S-2400…S-3000 | No | 8 | Yes | Yes |
| S-5001…S-5013 (parsers) | **Yes** in `packages/domain/src/returns/parsers.ts` | n/a | No | No |

44 golden XMLs under `docs/templates/golden/` are inert.

### Pipeline gaps

- **XML build:** not wired. The active processor expects a pre-signed envelope.
- **XSD validation:** framework exists in `packages/domain/src/xml/xsd-validation.ts`
  for table events; no caller.
- **Signing:** `packages/pki-pades/src/index.ts` is real (RSA-SHA256, hardened
  against DTD/entity/stylesheet/external IDs); never invoked from active code.
- **SOAP:** `services/submission/src/transport/soap-sandbox.ts` is a
  deterministic stub; no real transport.
- **Returns:** parser is production-ready, `services/retorno/src/handler.ts`
  is a placeholder.
- **Retry / DLQ / replay:** schema and publishers exist; no runners.
- **Certificate lifecycle:** PKI signs bytes; no service loads certs from
  Secrets Manager, validates, or rotates.

### Code quality gaps (severity-ranked)

1. **CRITICAL — Build is theatre.** `npm run build` runs a structural checker.
2. **CRITICAL — Lifted tree non-compileable.** `@nestjs/*` and missing local
   modules.
3. **CRITICAL — SGP coupling in lifted tree.** 52+ files reference SGP schemas.
4. **HIGH — Schema/code mismatch.** Migrations create 3 tables; runtime
   references ~20.
5. **HIGH — 7 of 9 services are no-ops.**
6. **HIGH — No structured logging, metrics, traces, alarms.**
7. **HIGH — Type laxness in active code** (`any`/`unknown` casts).
8. **HIGH — No CI** (`.github/workflows` absent).
9. **MEDIUM — Test coverage thin** (2–3 active contract files).
10. **MEDIUM — Dependency hygiene** (no audit, some 2023-era pins).

### Architecture wins

- Boundary doctrine intact in active code.
- Layering clean (`contracts → domain → services → infra`).
- Idempotency contract-and-DB enforced.
- Multi-tenancy via RLS with worker-role bypass.
- Stage separation modeled.

### Architecture gaps

1. **Submission asymmetry** (the resolved ambiguity above).
2. **SOAP sandboxed only.**
3. **Retry/DLQ/replay schema without runners.**
4. **Certificate lifecycle disconnected.**
5. **Returns disconnected** (parser solid, handler placeholder).
6. **No cross-service integration tests.**
7. **No DLQ triage table** (operators reconstruct from history).

### Security findings (severity-ranked)

1. **CRITICAL — XXE/DTD hardening missing in lifted XSD validator** (does not
   currently run; release-blocking if activated as-is).
2. **CRITICAL — IAM wildcards in CDK output** (`Resource: "*"` for `logs:*`,
   `sqs:*`, `secretsmanager:GetSecretValue`, `kms:Decrypt`).
3. **CRITICAL — Mixed HTTP/HTTPS endpoint config**, no runtime guard preventing
   `PRODUCTION` from binding to non-HTTPS.
4. **HIGH — Certificate bytes in DB (lifted).** Active migration is correct;
   lifted pattern must not be promoted.
5. **HIGH — No PII redaction in logs.**
6. **HIGH — No XSD application before signing.** Malformed-but-parseable XML
   could be signed.
7. **MEDIUM — Constraint coverage** for `secret_ref` ARN format.
8. **MEDIUM — No HTTP gateway authentication.**

Repo hygiene wins: no `.pem`/`.pfx`/`.p12`/`.key`/`.crt` files in tree;
`.gitignore` present (round 0 will reinstate the broader ignore set).

## What round 0 must produce

A green CI pipeline that executes real behavior on every PR for: build, lint,
unit tests, real-Postgres DB tests, in-process integration test, LocalStack
integration test, real CDK synth (per stage with scoped IAM), and coverage —
plus a published `@esocial/contracts@1.0.0`, an autonomous schema, an
end-to-end pipeline proven on 5 event families and full S-50xx returns,
operator runbooks, and an evidence bundle under `docs/release/0.1.0/`.

Promotion of the remaining ~30 event families is **round 1** — mechanical
once round 0's pipeline is stable.
