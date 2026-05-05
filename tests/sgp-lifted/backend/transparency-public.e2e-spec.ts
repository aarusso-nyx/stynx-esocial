import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { DatabaseService } from '../../backend/src/database/database.service';
import { PublicoModule } from '../../backend/src/publico/publico.module';

const goldenDir = join(
  __dirname,
  'golden',
  'transparency',
  'public-payroll-v01',
);
const transparencyFixture = readJson<TransparencyGoldenInput>(
  join(goldenDir, 'input.json'),
);
const updateGoldens = process.env.SGP_UPDATE_R3_016_GOLDENS === '1';

class FakeTransparencyDatabase {
  readonly configured = true;
  readonly queries: string[] = [];

  query<T>(sql: string): Promise<T[]> {
    this.queries.push(sql);
    if (sql.includes('transparency_publish_event')) {
      return Promise.resolve([
        { snapshot_hash: transparencyFixture.snapshotHash },
      ] as T[]);
    }
    if (sql.includes('count(*)::text')) {
      return Promise.resolve([
        { total: String(transparencyFixture.rows.length) },
      ] as T[]);
    }
    if (sql.includes('transparency_payroll_snapshot')) {
      return Promise.resolve(transparencyFixture.rows as T[]);
    }
    return Promise.resolve([] as T[]);
  }
}

describe('public transparency endpoints', () => {
  let app: INestApplication<SupertestApp>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PublicoModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(new FakeTransparencyDatabase())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('matches the public payroll JSON golden without protected fields', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/api/v1/public/transparency/${transparencyFixture.tenantId}/payroll`,
      )
      .expect(200);

    expect(JSON.stringify(response.body)).not.toMatch(protectedFieldPattern);
    expect(response.body).toEqual(
      expectedJson(join(goldenDir, 'expected.json'), response.body),
    );
  });

  it('matches the public payroll CSV golden without protected fields', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/api/v1/public/transparency/${transparencyFixture.tenantId}/payroll.csv`,
      )
      .expect(200);

    expect(response.text.charCodeAt(0)).toBe(0xfeff);
    expect(response.text).not.toMatch(protectedFieldPattern);
    expect(response.text).toBe(
      expectedText(join(goldenDir, 'expected.csv'), response.text),
    );
  });
});

const protectedFieldPattern = /cpf|bank|dependent|address/i;

interface TransparencyGoldenInput {
  tenantId: string;
  snapshotHash: string;
  rows: Array<Record<string, string>>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function expectedJson(path: string, actual: unknown): unknown {
  if (updateGoldens || !existsSync(path)) {
    writeExpected(path, `${JSON.stringify(actual, null, 2)}\n`);
  }
  return readJson(path);
}

function expectedText(path: string, actual: string): string {
  if (updateGoldens || !existsSync(path)) {
    writeExpected(path, actual);
  }
  return readFileSync(path, 'utf8');
}

function writeExpected(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, 'utf8');
}
