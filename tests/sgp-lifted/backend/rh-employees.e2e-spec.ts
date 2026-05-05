import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { DatabaseService } from '../../backend/src/database/database.service';

function encodePart(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function token(): string {
  const payload = {
    sub: 'rh-user',
    'cognito:username': 'rh.user',
    'cognito:groups': ['RH'],
    'custom:tenant_id': '00000000-0000-0000-0000-000000000100',
    exp: Math.floor(Date.now() / 1000) + 3600,
    token_use: 'access',
  };
  return `${encodePart({ alg: 'none', typ: 'JWT' })}.${encodePart(payload)}.`;
}

class FakeRhEmployeeDatabaseService {
  readonly configured = true;
  private employee = {
    id: '00000000-0000-4000-8000-000000000001',
    registration: 'MAT-001',
    name: 'Servidor HR01',
    cpf: '00011122233',
    email: 'servidor@example.test',
    lifecycle_status: 'ACTIVE',
    functional_status: 'Em exercicio',
    branch_name: null,
    branch_id: null,
    active: true,
    abono_permanencia_ativo: false,
    abono_permanencia_inicio: null as Date | null,
    abono_permanencia_fundamento: null as string | null,
    version: 0,
    created_at: new Date('2026-05-01T00:00:00.000Z'),
    updated_at: new Date('2026-05-01T00:00:00.000Z'),
  };

  query<T>(sql: string, values: readonly unknown[] = []): Promise<T[]> {
    if (sql.includes('SELECT DISTINCT p.key')) {
      return Promise.resolve(
        [
          'auth.read',
          'rh.read',
          'rh.write',
          'rh.employee.read',
          'rh.employee.write',
          'rh.employee.admit',
          'rh.employee.terminate',
          'rh.employee.abono.write',
        ].map((key) => ({ key })) as T[],
      );
    }
    if (sql.includes('SELECT public.sgp_append_audit_event')) {
      return Promise.resolve([] as T[]);
    }
    if (
      sql.includes('abono_permanencia_ativo AS active') &&
      sql.includes('FROM hr.employee')
    ) {
      return Promise.resolve([
        {
          id: this.employee.id,
          active: this.employee.abono_permanencia_ativo,
          starts_on: this.employee.abono_permanencia_inicio,
          legal_basis: this.employee.abono_permanencia_fundamento,
          version: this.employee.version,
          updated_at: this.employee.updated_at,
        },
      ] as T[]);
    }
    if (
      sql.includes('SELECT count(*)::text AS total') &&
      sql.includes('FROM hr.employee')
    ) {
      return Promise.resolve([{ total: '1' }] as T[]);
    }
    if (
      sql.includes('FROM hr.employee e') &&
      sql.includes('ORDER BY e.registration ASC')
    ) {
      return Promise.resolve([this.employee] as T[]);
    }
    return Promise.resolve([] as T[]);
  }

  async transaction<T>(
    callback: (client: {
      query: <R>(
        sql: string,
        values?: readonly unknown[],
      ) => Promise<{ rows: R[] }>;
    }) => Promise<T>,
  ): Promise<T> {
    return callback({ query: this.clientQuery.bind(this) });
  }

  private clientQuery<T>(
    sql: string,
    _values: readonly unknown[] = [],
  ): Promise<{ rows: T[] }> {
    if (sql.includes('INSERT INTO hr.functional_status')) {
      return Promise.resolve({ rows: [{ id: 'status-1' }] as T[] });
    }
    if (sql.includes('INSERT INTO hr.employment_link')) {
      return Promise.resolve({ rows: [{ id: 'link-1' }] as T[] });
    }
    if (sql.includes('INSERT INTO hr.contract_type')) {
      return Promise.resolve({ rows: [{ id: 'contract-type-1' }] as T[] });
    }
    if (sql.includes('SELECT version') && sql.includes('FROM hr.employee')) {
      return Promise.resolve({
        rows: [{ version: this.employee.version }] as T[],
      });
    }
    if (sql.includes('WITH created_employee AS')) {
      return Promise.resolve({
        rows: [{ ...this.employee, contract_id: 'contract-1' }] as T[],
      });
    }
    if (sql.includes('UPDATE hr.employee')) {
      if (sql.includes('abono_permanencia_ativo')) {
        const active = Boolean(_values[1]);
        this.employee = {
          ...this.employee,
          abono_permanencia_ativo: active,
          abono_permanencia_inicio: active
            ? new Date(String(_values[2]))
            : null,
          abono_permanencia_fundamento:
            typeof _values[3] === 'string' && _values[3] ? _values[3] : null,
          version: this.employee.version + 1,
          updated_at: new Date('2026-05-01T00:01:00.000Z'),
        };
        return Promise.resolve({
          rows: [
            {
              id: this.employee.id,
              active: this.employee.abono_permanencia_ativo,
              starts_on: this.employee.abono_permanencia_inicio,
              legal_basis: this.employee.abono_permanencia_fundamento,
              audit_event_id: 'audit-1',
              version: this.employee.version,
              updated_at: this.employee.updated_at,
            },
          ] as T[],
        });
      }
      this.employee = {
        ...this.employee,
        lifecycle_status: 'TERMINATED',
        functional_status: 'Desligamento',
        active: false,
      };
      return Promise.resolve({ rows: [this.employee] as T[] });
    }
    if (
      sql.includes('FROM hr.employee e') &&
      sql.includes('WHERE e.id = $1::uuid')
    ) {
      return Promise.resolve({ rows: [this.employee] as T[] });
    }
    if (sql.includes('FROM hr.employee_status_history')) {
      return Promise.resolve({
        rows: [
          {
            id: 'history-1',
            functional_status: this.employee.functional_status,
            starts_on: new Date('2026-05-01T00:00:00.000Z'),
            ends_on: null,
            notes: 'HR01',
          },
        ] as T[],
      });
    }
    if (sql.includes('FROM hr.employment_contract')) {
      return Promise.resolve({
        rows: [
          {
            id: 'contract-1',
            starts_on: new Date('2026-05-01T00:00:00.000Z'),
            ends_on: this.employee.active
              ? null
              : new Date('2026-05-20T00:00:00.000Z'),
            status: this.employee.active ? 'ACTIVE' : 'INACTIVE',
          },
        ] as T[],
      });
    }
    return Promise.resolve({ rows: [] as T[] });
  }
}

describe('RH employees lifecycle (e2e)', () => {
  let app: INestApplication;
  const originalUnsigned = process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS;

  beforeEach(async () => {
    process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS = 'true';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useClass(FakeRhEmployeeDatabaseService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    if (originalUnsigned === undefined)
      delete process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS;
    else process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS = originalUnsigned;
  });

  function server(): SupertestApp {
    return app.getHttpAdapter().getInstance() as SupertestApp;
  }

  it('admits, reads dossier, and terminates an employee', async () => {
    const bearer = `Bearer ${token()}`;
    const admitted = await request(server())
      .post('/api/v1/funcionarios')
      .set('authorization', bearer)
      .send({
        registration: 'MAT-001',
        name: 'Servidor HR01',
        hiredOn: '2026-05-01',
      })
      .expect(201);

    expect(admitted.body.employeeId).toBe(
      '00000000-0000-4000-8000-000000000001',
    );
    expect(admitted.body.employmentContractId).toBe('contract-1');

    await request(server())
      .get('/api/v1/funcionarios/00000000-0000-4000-8000-000000000001/dossie')
      .set('authorization', bearer)
      .expect(200)
      .expect((response) => {
        expect(response.body.statusHistory).toHaveLength(1);
      });

    await request(server())
      .post(
        '/api/v1/funcionarios/00000000-0000-4000-8000-000000000001/desligamento',
      )
      .set('authorization', bearer)
      .send({
        terminationDate: '2026-05-20',
        terminationReasonId: '00000000-0000-4000-8000-000000000099',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.employee.lifecycleStatus).toBe('TERMINATED');
      });
  });

  it('returns 412 when two editors submit the same cadastro version', async () => {
    const bearer = `Bearer ${token()}`;
    const employeeUrl =
      '/api/v1/funcionarios/00000000-0000-4000-8000-000000000001/abono-permanencia';

    const firstRead = await request(server())
      .get(employeeUrl)
      .set('authorization', bearer)
      .expect(200);

    expect(firstRead.headers.etag).toBe('"0"');

    await request(server())
      .post(employeeUrl)
      .set('authorization', bearer)
      .set('if-match', firstRead.headers.etag)
      .send({
        active: true,
        startsOn: '2026-05-01',
        legalBasis: 'EC 41/2003 art. 3 paragraph 1',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.version).toBe(1);
      });

    await request(server())
      .post(employeeUrl)
      .set('authorization', bearer)
      .set('if-match', firstRead.headers.etag)
      .send({ active: false })
      .expect(412);
  });
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
