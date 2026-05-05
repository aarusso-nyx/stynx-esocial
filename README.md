# stynx-esocial

Standalone stynx product for eSocial message validation, storage, queue
processing, and relay behavior.

Hard boundaries:

- The stynx-esocial database lives in its own AWS account and never exposes SQL
  access to SGP.
- SGP records its own legal/operator view in `public.esocial_spool`.
- SGP frontend calls only SGP `/api/v1/esocial/*` routes.
- Cross-boundary traffic is SQS, EventBridge, or SGP-backend-only HTTPS.

The initial R6 skeleton keeps the repository deployable without production AWS
credentials. Real dev/qa deployment requires account IDs, SGP backend role ARN,
and private package registry credentials.
