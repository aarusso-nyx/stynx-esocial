import type { EsocialContractError, EsocialEnvelopeBase } from './envelope.js';
import type { EsocialStatus } from './kinds.js';

export type AuditEventEnvelope = EsocialEnvelopeBase<'audit'> &
  Readonly<{
    actor_id?: string | undefined;
    action: string;
    status?: EsocialStatus | undefined;
    target: {
      type: string;
      id?: string | undefined;
    };
    before?: unknown | undefined;
    after?: unknown | undefined;
    errors?: readonly EsocialContractError[] | undefined;
    occurred_at: string;
  }>;
