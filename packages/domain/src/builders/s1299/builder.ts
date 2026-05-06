import type { S1299ClosureDto } from '@esocial/contracts';

import {
  type BuilderContext,
  type BuilderMetadata,
  type BuiltXml,
  builtXml,
  eventId,
  ideEmpregadorXml,
  ideEvento,
  requireEmptyArray,
  validateRequired,
  withFinalNewline,
} from '../common.js';

export const S1299_METADATA: BuilderMetadata = {
  eventCode: 'S-1299',
  leiauteVersion: 'S-1.3',
  xmlRoot: 'eSocial',
  eventElement: 'evtFechaEvPer',
  namespace: 'http://www.esocial.gov.br/schema/evt/evtFechaEvPer/v_S_01_03_00',
  xsdBinding: 'packages/domain/src/xml/xsd/bundle/evtFechaEvPer.xsd',
  tableVersionDependencies: ['S-1000'],
  receiptDependencies: ['S-1200', 'S-1202', 'S-1207', 'S-1210'],
};

export function buildS1299(
  dto: S1299ClosureDto,
  ctx: BuilderContext = {},
): BuiltXml {
  validateRequired(dto, [
    'tenantId',
    'sourceEventId',
    'employerCnpj',
    'competence',
    'payrollRunId',
    'acceptedEventCounts.remuneration',
    'acceptedEventCounts.payments',
  ]);
  requireEmptyArray(dto.pendingPeriodicEvents, 'pendingPeriodicEvents');
  const nodes = mapDtoToXmlNodes(dto);
  const id = eventId('S-1299', dto.tenantId, dto.competence);
  const xml = withFinalNewline(`<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="${S1299_METADATA.namespace}">
  <evtFechaEvPer Id="${id}">
    ${ideEvento(ctx, { includePeriod: dto.competence })}
    ${ideEmpregadorXml(dto.employerCnpj)}
    <infoFech>
      <evtRemun>${nodes.evtRemun}</evtRemun>
      <evtPgtos>${nodes.evtPgtos}</evtPgtos>
      <evtComProd>N</evtComProd>
      <evtContratAvNP>N</evtContratAvNP>
      <evtInfoComplPer>N</evtInfoComplPer>
    </infoFech>
  </evtFechaEvPer>
</eSocial>`);
  return builtXml(xml, S1299_METADATA, [id]);
}

export function mapDtoToXmlNodes(dto: S1299ClosureDto): Readonly<{
  evtRemun: 'S' | 'N';
  evtPgtos: 'S' | 'N';
}> {
  return {
    evtRemun: dto.acceptedEventCounts.remuneration > 0 ? 'S' : 'N',
    evtPgtos: dto.acceptedEventCounts.payments > 0 ? 'S' : 'N',
  };
}
