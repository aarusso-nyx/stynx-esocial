import type { AuditEventEnvelope } from '@stynx/esocial-contracts';

export type StynxEsocialPublisher = {
  publish(topic: string, envelope: unknown): Promise<void>;
};

export class AuditPublisher {
  constructor(private readonly publisher: StynxEsocialPublisher) {}

  publish(envelope: AuditEventEnvelope): Promise<void> {
    return this.publisher.publish('sgp.esocial.audit', envelope);
  }
}
