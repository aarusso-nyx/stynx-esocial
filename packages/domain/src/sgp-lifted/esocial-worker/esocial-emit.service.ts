import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { QueryResultRow } from 'pg';

import { RequestContextStore } from '../common/request-context/request-context.store';
import { DatabaseService } from '../database/database.service';
import { CertificateStoreService } from './certificate-store/certificate-store.service';
import { IcpSignerService } from './signature/icp-signer.service';
import {
  XsdValidationResult,
  XsdValidatorService,
} from './xsd/xsd-validator.service';

interface EmittedEventRow extends QueryResultRow {
  id: string;
  event_type: string;
  reference: string;
  competence: string;
  status: string;
  created_at: Date | string;
}

export interface EmitESocialInput {
  tenantId: string;
  eventKind: string;
  xml: string;
  reference?: string;
  competence?: string;
  sourceEntityKind?: string;
  sourceEntityId?: string;
  payrollRunId?: string;
  paymentBatchId?: string;
  xmlHash?: string;
  payload?: Record<string, unknown>;
}

export interface EmittedESocialEvent {
  id: string;
  eventKind: string;
  reference: string;
  competence: string;
  status: string;
  createdAt: string;
}

const EMIT_PERMISSIONS = [
  'esocial.event.write',
  'esocial.certificate.read',
  'esocial.certificate.write',
  'folha.write',
] as const;

@Injectable()
export class ESocialEmitService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly xsdValidator: XsdValidatorService,
    private readonly signer: IcpSignerService,
    private readonly certificateStore: CertificateStoreService,
  ) {}

  async emit(input: EmitESocialInput): Promise<EmittedESocialEvent> {
    this.ensureDatabase();
    return RequestContextStore.run(
      {
        tenantId: input.tenantId,
        permissions: [...EMIT_PERMISSIONS],
      },
      async () => this.emitWithinContext(input),
    );
  }

  private async emitWithinContext(
    input: EmitESocialInput,
  ): Promise<EmittedESocialEvent> {
    const eventKind = input.eventKind.trim().toUpperCase();
    let validation: XsdValidationResult;
    try {
      validation = this.xsdValidator.assertValid(eventKind, input.xml, {
        allowUnsigned: true,
      });
    } catch (error) {
      await this.recordValidationFailure(input, error);
      throw error;
    }

    const certificate = await this.certificateStore.activeCertificate();
    const signed = this.signer.sign({
      xml: input.xml,
      pkcs12: certificate.pkcs12,
    });
    if (signed.validTo <= new Date()) {
      throw new BadRequestException(
        'Expired eSocial certificate cannot be used for emission',
      );
    }
    this.xsdValidator.assertValid(eventKind, signed.xml);

    const rows = await this.databaseService.query<EmittedEventRow>(
      `
      INSERT INTO public.esocial_event (
        tenant_id,
        event_type,
        reference,
        competence,
        payload,
        xml_payload,
        event_kind,
        source_entity_kind,
        source_entity_id,
        payroll_run_id,
        payment_batch_id,
        xml_signed,
        xml_hash,
        schema_version,
        status,
        generated_at
      )
      VALUES (
        $1::uuid,
        $2,
        $3,
        $4,
        $5::jsonb,
        $6,
        $2,
        $7,
        $8,
        NULLIF($9, '')::uuid,
        NULLIF($10, '')::uuid,
        convert_to($6, 'UTF8'),
        $11,
        'S-1.3',
        'PENDENTE'::"ESocialEventStatus",
        now()
      )
      RETURNING
        id::text,
        event_type,
        reference,
        competence,
        status::text,
        created_at
      `,
      [
        input.tenantId,
        eventKind,
        input.reference?.trim() || this.eventReference(input.xml),
        input.competence ?? this.competenceFromXml(input.xml),
        JSON.stringify({
          ...(input.payload ?? {}),
          emitHub: {
            xsdPath: validation.xsdPath,
            certificateId: certificate.certificateId,
            certificateAlias: certificate.alias,
            signedAt: new Date().toISOString(),
          },
        }),
        signed.xml,
        input.sourceEntityKind ?? null,
        input.sourceEntityId ?? null,
        input.payrollRunId ?? '',
        input.paymentBatchId ?? '',
        input.xmlHash ?? this.sha256(input.xml),
      ],
    );

    const event = rows[0]!;
    await this.databaseService.query(
      `
      SELECT public.sgp_append_audit_event(
        'CREATE',
        'esocial.event',
        $1,
        NULL,
        NULL,
        NULL,
        'public.esocial_event',
        NULL,
        $2::jsonb,
        NULL,
        NULL,
        NULL
      )
      `,
      [
        event.id,
        JSON.stringify({
          eventKind,
          schemaVersion: 'S-1.3',
          certificateId: certificate.certificateId,
        }),
      ],
    );

    return {
      id: event.id,
      eventKind: event.event_type,
      reference: event.reference,
      competence: event.competence,
      status: event.status,
      createdAt: new Date(event.created_at).toISOString(),
    };
  }

  private async recordValidationFailure(
    input: EmitESocialInput,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.databaseService.query(
      `
      INSERT INTO esocial.xsd_validation_failure (
        tenant_id,
        event_kind,
        xsd_path,
        error_xml_pointer,
        error_message
      )
      VALUES ($1::uuid, $2, $3, $4, $5)
      `,
      [
        input.tenantId,
        input.eventKind.trim().toUpperCase(),
        '',
        '/eSocial',
        message.slice(0, 1000),
      ],
    );
  }

  private eventReference(xml: string): string {
    return xml.match(/\sId="([^"]+)"/)?.[1] ?? 'esocial-event';
  }

  private competenceFromXml(xml: string): string {
    return xml.match(/<iniValid>(\d{4}-\d{2})<\/iniValid>/)?.[1] ?? '2026-01';
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private ensureDatabase(): void {
    if (!this.databaseService.configured) {
      throw new ServiceUnavailableException(
        'DATABASE_URL is required for eSocial emission',
      );
    }
  }
}
