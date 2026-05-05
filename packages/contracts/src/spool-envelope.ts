import type { EsocialContractError, EsocialEnvelopeBase } from './envelope.js';
import type { EsocialClass } from './kinds.js';
import type { EsocialStatus } from './kinds.js';

export type EsocialSpoolStatus = EsocialStatus;

export type SpoolUpdateEnvelope = EsocialEnvelopeBase<'spool'> &
  Readonly<{
    message_id: string;
    kind: EsocialClass;
    status_transition: {
      from?: EsocialSpoolStatus | undefined;
      to: EsocialSpoolStatus;
    };
    response_payload?: unknown | undefined;
    response_hash?: string | undefined;
    errors?: readonly EsocialContractError[] | undefined;
    occurred_at: string;
  }>;
