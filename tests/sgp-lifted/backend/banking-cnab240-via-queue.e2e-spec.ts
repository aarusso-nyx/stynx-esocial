import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { IntegrationsWorkerService } from '../../backend/src/integrations-worker/integrations-worker.service';
import {
  Cnab240BuilderService,
  type Cnab240BuildInput,
} from '../../backend/src/integrations-worker/cnab240/cnab240-builder.service';
import { Cnab240RelayDispatchService } from '../../backend/src/integrations-worker/cnab240/cnab240-relay-dispatch.service';
import type {
  BankingCnab240ReturnProcessingInput,
  BankingPaymentBatchStateStatus,
} from '../../backend/src/integrations-worker/cnab240/adapters/queue-adapter';
import { Cnab240ReturnParserService } from '../../backend/src/integrations-worker/cnab240/return/cnab240-return-parser.service';
import { OccurrenceMapperService } from '../../backend/src/integrations-worker/cnab240/return/occurrence-mapper.service';

type SerializedCnab240BuildInput = Omit<Cnab240BuildInput, 'generatedAt'> & {
  generatedAt: string;
};

const GOLDEN_ROOT = join(__dirname, 'golden/cnab240');
const tenantId = '00000000-0000-4000-8000-000000000091';
const BANK_CASES = [
  { slug: 'bb', bankCode: '001' },
  { slug: 'caixa', bankCode: '104' },
  { slug: 'itau', bankCode: '341' },
  { slug: 'bradesco', bankCode: '237' },
  { slug: 'santander', bankCode: '033' },
] as const;

describe('R4-91 banking CNAB240 via queue wiring', () => {
  const builder = new Cnab240BuilderService();
  const parser = new Cnab240ReturnParserService();
  const mapper = new OccurrenceMapperService();

  it('sends remessa through the banking relay and reconciles retorno for the five bank fixtures', async () => {
    const stateWrites: Array<{ sql: string; values?: unknown[] }> = [];
    const database = {
      query: jest.fn(async (sql: string, values?: unknown[]) => {
        stateWrites.push({ sql, values });
        return [];
      }),
    };
    const returnProcessor = {
      process: jest.fn(async (input: BankingCnab240ReturnProcessingInput) => {
        const parsed = parser.parse(Buffer.from(input.content, 'base64'));
        const rejectedRecords = parsed.details.filter(
          (detail) =>
            mapper.map(detail.bankCode, detail.occurrenceCode)
              .internalStatus !== 'ACCEPTED',
        ).length;

        return {
          returnFileId: `00000000-0000-4000-8000-${String(
            Number(parsed.bankCode),
          ).padStart(12, '0')}`,
          remittanceFileId: input.remittanceFileId,
          bankCode: Number(parsed.bankCode),
          fileHash: parsed.fileHash,
          processedRecords: parsed.details.length,
          rejectedRecords,
        };
      }),
    };
    const service = new Cnab240RelayDispatchService(
      database as never,
      returnProcessor as never,
      parser,
      mapper,
    );

    try {
      for (const { slug, bankCode } of BANK_CASES) {
        const fixture = readRemittanceFixture(slug);
        const artifact = builder.build(fixture.input);
        const remittanceFileId = `00000000-0000-4000-8000-${bankCode.padStart(
          12,
          '0',
        )}`;

        expect(artifact.content).toEqual(fixture.expected);

        const result = await service.submitGeneratedRemittance({
          tenantId,
          remittanceFileId,
          bankId: bankCode,
          artifact,
          correlationId: `corr-r4-91-${slug}`,
        });

        expect(result.relay).toMatchObject({
          handledBy: 'banking-relay-mock',
          bankCode,
          remittanceFileId,
          remittanceFileHash: artifact.fileHash,
        });
        expect(result.returnProcessing).toMatchObject({
          remittanceFileId,
          bankCode: Number(bankCode),
          fileHash: result.relay.returnFileHash,
          processedRecords: artifact.details.length,
        });
        expect(result.parsedReturn.details).toHaveLength(
          artifact.details.length,
        );
        expect(result.paymentBatchState).toMatchObject({
          remittanceFileId,
          bankCode,
          remittanceFileHash: artifact.fileHash,
          returnFileHash: result.relay.returnFileHash,
          processedRecords: artifact.details.length,
          status: 'RETURNED' satisfies BankingPaymentBatchStateStatus,
        });
        expect(result.paymentBatchState.rejectedRecords).toBeGreaterThan(0);
        expect(
          result.paymentBatchState.details.map((detail) => detail.sequence),
        ).toEqual(artifact.details.map((detail) => detail.sequence));

        const latestStateWrite = stateWrites.at(-1);
        expect(latestStateWrite?.sql).toContain(
          'UPDATE payroll.payment_remittance_file',
        );
        expect(latestStateWrite?.values).toEqual([
          remittanceFileId,
          'RETURNED',
        ]);
      }

      expect(returnProcessor.process).toHaveBeenCalledTimes(BANK_CASES.length);
      expect(database.query).toHaveBeenCalledTimes(BANK_CASES.length);
    } finally {
      service.onModuleDestroy();
    }
  });

  it('wires integrations worker remessa jobs into the CNAB240 relay dispatcher', async () => {
    const fixture = readRemittanceFixture('bb');
    const artifact = builder.build(fixture.input);
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM public.report_request rr')) {
        return [
          {
            id: '00000000-0000-4000-8000-000000000191',
            tenant_id: tenantId,
            definition_code: 'FOLHA_CNAB_REMESSA',
            parameters: {
              remittanceId: '00000000-0000-4000-8000-000000000291',
              bankId: '001',
              format: 'CNAB240',
              remittanceNumber: 91,
            },
            payroll_run_id: '00000000-0000-4000-8000-000000000391',
            competence_year: 2026,
            competence_month: 5,
          },
        ];
      }
      if (sql.includes("SET status = 'RUNNING'")) {
        return [{ id: '00000000-0000-4000-8000-000000000191' }];
      }
      if (sql.includes('INSERT INTO public.document_attachment')) {
        return [{ id: '00000000-0000-4000-8000-000000000491' }];
      }
      return [];
    });
    const storeGeneratedObject = jest.fn(async ({ storageKey, body }) => ({
      storageKind: 'LOCAL',
      storageKey,
      sizeBytes: Buffer.byteLength(body),
      checksum: createHash('sha256').update(body).digest('hex'),
    }));
    const submitGeneratedRemittance = jest.fn(async () => ({
      relay: {
        handledBy: 'banking-relay-mock',
        returnFileHash: 'b'.repeat(64),
      },
      paymentBatchState: {
        status: 'RETURNED',
        processedRecords: artifact.details.length,
        rejectedRecords: 8,
      },
      returnProcessing: {
        returnFileId: '00000000-0000-4000-8000-000000000591',
      },
    }));
    const service = new IntegrationsWorkerService(
      { query } as never,
      { storeGeneratedObject } as never,
      undefined,
      { submitGeneratedRemittance } as never,
      { emit: jest.fn(async () => artifact) } as never,
    );

    await expect(service.pollOnce(1)).resolves.toMatchObject({
      discovered: 1,
      processed: 1,
      failed: 0,
    });

    expect(submitGeneratedRemittance).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        remittanceFileId: '00000000-0000-4000-8000-000000000291',
        bankId: '001',
        artifact,
      }),
    );

    const completedCall = query.mock.calls.find(([sql]) =>
      String(sql).includes("SET status = 'COMPLETED'"),
    );
    expect(completedCall).toBeDefined();
    const completedParameters = JSON.parse(String(completedCall?.[1]?.[1]));
    expect(completedParameters.result.relay).toEqual(
      expect.objectContaining({
        handledBy: 'banking-relay-mock',
        paymentBatchStatus: 'RETURNED',
        processedRecords: artifact.details.length,
        rejectedRecords: 8,
        returnFileId: '00000000-0000-4000-8000-000000000591',
      }),
    );
  });
});

function readRemittanceFixture(slug: string): {
  input: Cnab240BuildInput;
  expected: Buffer;
} {
  const dir = join(GOLDEN_ROOT, slug);
  const input = JSON.parse(
    readFileSync(join(dir, 'input.json'), 'utf8'),
  ) as SerializedCnab240BuildInput;

  return {
    input: {
      ...input,
      generatedAt: new Date(input.generatedAt),
    },
    expected: readFileSync(join(dir, 'expected.rem')),
  };
}
