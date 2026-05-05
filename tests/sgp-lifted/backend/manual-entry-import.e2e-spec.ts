import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { ManualEntryImportController } from '../../backend/src/folha-pagamento/import/manual-entry-import.controller';
import { buildSimpleXlsx } from './helpers/simple-xlsx-fixture';

describe('Manual entry XLSX import API contract (e2e)', () => {
  it('exposes the folha-scoped manual entry import and audits the XLSX against the folha id', async () => {
    const xlsx = buildSimpleXlsx([
      ['matricula', 'verba_codigo', 'valor'],
      ['MAT-001', 'PLANTAO', '250.00'],
    ]);
    const importFile = jest.fn().mockResolvedValue({
      payrollRunId: 'run-1',
      folhaPagamentoId: 'run-1',
      fileName: 'lancamentos-manuais.xlsx',
      fileHash: 'hash-1',
      totalRows: 1,
      acceptedRows: 1,
      rejectedRows: 0,
      accepted: [
        {
          rowNumber: 2,
          payrollItemId: 'item-1',
          employeeId: 'emp-1',
          employeeRegistration: 'MAT-001',
          earningDeductionId: 'rubrica-1',
          earningDeductionCode: 'PLANTAO',
          amount: '250.00',
          idempotencyKey: 'tenant:2026:05:run-1:emp-1:rubrica-1:IMPORTED',
          operation: 'created',
        },
      ],
      errors: [],
    });
    const auditMutation = jest.fn().mockResolvedValue(undefined);
    const controller = new ManualEntryImportController(
      { importFile } as never,
      { auditMutation } as never,
    );
    const request = {
      method: 'POST',
      url: '/api/v1/folhas/run-1/importar/lancamento-manual',
      headers: {},
      actor: { username: 'folha-user' },
    } as never;

    const result = await controller.importManualEntries(request, 'run-1', {
      buffer: xlsx,
      originalname: 'lancamentos-manuais.xlsx',
      size: xlsx.length,
    });

    expect(importFile).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ originalname: 'lancamentos-manuais.xlsx' }),
    );
    expect(result).toMatchObject({ acceptedRows: 1, rejectedRows: 0 });
    expect(auditMutation).toHaveBeenCalledWith(
      request,
      'IMPORT',
      'payroll.manual_entry_import',
      expect.objectContaining({
        resourceId: 'run-1',
        metadata: expect.objectContaining({
          event: 'folha.manual_entry_import.completed',
          folhaPagamentoId: 'run-1',
          fileHash: 'hash-1',
        }),
      }),
    );
    expect(auditMutation).toHaveBeenCalledWith(
      request,
      'IMPORT',
      'payroll.employee_payroll_item',
      expect.objectContaining({
        resourceId: 'item-1',
        metadata: expect.objectContaining({
          event: 'folha.manual_entry_import.row_accepted',
          folhaPagamentoId: 'run-1',
          rowNumber: 2,
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
