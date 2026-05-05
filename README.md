# stynx-esocial

Standalone stynx product for eSocial message validation, storage, queue
processing, and relay behavior.

Hard boundaries:

- The stynx-esocial database lives in its own AWS account and never exposes SQL
  access to SGP.
- SGP records its own legal/operator view in `public.esocial_events`.
- SGP triggers eSocial internally from backend domain actions; it does not expose
  browser-facing eSocial routes.
- Cross-boundary traffic is SQS, EventBridge, or SGP-backend-only HTTPS.

Documentation starts in [`docs/README.md`](docs/README.md). The lifted event
inventory is in [`docs/events.md`](docs/events.md), and copied XML examples live
under [`docs/templates/golden/`](docs/templates/golden/).

The initial R6 skeleton keeps the repository deployable without production AWS
credentials. Real dev/qa deployment requires account IDs, SGP backend role ARN,
and private package registry credentials.
