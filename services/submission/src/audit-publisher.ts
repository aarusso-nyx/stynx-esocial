import type { AuditEventEnvelope } from '@esocial/contracts';

export type EsocialPublisher = {
  publish(topic: string, envelope: unknown): Promise<void>;
};

export class AuditPublisher {
  constructor(private readonly publisher: EsocialPublisher) {}

  publish(envelope: AuditEventEnvelope): Promise<void> {
    return this.publisher.publish('sgp.esocial.audit', envelope);
  }
}
