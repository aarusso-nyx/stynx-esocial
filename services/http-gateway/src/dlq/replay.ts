import type { AuditEventEnvelope } from '@esocial/contracts';
import {
  buildSubmissionPublishCommand,
  buildReplayRequestFromDlq,
  decideReplayClash,
} from '@esocial/domain';
import type {
  ReplayableDlqPayload,
  SubmissionPublisher,
  SubmissionRequestEnvelope,
} from '@esocial/domain';

export type HttpGatewayEvent = Readonly<{
  httpMethod?: string | undefined;
  path?: string | undefined;
  pathParameters?: Record<string, string | undefined> | undefined;
  queryStringParameters?: Record<string, string | undefined> | undefined;
  body?: string | null | undefined;
  requestContext?: {
    identity?: {
      userArn?: string | undefined;
      caller?: string | undefined;
    } | undefined;
    authorizer?: Record<string, unknown> | undefined;
  } | undefined;
}>;

export type DlqReplayPrincipal = Readonly<{
  actorId: string;
  tenantId?: string | undefined;
  roles: readonly string[];
  source: 'iam' | 'oidc';
}>;

export type HttpGatewayResponse = Readonly<{
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}>;

export type DlqReplayRepository = Readonly<{
  load(dlqItemId: string): Promise<ReplayableDlqPayload<SubmissionRequestEnvelope> | undefined>;
  completedIdempotencyKeys(input: Readonly<{
    tenantId: string;
    originalIdempotencyKey: string;
  }>): Promise<readonly string[]>;
  appendReplayAudit(input: Readonly<{
    dlqItemId: string;
    auditEvent: AuditEventEnvelope;
  }>): Promise<void>;
  markReplayRequested(input: Readonly<{
    dlqItemId: string;
    replayedBy: string;
    replayRequestId: string;
  }>): Promise<void>;
}>;

export type CreateDlqReplayHandlerOptions = Readonly<{
  repository: DlqReplayRepository;
  requestPublisher: SubmissionPublisher<SubmissionRequestEnvelope>;
  trustedIssuer?: string | undefined;
  now?: (() => Date) | undefined;
  uuid?: (() => string) | undefined;
}>;

export function createDlqReplayHandler(
  options: CreateDlqReplayHandlerOptions,
): (event: HttpGatewayEvent) => Promise<HttpGatewayResponse> {
  return async (event) => {
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'method_not_allowed' });
    }
    const principal = authorizeReplayPrincipal(event, {
      trustedIssuer: options.trustedIssuer ?? 'esocial-operator',
      now: options.now?.() ?? new Date(),
    });
    if (principal.status !== 'ok') {
      return json(principal.statusCode, { error: principal.error });
    }
    const dlqItemId = event.pathParameters?.['id'] ?? dlqIdFromPath(event.path);
    if (!dlqItemId) {
      return json(400, { error: 'dlq_id_required' });
    }

    const payload = parseReplayBody(event.body);
    const dlq = await options.repository.load(dlqItemId);
    if (!dlq) {
      return json(404, { error: 'dlq_item_not_found' });
    }

    const original = dlq.original_envelope;
    if (!original) {
      return json(409, { error: 'dlq_item_not_replayable' });
    }
    if (principal.principal.tenantId &&
        principal.principal.tenantId !== original.tenant_id) {
      await options.repository.appendReplayAudit({
        dlqItemId,
        auditEvent: deniedAudit(original, principal.principal, 'tenant_mismatch', options.now?.()),
      });
      return json(403, { error: 'tenant_forbidden' });
    }
    if (!hasReplayRole(principal.principal)) {
      await options.repository.appendReplayAudit({
        dlqItemId,
        auditEvent: deniedAudit(original, principal.principal, 'role_lacks_replay', options.now?.()),
      });
      return json(403, { error: 'replay_permission_required' });
    }
    if (forceReplay(event) && !isReplayAdmin(principal.principal)) {
      await options.repository.appendReplayAudit({
        dlqItemId,
        auditEvent: deniedAudit(original, principal.principal, 'force_requires_admin', options.now?.()),
      });
      return json(409, { error: 'force_replay_requires_admin' });
    }

    const clash = decideReplayClash({
      originalIdempotencyKey: original['idempotency-key'],
      completedIdempotencyKeys: await options.repository.completedIdempotencyKeys({
        tenantId: original.tenant_id,
        originalIdempotencyKey: original['idempotency-key'],
      }),
      force: forceReplay(event),
    });
    if (clash.action === 'refuse') {
      return json(409, {
        error: 'idempotency_key_completed',
        reason: clash.reason,
        idempotencyKey: clash.completedIdempotencyKey,
      });
    }

    const replay = buildReplayRequestFromDlq({
      dlq,
      replayedBy: principal.principal.actorId,
      replayReason: payload.reason,
      now: options.now?.(),
      uuid: options.uuid,
    });
    await options.repository.appendReplayAudit({
      dlqItemId,
      auditEvent: replay.auditEvent,
    });
    await options.requestPublisher.publish({
      ...buildSubmissionPublishCommand(
        'retry',
        replay.request,
        `${replay.request['request-id']}:dlq-replay`,
      ),
      envelope: replay.request,
    });
    await options.repository.markReplayRequested({
      dlqItemId,
      replayedBy: principal.principal.actorId,
      replayRequestId: replay.request['request-id'],
    });

    return json(202, {
      status: 'replay_requested',
      dlqItemId,
      requestId: replay.request['request-id'],
      correlationId: replay.request['correlation-id'],
      idempotencyKey: replay.request['idempotency-key'],
      clashRule: clash.reason,
    });
  };
}

function parseReplayBody(body: string | null | undefined): { reason: string } {
  if (!body) return { reason: 'operator replay requested' };
  const candidate = JSON.parse(body) as { reason?: unknown };
  return {
    reason: typeof candidate.reason === 'string' && candidate.reason.trim().length > 0
      ? candidate.reason
      : 'operator replay requested',
  };
}

function forceReplay(event: HttpGatewayEvent): boolean {
  return event.queryStringParameters?.['force'] === 'true';
}

function authorizeReplayPrincipal(
  event: HttpGatewayEvent,
  options: Readonly<{
    trustedIssuer: string;
    now: Date;
  }>,
): Readonly<
  | {
      status: 'ok';
      principal: DlqReplayPrincipal;
    }
  | {
      status: 'error';
      statusCode: 401 | 403;
      error: string;
    }
> {
  const iamActor = event.requestContext?.identity?.userArn ??
    event.requestContext?.identity?.caller;
  if (iamActor) {
    return {
      status: 'ok',
      principal: {
        actorId: iamActor,
        roles: ['admin'],
        source: 'iam',
      },
    };
  }

  const authorizer = event.requestContext?.authorizer;
  if (!authorizer) {
    return {
      status: 'error',
      statusCode: 403,
      error: 'iam_sigv4_required',
    };
  }
  const malformed = {
    status: 'error',
    statusCode: 401,
    error: 'invalid_authorizer_token',
  } as const;
  const issuer = stringClaim(authorizer, 'iss');
  if (!issuer || issuer !== options.trustedIssuer) {
    return {
      ...malformed,
      error: issuer ? 'wrong_token_issuer' : malformed.error,
    };
  }
  const expiresAt = numberClaim(authorizer, 'exp');
  if (expiresAt !== undefined &&
      expiresAt * 1000 <= options.now.getTime()) {
    return {
      status: 'error',
      statusCode: 401,
      error: 'token_expired',
    };
  }
  const actorId = stringClaim(authorizer, 'sub') ?? stringClaim(authorizer, 'principalId');
  if (!actorId) return malformed;
  return {
    status: 'ok',
    principal: {
      actorId,
      tenantId: stringClaim(authorizer, 'tenant_id') ?? stringClaim(authorizer, 'tenantId'),
      roles: rolesClaim(authorizer),
      source: 'oidc',
    },
  };
}

function hasReplayRole(principal: DlqReplayPrincipal): boolean {
  return isReplayAdmin(principal) || principal.roles.includes('replay');
}

function isReplayAdmin(principal: DlqReplayPrincipal): boolean {
  return principal.roles.includes('admin') || principal.roles.includes('dlq:admin');
}

function deniedAudit(
  original: SubmissionRequestEnvelope,
  principal: DlqReplayPrincipal,
  reason: string,
  now: Date | undefined,
): AuditEventEnvelope {
  const occurredAt = (now ?? new Date()).toISOString();
  return {
    version: original.version,
    family: 'audit',
    'request-id': `${original['request-id']}:auth-denied`,
    'correlation-id': original['correlation-id'],
    'idempotency-key': `${original['idempotency-key']}:auth-denied:${reason}`,
    created_at: occurredAt,
    tenant_id: original.tenant_id,
    environment: original.environment,
    event_class: original.event_class,
    source: original.source,
    actor_id: principal.actorId,
    action: 'auth.denied',
    status: 'failed',
    target: {
      type: 'esocial.dlq',
      id: original['request-id'],
    },
    before: {
      authorization_source: principal.source,
      roles: principal.roles,
    },
    after: {
      denial_reason: reason,
    },
    errors: [
      {
        category: 'authentication',
        code: 'DLQ_REPLAY_AUTH_DENIED',
        message: reason,
      },
    ],
    occurred_at: occurredAt,
  };
}

function stringClaim(
  authorizer: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = authorizer[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function numberClaim(
  authorizer: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = authorizer[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function rolesClaim(authorizer: Record<string, unknown>): readonly string[] {
  const raw = authorizer['roles'] ?? authorizer['scope'] ?? authorizer['scp'];
  if (Array.isArray(raw)) {
    return raw.filter((role): role is string => typeof role === 'string');
  }
  if (typeof raw === 'string') {
    return raw.split(/[,\s]+/u).filter(Boolean);
  }
  return [];
}

function dlqIdFromPath(path: string | undefined): string | undefined {
  return path?.match(/^\/dlq\/([^/]+)\/replay$/u)?.[1];
}

function json(statusCode: number, body: unknown): HttpGatewayResponse {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}
