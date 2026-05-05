export type StynxEsocialStage = 'dev' | 'qa';

export const STYNX_ESOCIAL_AWS_BOUNDARY = {
  eventBusName: 'stynx-esocial-events',
  databaseAccess: 'lambda-private-subnets-only',
  forbiddenNetworkPaths: ['vpc-peering-to-sgp', 'fdw-to-sgp', 'shared-db-url'],
  allowedCrossAccountPaths: ['sqs', 'eventbridge', 'mtls-api-gateway'],
} as const;

export function queueName(stage: StynxEsocialStage, kind: string, suffix: string): string {
  return `sgp.esocial.${kind}.${suffix}.${stage}.fifo`;
}
