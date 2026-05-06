import { handlerResult } from '@esocial/service-shared';

export async function handler(event: { Records?: unknown[] }) {
  return handlerResult('esocial-retention-sweeper', event.Records?.length ?? 0);
}
