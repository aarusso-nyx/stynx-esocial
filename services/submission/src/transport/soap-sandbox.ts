export {
  DeterministicSandboxTransport,
  DeterministicSandboxTransport as SandboxSoapTransport,
  SoapClientTransport,
  SoapTransportGuardError,
  assertNonProductionEndpointSafe,
  assertSoapEndpointAllowed,
  loadCommittedEnviarLoteWsdl,
  normalizeSoapEnvironment,
  resolveEsocialSoapEndpoints,
  transportFactory,
} from '@esocial/domain';
export type {
  DeterministicSandboxTransportOptions,
  LegacySoapEnvironment as EsocialSoapEnvironment,
  ResolveSoapEndpointOptions,
  SoapContext,
  SoapEndpointConfig as EsocialSoapEndpointConfig,
  SoapEndpointGuardOptions,
  SoapEndpointSet as EsocialSoapEndpointSet,
  SoapResult,
  SoapTransport,
  TransportFactoryOptions,
} from '@esocial/domain';
