# Lifted Retention Register

Batch 5 retired the lifted builders, return parsers, adapter/service copies,
and `tests/sgp-lifted/` corpus. Round 2 moved the retained XSD bundle into
active XML ownership at `packages/domain/src/xml/xsd/bundle/` and removed the
remaining `packages/domain/src/sgp-lifted/` tree.

| Retained path | Owner | Status | Deletion gate | Target |
| --- | --- | --- | --- | --- |
| `packages/domain/src/sgp-lifted/` | XML/event worker | Deleted. | Complete after `npm test`, `npm run test:integration`, and `npm run integration:localstack` pass with active XSD bindings. | Round 2 foundation. |
| `packages/domain/src/xml/xsd/bundle/` | XML/event worker plus eSocial regulatory owner | Active XSD bundle. | Replace only when the regulatory owner supplies a newer authoritative leiaute bundle and all metadata/tests are updated in the same change. | Before owner-authorized real connectivity. |

No active file may import SGP runtime code, SGP SQL schemas, production data, or
`packages/domain/src/sgp-lifted/`.
