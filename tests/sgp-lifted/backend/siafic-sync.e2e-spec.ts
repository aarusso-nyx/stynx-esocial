import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { SiaficConnectorService } from '../../backend/src/integrations-worker/siafic/siafic-connector.service';
import { SiaficSyncService } from '../../backend/src/integrations-worker/siafic/siafic-sync.service';
import type {
  SiaficStagePayload,
  SiaficSyncBatchDto,
  SiaficSyncStage,
  SiaficSyncStatus,
  SyncSiaficPayrollRunDto,
} from '../../backend/src/integrations-worker/siafic/siafic.dto';

const goldenDir = join(__dirname, 'golden', 'siafic-v01');
const input = readJson<SiaficGoldenInput>(join(goldenDir, 'input.json'));
const expected = readJson<SiaficGoldenExpected>(
  join(goldenDir, 'expected.json'),
);

describe('R4-14 SIAFIC payroll sync conformance golden (e2e)', () => {
  let server: Server;
  let endpoint: string;
  let receivedRequests: ReceivedSiaficRequest[];

  beforeAll(async () => {
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const payload = JSON.parse(
          Buffer.concat(chunks).toString('utf8'),
        ) as SiaficStagePayload;
        receivedRequests.push({
          headers: {
            enteCode: headerText(request.headers['x-sgp-ente-code']),
            stage: headerText(request.headers['x-sgp-siafic-stage']),
            idempotencyKey: headerText(request.headers['x-idempotency-key']),
          },
          payload,
        });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            status: 'ACEITO',
            protocolo: `SIAFIC-${payload.stage}-OK`,
            stage: payload.stage,
            itemCount: payload.items.length,
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unexpected SIAFIC golden stub address');
    }
    endpoint = `http://127.0.0.1:${address.port}/sync`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  beforeEach(() => {
    receivedRequests = [];
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('traverses payroll accounting rows into the neutral SIAFIC JSON contract', async () => {
    const itemWrites: SiaficItemWrite[] = [];
    const batchStageUpdates: SiaficBatchStageUpdate[] = [];
    let batchInsert: SiaficBatchInsert | null = null;
    const database = {
      configured: true,
      query: jest.fn(async (sql: string, values: readonly unknown[] = []) => {
        if (sql.includes('FROM payroll.payroll_run run')) {
          expect(values).toEqual([input.syncRequest.payrollRunId]);
          expect(sql).toContain('payroll.v_payroll_run_line_active');
          expect(sql).toContain('JOIN payroll.accounting_account account');
          return input.accountingRows;
        }

        if (sql.includes('INSERT INTO fiscal.siafic_sync_batch')) {
          batchInsert = batchInsertFrom(values);
          return [{ id: input.batch.id }];
        }

        if (sql.includes('FROM fiscal.siafic_sync_batch batch')) {
          expect(values).toEqual([input.batch.id]);
          return [batchRowFrom(expected.batchResult)];
        }

        return [];
      }),
      transaction: jest.fn(
        async (callback: (client: TestDbClient) => Promise<void>) =>
          callback({
            query: async (sql: string, values: readonly unknown[] = []) => {
              if (sql.includes('INSERT INTO fiscal.siafic_sync_item')) {
                itemWrites.push(itemWriteFrom(values));
              }

              if (sql.includes('UPDATE fiscal.siafic_sync_batch')) {
                batchStageUpdates.push(batchStageUpdateFrom(values));
              }

              return { rows: [] };
            },
          }),
      ),
    };
    const service = new SiaficSyncService(
      database as never,
      new SiaficConnectorService(
        new ConfigService({
          SIAFIC_ENDPOINT_URL: endpoint,
          SIAFIC_MAX_ATTEMPTS: '1',
        }),
      ),
    );

    const result = await RequestContextStore.run(
      {
        tenantId: input.tenantId,
        permissions: input.permissions,
        bypassRls: true,
        bypassRlsReason: 'integrations-worker',
      },
      () => service.syncPayrollRun(input.syncRequest),
    );

    expect(expected.officialConformance).toBe(false);
    expect(expected.productionHomologation).toBe('OUT_OF_SCOPE');
    expect(expected.layoutSelection).toBe('DEFERRED_OWNER_DECISION');
    expect(batchInsert).toEqual(expected.batchInsert);
    expect(receivedRequests.map((entry) => entry.headers)).toEqual(
      expected.requestHeaders,
    );
    expect(receivedRequests.map((entry) => entry.payload)).toEqual(
      expected.stagePayloads,
    );
    expect(itemWrites).toEqual(expected.itemWrites);
    expect(batchStageUpdates).toEqual(expected.batchStageUpdates);
    expect(result).toEqual(expected.batchResult);
    expect(database.transaction).toHaveBeenCalledTimes(3);
  });
});

interface SiaficGoldenInput {
  caseId: string;
  tenantId: string;
  permissions: string[];
  legalAnchor: {
    sourceStatus: string;
    regulatoryBasis: string[];
    referencePath: string;
    layoutSelection: string;
  };
  syncRequest: SyncSiaficPayrollRunDto;
  batch: {
    id: string;
    createdAt: string;
    updatedAt: string;
  };
  accountingRows: PayrollAccountingGoldenRow[];
}

interface PayrollAccountingGoldenRow {
  payroll_run_id: string;
  competence: string;
  source_line_id: string;
  accounting_account_id: string;
  account_code: string;
  account_type: string;
  earning_code: string;
  earning_description: string;
  amount: string;
}

interface SiaficGoldenExpected {
  schemaVersion: 'siafic-v01';
  sourceStatus: 'SGP_NEUTRAL_JSON_CONTRACT';
  officialConformance: false;
  productionHomologation: 'OUT_OF_SCOPE';
  layoutSelection: 'DEFERRED_OWNER_DECISION';
  legalAnchor: {
    regulatoryBasis: string[];
    referencePath: string;
  };
  batchInsert: SiaficBatchInsert;
  requestHeaders: SiaficRequestHeaders[];
  stagePayloads: SiaficStagePayload[];
  itemWrites: SiaficItemWrite[];
  batchStageUpdates: SiaficBatchStageUpdate[];
  batchResult: SiaficSyncBatchDto;
}

interface SiaficRequestHeaders {
  enteCode: string;
  stage: string;
  idempotencyKey: string;
}

interface ReceivedSiaficRequest {
  headers: SiaficRequestHeaders;
  payload: SiaficStagePayload;
}

interface SiaficBatchInsert {
  payrollRunId: string;
  competence: string;
  enteCode: string;
  circuitState: string;
  stageStatus: Record<SiaficSyncStage, 'PENDING'>;
  itemCount: number;
  totalAmount: string;
}

interface SiaficItemWrite {
  batchId: string;
  stage: SiaficSyncStage;
  sourceLineId: string;
  accountingAccountId: string;
  accountCode: string;
  accountType: string;
  amount: string;
  status: SiaficSyncStatus;
  receiptNumber: string | null;
}

interface SiaficBatchStageUpdate {
  batchId: string;
  stage: SiaficSyncStage;
  status: SiaficSyncStatus;
  circuitState: string;
  receiptNumber: string | null;
  lastError: string | null;
  responsePayload: Record<string, unknown>;
}

interface TestDbClient {
  query(
    sql: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, never>> }>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function headerText(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(',') : (value ?? '');
}

function batchInsertFrom(values: readonly unknown[]): SiaficBatchInsert {
  return {
    payrollRunId: stringAt(values, 0),
    competence: stringAt(values, 1),
    enteCode: stringAt(values, 2),
    circuitState: stringAt(values, 3),
    stageStatus: JSON.parse(stringAt(values, 4)) as Record<
      SiaficSyncStage,
      'PENDING'
    >,
    itemCount: numberAt(values, 5),
    totalAmount: stringAt(values, 6),
  };
}

function itemWriteFrom(values: readonly unknown[]): SiaficItemWrite {
  return {
    batchId: stringAt(values, 0),
    stage: stageAt(values, 1),
    sourceLineId: stringAt(values, 2),
    accountingAccountId: stringAt(values, 3),
    accountCode: stringAt(values, 4),
    accountType: stringAt(values, 5),
    amount: stringAt(values, 6),
    status: statusAt(values, 7),
    receiptNumber: nullableStringAt(values, 8),
  };
}

function batchStageUpdateFrom(
  values: readonly unknown[],
): SiaficBatchStageUpdate {
  return {
    batchId: stringAt(values, 0),
    status: statusAt(values, 1),
    stage: stageAt(values, 2),
    circuitState: stringAt(values, 3),
    receiptNumber: nullableStringAt(values, 4),
    lastError: nullableStringAt(values, 5),
    responsePayload: JSON.parse(stringAt(values, 6)) as Record<string, unknown>,
  };
}

function batchRowFrom(batch: SiaficSyncBatchDto): Record<string, unknown> {
  return {
    id: batch.id,
    payroll_run_id: batch.payrollRunId,
    competence: batch.competence,
    ente_code: batch.enteCode,
    status: batch.status,
    circuit_state: batch.circuitState,
    attempts: String(batch.attempts),
    receipt_number: batch.receiptNumber,
    last_error: batch.lastError,
    stage_status: batch.stageStatus,
    item_count: String(batch.itemCount),
    total_amount: batch.totalAmount,
    created_at: batch.createdAt,
    updated_at: batch.updatedAt,
  };
}

function stringAt(values: readonly unknown[], index: number): string {
  return String(values[index]);
}

function nullableStringAt(
  values: readonly unknown[],
  index: number,
): string | null {
  const value = values[index];
  return value === null || value === undefined ? null : String(value);
}

function numberAt(values: readonly unknown[], index: number): number {
  return Number(values[index]);
}

function stageAt(values: readonly unknown[], index: number): SiaficSyncStage {
  return stringAt(values, index) as SiaficSyncStage;
}

function statusAt(values: readonly unknown[], index: number): SiaficSyncStatus {
  return stringAt(values, index) as SiaficSyncStatus;
}
