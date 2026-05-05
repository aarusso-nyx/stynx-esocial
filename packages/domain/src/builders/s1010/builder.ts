import type { S1010RubricDto } from '@esocial/contracts';

import {
  type BuilderContext,
  type BuilderMetadata,
  type BuiltXml,
  builtXml,
  eventId,
  ideEmpregadorXml,
  ideEvento,
  validateRequired,
  withFinalNewline,
  xmlEscape,
} from '../common.js';

export const S1010_METADATA: BuilderMetadata = {
  eventCode: 'S-1010',
  leiauteVersion: 'S-1.3',
  xmlRoot: 'eSocial',
  eventElement: 'evtTabRubrica',
  namespace: 'http://www.esocial.gov.br/schema/evt/evtTabRubrica/v_S_01_03_00',
  xsdBinding: 'packages/domain/src/sgp-lifted/esocial-worker/xsd/evtTabRubrica.xsd',
  tableVersionDependencies: ['S-1000'],
};

export function buildS1010(
  dto: S1010RubricDto,
  ctx: BuilderContext = {},
): BuiltXml {
  validateRequired(dto, [
    'tenantId',
    'sourceEventId',
    'sourceEntityId',
    'employerCnpj',
    'validityStart',
    'rubricCode',
    'rubricTableId',
    'description',
    'rubricType',
    'natureCode',
    'socialSecurityIncidence',
    'incomeTaxIncidence',
    'fgtsIncidence',
  ]);
  const nodes = mapDtoToXmlNodes(dto);
  const id = eventId('S-1010', dto.tenantId, dto.sourceEntityId ?? dto.sourceEventId);
  const xml = withFinalNewline(`<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="${S1010_METADATA.namespace}">
  <evtTabRubrica Id="${id}">
    ${ideEvento(ctx)}
    ${ideEmpregadorXml(dto.employerCnpj)}
    <infoRubrica>
      <inclusao>
        <ideRubrica><codRubr>${xmlEscape(nodes.codRubr)}</codRubr><ideTabRubr>${xmlEscape(nodes.ideTabRubr)}</ideTabRubr><iniValid>${xmlEscape(nodes.iniValid)}</iniValid></ideRubrica>
        <dadosRubrica>
          <dscRubr>${xmlEscape(nodes.dscRubr)}</dscRubr>
          <natRubr>${xmlEscape(nodes.natRubr)}</natRubr>
          <tpRubr>${nodes.tpRubr}</tpRubr>
          <codIncCP>${xmlEscape(nodes.codIncCP)}</codIncCP>
          <codIncIRRF>${xmlEscape(nodes.codIncIRRF)}</codIncIRRF>
          <codIncFGTS>${xmlEscape(nodes.codIncFGTS)}</codIncFGTS>
          <codIncCPRP>${xmlEscape(nodes.codIncCPRP)}</codIncCPRP>
          <codIncPisPasep>${xmlEscape(nodes.codIncPisPasep)}</codIncPisPasep>
          <tetoRemun>${xmlEscape(nodes.tetoRemun)}</tetoRemun>
        </dadosRubrica>
      </inclusao>
    </infoRubrica>
  </evtTabRubrica>
</eSocial>`);
  return builtXml(xml, S1010_METADATA, [id]);
}

export function mapDtoToXmlNodes(dto: S1010RubricDto): Readonly<{
  codRubr: string;
  ideTabRubr: string;
  iniValid: string;
  dscRubr: string;
  natRubr: string;
  tpRubr: '1' | '2' | '3' | '4';
  codIncCP: string;
  codIncIRRF: string;
  codIncFGTS: string;
  codIncCPRP: string;
  codIncPisPasep: string;
  tetoRemun: string;
}> {
  return {
    codRubr: dto.rubricCode,
    ideTabRubr: dto.rubricTableId,
    iniValid: dto.validityStart,
    dscRubr: dto.description,
    natRubr: dto.natureCode,
    tpRubr: rubricType(dto.rubricType),
    codIncCP: dto.socialSecurityIncidence,
    codIncIRRF: dto.incomeTaxIncidence,
    codIncFGTS: dto.fgtsIncidence,
    codIncCPRP: '00',
    codIncPisPasep: dto.unionContributionIncidence ?? '11',
    tetoRemun: 'N',
  };
}

function rubricType(value: string): '1' | '2' | '3' | '4' {
  if (value === 'deduction') return '2';
  if (value === 'informational') return '3';
  if (value === 'informational-deduction') return '4';
  return '1';
}
