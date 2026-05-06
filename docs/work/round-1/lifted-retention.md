# Lifted Retention Register

Batch 5 retired the lifted builders, return parsers, adapter/service copies,
and `tests/sgp-lifted/` corpus. The remaining lifted tree is intentionally
small and excluded from TypeScript compilation by
`packages/domain/tsconfig.json`.

| Retained path | Owner | Reason | Deletion gate | Target |
| --- | --- | --- | --- | --- |
| `packages/domain/src/sgp-lifted/esocial-worker/xsd/` | XML/event worker plus eSocial regulatory owner | Active builders and `packages/domain/src/xml/xsd-validation.ts` still bind to this S-1.3 schema bundle. Moving the bundle requires updating every XSD binding and re-running golden, XSD, SOAP, and integration evidence. | Copy the authoritative XSD bundle to `packages/domain/src/xml/xsd/`, update all active `xsdBinding` metadata, and prove `npm test`, `npm run test:integration`, and `npm run integration:localstack`. | Round 2 foundation, before real restricted-production connectivity. |

No retained file may import SGP runtime code, SGP SQL schemas, or production
data. Any new dependency on this path must either move the XSD into the active
tree first or update this register in the same change.
