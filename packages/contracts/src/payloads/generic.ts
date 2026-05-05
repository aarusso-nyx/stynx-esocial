import type { EsocialClass } from '../kinds.js';
import type { EsocialStatus } from '../kinds.js';

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
  status: EsocialStatus;
  payload?: unknown;
  error?: {
    code?: string;
    message: string;
    details?: unknown;
  };
}>;
