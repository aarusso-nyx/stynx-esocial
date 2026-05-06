# Network Policy Runtime Evidence

Generated for Round 6 F5.2 with `tests/integration/network-policy.test.mjs`.

## Denied Egress

- Timestamp: `2026-05-06T12:00:00.000Z`
- Stage: `qualification`
- Denied host: `blocked-soap.example.test`
- Error code: `SOAP_ENDPOINT_NOT_ALLOWLISTED`
- Request hash: `sha256:ad04dc7486e5a8ea1d38cc405d81366cc41cef49e42acb6a1936399d77c638f5`
- Audit kind represented by the evidence fixture: `network.denied`

The captured evidence stores only hashes and policy metadata. The signed XML,
SOAP envelope, CPF/CNPJ values, and payload body are not persisted in the
network-denial artifact.

## Allowed Control

The same `SoapClientTransport` instance succeeds against
`allowed-soap.example.test` when the host is present in the qualification
allowlist. The integration test asserts the successful response protocol and
the denied-host failure in the same run.
