import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { CognitoJwtService } from '../../backend/src/auth/cognito-jwt.service';
import { DatabaseService } from '../../backend/src/database/database.service';

const tenantId = '00000000-0000-0000-0000-000000000100';
const incidentId = '00000000-0000-4000-8000-000000000241';
const ropaEntryId = '00000000-0000-4000-8000-000000000239';
const legalBasisRuleId = '00000000-0000-4000-8000-000000000040';

class FakeRcisDatabase {
  readonly configured = true;
  auditEvents = 0;
  incident = incidentRow();

  async query<T>(sql: string, values: readonly unknown[] = []): Promise<T[]> {
    if (sql.includes('sgp_append_audit_event')) {
      this.auditEvents += 1;
      return [{ id: 'audit-1' }] as T[];
    }
    if (sql.includes('FROM lgpd.ropa_entry entry')) {
      return [incidentSourceRow()] as T[];
    }
    if (sql.includes('INSERT INTO lgpd.security_incident')) {
      this.incident = incidentRow({
        summary: String(values[4]),
        personal_data_confirmed_at: values[6],
        anpd_due_at: values[7],
        anpd_alert_at: values[8],
        affected_data_categories: values[10],
      });
      return [{ id: incidentId }] as T[];
    }
    if (sql.includes('UPDATE lgpd.security_incident')) {
      const status = String(values[1]);
      this.incident = updateIncidentForStatus(status, this.incident, values);
      return [{ id: incidentId }] as T[];
    }
    if (sql.includes('FROM lgpd.security_incident')) {
      return [this.incident] as T[];
    }
    return [] as T[];
  }
}

describe('LGPD RCIS incident API (e2e)', () => {
  let app: INestApplication;
  let database: FakeRcisDatabase;

  beforeAll(async () => {
    database = new FakeRcisDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CognitoJwtService)
      .useValue({
        verifyAuthorizationHeader: jest.fn(async () => ({
          sub: 'admin',
          username: 'admin.local',
          tenantId,
          groups: [],
          permissions: ['auditoria.read', 'gestao.write'],
        })),
      })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('runs DETECTED -> TRIAGED -> REPORTED -> COMPLEMENTED -> CLOSED with RCIS deadlines and audit', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .post('/api/v1/admin/lgpd/incidents')
      .set('Authorization', 'Bearer fake')
      .send({
        summary: 'Credential exposure under investigation',
        flowKey: 'payroll.payslip_pdf',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.id).toBe(incidentId);
        expect(body.status).toBe('DETECTED');
      });

    await request(app.getHttpServer() as SupertestApp)
      .patch(`/api/v1/admin/lgpd/incidents/${incidentId}/triage`)
      .set('Authorization', 'Bearer fake')
      .send({
        riskRelevant: true,
        personalDataConfirmedAt: '2026-05-01T10:00:00.000Z',
        affectedDataNature: 'MIXED',
        affectedDataCategories: ['CPF', 'bank_account'],
        affectedSubjectsEstimate: 42,
        severity: 'HIGH',
        riskAssessment: 'Potential relevant risk to holders.',
        mitigationMeasures: ['credential rotation'],
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('TRIAGED');
        expect(body.anpdDueAt).toBe('2026-05-06T10:00:00.000Z');
        expect(body.anpdAlertAt).toBe('2026-05-05T10:00:00.000Z');
      });

    await request(app.getHttpServer() as SupertestApp)
      .patch(`/api/v1/admin/lgpd/incidents/${incidentId}/report`)
      .set('Authorization', 'Bearer fake')
      .send({
        reportedAt: '2026-05-06T10:00:00.000Z',
        anpdProtocol: 'ANPD-2026-001',
        controllerContact: 'dpo@example.gov.br',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('REPORTED');
        expect(body.complementDueAt).toBe('2026-06-03T10:00:00.000Z');
      });

    await request(app.getHttpServer() as SupertestApp)
      .patch(`/api/v1/admin/lgpd/incidents/${incidentId}/complement`)
      .set('Authorization', 'Bearer fake')
      .send({
        complementedAt: '2026-05-20T10:00:00.000Z',
        complementSummary:
          'Technical report and holder communications attached.',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('COMPLEMENTED');
      });

    await request(app.getHttpServer() as SupertestApp)
      .patch(`/api/v1/admin/lgpd/incidents/${incidentId}/close`)
      .set('Authorization', 'Bearer fake')
      .send({ closureReason: 'ANPD communication process completed.' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('CLOSED');
      });

    expect(database.auditEvents).toBe(5);
  });
});

function updateIncidentForStatus(
  status: string,
  current: ReturnType<typeof incidentRow>,
  values: readonly unknown[],
) {
  if (status === 'TRIAGED') {
    return {
      ...current,
      status,
      personal_data_confirmed_at: values[3],
      anpd_due_at: values[4],
      anpd_alert_at: values[5],
      affected_data_nature: values[6],
      affected_data_categories: values[7],
      affected_subjects_estimate: values[8],
      affected_children_estimate: values[9],
      affected_elderly_estimate: values[10],
      risk_relevant: values[11],
      severity: values[12],
      risk_assessment: values[13],
      mitigation_measures: values[14],
      triaged_by_ref: values[15],
    };
  }
  if (status === 'REPORTED') {
    return {
      ...current,
      status,
      anpd_reported_at: values[3],
      complement_due_at: values[4],
      anpd_protocol: values[5],
      controller_contact: values[6],
      titular_communication_summary: values[7],
      reported_by_ref: values[8],
    };
  }
  if (status === 'COMPLEMENTED') {
    return {
      ...current,
      status,
      complemented_at: values[3],
      complement_summary: values[4],
      complemented_by_ref: values[5],
    };
  }
  if (status === 'CLOSED') {
    return {
      ...current,
      status,
      closed_at: values[3],
      closure_reason: values[4],
      closed_by_ref: values[5],
    };
  }
  return { ...current, status };
}

function incidentSourceRow() {
  return {
    ropa_entry_id: ropaEntryId,
    legal_basis_rule_id: legalBasisRuleId,
    flow_key: 'payroll.payslip_pdf',
  };
}

function incidentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: incidentId,
    tenant_id: tenantId,
    ropa_entry_id: ropaEntryId,
    legal_basis_rule_id: legalBasisRuleId,
    flow_key: 'payroll.payslip_pdf',
    status: 'DETECTED',
    severity: 'MEDIUM',
    summary: 'Credential exposure under investigation',
    detected_at: '2026-05-01T09:00:00.000Z',
    personal_data_confirmed_at: null,
    anpd_due_at: null,
    anpd_alert_at: null,
    anpd_reported_at: null,
    complement_due_at: null,
    complemented_at: null,
    closed_at: null,
    affected_data_nature: null,
    affected_data_categories: [],
    affected_subjects_estimate: null,
    affected_children_estimate: null,
    affected_elderly_estimate: null,
    risk_relevant: false,
    risk_assessment: null,
    mitigation_measures: [],
    controller_contact: null,
    anpd_protocol: null,
    titular_communication_summary: null,
    complement_summary: null,
    closure_reason: null,
    created_by_ref: 'admin.local',
    triaged_by_ref: null,
    reported_by_ref: null,
    complemented_by_ref: null,
    closed_by_ref: null,
    created_at: '2026-05-01T09:00:00.000Z',
    updated_at: '2026-05-01T09:00:00.000Z',
    ropa_operation_name: 'Payroll payslip generation',
    legal_basis_data_category: 'MIXED',
    requires_dpia: true,
    sharing_scope: 'internal_employee_portal',
    ...overrides,
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
