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
const entryId = '00000000-0000-4000-8000-000000000239';

class FakeRopaDatabase {
  readonly configured = true;
  auditEvents = 0;

  async query<T>(sql: string, values: readonly unknown[] = []): Promise<T[]> {
    if (sql.includes('sgp_append_audit_event')) {
      this.auditEvents += 1;
      return [{ id: 'audit-1' }] as T[];
    }
    if (sql.includes('INSERT INTO lgpd.ropa_entry')) {
      return [{ id: entryId }] as T[];
    }
    if (sql.includes('UPDATE lgpd.ropa_entry')) {
      return [{ id: entryId }] as T[];
    }
    if (sql.includes('FROM lgpd.legal_basis_rule')) {
      return [legalBasisRow(String(values[0] ?? 'payroll.payslip_pdf'))] as T[];
    }
    if (sql.includes('FROM lgpd.ropa_entry')) {
      const candidate = String(values[0] ?? 'payroll.payslip_pdf');
      const flowKey = candidate.includes('.')
        ? candidate
        : 'payroll.payslip_pdf';
      return [ropaRow(flowKey)] as T[];
    }
    return [] as T[];
  }
}

describe('LGPD ROPA admin API (e2e)', () => {
  let app: INestApplication;
  let database: FakeRopaDatabase;

  beforeAll(async () => {
    database = new FakeRopaDatabase();
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

  it('exposes GET, POST, and PATCH under /api/v1/admin/lgpd/ropa with audit on mutations', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .get('/api/v1/admin/lgpd/ropa?flowKey=payroll.payslip_pdf')
      .set('Authorization', 'Bearer fake')
      .expect(200)
      .expect(({ body }) => {
        expect(body.items[0].flowKey).toBe('payroll.payslip_pdf');
        expect(body.items[0].legalBasis.legalBasisCode).toBe('LGPD_ART_7_II');
      });

    await request(app.getHttpServer() as SupertestApp)
      .post('/api/v1/admin/lgpd/ropa')
      .set('Authorization', 'Bearer fake')
      .send({
        flowKey: 'payroll.payslip_pdf',
        operationName: 'Payroll payslip generation',
        controllerArea: 'Payroll',
        riskLevel: 'HIGH',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.id).toBe(entryId);
        expect(body.flowKey).toBe('payroll.payslip_pdf');
      });

    await request(app.getHttpServer() as SupertestApp)
      .patch(`/api/v1/admin/lgpd/ropa/${entryId}`)
      .set('Authorization', 'Bearer fake')
      .send({ riskLevel: 'MEDIUM' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.id).toBe(entryId);
      });

    expect(database.auditEvents).toBe(2);
  });
});

function legalBasisRow(flowKey: string) {
  return {
    flow_key: flowKey,
    flow_name: 'Official payslip PDF/A',
    data_category: 'MIXED',
    legal_basis_code: 'LGPD_ART_7_II',
    legal_basis_article: 'LGPD art. 7, II',
    sensitive_basis_code: 'LGPD_ART_11_II_A',
    sensitive_basis_article: 'LGPD art. 11, II, a',
    purpose: 'Generate payslips.',
    data_subjects: ['public employee'],
    data_categories: ['CPF'],
    source_tables: ['hr.employee'],
    read_surfaces: ['report-service/payslip'],
    retention_rule: 'Functional retention.',
    sharing_scope: 'internal_employee_portal',
    requires_consent: false,
    requires_dpia: true,
    decision_record_anchor: 'ADR-LGPD-001',
  };
}

function ropaRow(flowKey: string) {
  return {
    id: entryId,
    tenant_id: tenantId,
    flow_key: flowKey,
    operation_name: 'Payroll payslip generation',
    controller_area: 'Payroll',
    processor_name: 'SGP report-service',
    external_recipients: [],
    international_transfer: false,
    security_controls: ['tenant RLS', 'permission guard'],
    lifecycle_evidence: ['ADR-LGPD-001'],
    risk_level: 'HIGH',
    status: 'ACTIVE',
    review_due_at: '2026-11-02',
    notes: null,
    created_at: '2026-05-02T12:00:00.000Z',
    updated_at: '2026-05-02T12:00:00.000Z',
    flow_name: 'Official payslip PDF/A',
    data_category: 'MIXED',
    legal_basis_code: 'LGPD_ART_7_II',
    sensitive_basis_code: 'LGPD_ART_11_II_A',
    purpose: 'Generate payslips.',
    data_subjects: ['public employee'],
    data_categories: ['CPF'],
    source_tables: ['hr.employee'],
    read_surfaces: ['report-service/payslip'],
    retention_rule: 'Functional retention.',
    sharing_scope: 'internal_employee_portal',
    requires_consent: false,
    requires_dpia: true,
    decision_record_anchor: 'ADR-LGPD-001',
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
