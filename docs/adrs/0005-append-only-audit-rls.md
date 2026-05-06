# ADR 0005: Append-Only Audit With Worker RLS Bypass

## Status

Accepted

## Context

Audit and status history must support regulatory evidence and operator triage.

## Decision

Audit and status history are append-only. Tenant RLS applies by
`app.current_tenant_id`, while the `esocial_worker` role is the explicit
cross-tenant operational bypass.

## Consequences

Workers may insert and read operational evidence but update/delete attempts are
blocked by grants and triggers.
