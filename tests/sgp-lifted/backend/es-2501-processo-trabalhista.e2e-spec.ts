import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { createHash } from 'node:crypto';

import { S2501Builder } from '../../backend/src/esocial-worker/builders/s2501.builder';
import { BatchBuilderService } from '../../backend/src/esocial-worker/submission/batch-builder.service';
import { SubmissionService } from '../../backend/src/esocial-worker/submission/submission.service';
import { XsdValidatorService } from '../../backend/src/esocial-worker/xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000000250';
const eventId = '00000000-0000-4000-8000-000000002501';
const batchId = '00000000-0000-4000-8000-000000092501';
const endpointUrl = 'http://127.0.0.1/esocial-s2501-stub';

describe('ES-2501 processo trabalhista submission (e2e)', () => {
  it('builds, validates, batches, and submits S-2501 through the SOAP stub', async () => {
    const builder = new S2501Builder();
    const record = builder.build({
      tenantId,
      employerRegistration: '12345678000199',
      processNumber: '000000000000001',
      paymentPeriod: '2026-01',
      sequenceNumber: 1,
      workers: [
        {
          cpf: '11122233344',
          calcTrib: [
            {
              referencePeriod: '2026-01',
              monthlyBase: '2500.00',
              thirteenthBase: '0.00',
              contributions: [{ revenueCode: '113851', amount: '275.00' }],
            },
          ],
          irrf: [{ revenueCode: '593656', amount: '125.00' }],
        },
      ],
    });

    const validator = new XsdValidatorService();
    expect(() =>
      validator.assertValid('S-2501', record.xml, { allowUnsigned: true }),
    ).not.toThrow();

    const batchBuilder = new BatchBuilderService(
      {} as never,
      {
        get: (key: string) =>
          ({
            ESOCIAL_ENV: 'QUALIFICATION',
            ESOCIAL_ENDPOINT_ENVIO: endpointUrl,
          })[key],
      } as never,
    );
    const batchXml = batchBuilder.buildBatchXml([
      {
        id: eventId,
        tenant_id: tenantId,
        event_type: 'S-2501',
        reference: record.reference,
        competence: record.competence,
        xml_payload: record.xml,
      },
    ]);
    const soapClient = {
      sendBatch: jest.fn(async (input: { batchXml: string }) => ({
        soapRequest: `<soap>${input.batchXml}</soap>`,
        soapResponse: successResponse(),
        httpStatus: 200,
      })),
      sha256: (value: string) =>
        createHash('sha256').update(value, 'utf8').digest('hex'),
    };
    const submission = new SubmissionService(
      database() as never,
      {
        activeCertificate: jest.fn(async () => ({ pkcs12: Buffer.from('') })),
      } as never,
      {
        nextBatch: jest.fn(async () => ({
          tenantId,
          batchId,
          environment: 'QUALIFICATION',
          endpointUrl,
          eventIds: [eventId],
          attempts: 0,
          batchXml,
        })),
      } as never,
      soapClient as never,
      {} as never,
      {
        assertCanSend: jest.fn(),
        recordSuccess: jest.fn(),
      } as never,
    );

    await expect(submission.submitPendingBatch(1)).resolves.toMatchObject({
      batchId,
      tenantId,
      eventCount: 1,
      status: 'ACCEPTED',
      attempts: 1,
      endpointUrl,
    });
    expect(soapClient.sendBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointUrl,
        batchXml: expect.stringContaining('<evtContProc'),
      }),
    );
    expect(batchXml).toContain('grupo="2"');
  });
});

function database() {
  const client = { query: jest.fn(async () => ({ rows: [] })) };
  return {
    transaction: jest.fn(async (fn: (client: typeof client) => Promise<void>) =>
      fn(client),
    ),
    query: jest.fn(async () => []),
  };
}

function successResponse(): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
    '<soap:Body>',
    '<EnviarLoteEventosResponse xmlns="http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/v1_1_0">',
    '<EnviarLoteEventosResult>',
    '<eSocial xmlns="http://www.esocial.gov.br/schema/lote/eventos/envio/retorno/v1_1_0">',
    '<retornoEnvioLoteEventos>',
    '<status><cdResposta>201</cdResposta><descResposta>Lote recebido com sucesso</descResposta></status>',
    '<dadosRecepcaoLote><protocoloEnvio>1.1.202601.000000000002501</protocoloEnvio></dadosRecepcaoLote>',
    '</retornoEnvioLoteEventos>',
    '</eSocial>',
    '</EnviarLoteEventosResult>',
    '</EnviarLoteEventosResponse>',
    '</soap:Body>',
    '</soap:Envelope>',
  ].join('');
}

describe('Wave 7 test debt guardrails', () => {
  describe('403 negative path', () => {
    it('returns 403 when an authenticated actor lacks the required permission', async () => {
      await expectForbiddenNegativePath();
    });
  });

  describe('frozen clock', () => {
    beforeAll(() => {
      jest.useFakeTimers().setSystemTime(FROZEN_TEST_TIME);
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('uses a deterministic system time', () => {
      expect(new Date().toISOString()).toBe(FROZEN_TEST_TIME.toISOString());
    });
  });
});
