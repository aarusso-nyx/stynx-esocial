export type EsocialStage = 'qualification' | 'restricted-production' | 'production';

export const ESOCIAL_AWS_BOUNDARY = {
  eventBusName: 'esocial-<stage>-events',
  databaseAccess: 'lambda-private-subnets-only',
  forbiddenNetworkPaths: ['vpc-peering-to-sgp', 'fdw-to-sgp', 'shared-db-url'],
  allowedCrossAccountPaths: ['sqs', 'eventbridge', 'mtls-api-gateway'],
} as const;

export const ESOCIAL_LAMBDA_SERVICES = [
  'submission',
  'retorno',
  'certificado',
  'http-gateway',
  'tabelas',
  'trabalhador',
  'folha',
  'fechamento',
  'exclusao',
] as const;

export type EsocialLambdaService = (typeof ESOCIAL_LAMBDA_SERVICES)[number];

export const ESOCIAL_TEMPLATE_STAGES: Readonly<Record<EsocialStage, {
  endpointHost: string;
  production: boolean;
  retentionDays: number;
}>> = {
  qualification: {
    endpointHost: 'esocial-qualification.local',
    production: false,
    retentionDays: 14,
  },
  'restricted-production': {
    endpointHost: 'esocial-restricted.local',
    production: false,
    retentionDays: 30,
  },
  production: {
    endpointHost: 'webservices.esocial.gov.br',
    production: true,
    retentionDays: 365,
  },
};

export function queueName(stage: EsocialStage, topic: string): string {
  return `sgp.esocial.${topic}.${stage}.fifo`;
}

export function lambdaName(stage: EsocialStage, service: EsocialLambdaService): string {
  return `esocial-${stage}-${service}`;
}
