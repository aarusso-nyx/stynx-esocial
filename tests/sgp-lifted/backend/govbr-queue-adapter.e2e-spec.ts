import {
  InMemoryQueueTransport,
  type QueueAdapterDeadLetterEnvelope,
  type QueueAdapterRequestEnvelope,
} from '../../backend/src/common/adapters';
import {
  GOVBR_RELAY_QUEUE_KIND,
  GovBrRelayMockResponder,
  type GovBrRelayRequestPayload,
} from '../../backend/src/external/mocks/govbr-relay';
import { GovBrQueueAdapter } from '../../backend/src/auth/govbr/adapters/queue-adapter';

const tenantId = '00000000-0000-0000-0000-000000054100';
const relayNow = () => new Date('2026-05-04T14:10:00.000Z');

describe('R5-41 GovBR sign mock relay queue adapter (e2e)', () => {
  let transport: InMemoryQueueTransport;
  let relay: GovBrRelayMockResponder;
  let adapter: GovBrQueueAdapter;

  beforeEach(() => {
    transport = new InMemoryQueueTransport();
    relay = new GovBrRelayMockResponder({
      transport,
      now: relayNow,
    });
    adapter = new GovBrQueueAdapter({
      transport,
      retryDelayMs: () => 0,
      responseTimeoutMs: 1_000,
      now: relayNow,
      idFactory: deterministicIdFactory(),
    });
  });

  afterEach(() => {
    adapter.close();
    relay.close();
  });

  it('posts create and approved completion requests through the GovBR queue and returns deterministic signature evidence', async () => {
    const payload = {
      section: 'contato',
      payload: { email: 'novo@example.test' },
      previousPayload: { email: 'antigo@example.test' },
    };

    const created = await adapter.createRequest(
      actor(),
      {
        resourceType: 'hr.cadastral_change_request',
        resourceId: 'draft-contato',
        payload,
        returnUrl: '/govbr-sign/callback',
      },
      {
        requestId: 'req-r5-41-create',
        correlationId: 'corr-r5-41-govbr',
      },
    );
    const callbackUrl = new URL(`http://localhost${created.redirectUrl}`);
    const state = requiredParam(callbackUrl, 'state');
    const challenge = requiredParam(callbackUrl, 'challenge');

    expect(created.queueResponse.status).toBe('OK');
    expect(created.ack).toMatchObject({
      status: 'SANDBOX_ACK',
      receivedAt: '2026-05-04T14:10:00.000Z',
    });
    expect(created.ack.protocol).toMatch(/^GOVBR-SIGN-PENDING-/);
    expect(created.request).toMatchObject({
      state,
      provider: 'govbr-local-sandbox',
      status: 'PENDING',
      resourceType: 'hr.cadastral_change_request',
      resourceId: 'draft-contato',
      evidenceUri: null,
      signature: null,
    });

    const completed = await adapter.completeRequest({
      state,
      decision: 'APPROVED',
      challenge,
      requestId: 'req-r5-41-complete',
      correlationId: 'corr-r5-41-govbr',
    });
    const signature = completed.request.signature;
    if (!signature) {
      throw new Error('expected approved GovBR relay response to be signed');
    }

    expect(completed.queueResponse.status).toBe('OK');
    expect(completed.ack.protocol).toMatch(/^GOVBR-SIGN-SIGNED-/);
    expect(completed.redirectUrl).toBe(
      `/govbr-sign/callback?status=signed&signatureRequestId=${completed.request.id}`,
    );
    expect(completed.request).toMatchObject({
      id: created.request.id,
      state,
      status: 'SIGNED',
      evidenceUri: `govbr-sandbox://advanced-signatures/${signature.id}`,
      signature: {
        provider: 'govbr-local-sandbox',
        legalBasis: 'Lei 14.063/2020 art. 4 II',
        level: 'ADVANCED',
        evidence: {
          uniqueAssociation: true,
          signerControlHighConfidence: true,
          laterModificationDetectable: true,
        },
        signedAt: '2026-05-04T14:10:00.000Z',
      },
    });
    expect(adapter.verifyEnvelope(payload, signature)).toBe(true);
    expect(
      adapter.verifyEnvelope(
        { ...payload, payload: { email: 'fraude@example.test' } },
        signature,
      ),
    ).toBe(false);

    const requests = transport.history<
      QueueAdapterRequestEnvelope<
        typeof GOVBR_RELAY_QUEUE_KIND,
        GovBrRelayRequestPayload
      >
    >('sgp.adapter.govbr-sign.request');
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      'request-id': 'req-r5-41-create',
      'correlation-id': 'corr-r5-41-govbr',
      tenant_id: tenantId,
      kind: GOVBR_RELAY_QUEUE_KIND,
      payload: {
        action: 'CREATE_SIGNATURE_REQUEST',
        resourceType: 'hr.cadastral_change_request',
      },
    });
    expect(requests[1]).toMatchObject({
      'request-id': 'req-r5-41-complete',
      'correlation-id': 'corr-r5-41-govbr',
      tenant_id: tenantId,
      kind: GOVBR_RELAY_QUEUE_KIND,
      payload: {
        action: 'COMPLETE_SIGNATURE_REQUEST',
        state,
        decision: 'APPROVED',
      },
    });
  });

  it('returns a deterministic denied response without signature evidence', async () => {
    const created = await adapter.createRequest(actor(), {
      resourceType: 'hr.cadastral_change_request',
      resourceId: 'draft-endereco',
      payload: { section: 'endereco' },
    });
    const callbackUrl = new URL(`http://localhost${created.redirectUrl}`);

    const denied = await adapter.completeRequest({
      state: requiredParam(callbackUrl, 'state'),
      decision: 'DENIED',
      requestId: 'req-r5-41-denied',
      correlationId: 'corr-r5-41-denied',
    });

    expect(denied.ack.protocol).toMatch(/^GOVBR-SIGN-DENIED-/);
    expect(denied.request).toMatchObject({
      id: created.request.id,
      status: 'DENIED',
      evidenceUri: null,
      signature: null,
      decidedAt: '2026-05-04T14:10:00.000Z',
    });
    expect(denied.redirectUrl).toBe(
      `/govbr-sign/callback?status=denied&signatureRequestId=${created.request.id}`,
    );
  });

  it('dead-letters unknown signature states through the R4-95 DLQ path', async () => {
    await expect(
      adapter.completeRequest({
        tenantId,
        state: '00000000-0000-4000-8000-000000054199',
        decision: 'APPROVED',
        requestId: 'req-r5-41-unknown-state',
        correlationId: 'corr-r5-41-unknown-state',
        maxAttempts: 1,
      }),
    ).rejects.toThrow('Unknown gov.br signature state');

    const deadLetters = transport.history<
      QueueAdapterDeadLetterEnvelope<typeof GOVBR_RELAY_QUEUE_KIND>
    >('sgp.adapter.govbr-sign.dlq');
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0]).toMatchObject({
      reason: 'Unknown gov.br signature state.',
      request: {
        'request-id': 'req-r5-41-unknown-state',
        kind: GOVBR_RELAY_QUEUE_KIND,
        tenant_id: tenantId,
      },
      response: {
        status: 'DEAD_LETTER',
        error: {
          code: 'GOVBR_RELAY_UNKNOWN_STATE',
          kind: 'DEFINITIVE',
        },
      },
    });
  });
});

function actor() {
  return {
    sub: 'govbr-sub-r5-41',
    username: 'servidor.portal',
    tenantId,
    groups: [],
    permissions: ['portal.profile.write'],
    claims: { cpf: '00011122233', email: 'servidor@example.test' },
  };
}

function requiredParam(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (!value) {
    throw new Error(`missing URL parameter ${name}`);
  }
  return value;
}

function deterministicIdFactory(): () => string {
  let next = 1;
  return () => {
    const suffix = String(next).padStart(12, '0');
    next += 1;
    return `00000000-0000-4000-8000-${suffix}`;
  };
}
