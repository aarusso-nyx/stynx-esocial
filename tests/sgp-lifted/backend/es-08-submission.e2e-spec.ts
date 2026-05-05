import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { createServer, Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';
import { CertificateStoreService } from '../../backend/src/esocial-worker/certificate-store/certificate-store.service';
import { IcpSignerService } from '../../backend/src/esocial-worker/signature/icp-signer.service';
import {
  createPkcs12Fixture,
  S1000_VALID_XML,
} from '../../backend/src/esocial-worker/testing/esocial-fixtures';
import { BatchBuilderService } from '../../backend/src/esocial-worker/submission/batch-builder.service';
import { CircuitBreakerService } from '../../backend/src/esocial-worker/submission/circuit-breaker.service';
import { RetryStrategyService } from '../../backend/src/esocial-worker/submission/retry-strategy.service';
import { SoapClientService } from '../../backend/src/esocial-worker/submission/soap-client.service';
import { SubmissionService } from '../../backend/src/esocial-worker/submission/submission.service';

const tenantId = '00000000-0000-0000-0000-000000003708';
const eventId = '00000000-0000-4000-8000-000000003709';
const certificateAlias = 'ES-08 E2E Certificate';

describe('ES-08 SOAP submission (e2e)', () => {
  let databaseService: DatabaseService;
  let submissionService: SubmissionService;
  let server: Server;
  let endpointUrl: string;
  let requestCount = 0;
  const receivedRequests: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for es-08-submission');
    }
    const stub = await startStubServer();
    server = stub.server;
    endpointUrl = stub.endpointUrl;

    const config = {
      get: (key: string) =>
        ({
          DATABASE_URL: process.env.DATABASE_URL,
          ESOCIAL_ENV: 'QUALIFICATION',
          ESOCIAL_ENDPOINT_ENVIO: endpointUrl,
          ESOCIAL_CIRCUIT_FAILURE_THRESHOLD: '3',
          ESOCIAL_CIRCUIT_COOLDOWN_MS: '60000',
        })[key],
    };
    databaseService = new DatabaseService(config as never);
    const signer = new IcpSignerService();
    const certificateStore = new CertificateStoreService(
      databaseService,
      config as never,
      signer,
    );
    submissionService = new SubmissionService(
      databaseService,
      certificateStore,
      new BatchBuilderService(databaseService, config as never),
      new SoapClientService(signer),
      new RetryStrategyService(),
      new CircuitBreakerService(databaseService, config as never),
    );
    await seed(databaseService, certificateStore, signer);
  });

  afterAll(async () => {
    await RequestContextStore.run(
      { tenantId, bypassRls: true, bypassRlsReason: 'esocial-worker' },
      async () => {
        await databaseService?.query(
          `
          DELETE FROM esocial.endpoint_circuit_state
          WHERE endpoint_url = $1
          `,
          [endpointUrl],
        );
      },
    );
    await cleanup(databaseService);
    await databaseService?.onModuleDestroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('retries a transient SOAP fault and then accepts the same batch through the committed WSDL stub', async () => {
    const first = await submissionService.submitPendingBatch(50);
    expect(first).toMatchObject({
      eventCount: 1,
      status: 'RETRY',
      endpointUrl,
    });

    await runAsTenant(async () => {
      const batches = await submissionService.listBatches();
      expect(batches[0]).toMatchObject({
        status: 'RETRY',
        attempts: 1,
        eventIds: [eventId],
      });
      await submissionService.forceRetry(batches[0].batchId);
    });

    const second = await submissionService.submitPendingBatch(50);
    expect(second).toMatchObject({
      eventCount: 1,
      status: 'ACCEPTED',
      attempts: 2,
    });

    await runAsTenant(async () => {
      const batches = await submissionService.listBatches();
      expect(batches[0]).toMatchObject({
        status: 'ACCEPTED',
        attempts: 2,
        httpStatus: 200,
      });
      const circuits = await submissionService.listCircuitStates();
      expect(
        circuits.find((circuit) => circuit.endpointUrl === endpointUrl),
      ).toMatchObject({
        state: 'CLOSED',
        failureCount: 0,
      });
    });

    expect(requestCount).toBe(2);
    expect(
      receivedRequests.every((request) => request.includes('wsse:Security')),
    ).toBe(true);
    expect(
      receivedRequests.every((request) =>
        request.includes('EnviarLoteEventos'),
      ),
    ).toBe(true);
  });

  async function startStubServer(): Promise<{
    server: Server;
    endpointUrl: string;
  }> {
    const wsdl = readFileSync(
      join(
        process.cwd(),
        'src/esocial-worker/submission/__fixtures__/ws-enviar-lote-eventos.wsdl',
      ),
      'utf8',
    );
    const stubServer = createServer((request, response) => {
      if (request.method === 'GET') {
        response.writeHead(200, { 'content-type': 'text/xml' });
        response.end(wsdl);
        return;
      }

      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        requestCount += 1;
        receivedRequests.push(Buffer.concat(chunks).toString('utf8'));
        if (requestCount === 1) {
          response.writeHead(500, { 'content-type': 'text/xml' });
          response.end(faultResponse());
          return;
        }
        response.writeHead(200, { 'content-type': 'text/xml' });
        response.end(successResponse());
      });
    });
    await new Promise<void>((resolve) =>
      stubServer.listen(0, '127.0.0.1', resolve),
    );
    const address = stubServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to start eSocial WSDL stub server');
    }
    return {
      server: stubServer,
      endpointUrl: `http://127.0.0.1:${address.port}/WsEnviarLoteEventos.svc`,
    };
  }
});

async function seed(
  database: DatabaseService,
  certificateStore: CertificateStoreService,
  signer: IcpSignerService,
): Promise<void> {
  const fixture = createPkcs12Fixture(new Date('2030-01-01T00:00:00.000Z'));
  await database.query(
    `
    INSERT INTO public.tenant (id, slug, code, name, status)
    VALUES ($1::uuid, 'es08-e2e', 'ES08', 'ES-08 E2E', 'ACTIVE'::public."RecordStatus")
    ON CONFLICT (id) DO NOTHING
    `,
    [tenantId],
  );
  await runAsTenant(async () => {
    await certificateStore.upload({
      alias: certificateAlias,
      kind: 'A1',
      pkcs12Base64: fixture.pkcs12.toString('base64'),
      password: fixture.password,
    });
  });
  const signed = signer.sign({
    xml: S1000_VALID_XML,
    pkcs12: fixture.pkcs12,
    password: fixture.password,
  });
  await runAsTenant(async () => {
    await database.query(
      `
      DELETE FROM esocial.submission_batch
      WHERE tenant_id = $1::uuid
      `,
      [tenantId],
    );
    await database.query(
      `
      DELETE FROM public.esocial_event
      WHERE id = $1::uuid
      `,
      [eventId],
    );
    await database.query(
      `
      INSERT INTO public.esocial_event (
        id,
        tenant_id,
        event_type,
        event_kind,
        reference,
        competence,
        payload,
        xml_payload,
        xml_signed,
        xml_hash,
        schema_version,
        status,
        generated_at,
        created_at
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        'S-1000',
        'S-1000'::esocial.s1xxx_event_kind,
        'IDES08E2E0000000000000000000000001',
        '2026-05',
        '{}'::jsonb,
        $3,
        convert_to($4, 'UTF8'),
        repeat('b', 64),
        'S-1.3',
        'PENDENTE'::public."ESocialEventStatus",
        now(),
        TIMESTAMPTZ '1970-01-01 00:00:00+00'
      )
      `,
      [eventId, tenantId, S1000_VALID_XML, signed.xml],
    );
  });
}

async function cleanup(database: DatabaseService): Promise<void> {
  if (!database) return;
  await RequestContextStore.run(
    { bypassRls: true, bypassRlsReason: 'esocial-worker' },
    async () => {
      await database.query(
        `
        DELETE FROM esocial.submission_batch
        WHERE tenant_id = $1::uuid
        `,
        [tenantId],
      );
      await database.query(
        `
        DELETE FROM esocial.tenant_certificate
        WHERE tenant_id = $1::uuid
          AND alias = $2
        `,
        [tenantId, certificateAlias],
      );
      await database.query(
        `
        DELETE FROM public.esocial_event
        WHERE id = $1::uuid
        `,
        [eventId],
      );
    },
  );
}

async function runAsTenant<T>(fn: () => Promise<T>): Promise<T> {
  return RequestContextStore.run(
    {
      tenantId,
      permissions: [
        'esocial.event.read',
        'esocial.event.write',
        'esocial.certificate.read',
        'esocial.certificate.write',
        'esocial.submission.read',
        'esocial.submission.retry',
      ],
    },
    fn,
  );
}

function faultResponse(): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
    '<soap:Body>',
    '<soap:Fault>',
    '<faultcode>soap:Server</faultcode>',
    '<faultstring>Falha temporaria de processamento no eSocial</faultstring>',
    '</soap:Fault>',
    '</soap:Body>',
    '</soap:Envelope>',
  ].join('');
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
    '<dadosRecepcaoLote><protocoloEnvio>1.1.202605.000000000000001</protocoloEnvio></dadosRecepcaoLote>',
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
