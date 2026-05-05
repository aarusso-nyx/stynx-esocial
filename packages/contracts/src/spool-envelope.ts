import type { EsocialClass } from './kinds';

export type EsocialSpoolStatus =
  | 'PENDING'
  | 'SENT'
  | 'RECEIVED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'RETRY'
  | 'DLQ';

export type SpoolUpdateEnvelope = Readonly<{
  message_id: string;
  tenant_id: string;
  kind: EsocialClass;
  status_transition: {
    from?: EsocialSpoolStatus;
    to: EsocialSpoolStatus;
  };
  response_payload?: unknown;
  response_hash?: string;
  error?: {
    code?: string;
    message: string;
    details?: unknown;
  };
  occurred_at: string;
}>;
