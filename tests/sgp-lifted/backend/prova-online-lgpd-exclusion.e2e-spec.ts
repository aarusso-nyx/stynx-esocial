import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { CognitoJwtService } from '../../backend/src/auth/cognito-jwt.service';
import { DatabaseService } from '../../backend/src/database/database.service';

const sessionId = '00000000-0000-4000-8000-000000000841';

class FakeExclusionDatabase {
  readonly configured = true;

  constructor(private readonly retentionOpen: boolean) {}

  async query<T>(): Promise<T[]> {
    return [] as T[];
  }

  async transaction<T>(
    callback: (client: { query: jest.Mock }) => Promise<T>,
  ): Promise<T> {
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('retention_until >')) {
          return {
            rows: this.retentionOpen
              ? [{ retention_until: new Date('2031-05-02T00:00:00.000Z') }]
              : [],
          };
        }
        if (sql.includes('DELETE FROM recrutamento.proctoring_artifact')) {
          return { rows: [{ ok: 1 }, { ok: 1 }], rowCount: 2 };
        }
        return { rows: [] };
      }),
    };
    return callback(client);
  }
}

describe('REC-08 LGPD artifact exclusion', () => {
  async function createApp(retentionOpen: boolean) {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CognitoJwtService)
      .useValue({
        verifyAuthorizationHeader: jest.fn(async () => ({
          sub: 'candidate',
          username: 'candidate',
          tenantId: '00000000-0000-4000-8000-000000000001',
          groups: [],
          permissions: ['recrutamento.exam.write'],
        })),
      })
      .overrideProvider(DatabaseService)
      .useValue(new FakeExclusionDatabase(retentionOpen))
      .compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    return app;
  }

  it('keeps deletion pending before retention expiry and deletes after legal retention', async () => {
    const pendingApp = await createApp(true);
    try {
      const pending = await request(pendingApp.getHttpServer() as SupertestApp)
        .delete(
          `/api/v1/recrutamento/prova-online/sessions/${sessionId}/artifacts`,
        )
        .set('Authorization', 'Bearer fake')
        .expect(200);
      expect(pending.body.status).toBe('PENDING');
      expect(pending.body.legalBasis).toContain('public contest');
    } finally {
      await pendingApp.close();
    }

    const deletionApp = await createApp(false);
    try {
      const deleted = await request(deletionApp.getHttpServer() as SupertestApp)
        .delete(
          `/api/v1/recrutamento/prova-online/sessions/${sessionId}/artifacts`,
        )
        .set('Authorization', 'Bearer fake')
        .expect(200);
      expect(deleted.body).toEqual({ status: 'DELETED', deleted: 2 });
    } finally {
      await deletionApp.close();
    }
  });
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
