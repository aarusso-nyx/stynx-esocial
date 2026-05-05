import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { S1207Builder } from '../../backend/src/esocial-worker/builders/s1207.builder';
import { S2410Builder } from '../../backend/src/esocial-worker/builders/s2410.builder';
import { XsdValidatorService } from '../../backend/src/esocial-worker/xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000001207';
const payrollRunId = '00000000-0000-4000-8000-000000001207';
const employeeId = '00000000-0000-4000-8000-000000001201';
const retirementGrantId = '00000000-0000-4000-8000-000000002413';

describe('S-1207 RPPS benefit periodic reporting (e2e)', () => {
  const validator = new XsdValidatorService();

  it('reuses the deterministic S-2410 benefit number for monthly RPPS benefit payroll', async () => {
    const s2410 = new S2410Builder(
      database([[retirementBenefitGrant()]]) as never,
    );
    const grant = await s2410.buildRetirementGrant(retirementGrantId);

    const s1207 = new S1207Builder(
      database([[payrollRun()], payrollBenefitItems()]) as never,
    );
    const records = await s1207.build(tenantId, payrollRunId);

    expect(records).toHaveLength(1);
    expect(records[0].nrBeneficio).toBe(grant.payload.nrBeneficio);
    expect(records[0].payload).toMatchObject({
      sourceKind: grant.payload.sourceKind,
      nrBeneficio: grant.payload.nrBeneficio,
      cpfBenef: grant.payload.cpfBenef,
    });
    expect(() =>
      validator.assertValid('S-2410', grant.xml, { allowUnsigned: true }),
    ).not.toThrow();
    expect(() =>
      validator.assertValid('S-1207', records[0].xml, {
        allowUnsigned: true,
      }),
    ).not.toThrow();
  });
});

function database(results: unknown[][]) {
  let index = 0;
  return {
    query: jest.fn(async () => results[index++] ?? []),
  };
}

function retirementBenefitGrant() {
  return {
    retirement_grant_id: retirementGrantId,
    tenant_id: tenantId,
    employee_id: employeeId,
    employee_registration: 'RPPS-001',
    employee_cpf: '11144477735',
    granted_on: '2026-04-25',
    legal_basis: 'Lei Municipal 1/2026',
    appointment_act: 'Portaria 10/2026',
    rule_name: 'Aposentadoria voluntaria RPPS',
    company_cnpj: '12345678000199',
  };
}

function payrollRun() {
  return {
    id: payrollRunId,
    tenant_id: tenantId,
    status: 'GENERATED',
    competence_year: 2026,
    competence_month: 5,
  };
}

function payrollBenefitItems() {
  return [
    payrollBenefitItem('PROV', 'EARNING', '5200.00'),
    payrollBenefitItem('RPPS', 'DEDUCTION', '572.00'),
  ];
}

function payrollBenefitItem(
  rubricCode: string,
  entryKind: string,
  amount: string,
) {
  return {
    tenant_id: tenantId,
    payroll_run_id: payrollRunId,
    competence_year: 2026,
    competence_month: 5,
    employee_id: employeeId,
    beneficiary_cpf: '11144477735',
    cnpj: '12345678000199',
    benefit_source_kind: 'RETIREMENT',
    benefit_source_id: retirementGrantId,
    nr_beneficio: 'RET08000000000002413',
    active_benefit_count: '1',
    rubric_code: rubricCode,
    table_code: 'SGP',
    entry_kind: entryKind,
    amount,
    quantity: '1.0000',
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
