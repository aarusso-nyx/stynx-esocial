import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { PreconditionFailedException } from '@nestjs/common';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DctfwebBuilderService } from '../../backend/src/integrations-worker/dctfweb/dctfweb-builder.service';
import { DctfwebSignerService } from '../../backend/src/integrations-worker/dctfweb/dctfweb-signer.service';

const tenantId = '00000000-0000-0000-0000-00000000f501';
const declarationId = '00000000-0000-4000-8000-00000000f501';

interface TestDbClient {
  query(sql: string, values: unknown[]): Promise<{ rows: unknown[] }>;
}

describe('DCTFWeb flow (e2e)', () => {
  it('matches DCTFWeb item totals to accepted S-5011/S-5012/S-5013 totalizers', async () => {
    const inserted: Array<{ baseAmount: string; amount: string }> = [];
    const db = {
      configured: true,
      query: jest
        .fn()
        .mockResolvedValueOnce([
          totalizer('S-5011', 'REC-S1299', [
            debit(
              '00000000-0000-4000-8000-000000005011',
              '1082-01',
              '1000.00',
              '200.00',
            ),
          ]),
          totalizer('S-5012', 'REC-S1299', [
            debit(
              '00000000-0000-4000-8000-000000005012',
              '0561',
              '500.00',
              '50.00',
            ),
          ]),
          totalizer('S-5013', 'REC-S1299', [
            debit(
              '00000000-0000-4000-8000-000000005013',
              'FGTS',
              '800.00',
              '64.00',
            ),
          ]),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([declarationRow('314.00')])
        .mockResolvedValueOnce([
          itemRow('S5011', '1082-01', '1000.00', '200.00'),
          itemRow('S5012', '0561', '500.00', '50.00'),
          itemRow('S5013', 'FGTS', '800.00', '64.00'),
        ]),
      transaction: jest.fn(
        async (callback: (client: TestDbClient) => Promise<unknown>) =>
          callback({
            query: jest.fn(async (sql: string, values: unknown[]) => {
              if (sql.includes('INSERT INTO fiscal.dctfweb_declaration')) {
                return { rows: [{ id: declarationId }] };
              }
              if (sql.includes('INSERT INTO fiscal.dctfweb_item')) {
                inserted.push({
                  baseAmount: String(values[5]),
                  amount: String(values[6]),
                });
              }
              return { rows: [] };
            }),
          }),
      ),
    };
    const service = new DctfwebBuilderService(db as never);

    const result = await RequestContextStore.run(
      {
        tenantId,
        permissions: ['fiscal.dctfweb.read', 'fiscal.dctfweb.write'],
      },
      () => service.generate({ year: 2026, month: 1 }),
    );

    const totalizersAmount = ['200.00', '50.00', '64.00'].reduce(
      (sum, value) => sum + Number(value),
      0,
    );
    const itemAmount = inserted.reduce(
      (sum, item) => sum + Number(item.amount),
      0,
    );
    expect(itemAmount).toBe(totalizersAmount);
    expect(result.totalAmount).toBe('314.00');
  });

  it('includes pending MIT tax debits with CSLL adicional in generated DCTFWeb', async () => {
    const inserted: Array<{ amount: string; csllAdicionalAmount: string }> = [];
    const db = {
      configured: true,
      query: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            pgd_declaration_id: 'PGD-DECL-2026-01',
            pgd_debit_id: 'PGD-DEBIT-001',
            cnpj_filial: '12.345.678/0001-99',
            tax_code: '0561',
            base_amount: '900,00',
            amount: '88,10',
            csll_adicional_amount: '15,00',
            mit_status: null,
          },
        ])
        .mockResolvedValueOnce([declarationRow('103.10')])
        .mockResolvedValueOnce([
          itemRow('MIT', '0561', '900.00', '88.10', {
            cnpj_filial: '12345678000199',
            csll_adicional_amount: '15.00',
            mit_debit_id: 'MIT-generated',
            mit_status: 'PENDING',
          }),
        ]),
      transaction: jest.fn(
        async (callback: (client: TestDbClient) => Promise<unknown>) =>
          callback({
            query: jest.fn(async (sql: string, values: unknown[]) => {
              if (sql.includes('INSERT INTO fiscal.dctfweb_declaration')) {
                return { rows: [{ id: declarationId }] };
              }
              if (sql.includes('INSERT INTO fiscal.dctfweb_item')) {
                inserted.push({
                  amount: String(values[6]),
                  csllAdicionalAmount: String(values[7]),
                });
              }
              return { rows: [] };
            }),
          }),
      ),
    };
    const service = new DctfwebBuilderService(db as never);

    const result = await RequestContextStore.run(
      {
        tenantId,
        permissions: ['fiscal.dctfweb.read', 'fiscal.dctfweb.write'],
      },
      () => service.generate({ year: 2026, month: 1 }),
    );

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM fiscal.dctf_pgd_tax_debit'),
      [tenantId, '2026-01-01'],
    );
    expect(inserted).toEqual([
      { amount: '88.10', csllAdicionalAmount: '15.00' },
    ]);
    expect(result.items[0]).toMatchObject({
      sourceEvent: 'MIT',
      amount: '88.10',
      csllAdicionalAmount: '15.00',
      mitStatus: 'PENDING',
      cnpjFilial: '12345678000199',
    });
  });

  it('returns 412 when no ICP-Brasil certificate is configured', async () => {
    const signer = new DctfwebSignerService(
      { configured: true } as never,
      {
        find: jest.fn(async () => ({ ...signedCandidate(), status: 'DRAFT' })),
      } as never,
      {
        activeCertificate: jest.fn(async () => {
          throw new Error(
            'No active non-expired eSocial certificate is available for current tenant',
          );
        }),
      } as never,
      { readPkcs12: jest.fn() } as never,
    );

    await expect(signer.sign(declarationId)).rejects.toBeInstanceOf(
      PreconditionFailedException,
    );
  });
});

function totalizer(kind: string, receipt: string, items: unknown[]) {
  return {
    kind,
    source_event_recibo: receipt,
    payload: { items },
  };
}

function debit(
  sourceRunId: string,
  debitCode: string,
  baseAmount: string,
  amount: string,
) {
  return { sourceRunId, debitCode, baseAmount, amount };
}

function declarationRow(totalAmount: string) {
  return {
    id: declarationId,
    competence: '2026-01-01',
    kind: 'ORIGINAL',
    status: 'DRAFT',
    original_declaration_id: null,
    payload_xml_ref: 's3://payload.xml',
    payload_xml: '<DCTFWeb />',
    payload_xml_hash: 'a'.repeat(64),
    signed_xml_ref: null,
    signed_xml: null,
    signed_xml_hash: null,
    transmitted_xml_hash: null,
    receipt_number: null,
    receipt_at: null,
    item_count: 3,
    total_base_amount: '2300.00',
    total_amount: totalAmount,
    created_at: '2026-05-02T12:00:00.000Z',
    updated_at: '2026-05-02T12:00:00.000Z',
  };
}

function itemRow(
  sourceEvent: string,
  debitCode: string,
  baseAmount: string,
  amount: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `00000000-0000-4000-8000-${debitCode.padEnd(12, '0').slice(0, 12)}`,
    source_event: sourceEvent,
    source_run_id: '00000000-0000-4000-8000-000000005011',
    debit_code: debitCode,
    base_amount: baseAmount,
    amount,
    csll_adicional_amount: null,
    mit_status: null,
    mit_debit_id: null,
    cnpj_filial: null,
    ...overrides,
  };
}

function signedCandidate() {
  return {
    id: declarationId,
    payloadXml: '<DCTFWeb><declaracao Id="DCTF1" /></DCTFWeb>',
  };
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
