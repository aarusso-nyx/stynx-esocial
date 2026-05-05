import { handlerResult } from '../../shared/src/handler-result';

export async function handler(event: { Records?: unknown[] }) {
  return handlerResult('stynx-esocial-folha', event.Records?.length ?? 0);
}
