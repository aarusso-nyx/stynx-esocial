# E2E Evidence

Command:

```bash
npm run test:e2e
```

Result: passed.

The test executes a deterministic local path:

1. Load S-1299 v1 request example.
2. Validate DTO and idempotency key.
3. Build XML.
4. Sign with generated local test key material.
5. Submit to the deterministic SOAP stub.
6. Parse the protocol response and assert no `gov.br` endpoint is used.
