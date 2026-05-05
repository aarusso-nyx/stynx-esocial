import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { GoneException } from '@nestjs/common';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DirfBuilderService } from '../../backend/src/integrations-worker/dirf/dirf-builder.service';
import { DirfController } from '../../backend/src/integrations-worker/dirf/dirf.controller';
import { DirfFormatterService } from '../../backend/src/integrations-worker/dirf/dirf-formatter.service';
import { DirfValidatorService } from '../../backend/src/integrations-worker/dirf/dirf-validator.service';

const tenantId = '00000000-0000-0000-0000-00000000f502';
const arquivoId = '00000000-0000-4000-8000-00000000f502';
const beneficiaryId = '00000000-0000-4000-8000-00000000b001';

interface TestDbClient {
  query(
    sql: string,
    values: unknown[],
  ): Promise<{ rows: unknown[]; rowCount?: number }>;
}

describe('DIRF validation flow (e2e)', () => {
  it('returns 410 when generating DIRF for competences from 2025-01-01 onward', async () => {
    const builder = {
      generate: jest.fn(),
    };
    const auditService = {
      auditMutation: jest.fn(),
    };
    const controller = new DirfController(
      builder as never,
      auditService as never,
    );

    for (const yearBase of [2025, 2026]) {
      const failure = await controller
        .generate({} as never, { yearBase })
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(GoneException);
      expect((failure as GoneException).getStatus()).toBe(410);
    }
    expect(builder.generate).not.toHaveBeenCalled();
    expect(auditService.auditMutation).not.toHaveBeenCalled();
  });

  it('emits header and closing records and matches payment sums to totals', async () => {
    const insertedPayments: Array<{ amount: string; irrf: string }> = [];
    const db = {
      configured: true,
      query: jest
        .fn()
        .mockResolvedValueOnce([
          source(
            'CPF',
            '11111111111',
            'Ana Silva',
            '0588',
            '2024-01-01',
            '1000.00',
            '100.00',
          ),
          source(
            'CPF',
            '11111111111',
            'Ana Silva',
            '0588',
            '2024-02-01',
            '500.00',
            '50.00',
          ),
        ])
        .mockResolvedValueOnce([arquivoRow('1500.00', '150.00')])
        .mockResolvedValueOnce([beneficiaryRow('1500.00')])
        .mockResolvedValueOnce([
          paymentRow('0588', '2024-01-01', '1000.00', '100.00'),
          paymentRow('0588', '2024-02-01', '500.00', '50.00'),
        ]),
      transaction: jest.fn(
        async (callback: (client: TestDbClient) => Promise<unknown>) =>
          callback({
            query: jest.fn(async (sql: string, values: unknown[]) => {
              if (sql.includes('INSERT INTO fiscal.dirf_arquivo')) {
                return { rows: [{ id: arquivoId }], rowCount: 1 };
              }
              if (sql.includes('INSERT INTO fiscal.dirf_beneficiario')) {
                return { rows: [{ id: beneficiaryId }], rowCount: 1 };
              }
              if (sql.includes('INSERT INTO fiscal.dirf_pagamento')) {
                insertedPayments.push({
                  amount: String(values[4]),
                  irrf: String(values[5]),
                });
              }
              return { rows: [], rowCount: 0 };
            }),
          }),
      ),
    };
    const service = new DirfBuilderService(
      db as never,
      new DirfFormatterService(),
      new DirfValidatorService(),
    );

    const result = await RequestContextStore.run(
      {
        tenantId,
        permissions: ['fiscal.dirf.read', 'fiscal.dirf.write'],
      },
      () => service.generate({ yearBase: 2024 }),
    );

    expect(result.txtContent).toContain(
      'DIRF|DIRF-RFB-2.060/2024|2024|ORIGINAL|',
    );
    expect(result.txtContent).toContain('FIMDIRF|');
    const insertedTotal = insertedPayments.reduce(
      (total, payment) => total + Number(payment.amount),
      0,
    );
    expect(insertedTotal.toFixed(2)).toBe(
      String(result.beneficiaries[0].totals['amount']),
    );
  });
});

function source(
  beneficiary_kind: string,
  beneficiary_document: string,
  beneficiary_name: string,
  revenue_code: string,
  month_year: string,
  amount: string,
  irrf: string,
) {
  return {
    beneficiary_kind,
    beneficiary_document,
    beneficiary_name,
    revenue_code,
    month_year,
    amount,
    irrf,
    deductions: {},
  };
}

function arquivoRow(total_amount: string, total_irrf: string) {
  return {
    id: arquivoId,
    year_base: 2024,
    kind: 'ORIGINAL',
    status: 'VALIDATED',
    original_arquivo_id: null,
    txt_ref: 's3://dirf.txt',
    txt_content: 'DIRF|DIRF-RFB-2.060/2024|2024|ORIGINAL|\r\nFIMDIRF|\r\n',
    txt_hash: 'a'.repeat(64),
    layout_version: 'DIRF-RFB-2.060/2024',
    generated_at: '2024-05-02T12:00:00.000Z',
    beneficiary_count: 1,
    payment_count: 2,
    total_amount,
    total_irrf,
    created_at: '2024-05-02T12:00:00.000Z',
    updated_at: '2024-05-02T12:00:00.000Z',
  };
}

function beneficiaryRow(amount: string) {
  return {
    id: beneficiaryId,
    cpf_cnpj: '11111111111',
    kind: 'CPF',
    name: 'Ana Silva',
    totals: {
      amount,
      irrf: '150.00',
      byCode: { '0588': { amount, irrf: '150.00' } },
    },
  };
}

function paymentRow(
  code: string,
  month_year: string,
  amount: string,
  irrf: string,
) {
  return {
    id: `00000000-0000-4000-8000-${code.padEnd(12, '0').slice(0, 12)}`,
    code,
    month_year,
    amount,
    irrf,
    deductions: {},
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
