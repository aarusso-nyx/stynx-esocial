import { createServer, Server } from 'node:http';

import { ConfigService } from '@nestjs/config';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { SiaficConnectorService } from '../../backend/src/integrations-worker/siafic/siafic-connector.service';
import { SiaficSyncService } from '../../backend/src/integrations-worker/siafic/siafic-sync.service';

const tenantId = '00000000-0000-0000-0000-00000000f525';
const payrollRunId = '00000000-0000-4000-8000-000000000525';
const batchId = '00000000-0000-4000-8000-000000002525';
const sourceLineId = '00000000-0000-4000-8000-000000001525';
const accountingAccountId = '00000000-0000-4000-8000-000000003525';

describe('SIAFIC payroll accounting sync (e2e)', () => {
  let server: Server;
  let endpoint: string;
  const receivedStages: string[] = [];

  beforeAll(async () => {
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          stage: string;
          items: Array<{ accountCode: string; amount: string }>;
        };
        receivedStages.push(body.stage);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            accepted: true,
            receiptNumber: `SIAFIC-${body.stage}-OK`,
            accountCode: body.items[0]?.accountCode,
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unexpected SIAFIC stub address');
    }
    endpoint = `http://127.0.0.1:${address.port}/sync`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  beforeEach(() => {
    receivedStages.length = 0;
  });

  it('loads payroll_accounting mappings and transmits empenho, liquidacao, and pagamento', async () => {
    const stageWrites: string[] = [];
    const db = {
      configured: true,
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            payroll_run_id: payrollRunId,
            competence: '2025-01-01',
            source_line_id: sourceLineId,
            accounting_account_id: accountingAccountId,
            account_code: '3.1.90.11.00',
            account_type: 'DESPESA_PESSOAL',
            earning_code: '001',
            earning_description: 'Vencimento base',
            amount: '1000.00',
          },
        ])
        .mockResolvedValueOnce([{ id: batchId }])
        .mockResolvedValueOnce([
          {
            id: batchId,
            payroll_run_id: payrollRunId,
            competence: '2025-01-01',
            ente_code: '12345678000199',
            status: 'ACCEPTED',
            circuit_state: 'CLOSED',
            attempts: '3',
            receipt_number: 'SIAFIC-PAGAMENTO-OK',
            last_error: null,
            stage_status: {
              EMPENHO: 'ACCEPTED',
              LIQUIDACAO: 'ACCEPTED',
              PAGAMENTO: 'ACCEPTED',
            },
            item_count: '1',
            total_amount: '1000.00',
            created_at: '2026-05-02T12:00:00.000Z',
            updated_at: '2026-05-02T12:00:00.000Z',
          },
        ]),
      transaction: jest.fn(async (callback) =>
        callback({
          query: jest.fn(async (sql: string, values: unknown[]) => {
            if (sql.includes('INSERT INTO fiscal.siafic_sync_item')) {
              stageWrites.push(String(values[1]));
            }
            return { rows: [] };
          }),
        }),
      ),
    };
    const service = new SiaficSyncService(
      db as never,
      new SiaficConnectorService(
        new ConfigService({
          SIAFIC_ENDPOINT_URL: endpoint,
          SIAFIC_MAX_ATTEMPTS: '1',
        }),
      ),
    );

    const result = await RequestContextStore.run(
      {
        tenantId,
        permissions: ['fiscal.dctfweb.write', 'folha.read'],
      },
      () =>
        service.syncPayrollRun({
          payrollRunId,
          enteCode: '12345678000199',
        }),
    );

    expect(String(db.query.mock.calls[0][0])).toContain(
      'JOIN payroll.accounting_account account',
    );
    expect(receivedStages).toEqual(['EMPENHO', 'LIQUIDACAO', 'PAGAMENTO']);
    expect(stageWrites).toEqual(['EMPENHO', 'LIQUIDACAO', 'PAGAMENTO']);
    expect(result.stageStatus).toEqual({
      EMPENHO: 'ACCEPTED',
      LIQUIDACAO: 'ACCEPTED',
      PAGAMENTO: 'ACCEPTED',
    });
  });
});
