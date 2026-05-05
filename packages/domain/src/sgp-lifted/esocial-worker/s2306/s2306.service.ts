import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { S2306Builder, S2306BuildResult } from './s2306.builder';
import { S2306Transmitter } from './s2306.transmitter';

export interface S2306EmissionResult {
  changeId: string;
  eventId: string;
  emittedEventId: string;
  status: string;
  xml: string;
}

@Injectable()
export class S2306Service {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly builder: S2306Builder,
    private readonly transmitter: S2306Transmitter,
  ) {}

  async build(changeId: string): Promise<S2306BuildResult> {
    return this.builder.build(changeId);
  }

  async emit(changeId: string): Promise<S2306EmissionResult> {
    const built = await this.builder.build(changeId);
    const rows = await this.databaseService.query<{ id: string }>(
      `
      INSERT INTO esocial.s2306_event (
        tenant_id,
        tsv_contract_change_id,
        payload_xml,
        status
      )
      VALUES ($1::uuid, $2::uuid, $3, 'DRAFT'::esocial.s2306_event_status)
      ON CONFLICT (tenant_id, tsv_contract_change_id)
      DO UPDATE
      SET payload_xml = EXCLUDED.payload_xml,
          status = 'DRAFT'::esocial.s2306_event_status,
          updated_at = now()
      RETURNING id::text
      `,
      [built.tenantId, built.changeId, built.xml],
    );
    const emitted = await this.transmitter.transmit(built);
    const eventRow = rows[0]!;
    await this.databaseService.query(
      `
      UPDATE esocial.s2306_event
      SET receipt = $3,
          status = 'TRANSMITTED'::esocial.s2306_event_status,
          updated_at = now()
      WHERE tenant_id = $1::uuid
        AND id = $2::uuid
      `,
      [built.tenantId, eventRow.id, emitted.reference],
    );
    return {
      changeId: built.changeId,
      eventId: eventRow.id,
      emittedEventId: emitted.id,
      status: 'TRANSMITTED',
      xml: built.xml,
    };
  }
}
