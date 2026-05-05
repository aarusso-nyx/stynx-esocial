import type { SpoolUpdateEnvelope } from '@stynx/esocial-contracts';

import type { StynxEsocialPublisher } from './audit-publisher';

export class SpoolUpdatePublisher {
  constructor(private readonly publisher: StynxEsocialPublisher) {}

  publish(envelope: SpoolUpdateEnvelope): Promise<void> {
    return this.publisher.publish('sgp.esocial.spool.update', envelope);
  }
}
