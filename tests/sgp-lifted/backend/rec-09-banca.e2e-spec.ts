import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { CognitoJwtService } from '../../backend/src/auth/cognito-jwt.service';
import { DatabaseService } from '../../backend/src/database/database.service';

const tenantId = '00000000-0000-4000-8000-000000000001';
const concursoId = '00000000-0000-4000-8000-000000000911';
const documentId = '00000000-0000-4000-8000-000000000912';
const memberIds = [
  '00000000-0000-4000-8000-000000000913',
  '00000000-0000-4000-8000-000000000914',
  '00000000-0000-4000-8000-000000000915',
];

class FakeRec09Database {
  readonly configured = true;
  document = {
    tenant_id: tenantId,
    id: documentId,
    concurso_id: concursoId,
    kind: 'GABARITO',
    source_ref: 'rec-09-gabarito-final',
    content_hash: '0'.repeat(64),
    format: 'PADES',
    signed_payload: Buffer.from('{}'),
    status: 'DRAFT',
    published_at: null as Date | null,
    public_verify_token: 'rec09-public-token',
  };
  members = memberIds.map((id, index) => ({
    tenant_id: tenantId,
    id,
    concurso_id: concursoId,
    full_name: `Assinante ${index + 1}`,
    cpf: `1234567890${index}`,
    role: index === 0 ? 'PRESIDENTE' : 'MEMBRO',
    cert_kind: 'ICP_A1',
    cert_subject_dn: `CN=Assinante ${index + 1}`,
    cert_serial: `SERIAL-${index + 1}`,
    active: true,
  }));
  signatures: Array<Record<string, unknown>> = [];

  async query<T>(sql: string, values: unknown[] = []): Promise<T[]> {
    if (sql.includes('INSERT INTO recrutamento.signed_document')) {
      this.document = {
        ...this.document,
        content_hash: values[3] as string,
        signed_payload: values[5] as Buffer,
        public_verify_token: values[6] as string,
      };
      return [this.document] as T[];
    }
    if (sql.includes('UPDATE recrutamento.signed_document')) {
      this.document = {
        ...this.document,
        status: 'PUBLISHED',
        published_at: new Date('2026-05-02T14:00:00.000Z'),
      };
      return [this.document] as T[];
    }
    if (sql.includes('WHERE public_verify_token')) {
      return [this.document] as T[];
    }
    if (sql.includes('FROM recrutamento.document_signature ds')) {
      return this.signatureRows() as T[];
    }
    return [] as T[];
  }

  async transaction<T>(
    callback: (client: { query: jest.Mock }) => Promise<T>,
  ): Promise<T> {
    const client = {
      query: jest.fn(async (sql: string, values: unknown[] = []) => {
        if (sql.includes('FOR UPDATE') && sql.includes('signed_document')) {
          return { rows: [this.document] };
        }
        if (sql.includes('FOR UPDATE') && sql.includes('banca_membro')) {
          return {
            rows: [this.members.find((member) => member.id === values[1])],
          };
        }
        if (sql.includes('FROM recrutamento.document_signature ds')) {
          return { rows: this.signatureRows() };
        }
        if (sql.includes('INSERT INTO recrutamento.document_signature')) {
          this.signatures.push({
            id: `sig-${this.signatures.length + 1}`,
            banca_membro_id: values[2],
            signed_at: new Date('2026-05-02T13:00:00.000Z'),
            signature_value: values[3],
            signature_order: values[6],
          });
          return { rows: [] };
        }
        if (sql.includes('UPDATE recrutamento.signed_document')) {
          this.document = {
            ...this.document,
            signed_payload: values[2] as Buffer,
            content_hash: values[3] as string,
            status: values[4] as string,
          };
          return { rows: [this.document] };
        }
        return { rows: [] };
      }),
    };
    return callback(client);
  }

  private signatureRows() {
    return this.signatures.map((signature) => {
      const member = this.members.find(
        (candidate) => candidate.id === signature.banca_membro_id,
      );
      return { ...signature, ...member };
    });
  }
}

describe('REC-09 certificacao digital da banca', () => {
  let app: INestApplication<SupertestApp>;
  let database: FakeRec09Database;

  beforeEach(async () => {
    database = new FakeRec09Database();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CognitoJwtService)
      .useValue({
        verifyAuthorizationHeader: jest.fn(async () => ({
          sub: 'banca-user',
          username: 'banca-user',
          tenantId,
          groups: [],
          permissions: ['recrutamento.banca.read', 'recrutamento.banca.write'],
        })),
      })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a final answer key document, signs with 3 members, publishes, and verifies publicly', async () => {
    const auth = { Authorization: 'Bearer fake' };
    await request(app.getHttpServer())
      .post('/api/v1/recrutamento/banca/documentos')
      .set(auth)
      .send({
        concursoId,
        kind: 'GABARITO',
        sourceRef: 'rec-09-gabarito-final',
        format: 'PADES',
        payloadBase64: Buffer.from('%PDF-1.7 final answer key').toString(
          'base64',
        ),
      })
      .expect(201);

    for (const bancaMembroId of memberIds) {
      await request(app.getHttpServer())
        .post(`/api/v1/recrutamento/banca/documentos/${documentId}/signatures`)
        .set(auth)
        .send({ bancaMembroId })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post(`/api/v1/recrutamento/banca/documentos/${documentId}/publicacao`)
      .set(auth)
      .send({})
      .expect(201);

    const verified = await request(app.getHttpServer())
      .get(
        `/api/v1/publico/banca/verify/${database.document.public_verify_token}`,
      )
      .expect(200);

    expect(verified.body.valid).toBe(true);
    expect(verified.body.signers).toHaveLength(3);
    expect(JSON.stringify(verified.body)).not.toContain('123456789');
  });
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
