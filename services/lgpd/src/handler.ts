import { handlerResult } from '@esocial/service-shared';

export async function handler(event: { Records?: unknown[] }) {
  return handlerResult('esocial-lgpd', event.Records?.length ?? 0);
}
