export const STYNX_ESOCIAL_DOMAIN_VERSION = 'r6-skeleton';

export type StynxEsocialDomainBoundary = Readonly<{
  database: 'isolated-stynx-esocial';
  sgpDatabaseAccess: false;
  allowedIngress: 'sqs' | 'sgp-backend-https';
}>;
