import { ReportWorkerService } from '../../backend/src/report-service/report-worker.service';

const tenantId = '00000000-0000-4000-8000-000000000100';
const requestA = '00000000-0000-4000-8000-000000000a01';
const requestB = '00000000-0000-4000-8000-000000000b02';
const payrollRunA = '00000000-0000-4000-8000-000000000901';
const payrollRunB = '00000000-0000-4000-8000-000000000902';

describe('ReportWorkerService concurrency isolation (e2e)', () => {
  it('isolates simultaneous same-tenant report jobs and keeps their outputs independent', async () => {
    const claimedJobs = [
      job(requestA, payrollRunA),
      job(requestB, payrollRunB),
    ];
    const completedParameters = new Map<string, ReportRequestParameters>();
    const storageInputs: StoredObjectInput[] = [];
    const activeLogicalReportKeys = new Set<string>();
    let overlappingSameReportGeneration = false;
    let attachmentSequence = 0;

    const query = jest.fn(
      async (
        sql: string,
        values: readonly unknown[] = [],
      ): Promise<Array<Record<string, unknown>>> => {
        if (sql.includes('WITH claimed AS')) {
          const next = claimedJobs.shift();
          return next ? [next] : [];
        }
        if (sql.includes('FROM payroll.payroll_run run')) {
          return [summaryForRun(String(values[0]))];
        }
        if (sql.includes('GROUP BY coalesce(status.description')) {
          return [statusTotalsForRun(String(values[0]))];
        }
        if (sql.includes('INSERT INTO public.document_attachment')) {
          attachmentSequence += 1;
          return [{ id: `attachment-${attachmentSequence}` }];
        }
        if (sql.includes('INSERT INTO public.generated_report_file')) {
          return [];
        }
        if (sql.includes("SET status = 'COMPLETED'")) {
          completedParameters.set(
            String(values[0]),
            JSON.parse(String(values[1])) as ReportRequestParameters,
          );
          return [];
        }
        return [];
      },
    );
    const storeGeneratedObject = jest.fn(
      async (input: StoredObjectInput): Promise<StoredObjectResult> => {
        const logicalKey = input.storageKey.split('/').slice(0, 6).join('/');
        if (activeLogicalReportKeys.has(logicalKey)) {
          overlappingSameReportGeneration = true;
        }
        activeLogicalReportKeys.add(logicalKey);
        storageInputs.push(input);
        await sleep(30);
        activeLogicalReportKeys.delete(logicalKey);
        return {
          storageKind: 'S3',
          storageKey: input.storageKey,
          sizeBytes: input.body.length,
          checksum: `checksum-${input.storageKey.split('/').pop()}`,
        };
      },
    );
    const service = new ReportWorkerService(
      { configured: true, query } as never,
      { storeGeneratedObject } as never,
    );

    const [first, second] = await Promise.all([
      service.pollOnce(1),
      service.pollOnce(1),
    ]);

    expect(first).toMatchObject({ discovered: 1, processed: 1, failed: 0 });
    expect(second).toMatchObject({ discovered: 1, processed: 1, failed: 0 });
    expect(overlappingSameReportGeneration).toBe(false);
    expect(storageInputs).toHaveLength(2);

    const storageKeys = storageInputs.map((input) => input.storageKey);
    expect(new Set(storageKeys).size).toBe(2);
    expect(storageKeys).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`/${requestA}/`),
        expect.stringContaining(`/${requestB}/`),
      ]),
    );

    const artifactA = storageInputs.find((input) =>
      input.storageKey.includes(`/${requestA}/`),
    );
    const artifactB = storageInputs.find((input) =>
      input.storageKey.includes(`/${requestB}/`),
    );
    expect(artifactA?.body.toString('utf8')).toContain('Ativo A');
    expect(artifactA?.body.toString('utf8')).not.toContain('Ativo B');
    expect(artifactB?.body.toString('utf8')).toContain('Ativo B');
    expect(artifactB?.body.toString('utf8')).not.toContain('Ativo A');

    expect(completedParameters.get(requestA)?.result.storageKey).toContain(
      `/${requestA}/`,
    );
    expect(completedParameters.get(requestB)?.result.storageKey).toContain(
      `/${requestB}/`,
    );
  });
});

interface StoredObjectInput {
  storageKey: string;
  contentType: string;
  body: Buffer;
}

interface StoredObjectResult {
  storageKind: 'S3';
  storageKey: string;
  sizeBytes: number;
  checksum: string;
}

interface ReportRequestParameters {
  result: {
    storageKey: string;
  };
}

function job(id: string, payrollRunId: string): Record<string, unknown> {
  return {
    id,
    tenant_id: tenantId,
    definition_code: 'F-FOL-014',
    parameters: {},
    payroll_run_id: payrollRunId,
    branch_id: null,
    competence_year: 2026,
    competence_month: 5,
  };
}

function summaryForRun(payrollRunId: string): Record<string, unknown> {
  const suffix = payrollRunId === payrollRunA ? 'A' : 'B';
  return {
    payroll_run_id: payrollRunId,
    competence_year: 2026,
    competence_month: 5,
    branch_name: `Matriz ${suffix}`,
    status: 'GENERATED',
    employee_count: suffix === 'A' ? '10' : '20',
    total_earnings: suffix === 'A' ? '10000.00' : '20000.00',
    total_deductions: suffix === 'A' ? '1000.00' : '2000.00',
    total_net: suffix === 'A' ? '9000.00' : '18000.00',
  };
}

function statusTotalsForRun(payrollRunId: string): Record<string, unknown> {
  const suffix = payrollRunId === payrollRunA ? 'A' : 'B';
  return {
    label: `Ativo ${suffix}`,
    employee_count: suffix === 'A' ? '10' : '20',
    total_earnings: suffix === 'A' ? '10000.00' : '20000.00',
    total_deductions: suffix === 'A' ? '1000.00' : '2000.00',
    total_net: suffix === 'A' ? '9000.00' : '18000.00',
  };
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
