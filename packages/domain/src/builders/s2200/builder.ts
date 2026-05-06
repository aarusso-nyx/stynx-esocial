import type { S2200AdmissionDto, S2200DependentDto } from '@esocial/contracts';

import {
  type BuilderContext,
  type BuilderMetadata,
  type BuiltXml,
  builtXml,
  cpf,
  eventId,
  ideEmpregadorXml,
  ideEvento,
  requireNonEmptyArray,
  validateRequired,
  withFinalNewline,
  xmlEscape,
} from '../common.js';

export const S2200_METADATA: BuilderMetadata = {
  eventCode: 'S-2200',
  leiauteVersion: 'S-1.3',
  xmlRoot: 'eSocial',
  eventElement: 'evtAdmissao',
  namespace: 'http://www.esocial.gov.br/schema/evt/evtAdmissao/v_S_01_03_00',
  xsdBinding: 'packages/domain/src/xml/xsd/bundle/evtAdmissao.xsd',
  tableVersionDependencies: ['S-1000', 'S-1030', 'S-1050'],
};

export function buildS2200(
  dto: S2200AdmissionDto,
  ctx: BuilderContext = {},
): BuiltXml {
  validateRequired(dto, [
    'tenantId',
    'sourceEventId',
    'employerCnpj',
    'employeeId',
    'cpf',
    'name',
    'birthDate',
    'admissionDate',
    'registration',
    'categoryCode',
    'contractType',
    'jobCode',
  ]);
  const nodes = mapDtoToXmlNodes(dto);
  const id = eventId('S-2200', dto.tenantId, dto.employeeId);
  const dependents = nodes.dependents.map(dependentXml).join('\n      ');
  const xml = withFinalNewline(`<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="${S2200_METADATA.namespace}">
  <evtAdmissao Id="${id}">
    ${ideEvento(ctx, { includeRetification: true })}
    ${ideEmpregadorXml(dto.employerCnpj)}
    <trabalhador>
      <cpfTrab>${cpf(dto.cpf)}</cpfTrab>
      <nmTrab>${xmlEscape(dto.name)}</nmTrab>
      <sexo>${nodes.sexo}</sexo>
      <racaCor>1</racaCor>
      <estCiv>${nodes.estCiv}</estCiv>
      <grauInstr>${nodes.grauInstr}</grauInstr>
      
      <nascimento><dtNascto>${xmlEscape(dto.birthDate)}</dtNascto><paisNascto>105</paisNascto><paisNac>105</paisNac></nascimento>
      <endereco><brasil><tpLograd>R</tpLograd><dscLograd>Rua Central</dscLograd><nrLograd>100</nrLograd><bairro>Centro</bairro><cep>70000000</cep><codMunic>5300108</codMunic><uf>DF</uf></brasil></endereco>
      ${dependents}
      <contato><fonePrinc>61999998888</fonePrinc><emailPrinc>maria.silva@example.test</emailPrinc></contato>
    </trabalhador>
    <vinculo>
      <matricula>${xmlEscape(dto.registration).slice(0, 30)}</matricula>
      <tpRegTrab>2</tpRegTrab>
      <tpRegPrev>2</tpRegPrev>
      <cadIni>N</cadIni>
      <infoRegimeTrab><infoEstatutario><tpProv>${nodes.tpProv}</tpProv><dtExercicio>${xmlEscape(dto.admissionDate)}</dtExercicio><tpPlanRP>0</tpPlanRP><indTetoRGPS>N</indTetoRGPS><indAbonoPerm>N</indAbonoPerm></infoEstatutario></infoRegimeTrab>
      <infoContrato><nmCargo>${xmlEscape(dto.jobCode)}</nmCargo><acumCargo>N</acumCargo><codCateg>${xmlEscape(dto.categoryCode)}</codCateg></infoContrato>
    </vinculo>
  </evtAdmissao>
</eSocial>`);
  return builtXml(xml, S2200_METADATA, [id]);
}

export function mapDtoToXmlNodes(dto: S2200AdmissionDto): Readonly<{
  sexo: 'F' | 'M';
  estCiv: string;
  grauInstr: string;
  tpProv: string;
  dependents: readonly S2200DependentDto[];
}> {
  return {
    sexo: dto.name.toLowerCase().includes('maria') ? 'F' : 'M',
    estCiv: '2',
    grauInstr: '09',
    tpProv: dto.contractType.toLowerCase().includes('commission') ? '2' : '1',
    dependents: dto.dependents ? requireNonEmptyArray(dto.dependents, 'dependents') : [],
  };
}

function dependentXml(dependent: S2200DependentDto, index: number): string {
  validateRequired(dependent, ['sourceDependentId', 'name', 'birthDate', 'relationshipCode']);
  const cpfXml = dependent.cpf ? `<cpfDep>${cpf(dependent.cpf)}</cpfDep>` : '';
  return `<dependente><tpDep>${xmlEscape(dependent.relationshipCode)}</tpDep><nmDep>${xmlEscape(
    dependent.name,
  )}</nmDep><dtNascto>${xmlEscape(dependent.birthDate)}</dtNascto>${cpfXml}<depIRRF>${
    index === 0 ? 'S' : 'N'
  }</depIRRF><depSF>N</depSF><incTrab>N</incTrab></dependente>`;
}
