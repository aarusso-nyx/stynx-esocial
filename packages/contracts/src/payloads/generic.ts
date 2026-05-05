import type { EsocialClass } from '../kinds.js';
import type { EsocialStatus } from '../kinds.js';

export type EsocialClassRequestPayload<TClass extends EsocialClass> = Readonly<{
  class: TClass;
  tenantId: string;
  correlationId?: string | undefined;
  idempotencyKey?: string | undefined;
  payload: unknown;
}>;

export type EsocialClassResponsePayload<TClass extends EsocialClass> = Readonly<{
  class: TClass;
  tenantId: string;
  correlationId?: string | undefined;
  status: EsocialStatus;
  payload?: unknown | undefined;
  error?: {
    code?: string | undefined;
    message: string;
    details?: unknown | undefined;
  };
}>;
