import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { PensionistaImportController } from '../../backend/src/folha-pagamento/import/pensionista-import.controller';
import { buildSimpleXlsx } from './helpers/simple-xlsx-fixture';

describe('Pensionista verba XLSX import API contract (e2e)', () => {
  it('exposes the folha-scoped pensionista import and audits each accepted row', async () => {
    const xlsx = buildSimpleXlsx([
      ['pensao_id', 'matricula_pensionista', 'verba_codigo', 'valor'],
      [
        '55555555-5555-4555-8555-555555555555',
        'PENS-001',
        'PENSAO_VAR',
        '250.00',
      ],
    ]);
    const importFile = jest.fn().mockResolvedValue({
      payrollRunId: 'run-1',
      fileName: 'pensionistas.xlsx',
      fileHash: 'hash-1',
      totalRows: 1,
      acceptedRows: 1,
      rejectedRows: 0,
      accepted: [
        {
          rowNumber: 2,
          payrollItemId: 'item-1',
          pensionId: 'pension-1',
          pensionBeneficiaryId: 'beneficiary-1',
          pensionistaEmployeeId: 'pensionista-employee-1',
          pensionistaRegistration: 'PENS-001',
          earningDeductionId: 'rubrica-1',
          earningDeductionCode: 'PENSAO_VAR',
          amount: '250.00',
          payrollItemIdempotencyKey:
            'tenant:2026:05:run-1:pensionista-employee-1:rubrica-1:IMPORTED',
          pensionIdempotencyKey:
            'tenant:2026:05:run-1:pension-1:pensionista-employee-1:rubrica-1:PENSIONISTA_IMPORTED',
          operation: 'created',
        },
      ],
      errors: [],
    });
    const auditMutation = jest.fn().mockResolvedValue(undefined);
    const controller = new PensionistaImportController(
      { importFile } as never,
      { auditMutation } as never,
    );
    const request = {
      method: 'POST',
      url: '/api/v1/folhas/run-1/importar/pensionista',
      headers: {},
      actor: { username: 'folha-user' },
    } as never;

    const result = await controller.importPensionista(request, 'run-1', {
      buffer: xlsx,
      originalname: 'pensionistas.xlsx',
      size: xlsx.length,
    });

    expect(importFile).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ originalname: 'pensionistas.xlsx' }),
    );
    expect(result).toMatchObject({ acceptedRows: 1, rejectedRows: 0 });
    expect(auditMutation).toHaveBeenCalledWith(
      request,
      'IMPORT',
      'payroll.employee_payroll_item',
      expect.objectContaining({
        resourceId: 'item-1',
        metadata: expect.objectContaining({
          event: 'folha.pensionista_import.row_accepted',
          rowNumber: 2,
          pensionId: 'pension-1',
          pensionIdempotencyKey:
            'tenant:2026:05:run-1:pension-1:pensionista-employee-1:rubrica-1:PENSIONISTA_IMPORTED',
        }),
      }),
    );
    expect(auditMutation).toHaveBeenCalledTimes(2);
  });
});

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
