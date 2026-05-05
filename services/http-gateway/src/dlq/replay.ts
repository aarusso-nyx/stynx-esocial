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
    const replayedBy = sigv4Actor(event);
    if (!replayedBy) {
      return json(403, { error: 'iam_sigv4_required' });
    }
    const dlqItemId = event.pathParameters?.id ?? dlqIdFromPath(event.path);
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
      replayedBy,
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
      replayedBy,
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
  return event.queryStringParameters?.force === 'true';
}

function sigv4Actor(event: HttpGatewayEvent): string | undefined {
  return event.requestContext?.identity?.userArn ??
    event.requestContext?.identity?.caller ??
    (event.requestContext?.authorizer ? 'iam:authorizer' : undefined);
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
