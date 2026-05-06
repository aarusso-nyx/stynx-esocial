# Local Dev Evidence

Round 4 added:

- `docker-compose.dev.yml`
- `npm run dev:up`
- `npm run dev:down`
- `npm run dev:reset`
- `npm run dev:logs`
- `npm run dev:family -- S-XXXX`

The stack uses local Postgres, LocalStack, and deterministic SOAP fixtures only.
No real certificate or endpoint authorization is required.

Verification performed locally:

- `npm run test:e2e` passed against the deterministic in-process pipeline.
- `npm run dev:family -- S-1099` is available as the scaffold command. It was
  not left executed in the tree to avoid committing fake family source files.
