import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AuditService } from '../../backend/src/audit/audit.service';
import { DatabaseService } from '../../backend/src/database/database.service';
import { TceModule } from '../../backend/src/tce/tce.module';
import { audespLayoutFields } from '../../backend/src/tce/adapters/audesp-sp/testing/audesp-fixtures';

describe('TCE-03 AUDESP/SP stub adapter (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ TCE_STUB_MODE: 'true' })],
        }),
        TceModule.register(),
      ],
    })
      .overrideProvider(DatabaseService)
      .useValue(new FakeAudespDatabase())
      .overrideProvider(AuditService)
      .useValue({ auditMutation: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('creates, validates, and submits an approved monthly payroll run in stub mode', async () => {
    const created = await request(app.getHttpServer() as SupertestApp)
      .post('/v1/tce/audesp-sp/submissions')
      .send({ payrollRunId: payrollRunId() })
      .expect(201);

    expect(created.body).toEqual(
      expect.objectContaining({
        adapterId: 'audesp-sp',
        payrollRunId: payrollRunId(),
        status: 'DRAFT',
      }),
    );

    const validated = await request(app.getHttpServer() as SupertestApp)
      .post(`/v1/tce/audesp-sp/submissions/${created.body.id}/validate`)
      .expect(201);

    expect(validated.body.validationErrors).toEqual([]);
    expect(validated.body.status).toBe('VALIDATED');

    const submitted = await request(app.getHttpServer() as SupertestApp)
      .post(`/v1/tce/audesp-sp/submissions/${created.body.id}/submit`)
      .expect(201);

    expect(submitted.body).toEqual(
      expect.objectContaining({
        status: 'STUB_OK',
        envelopeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        responsePayload: expect.objectContaining({ accepted: true }),
      }),
    );
  });
});

class FakeAudespDatabase {
  readonly configured = true;
  private submission = {
    id: '00000000-0000-4000-8000-00000000a003',
    tenant_id: tenantId(),
    adapter_id: 'audesp-sp',
    layout_version_id: layoutId(),
    payroll_run_id: payrollRunId(),
    competence_year: 2026,
    competence_month: 4,
    envelope_xml_uri: null,
    envelope_hash: null,
    request_size_bytes: null,
    status: 'DRAFT',
    validation_errors: [],
    response_payload: {},
    response_hash: null,
    submitted_at: null,
    response_at: null,
  };
  private queue = {
    id: '00000000-0000-4000-8000-00000000a004',
    tenant_id: tenantId(),
    submission_id: '00000000-0000-4000-8000-00000000a003',
    adapter_id: 'audesp-sp',
    endpoint_url: 'stub://audesp-sp',
    state_code: 'SP',
    competence_year: 2026,
    competence_month: 4,
    status: 'PENDING',
    attempts: 0,
    max_attempts: 5,
    next_attempt_at: '2026-05-02T00:00:00.000Z',
    locked_by: null,
    locked_at: null,
    last_error_kind: null,
    last_error_payload: null,
    created_at: '2026-05-02T00:00:00.000Z',
    updated_at: '2026-05-02T00:00:00.000Z',
  };

  async query<T>(sql: string, values: readonly unknown[] = []): Promise<T[]> {
    if (sql.includes('INSERT INTO tce.adapter_registry')) {
      return [
        {
          id: 'registry',
          adapter_id: values[0],
          state_code: values[1],
          municipal_code: null,
          organ_kind: values[2],
          version: values[3],
          status: 'REGISTERED',
          capabilities: values[4],
          registered_at: '2026-05-02T00:00:00.000Z',
          last_health_check_at: values[5],
          last_health_status: values[6],
        },
      ] as T[];
    }
    if (sql.includes('INSERT INTO tce.adapter_lifecycle_event'))
      return [] as T[];
    if (sql.includes('FROM tce.adapter_registry')) return [] as T[];
    if (sql.includes('FROM tce.layout_version layout')) {
      return [{ id: layoutId(), version: '0.0.1' }] as T[];
    }
    if (sql.includes('FROM payroll.payroll_run run')) {
      return [
        {
          id: payrollRunId(),
          tenant_id: tenantId(),
          status: 'APPROVED',
          competence_year: 2026,
          competence_month: 4,
          organization_code: '3550308',
        },
      ] as T[];
    }
    if (sql.includes('FROM payroll.v_payroll_run_line_active item')) {
      return payrollItems() as T[];
    }
    if (sql.includes('FROM tce.layout_field')) {
      return audespLayoutFields().map((field) => ({
        field_path: field.fieldPath,
        data_type: field.dataType,
        required: field.required,
        max_length: field.maxLength,
        decimal_precision: field.decimalPrecision,
        decimal_scale: field.decimalScale,
      })) as T[];
    }
    if (sql.includes('UPDATE tce.submission') && values[1] === 'VALIDATED') {
      this.submission = {
        ...this.submission,
        status: 'VALIDATED',
        validation_errors: JSON.parse(String(values[2])),
      };
      return [this.submission] as T[];
    }
    if (sql.includes('UPDATE tce.submission') && values[1] === 'STUB_OK') {
      this.submission = {
        ...this.submission,
        status: 'STUB_OK',
        envelope_xml_uri: String(values[2]),
        envelope_hash: String(values[3]),
        request_size_bytes: Number(values[4]),
        response_payload: JSON.parse(String(values[5])) as Record<
          string,
          unknown
        >,
        response_hash: String(values[6]),
        submitted_at: String(values[7]),
        response_at: String(values[7]),
      };
      return [this.submission] as T[];
    }
    if (sql.includes('INSERT INTO tce.submission_queue')) {
      this.queue = {
        ...this.queue,
        tenant_id: String(values[0]),
        submission_id: String(values[1]),
        adapter_id: String(values[2]),
        endpoint_url: values[3] === null ? null : String(values[3]),
      };
      return [{ id: this.queue.id }] as T[];
    }
    if (sql.includes('tce.submission_queue')) {
      return [this.queue] as T[];
    }
    if (sql.includes('INSERT INTO tce.submission')) {
      this.submission = { ...this.submission, status: 'DRAFT' };
      return [this.submission] as T[];
    }
    if (sql.includes('FROM tce.submission')) {
      return [this.submission] as T[];
    }
    return [] as T[];
  }
}

function tenantId(): string {
  return '00000000-0000-0000-0000-000000000100';
}

function layoutId(): string {
  return '00000000-0000-4000-8000-00000000a002';
}

function payrollRunId(): string {
  return '00000000-0000-4000-8000-000000001200';
}

function payrollItems() {
  return [
    item(
      '00000000-0000-4000-8000-000000000001',
      'MAT-001',
      '11122233344',
      'Analista',
      'EARNING',
      '3000.00',
    ),
    item(
      '00000000-0000-4000-8000-000000000001',
      'MAT-001',
      '11122233344',
      'Analista',
      'DEDUCTION',
      '330.00',
    ),
    item(
      '00000000-0000-4000-8000-000000000002',
      'MAT-002',
      '22233344405',
      'Professor',
      'EARNING',
      '4200.00',
    ),
    item(
      '00000000-0000-4000-8000-000000000002',
      'MAT-002',
      '22233344405',
      'Professor',
      'DEDUCTION',
      '245.50',
    ),
  ];
}

function item(
  employeeId: string,
  registration: string,
  cpf: string,
  positionName: string,
  entryKind: string,
  amount: string,
) {
  return {
    employee_id: employeeId,
    registration,
    cpf,
    position_name: positionName,
    entry_kind: entryKind,
    amount,
  };
}
