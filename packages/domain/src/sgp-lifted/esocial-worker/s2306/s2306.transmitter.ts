import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  EmittedESocialEvent,
  ESocialEmitService,
} from '../esocial-emit.service';
import { S2306BuildResult } from './s2306.builder';

@Injectable()
export class S2306Transmitter {
  constructor(private readonly emitService: ESocialEmitService) {}

  async transmit(record: S2306BuildResult): Promise<EmittedESocialEvent> {
    return this.emitService.emit({
      tenantId: record.tenantId,
      eventKind: record.eventKind,
      xml: record.xml,
      reference: record.reference,
      competence: record.competence,
      sourceEntityKind: 'tsv_contract_change',
      sourceEntityId: record.changeId,
      xmlHash: createHash('sha256').update(record.xml, 'utf8').digest('hex'),
      payload: record.payload,
    });
  }
}
