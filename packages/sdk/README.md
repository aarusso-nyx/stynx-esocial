# @esocial/sdk

TypeScript SDK for SGP-facing eSocial DTO submission.

The SDK builds request envelopes and idempotency keys locally, then sends the
envelope through a pluggable transport. It does not build XML, sign payloads, or
call official eSocial endpoints; those remain inside the standalone eSocial
service.
