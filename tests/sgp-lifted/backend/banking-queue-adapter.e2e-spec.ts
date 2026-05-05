import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  InMemoryQueueTransport,
  type QueueAdapterRequestEnvelope,
} from '../../backend/src/common/adapters';
import {
  BankingRelayMockResponder,
  type BankingRelayRequestPayload,
} from '../../backend/src/external/mocks/banking-relay';
import {
  Cnab240BuilderService,
  type Cnab240BuildInput,
} from '../../backend/src/integrations-worker/cnab240/cnab240-builder.service';
import {
  BankingCnab240QueueAdapter,
  type BankingCnab240ReturnProcessingInput,
  type BankingPaymentBatchState,
  PayrollPaymentBatchStateSqlWriter,
} from '../../backend/src/integrations-worker/cnab240/adapters/queue-adapter';
import { Cnab240ReturnParserService } from '../../backend/src/integrations-worker/cnab240/return/cnab240-return-parser.service';
import { OccurrenceMapperService } from '../../backend/src/integrations-worker/cnab240/return/occurrence-mapper.service';

type SerializedCnab240BuildInput = Omit<Cnab240BuildInput, 'generatedAt'> & {
  generatedAt: string;
};

const GOLDEN_ROOT = join(__dirname, 'golden/cnab240');
const BANK_CASES = [
  { slug: 'bb', bankCode: '001' },
  { slug: 'caixa', bankCode: '104' },
  { slug: 'itau', bankCode: '341' },
  { slug: 'bradesco', bankCode: '237' },
  { slug: 'santander', bankCode: '033' },
] as const;

describe('R4-98 banking mock relay queue adapter', () => {
  const builder = new Cnab240BuilderService();
  const parser = new Cnab240ReturnParserService();
  const mapper = new OccurrenceMapperService();
  const fixedNow = () => new Date('2026-05-04T00:00:00.000Z');

  let transport: InMemoryQueueTransport;
  let relay: BankingRelayMockResponder;
  let adapter: BankingCnab240QueueAdapter;
  let stateWrites: BankingPaymentBatchState[];
  let processorInputs: BankingCnab240ReturnProcessingInput[];

  beforeEach(() => {
    transport = new InMemoryQueueTransport();
    relay = new BankingRelayMockResponder({
      transport,
      fixturesRoot: join(GOLDEN_ROOT, 'return'),
      now: fixedNow,
    });
    stateWrites = [];
    processorInputs = [];
    adapter = new BankingCnab240QueueAdapter({
      transport,
      parser,
      mapper,
      retryDelayMs: () => 0,
      responseTimeoutMs: 1_000,
      now: fixedNow,
      idFactory: deterministicIdFactory(),
      returnProcessor: {
        process: async (input) => {
          processorInputs.push(input);
          const parsed = parser.parse(Buffer.from(input.content, 'base64'));
          const rejectedRecords = parsed.details.filter(
            (detail) =>
              mapper.map(detail.bankCode, detail.occurrenceCode)
                .internalStatus !== 'ACCEPTED',
          ).length;

          return {
            returnFileId: `return-${processorInputs.length}`,
            remittanceFileId: input.remittanceFileId,
            bankCode: Number(parsed.bankCode),
            fileHash: parsed.fileHash,
            processedRecords: parsed.details.length,
            rejectedRecords,
          };
        },
      },
      paymentBatchStateWriter: {
        write: async (state) => {
          stateWrites.push(state);
        },
      },
    });
  });

  afterEach(() => {
    adapter.close();
    relay.close();
  });

  it.each(BANK_CASES)(
    'posts $slug CNAB240 through the banking queue and reconciles deterministic retorno',
    async ({ slug, bankCode }) => {
      const fixture = readRemittanceFixture(slug);
      const artifact = builder.build(fixture.input);
      const remittanceFileId = `00000000-0000-4000-8000-${bankCode.padStart(
        12,
        '0',
      )}`;

      expect(artifact.content).toEqual(fixture.expected);

      const first = await adapter.submitRemittance({
        tenantId: '00000000-0000-4000-8000-000000000100',
        remittanceFileId,
        artifact,
        correlationId: `corr-${slug}-1`,
      });
      const second = await adapter.submitRemittance({
        tenantId: '00000000-0000-4000-8000-000000000100',
        remittanceFileId,
        artifact,
        correlationId: `corr-${slug}-2`,
      });

      expect(first.relay.bankCode).toBe(bankCode);
      expect(first.relay.handledBy).toBe('banking-relay-mock');
      expect(first.relay.returnFileHash).toBe(second.relay.returnFileHash);
      expect(first.relay.retornoContentBase64).toBe(
        second.relay.retornoContentBase64,
      );
      expect(first.parsedReturn.details).toHaveLength(artifact.details.length);
      expect(first.paymentBatchState.processedRecords).toBe(
        artifact.details.length,
      );
      expect(
        first.paymentBatchState.details.map((detail) => detail.sequence),
      ).toEqual(artifact.details.map((detail) => detail.sequence));
      expect(
        first.paymentBatchState.details.map((detail) => detail.amount),
      ).toEqual(artifact.details.map((detail) => detail.amount));
      expect(first.paymentBatchState.status).toBe('RETURNED');
      expect(stateWrites).toHaveLength(2);
      expect(stateWrites[0]).toMatchObject({
        remittanceFileId,
        bankCode,
        returnFileHash: first.relay.returnFileHash,
      });
      expect(processorInputs[0]).toEqual({
        remittanceFileId,
        remittanceFileHash: artifact.fileHash,
        content: first.relay.retornoContentBase64,
        encoding: 'base64',
        processedBy: null,
      });

      const [request] = transport.history<
        QueueAdapterRequestEnvelope<'banking', BankingRelayRequestPayload>
      >('sgp.adapter.banking.request');
      expect(request).toEqual(
        expect.objectContaining({
          'correlation-id': `corr-${slug}-1`,
          tenant_id: '00000000-0000-4000-8000-000000000100',
          kind: 'banking',
          payload: expect.objectContaining({
            format: 'CNAB240',
            bankCode,
            remittanceFileHash: artifact.fileHash,
            contentBase64: artifact.content.toString('base64'),
          }),
        }),
      );
    },
  );

  it('materializes the reconciled payment batch state through SQL writer', async () => {
    const calls: Array<{ sql: string; values: unknown[] | undefined }> = [];
    const writer = new PayrollPaymentBatchStateSqlWriter({
      query: async (sql, values) => {
        calls.push({ sql, values });
        return [];
      },
    });

    await writer.write({
      remittanceFileId: '00000000-0000-4000-8000-000000000001',
      returnFileId: '00000000-0000-4000-8000-000000000002',
      bankCode: '001',
      status: 'PAID',
      remittanceFileHash: 'a'.repeat(64),
      returnFileHash: 'b'.repeat(64),
      processedRecords: 1,
      rejectedRecords: 0,
      details: [
        {
          sequence: 1,
          employeeId: '00000000-0000-4000-8000-000000000003',
          amount: '1000.00',
          occurrenceCode: '00',
          internalStatus: 'ACCEPTED',
        },
      ],
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.sql).toContain('UPDATE payroll.payment_remittance_file');
    expect(calls[0]?.values).toEqual([
      '00000000-0000-4000-8000-000000000001',
      'PAID',
    ]);
    expect(calls[1]?.sql).toContain('UPDATE payroll.payroll_run');
    expect(calls[1]?.values).toEqual(['00000000-0000-4000-8000-000000000001']);
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

function deterministicIdFactory(): () => string {
  let next = 1;
  return () => {
    const suffix = String(next).padStart(12, '0');
    next += 1;
    return `00000000-0000-4000-8000-${suffix}`;
  };
}
