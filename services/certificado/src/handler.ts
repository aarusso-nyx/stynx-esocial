import { handlerResult } from '../../shared/src/handler-result';

export async function handler(event: { Records?: unknown[] }) {
  return handlerResult('stynx-esocial-certificado', event.Records?.length ?? 0);
}
