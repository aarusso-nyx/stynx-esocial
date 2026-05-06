import type {
  SoapEndpointConfig,
  SoapEndpointSet,
  SoapEnvironment,
} from '../transport/soap-transport.js';

export type EnvReader = Readonly<Record<string, string | undefined>>;

export type NodeEnvironment = 'development' | 'test' | 'production';

export type QueueConfig = Readonly<{
  responseQueueUrl?: string | undefined;
  spoolQueueUrl?: string | undefined;
  retryQueueUrl?: string | undefined;
  dlqQueueUrl?: string | undefined;
}>;

export type AwsConfig = Readonly<{
  region: string;
  secretsManagerEndpoint?: string | undefined;
}>;

export type EsocialConfig = Readonly<{
  nodeEnv: NodeEnvironment;
  ci: boolean;
  databaseUrl?: string | undefined;
  eventBusName?: string | undefined;
  queues: QueueConfig;
  aws: AwsConfig;
  soapEndpoints: SoapEndpointConfig;
}>;

export type SubmissionServiceConfig = Readonly<{
  databaseUrl: string;
  responseQueueUrl: string;
  spoolQueueUrl: string;
  retryQueueUrl: string;
  dlqQueueUrl: string;
  eventBusName: string;
}>;

export type ReturnServiceConfig = Readonly<{
  databaseUrl: string;
  spoolQueueUrl: string;
  dlqQueueUrl: string;
  eventBusName: string;
}>;

export type CertificateServiceConfig = Readonly<{
  databaseUrl: string;
  awsRegion: string;
  secretsManagerEndpoint?: string | undefined;
}>;

export class ConfigurationError extends Error {
  constructor(
    message: string,
    readonly key: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export function loadConfig(env: EnvReader = process.env): EsocialConfig {
  return {
    nodeEnv: readNodeEnvironment(env),
    ci: readBoolean(env['CI']),
    databaseUrl: optionalUrl(env, 'ESOCIAL_DATABASE_URL'),
    eventBusName: optionalNonEmpty(env, 'ESOCIAL_EVENT_BUS_NAME'),
    queues: {
      responseQueueUrl: optionalUrl(env, 'ESOCIAL_RESPONSE_QUEUE_URL'),
      spoolQueueUrl: optionalUrl(env, 'ESOCIAL_SPOOL_QUEUE_URL'),
      retryQueueUrl: optionalUrl(env, 'ESOCIAL_RETRY_QUEUE_URL'),
      dlqQueueUrl: optionalUrl(env, 'ESOCIAL_DLQ_QUEUE_URL'),
    },
    aws: {
      region: optionalNonEmpty(env, 'AWS_REGION') ?? 'us-east-1',
      secretsManagerEndpoint:
        optionalUrl(env, 'AWS_ENDPOINT_URL_SECRETS_MANAGER')
        ?? optionalUrl(env, 'AWS_ENDPOINT_URL'),
    },
    soapEndpoints: loadSoapEndpointConfig(env),
  };
}

export function loadSubmissionServiceConfig(
  env: EnvReader = process.env,
): SubmissionServiceConfig {
  const config = loadConfig(env);
  return {
    databaseUrl: requireConfigValue(
      config.databaseUrl,
      'ESOCIAL_DATABASE_URL',
      'ESOCIAL_DATABASE_URL is required for the submission handler.',
    ),
    responseQueueUrl: requireConfigValue(
      config.queues.responseQueueUrl,
      'ESOCIAL_RESPONSE_QUEUE_URL',
      'ESOCIAL_RESPONSE_QUEUE_URL is required for the submission handler.',
    ),
    spoolQueueUrl: requireConfigValue(
      config.queues.spoolQueueUrl,
      'ESOCIAL_SPOOL_QUEUE_URL',
      'ESOCIAL_SPOOL_QUEUE_URL is required for the submission handler.',
    ),
    retryQueueUrl: requireConfigValue(
      config.queues.retryQueueUrl,
      'ESOCIAL_RETRY_QUEUE_URL',
      'ESOCIAL_RETRY_QUEUE_URL is required for the submission handler.',
    ),
    dlqQueueUrl: requireConfigValue(
      config.queues.dlqQueueUrl,
      'ESOCIAL_DLQ_QUEUE_URL',
      'ESOCIAL_DLQ_QUEUE_URL is required for the submission handler.',
    ),
    eventBusName: requireConfigValue(
      config.eventBusName,
      'ESOCIAL_EVENT_BUS_NAME',
      'ESOCIAL_EVENT_BUS_NAME is required for the submission handler.',
    ),
  };
}

export function loadReturnServiceConfig(
  env: EnvReader = process.env,
): ReturnServiceConfig {
  const config = loadConfig(env);
  return {
    databaseUrl: requireConfigValue(
      config.databaseUrl,
      'ESOCIAL_DATABASE_URL',
      'ESOCIAL_DATABASE_URL is required for the return handler.',
    ),
    spoolQueueUrl: requireConfigValue(
      config.queues.spoolQueueUrl,
      'ESOCIAL_SPOOL_QUEUE_URL',
      'ESOCIAL_SPOOL_QUEUE_URL is required for the return handler.',
    ),
    dlqQueueUrl: requireConfigValue(
      config.queues.dlqQueueUrl,
      'ESOCIAL_DLQ_QUEUE_URL',
      'ESOCIAL_DLQ_QUEUE_URL is required for the return handler.',
    ),
    eventBusName: requireConfigValue(
      config.eventBusName,
      'ESOCIAL_EVENT_BUS_NAME',
      'ESOCIAL_EVENT_BUS_NAME is required for the return handler.',
    ),
  };
}

export function loadCertificateServiceConfig(
  env: EnvReader = process.env,
): CertificateServiceConfig {
  const config = loadConfig(env);
  return {
    databaseUrl: requireConfigValue(
      config.databaseUrl,
      'ESOCIAL_DATABASE_URL',
      'ESOCIAL_DATABASE_URL is required for certificate custody.',
    ),
    awsRegion: config.aws.region,
    secretsManagerEndpoint: config.aws.secretsManagerEndpoint,
  };
}

export function readNodeEnvironment(env: EnvReader = process.env): NodeEnvironment {
  const value = optionalNonEmpty(env, 'NODE_ENV') ?? 'development';
  if (value === 'development' || value === 'test' || value === 'production') {
    return value;
  }
  throw new ConfigurationError(
    `NODE_ENV must be development, test, or production; received ${value}.`,
    'NODE_ENV',
    'CONFIG_NODE_ENV_INVALID',
  );
}

export function readCiFlag(env: EnvReader = process.env): boolean {
  return readBoolean(env['CI']);
}

export function loadSoapEndpointConfig(
  env: EnvReader = process.env,
): SoapEndpointConfig {
  return compactSoapConfig({
    qualification: soapEndpointSetFromEnv(env, 'qualification'),
    restricted_production: soapEndpointSetFromEnv(env, 'restricted_production'),
    production: soapEndpointSetFromEnv(env, 'production'),
  });
}

export function requireConfigValue(
  value: string | undefined,
  key: string,
  message: string,
): string {
  if (value) return value;
  throw new ConfigurationError(message, key, 'CONFIG_REQUIRED');
}

export function redactConfig(config: EsocialConfig): Record<string, unknown> {
  return {
    nodeEnv: config.nodeEnv,
    ci: config.ci,
    databaseUrl: redact(config.databaseUrl),
    eventBusName: config.eventBusName,
    queues: {
      responseQueueUrl: redact(config.queues.responseQueueUrl),
      spoolQueueUrl: redact(config.queues.spoolQueueUrl),
      retryQueueUrl: redact(config.queues.retryQueueUrl),
      dlqQueueUrl: redact(config.queues.dlqQueueUrl),
    },
    aws: {
      region: config.aws.region,
      secretsManagerEndpoint: redact(config.aws.secretsManagerEndpoint),
    },
    soapEndpoints: Object.fromEntries(
      Object.entries(config.soapEndpoints).map(([environment, endpoints]) => [
        environment,
        {
          submit: redact(endpoints?.submit),
          returnQuery: redact(endpoints?.returnQuery),
        },
      ]),
    ),
  };
}

function soapEndpointSetFromEnv(
  env: EnvReader,
  environment: SoapEnvironment,
): SoapEndpointSet | undefined {
  const prefix = `ESOCIAL_${environment.toUpperCase()}`;
  const submit = optionalUrl(env, `${prefix}_SOAP_SUBMIT_URL`);
  const returnQuery = optionalUrl(env, `${prefix}_SOAP_RETURN_URL`);
  if (!submit && !returnQuery) return undefined;
  if (!submit) {
    throw new ConfigurationError(
      `${prefix}_SOAP_SUBMIT_URL is required when ${prefix}_SOAP_RETURN_URL is configured.`,
      `${prefix}_SOAP_SUBMIT_URL`,
      'CONFIG_SOAP_ENDPOINT_INCOMPLETE',
    );
  }
  if (!returnQuery) {
    throw new ConfigurationError(
      `${prefix}_SOAP_RETURN_URL is required when ${prefix}_SOAP_SUBMIT_URL is configured.`,
      `${prefix}_SOAP_RETURN_URL`,
      'CONFIG_SOAP_ENDPOINT_INCOMPLETE',
    );
  }
  return { submit, returnQuery };
}

function compactSoapConfig(
  config: Partial<Record<SoapEnvironment, SoapEndpointSet | undefined>>,
): SoapEndpointConfig {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined),
  ) as SoapEndpointConfig;
}

function optionalNonEmpty(env: EnvReader, key: string): string | undefined {
  const value = env[key];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalUrl(env: EnvReader, key: string): string | undefined {
  const value = optionalNonEmpty(env, key);
  if (!value) return undefined;
  try {
    new URL(value);
    return value;
  } catch {
    throw new ConfigurationError(
      `${key} must be a valid URL.`,
      key,
      'CONFIG_URL_INVALID',
    );
  }
}

function readBoolean(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

function redact(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return '[configured]';
}
