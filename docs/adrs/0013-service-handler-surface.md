# ADR 0013: Service Handler Surface

## Status

Accepted

## Context

Family-named services existed as placeholders but did not own distinct queues,
auth profiles, retry policies, or operational runbooks.

## Decision

The active service surface is `submission`, `retorno`, `certificado`,
`http-gateway`, and `shared`. Family routing stays inside `submission`.

## Consequences

The previous `tabelas`, `trabalhador`, `folha`, `fechamento`, and `exclusao`
service concepts remain contract classifications, not Lambda services.
