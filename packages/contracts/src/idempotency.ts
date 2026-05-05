import type {
  EsocialContractVersion,
  EsocialEnvironment,
  EsocialRelayEventClass,
  EsocialTransportFamily,
} from './kinds.js';

const ESOCIAL_IDEMPOTENCY_CONTRACT_VERSION: EsocialContractVersion = 'v1';

export type EsocialIdempotencyMarker = Readonly<{
  marker: string;
  reference?: string;
}>;

export type EsocialIdempotencyKeyInput = Readonly<{
  family: EsocialTransportFamily;
  tenant_id: string;
  environment: EsocialEnvironment;
  event_class: EsocialRelayEventClass;
  source_event_id?: string;
  source_entity_id?: string;
  source_entity_ids?: readonly string[];
  competence?: string;
  payload_hash: string;
  rectification?: EsocialIdempotencyMarker;
  exclusion?: EsocialIdempotencyMarker;
}>;

export type EsocialIdempotencyKey = Readonly<{
  version: EsocialContractVersion;
  family: EsocialTransportFamily;
  tenant_id: string;
  environment: EsocialEnvironment;
  event_class: EsocialRelayEventClass;
  value: string;
}>;

export function buildEsocialIdempotencyKey(
  input: EsocialIdempotencyKeyInput,
): EsocialIdempotencyKey {
  const value = [
    'esocial',
    ESOCIAL_IDEMPOTENCY_CONTRACT_VERSION,
    input.family,
    input.tenant_id,
    input.environment,
    input.event_class,
    input.source_event_id,
    input.source_entity_id,
    normalizedList(input.source_entity_ids),
    input.competence,
    input.payload_hash,
    markerValue(input.rectification),
    markerValue(input.exclusion),
  ]
    .map(normalizePart)
    .join(':');

  return {
    version: ESOCIAL_IDEMPOTENCY_CONTRACT_VERSION,
    family: input.family,
    tenant_id: input.tenant_id,
    environment: input.environment,
    event_class: input.event_class,
    value,
  };
}

function markerValue(marker?: EsocialIdempotencyMarker): string | undefined {
  if (!marker) return undefined;
  return [marker.marker, marker.reference].map(normalizePart).join('~');
}

function normalizedList(values?: readonly string[]): string | undefined {
  if (!values?.length) return undefined;
  return [...values].sort().map(normalizePart).join(',');
}

function normalizePart(value?: string): string {
  return encodeURIComponent(value?.trim() || '-');
}
