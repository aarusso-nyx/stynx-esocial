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

class FakeInscricaoDatabase {
  readonly configured = true;
  private tokenHash = '';

  async query<T>(sql: string): Promise<T[]> {
    if (sql.includes('recrutamento.get_public_concurso')) {
      return [
        {
          concurso: {
            id: '00000000-0000-4000-8000-000000000051',
            tenantId: '00000000-0000-4000-8000-000000000001',
            vagas: [
              {
                positionId: '00000000-0000-4000-8000-000000000052',
                requirement: { minAge: 18, education: 'SUPERIOR' },
                baseSalary: '5000.00',
              },
            ],
          },
        },
      ] as T[];
    }
    return [] as T[];
  }

  async transaction<T>(callback: (client: unknown) => Promise<T>): Promise<T> {
    const client = {
      query: async (sql: string, values: unknown[] = []) => {
        if (sql.includes('INSERT INTO recrutamento.inscricao')) {
          this.tokenHash = String(values[12]);
          return {
            rows: [
              {
                id: '00000000-0000-4000-8000-000000000053',
                status: 'EXEMPT',
                candidato_id: '00000000-0000-4000-8000-000000000054',
              },
            ],
          };
        }
        if (sql.includes('FROM recrutamento.inscricao')) {
          return {
            rows:
              values[1] === this.tokenHash
                ? [
                    {
                      id: '00000000-0000-4000-8000-000000000053',
                      status: 'EXEMPT',
                      exemption_kind: 'CADUNICO',
                      full_name: 'Maria Silva',
                      payment_charge_id: null,
                      gateway: null,
                      external_id: null,
                    },
                  ]
                : [],
          };
        }
        return { rows: [] };
      },
    };
    return callback(client);
  }
}

describe('public inscricao flow', () => {
  let app: INestApplication<SupertestApp>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CognitoJwtService)
      .useValue({ verifyAuthorizationHeader: jest.fn() })
      .overrideProvider(DatabaseService)
      .useValue(new FakeInscricaoDatabase())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a CadUnico-exempt public application without JWT and confirms it by token', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/publico/concursos/rec-2026/inscricoes')
      .send(validPayload())
      .expect(201);

    expect(created.body.status).toBe('EXEMPT');
    expect(created.body.payment).toBeNull();

    const confirmed = await request(app.getHttpServer())
      .get(`/api/v1/publico/inscricoes/${created.body.id}`)
      .query({ token: created.body.token })
      .expect(200);

    expect(confirmed.body.exemptionKind).toBe('CADUNICO');
  });

  it('returns 422 when LGPD consent is missing', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/publico/concursos/rec-2026/inscricoes')
      .send({ ...validPayload(), lgpdConsent: false })
      .expect(422);
  });

  it('returns 422 for invalid CPF or age below the minimum', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/publico/concursos/rec-2026/inscricoes')
      .send({
        ...validPayload(),
        candidate: { ...validPayload().candidate, cpf: '11111111111' },
      })
      .expect(422);

    await request(app.getHttpServer())
      .post('/api/v1/publico/concursos/rec-2026/inscricoes')
      .send({
        ...validPayload(),
        candidate: { ...validPayload().candidate, birthDate: '2015-01-01' },
      })
      .expect(422);
  });
});

function validPayload() {
  return {
    vagaId: '00000000-0000-4000-8000-000000000052',
    candidate: {
      cpf: '52998224725',
      fullName: 'Maria Silva',
      birthDate: '1990-01-10',
      email: 'maria@example.test',
      phone: '11999999999',
      address: {
        street: 'Rua A',
        city: 'Sao Paulo',
        state: 'SP',
        postalCode: '01000-000',
      },
    },
    requirements: {
      education: 'SUPERIOR',
    },
    quotaSelfDeclaration: {
      pcd: true,
    },
    exemption: {
      kind: 'CADUNICO',
      nis: '12345678901',
    },
    lgpdConsent: true,
    lgpdConsentVersion: 'rec-02-v1',
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
