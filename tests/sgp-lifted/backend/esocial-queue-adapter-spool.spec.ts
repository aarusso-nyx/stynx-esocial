import { EsocialQueueAdapter } from '../../backend/src/esocial-worker/adapters/queue-adapter';

const tenantId = '00000000-0000-4000-8000-000000060500';
const batchId = '00000000-0000-4000-8000-000000060501';
const eventId = '00000000-0000-4000-8000-000000060502';
const messageId = '00000000-0000-4000-8000-000000060503';

describe('EsocialQueueAdapter spool integration', () => {
  it('records PENDING, SENT, and ACCEPTED spool transitions around queue submit', async () => {
    const spoolService = {
      recordPending: jest.fn().mockResolvedValue({ messageId }),
      recordSent: jest.fn().mockResolvedValue({ messageId, status: 'SENT' }),
      recordResponse: jest
        .fn()
        .mockResolvedValue({ messageId, status: 'ACCEPTED' }),
      recordError: jest.fn(),
    };
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const databaseService = {
      transaction: jest.fn((callback) => callback(client)),
    };
    const queue = {
      request: jest.fn(async (input) => {
        await input.onPublished?.({
          'request-id': 'req-1',
          'correlation-id': messageId,
          'idempotency-key': 'idem-1',
          'reply-to': 'sgp.adapter.esocial.response',
          'dead-letter-topic': 'sgp.adapter.esocial.dlq',
          'created-at': '2026-05-04T12:00:00.000Z',
          tenant_id: tenantId,
          kind: 'esocial',
          payload: input.payload,
          attempt: 1,
          'max-attempts': 3,
        });
        return {
          'request-id': 'req-1',
          'correlation-id': messageId,
          'created-at': '2026-05-04T12:00:01.000Z',
          tenant_id: tenantId,
          kind: 'esocial',
          status: 'OK',
          attempt: 1,
          payload: acceptedRelayPayload(),
        };
      }),
      close: jest.fn(),
    };
    const adapter = new EsocialQueueAdapter({
      databaseService: databaseService as never,
      queue: queue as never,
      spoolService: spoolService as never,
    });

    await expect(
      adapter.submitSignedEnvelope({
        tenantId,
        batchId,
        environment: 'QUALIFICATION',
        endpointUrl: 'mock://stynx-esocial',
        eventIds: [eventId],
        signedEnvelope: {
          tenantId,
          eventKind: 'S-1299',
          payloadXml: '<eSocial />',
          payloadSha256:
            '2d3cad9edc61723b2b6722d4e6aecc1f2ed5a0ef1114a5c9c9ab2a1fa6f2ef3f',
          pkcs7Sha256:
            '451b8de5e3db8ac4d42723254fe9545038a1e4e6bc2dcbce57c050ee2ed8bc92',
          signatureSha256:
            'ae6db8c834ef4ef34e72c9ecb15cbad6b62ac37ff3a527854c14469634090eb2',
          signedAt: '2026-05-04T12:00:00.000Z',
          signer: {
            subject: 'CN=Sandbox',
            issuer: 'CN=Sandbox',
            serialNumber: '01',
            notBefore: '2026-01-01T00:00:00.000Z',
            notAfter: '2027-01-01T00:00:00.000Z',
          },
        } as never,
        requestId: 'req-1',
        idempotencyKey: 'idem-1',
      }),
    ).resolves.toMatchObject({
      status: 'ACCEPTED',
      receiptNumber: '1.1.123',
    });

    expect(spoolService.recordPending).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        kind: 'submit',
        eventClass: 'S-1299',
        sourceRef: expect.objectContaining({ batchId, eventIds: [eventId] }),
      }),
    );
    expect(spoolService.recordSent).toHaveBeenCalledWith({
      tenantId,
      messageId,
      attempt: 1,
    });
    expect(spoolService.recordResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        messageId,
        status: 'ACCEPTED',
      }),
    );
    expect(spoolService.recordError).not.toHaveBeenCalled();
  });
});

function acceptedRelayPayload() {
  return {
    relay: 'esocial-relay',
    batchId,
    eventIds: [eventId],
    eventClass: 'S-1299',
    ack: {
      responseCode: '201',
      responseDescription: 'Lote recebido com sucesso',
      protocolNumber: '1.1.202605.123456789012345',
      receivedAt: '2026-05-04T12:00:01.000Z',
    },
    receipt: {
      responseCode: '201',
      responseDescription: 'Sucesso.',
      receiptNumber: '1.1.123',
      processedAt: '2026-05-04T12:00:02.000Z',
    },
    hashes: {
      requestSha256:
        '322d65ae0fef23c1e1112d6a8a0e45caacde4e85738caa1f9079f52f5fe4dd8c',
      payloadSha256:
        '2d3cad9edc61723b2b6722d4e6aecc1f2ed5a0ef1114a5c9c9ab2a1fa6f2ef3f',
      pkcs7Sha256:
        '451b8de5e3db8ac4d42723254fe9545038a1e4e6bc2dcbce57c050ee2ed8bc92',
    },
    xsd: {
      valid: true,
      eventKind: 'S-1299',
      xsdPath: 'evtFechaEvPer.xsd',
    },
    httpStatus: 200,
    soapRequest: '<soap:Envelope />',
    soapResponse: '<soap:Envelope />',
  };
}
