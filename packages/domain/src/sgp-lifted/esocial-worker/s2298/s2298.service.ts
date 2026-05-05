import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { S2298Builder, S2298BuildResult } from './s2298.builder';
import { S2298Transmitter } from './s2298.transmitter';

export interface S2298EmissionResult {
  orderId: string;
  eventId: string;
  emittedEventId: string;
  status: string;
  xml: string;
  originalS2299Receipt: string;
}

@Injectable()
export class S2298Service {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly builder: S2298Builder,
    private readonly transmitter: S2298Transmitter,
  ) {}

  async build(orderId: string): Promise<S2298BuildResult> {
    return this.builder.build(orderId);
  }

  async emit(orderId: string): Promise<S2298EmissionResult> {
    const built = await this.builder.build(orderId);
    const rows = await this.databaseService.query<{ id: string }>(
      `
      INSERT INTO esocial.s2298_event (
        tenant_id,
        reintegration_order_id,
        original_s2299_receipt,
        reint_type,
        payload_xml,
        status
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3,
        $4,
        $5,
        'DRAFT'::esocial.s2298_event_status
      )
      ON CONFLICT (tenant_id, reintegration_order_id)
      DO UPDATE
      SET original_s2299_receipt = EXCLUDED.original_s2299_receipt,
          reint_type = EXCLUDED.reint_type,
          payload_xml = EXCLUDED.payload_xml,
          status = 'DRAFT'::esocial.s2298_event_status,
          updated_at = now()
      RETURNING id::text
      `,
      [
        built.tenantId,
        built.orderId,
        built.originalS2299Receipt,
        built.reintType,
        built.xml,
      ],
    );
    const emitted = await this.transmitter.transmit(built);
    const eventRow = rows[0]!;
    await this.databaseService.query(
      `
      UPDATE esocial.s2298_event
      SET receipt = $3,
          status = 'TRANSMITTED'::esocial.s2298_event_status,
          updated_at = now()
      WHERE tenant_id = $1::uuid
        AND id = $2::uuid
      `,
      [built.tenantId, eventRow.id, emitted.reference],
    );
    await this.databaseService.query(
      `
      UPDATE hr.reintegration_order
      SET status = 'TRANSMITTED'::hr.reintegration_order_status
      WHERE tenant_id = $1::uuid
        AND id = $2::uuid
        AND status = 'APPLIED'::hr.reintegration_order_status
      `,
      [built.tenantId, built.orderId],
    );
    return {
      orderId: built.orderId,
      eventId: eventRow.id,
      emittedEventId: emitted.id,
      status: 'TRANSMITTED',
      xml: built.xml,
      originalS2299Receipt: built.originalS2299Receipt,
    };
  }
}
