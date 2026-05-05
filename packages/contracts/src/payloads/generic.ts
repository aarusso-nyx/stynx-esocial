import type { EsocialClass } from '../kinds';

export type EsocialClassRequestPayload<TClass extends EsocialClass> = Readonly<{
  class: TClass;
  tenantId: string;
  correlationId?: string;
  idempotencyKey?: string;
  payload: unknown;
}>;

export type EsocialClassResponsePayload<TClass extends EsocialClass> = Readonly<{
  class: TClass;
  tenantId: string;
  correlationId?: string;
  status: 'ACCEPTED' | 'REJECTED' | 'RETRY' | 'DLQ';
  payload?: unknown;
  error?: {
    code?: string;
    message: string;
    details?: unknown;
  };
}>;
