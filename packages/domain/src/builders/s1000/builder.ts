import type { S1000EmployerInfoDto } from '@esocial/contracts';

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

export const S1000_METADATA: BuilderMetadata = {
  eventCode: 'S-1000',
  leiauteVersion: 'S-1.3',
  xmlRoot: 'eSocial',
  eventElement: 'evtInfoEmpregador',
  namespace:
    'http://www.esocial.gov.br/schema/evt/evtInfoEmpregador/v_S_01_03_00',
  xsdBinding: 'packages/domain/src/xml/xsd/bundle/evtInfoEmpregador.xsd',
  tableVersionDependencies: [],
};

export function buildS1000(
  dto: S1000EmployerInfoDto,
  ctx: BuilderContext = {},
): BuiltXml {
  validateRequired(dto, [
    'tenantId',
    'sourceEventId',
    'sourceEntityId',
    'employerCnpj',
    'validityStart',
    'legalName',
    'taxClassification',
  ]);
  const nodes = mapDtoToXmlNodes(dto);
  const id = eventId('S-1000', dto.tenantId, dto.sourceEntityId ?? dto.sourceEventId);
  const xml = withFinalNewline(`<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="${S1000_METADATA.namespace}">
  <evtInfoEmpregador Id="${id}">
    ${ideEvento(ctx)}
    ${ideEmpregadorXml(dto.employerCnpj)}
    <infoEmpregador>
      <inclusao>
        <idePeriodo><iniValid>${xmlEscape(nodes.iniValid)}</iniValid></idePeriodo>
        <infoCadastro>
          <classTrib>${xmlEscape(nodes.classTrib)}</classTrib>
          <indCoop>${xmlEscape(nodes.indCoop)}</indCoop>
          <indConstr>${xmlEscape(nodes.indConstr)}</indConstr>
          <indDesFolha>${xmlEscape(nodes.indDesFolha)}</indDesFolha>
          <indOptRegEletron>${xmlEscape(nodes.indOptRegEletron)}</indOptRegEletron>
        </infoCadastro>
      </inclusao>
    </infoEmpregador>
  </evtInfoEmpregador>
</eSocial>`);
  return builtXml(xml, S1000_METADATA, [id]);
}

export function mapDtoToXmlNodes(dto: S1000EmployerInfoDto): Readonly<{
  iniValid: string;
  classTrib: string;
  indCoop: string;
  indConstr: string;
  indDesFolha: string;
  indOptRegEletron: string;
}> {
  return {
    iniValid: dto.validityStart,
    classTrib: dto.taxClassification,
    indCoop: dto.cooperativeIndicator ?? '0',
    indConstr: dto.constructionIndicator ?? '0',
    indDesFolha: dto.payrollExemptionIndicator ?? '0',
    indOptRegEletron: dto.electronicRecordOption ?? '0',
  };
}
