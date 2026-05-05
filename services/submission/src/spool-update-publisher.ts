import type { SpoolUpdateEnvelope } from '@esocial/contracts';

import type { EsocialPublisher } from './audit-publisher.js';

export class SpoolUpdatePublisher {
  constructor(private readonly publisher: EsocialPublisher) {}

  publish(envelope: SpoolUpdateEnvelope): Promise<void> {
    return this.publisher.publish('sgp.esocial.spool.update', envelope);
  }
}
