import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  EmittedESocialEvent,
  ESocialEmitService,
} from '../esocial-emit.service';
import { S2298BuildResult } from './s2298.builder';

@Injectable()
export class S2298Transmitter {
  constructor(private readonly emitService: ESocialEmitService) {}

  async transmit(record: S2298BuildResult): Promise<EmittedESocialEvent> {
    return this.emitService.emit({
      tenantId: record.tenantId,
      eventKind: record.eventKind,
      xml: record.xml,
      reference: record.reference,
      competence: record.competence,
      sourceEntityKind: 'reintegration_order',
      sourceEntityId: record.orderId,
      xmlHash: createHash('sha256').update(record.xml, 'utf8').digest('hex'),
      payload: record.payload,
    });
  }
}
