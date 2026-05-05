import type { EsocialContractError, EsocialEnvelopeBase } from './envelope.js';
import type { EsocialStatus } from './kinds.js';

export type AuditEventEnvelope = EsocialEnvelopeBase<'audit'> &
  Readonly<{
    actor_id?: string;
    action: string;
    status?: EsocialStatus;
    target: {
      type: string;
      id?: string;
    };
    before?: unknown;
    after?: unknown;
    errors?: readonly EsocialContractError[];
    occurred_at: string;
  }>;
