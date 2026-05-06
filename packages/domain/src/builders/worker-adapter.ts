import type {
  EsocialPromotedWorkerDto,
  EsocialPromotedWorkerDtoEventClass,
  S2205DependentChangeDto,
  S2205WorkerChangeDto,
  S2206ContractChangeDto,
  S2210CatDto,
  S2220ExamDto,
  S2230LeaveDto,
  S2240ExposureDto,
  S2298ReintegrationDto,
  S2299TerminationDto,
  S2299TerminationRubricDto,
  S2300TsvStartDto,
  S2306TsvContractChangeDto,
  S2399TsvTerminationDto,
} from '@esocial/contracts';

import { assertNever } from '../internal/exhaustive.js';

import {
  type BuilderContext,
  type BuilderMetadata,
  type BuiltXml,
  DtoValidationError,
  builtXml,
  cpf,
  eventId,
  fullRegistration,
  ideEmpregadorXml,
  ideEvento,
  validateRequired,
  withFinalNewline,
  xmlEscape,
} from './common.js';

type WorkerMetadata = BuilderMetadata & Readonly<{
  eventCode: EsocialPromotedWorkerDtoEventClass;
}>;

const XSD_ROOT = 'packages/domain/src/xml/xsd/bundle';

export const WORKER_EVENT_METADATA: Readonly<Record<
  EsocialPromotedWorkerDtoEventClass,
  WorkerMetadata
>> = {
  'S-2205': metadata('S-2205', 'evtAltCadastral', 'evtAltCadastral.xsd'),
  'S-2206': metadata('S-2206', 'evtAltContratual', 'evtAltContratual.xsd'),
  'S-2210': metadata('S-2210', 'evtCAT', 'evtCAT.xsd'),
  'S-2220': metadata('S-2220', 'evtMonit', 'evtMonit.xsd'),
  'S-2230': metadata('S-2230', 'evtAfastTemp', 'evtAfastTemp.xsd'),
  'S-2240': metadata('S-2240', 'evtExpRisco', 'evtExpRisco.xsd'),
  'S-2298': metadata('S-2298', 'evtReintegr', 'evtReintegr.xsd', ['S-2299']),
  'S-2299': metadata('S-2299', 'evtDeslig', 'evtDeslig.xsd'),
  'S-2300': metadata('S-2300', 'evtTSVInicio', 'evtTSVInicio.xsd'),
  'S-2306': metadata('S-2306', 'evtTSVAltContr', 'evtTSVAltContr.xsd', [
    'S-2300',
  ]),
  'S-2399': metadata('S-2399', 'evtTSVTermino', 'evtTSVTermino.xsd', [
    'S-2300',
    'S-2306',
  ]),
};

export function buildPromotedWorkerXml(
  dto: EsocialPromotedWorkerDto,
  ctx: BuilderContext = {},
): BuiltXml {
  switch (dto.eventClass) {
    case 'S-2205':
      return buildS2205Xml(dto, ctx);
    case 'S-2206':
      return buildS2206Xml(dto, ctx);
    case 'S-2210':
      return buildS2210Xml(dto, ctx);
    case 'S-2220':
      return buildS2220Xml(dto, ctx);
    case 'S-2230':
      return buildS2230Xml(dto, ctx);
    case 'S-2240':
      return buildS2240Xml(dto, ctx);
    case 'S-2298':
      return buildS2298Xml(dto, ctx);
    case 'S-2299':
      return buildS2299Xml(dto, ctx);
    case 'S-2300':
      return buildS2300Xml(dto, ctx);
    case 'S-2306':
      return buildS2306Xml(dto, ctx);
    case 'S-2399':
      return buildS2399Xml(dto, ctx);
    default:
      return assertNever(dto);
  }
}

export function assertPromotedWorkerVariantHandled(
  eventClass: EsocialPromotedWorkerDtoEventClass,
  variant: string,
): true {
  const variants: Readonly<Record<EsocialPromotedWorkerDtoEventClass, readonly string[]>> = {
    'S-2205': ['default'],
    'S-2206': ['promotion', 'transfer', 'regime-change'],
    'S-2210': ['initial', 'death', 'reopening'],
    'S-2220': ['admission', 'periodic', 'return-to-work', 'termination'],
    'S-2230': ['medical-leave', 'vacation'],
    'S-2240': ['start', 'change', 'end'],
    'S-2298': ['judicial', 'amnesty', 'other'],
    'S-2299': ['with-notice', 'without-notice'],
    'S-2300': ['intern', 'autonomous', 'council-member'],
    'S-2306': ['role', 'pay', 'internship', 'workplace'],
    'S-2399': ['intern', 'autonomous', 'council-member'],
  };
  if (!variants[eventClass].includes(variant)) {
    throw new DtoValidationError([`${eventClass}.kind`]);
  }
  return true;
}

function buildS2205Xml(dto: S2205WorkerChangeDto, ctx: BuilderContext): BuiltXml {
  validateRequired(dto, ['tenantId', 'sourceEventId', 'employerCnpj', 'employeeId', 'cpf', 'registration', 'changeDate', 'name']);
  const id = dto.eventId ?? eventId('S-2205', dto.tenantId, dto.employeeId);
  const dependents = (dto.dependents ?? []).map(dependentXml).join('\n        ');
  const metadata = WORKER_EVENT_METADATA['S-2205'];
  const xml = envelope(metadata, id, ctx, dto.employerCnpj, `
    <ideTrabalhador><cpfTrab>${cpf(dto.cpf)}</cpfTrab></ideTrabalhador>
    <alteracao>
      <dtAlteracao>${xmlEscape(dto.changeDate)}</dtAlteracao>
      <dadosTrabalhador>
        <nmTrab>${xmlEscape(dto.name)}</nmTrab>
        <sexo>${dto.sex ?? 'F'}</sexo>
        <racaCor>1</racaCor>
        <estCiv>${xmlEscape(dto.maritalStatus ?? '2')}</estCiv>
        <grauInstr>${xmlEscape(dto.educationLevel ?? '09')}</grauInstr>

        <paisNac>105</paisNac>
        <endereco><brasil><tpLograd>R</tpLograd><dscLograd>Rua Central</dscLograd><nrLograd>100</nrLograd><bairro>Centro</bairro><cep>70000000</cep><codMunic>5300108</codMunic><uf>DF</uf></brasil></endereco>
        ${dependents}
        <contato><fonePrinc>${xmlEscape(dto.phone ?? '61999998888')}</fonePrinc><emailPrinc>${xmlEscape(dto.email ?? 'maria.silva@example.test')}</emailPrinc></contato>
      </dadosTrabalhador>
    </alteracao>`);
  return builtXml(xml, metadata, [id]);
}

function buildS2206Xml(dto: S2206ContractChangeDto, ctx: BuilderContext): BuiltXml {
  validateRequired(dto, ['tenantId', 'sourceEventId', 'employerCnpj', 'employeeId', 'cpf', 'registration', 'changeKind', 'changeDate', 'effectiveDate', 'description', 'jobName', 'categoryCode']);
  assertPromotedWorkerVariantHandled('S-2206', dto.changeKind);
  const id = dto.eventId ?? eventId('S-2206', dto.tenantId, dto.employeeId);
  const metadata = WORKER_EVENT_METADATA['S-2206'];
  const xml = envelope(metadata, id, ctx, dto.employerCnpj, `
    ${ideVinculo(dto.cpf, dto.registration)}
    <altContratual>
      <dtAlteracao>${xmlEscape(dto.changeDate)}</dtAlteracao>
      <dtEf>${xmlEscape(dto.effectiveDate)}</dtEf>
      <dscAlt>${xmlEscape(dto.description)}</dscAlt>
      <vinculo>
        <tpRegPrev>2</tpRegPrev>
        <infoRegimeTrab><infoEstatutario><tpPlanRP>0</tpPlanRP><indTetoRGPS>N</indTetoRGPS><indAbonoPerm>N</indAbonoPerm></infoEstatutario></infoRegimeTrab>
        <infoContrato><nmCargo>${xmlEscape(dto.jobName)}</nmCargo><nmFuncao>${xmlEscape(dto.functionName ?? 'Coordenador de Cadastro')}</nmFuncao><acumCargo>N</acumCargo><codCateg>${xmlEscape(dto.categoryCode)}</codCateg><localTrabalho><localTrabGeral><tpInsc>1</tpInsc><nrInsc>${fullRegistration(dto.workplaceRegistrationNumber ?? dto.employerCnpj)}</nrInsc><descComp>${xmlEscape(dto.workplaceDescription ?? 'Secretaria de Administracao')}</descComp></localTrabGeral></localTrabalho></infoContrato>
      </vinculo>
    </altContratual>`);
  return builtXml(xml, metadata, [id]);
}

function buildS2210Xml(dto: S2210CatDto, ctx: BuilderContext): BuiltXml {
  validateRequired(dto, ['tenantId', 'sourceEventId', 'employerCnpj', 'employeeId', 'cpf', 'registration', 'kind', 'accidentDate']);
  assertPromotedWorkerVariantHandled('S-2210', dto.kind);
  if ((dto.kind === 'death' || dto.kind === 'reopening') && !dto.originalReceipt) {
    throw new DtoValidationError(['originalReceipt']);
  }
  const id = dto.eventId ?? eventId('S-2210', dto.tenantId, `${dto.employeeId}:${dto.kind}`);
  const metadata = WORKER_EVENT_METADATA['S-2210'];
  const isDeath = dto.kind === 'death';
  const isReopen = dto.kind === 'reopening';
  const xml = envelope(metadata, id, ctx, dto.employerCnpj, `
    ${ideVinculo(dto.cpf, dto.registration)}
    <cat>
      <dtAcid>${xmlEscape(dto.accidentDate)}</dtAcid>
      <tpAcid>1</tpAcid>
      <hrAcid>${xmlEscape(dto.accidentTime ?? '1030')}</hrAcid><hrsTrabAntesAcid>${xmlEscape(dto.workedHoursBeforeAccident ?? '0800')}</hrsTrabAntesAcid>
      <tpCat>${isDeath ? '3' : isReopen ? '2' : '1'}</tpCat>
      <indCatObito>${isDeath ? 'S' : 'N'}</indCatObito>
      ${isDeath ? `<dtObito>${xmlEscape(dto.deathDate ?? dto.accidentDate)}</dtObito>` : ''}
      <indComunPolicia>${(dto.policeCommunication ?? isDeath) ? 'S' : 'N'}</indComunPolicia>
      <codSitGeradora>000000002</codSitGeradora>
      <iniciatCAT>1</iniciatCAT>
      <obsCAT>${xmlEscape(dto.observation ?? 'Testemunha informou queda no patio')}</obsCAT>
      <ultDiaTrab>${xmlEscape(dto.accidentDate)}</ultDiaTrab>
      <houveAfast>${(dto.causedLeave ?? !isDeath) ? 'S' : 'N'}</houveAfast>
      <localAcidente><tpLocal>9</tpLocal><dscLocal>Patio operacional</dscLocal><dscLograd>Local do acidente</dscLograd><nrLograd>S/N</nrLograd></localAcidente>
      <parteAtingida><codParteAting>000000001</codParteAting><lateralidade>0</lateralidade></parteAtingida>
      <agenteCausador><codAgntCausador>000000002</codAgntCausador></agenteCausador>
      <atestado><dtAtendimento>2026-05-02</dtAtendimento><hrAtendimento>1200</hrAtendimento><indInternacao>${(dto.internment ?? (isDeath || isReopen)) ? 'S' : 'N'}</indInternacao><durTrat>${dto.treatmentDurationDays ?? (isDeath ? 1 : 10)}</durTrat><indAfast>${(dto.causedLeave ?? !isDeath) ? 'S' : 'N'}</indAfast><dscLesao>000000001</dscLesao><codCID>S00</codCID><emitente><nmEmit>Dra CAT</nmEmit><ideOC>1</ideOC><nrOC>12345</nrOC><ufOC>SP</ufOC></emitente></atestado>
      ${dto.originalReceipt ? `<catOrigem><nrRecCatOrig>${xmlEscape(dto.originalReceipt)}</nrRecCatOrig></catOrigem>` : ''}
    </cat>`);
  return builtXml(xml, metadata, [id]);
}

function buildS2220Xml(dto: S2220ExamDto, ctx: BuilderContext): BuiltXml {
  validateRequired(dto, ['tenantId', 'sourceEventId', 'employerCnpj', 'employeeId', 'cpf', 'registration', 'kind', 'examDate']);
  assertPromotedWorkerVariantHandled('S-2220', dto.kind);
  const examCode = { admission: '0', periodic: '1', 'return-to-work': '2', termination: '9' }[dto.kind];
  const id = dto.eventId ?? eventId('S-2220', dto.tenantId, `${dto.employeeId}:${dto.kind}`);
  const metadata = WORKER_EVENT_METADATA['S-2220'];
  const xml = envelope(metadata, id, ctx, dto.employerCnpj, `
    ${ideVinculo(dto.cpf, dto.registration)}
    <exMedOcup>
      <tpExameOcup>${examCode}</tpExameOcup>
      <aso>
        <dtAso>${xmlEscape(dto.examDate)}</dtAso>
        <resAso>${xmlEscape(dto.resultCode ?? '1')}</resAso>
        <exame><dtExm>${xmlEscape(dto.examDate)}</dtExm><procRealizado>${xmlEscape(dto.procedureCode ?? (dto.kind === 'periodic' ? '0281' : '0295'))}</procRealizado><obsProc>${xmlEscape(dto.procedureObservation ?? (dto.kind === 'periodic' ? 'Normal' : 'Avaliacao clinica do ASO'))}</obsProc><indResult>1</indResult></exame>
        <medico><nmMed>${xmlEscape(dto.doctorName ?? 'Dra Monitoramento')}</nmMed><nrCRM>${xmlEscape(dto.doctorCrm ?? '12345')}</nrCRM><ufCRM>${xmlEscape(dto.doctorUf ?? 'SP')}</ufCRM></medico>
      </aso>
    </exMedOcup>`);
  return builtXml(xml, metadata, [id]);
}

function buildS2230Xml(dto: S2230LeaveDto, ctx: BuilderContext): BuiltXml {
  validateRequired(dto, ['tenantId', 'sourceEventId', 'employerCnpj', 'employeeId', 'cpf', 'registration', 'kind', 'startDate', 'leaveReasonCode']);
  assertPromotedWorkerVariantHandled('S-2230', dto.kind);
  const id = dto.eventId ?? eventId('S-2230', dto.tenantId, `${dto.employeeId}:${dto.kind}`);
  const detail = dto.kind === 'vacation'
    ? `<perAquis><dtInicio>${xmlEscape(dto.acquisitionStart ?? '2025-01-10')}</dtInicio><dtFim>${xmlEscape(dto.acquisitionEnd ?? '2026-01-09')}</dtFim></perAquis>`
    : `<observacao>${xmlEscape(dto.observation ?? 'Licenca medica homologada')}</observacao>`;
  const metadata = WORKER_EVENT_METADATA['S-2230'];
  const xml = envelope(metadata, id, ctx, dto.employerCnpj, `
    ${ideVinculo(dto.cpf, dto.registration)}
    <infoAfastamento><iniAfastamento><dtIniAfast>${xmlEscape(dto.startDate)}</dtIniAfast><codMotAfast>${xmlEscape(dto.leaveReasonCode)}</codMotAfast>${detail}</iniAfastamento></infoAfastamento>`);
  return builtXml(xml, metadata, [id]);
}

function buildS2240Xml(dto: S2240ExposureDto, ctx: BuilderContext): BuiltXml {
  validateRequired(dto, ['tenantId', 'sourceEventId', 'employerCnpj', 'employeeId', 'cpf', 'registration', 'operation', 'startDate', 'workplaceRegistrationNumber', 'sector', 'activityDescription', 'riskCode', 'riskDescription', 'responsibleCpf']);
  assertPromotedWorkerVariantHandled('S-2240', dto.operation);
  const id = dto.eventId ?? eventId('S-2240', dto.tenantId, `${dto.employeeId}:${dto.operation}`);
  const intensity = Number(dto.intensity).toFixed(4);
  const intensityText = Number(dto.intensity).toFixed(6);
  const metadata = WORKER_EVENT_METADATA['S-2240'];
  const xml = envelope(metadata, id, ctx, dto.workplaceRegistrationNumber, `
    ${ideVinculo(dto.cpf, dto.registration)}
    <infoExpRisco>
      <dtIniCondicao>${xmlEscape(dto.startDate)}</dtIniCondicao>
      ${dto.operation === 'end' ? `<dtFimCondicao>${xmlEscape(dto.endDate ?? dto.startDate)}</dtFimCondicao>` : ''}
      <infoAmb><localAmb>1</localAmb><dscSetor>${xmlEscape(dto.sector)}</dscSetor><tpInsc>1</tpInsc><nrInsc>${fullRegistration(dto.workplaceRegistrationNumber)}</nrInsc></infoAmb>
      <infoAtiv><dscAtivDes>${xmlEscape(dto.activityDescription)} ${intensityText} dB(A)</dscAtivDes></infoAtiv>
      <agNoc>
        <codAgNoc>${xmlEscape(dto.riskCode)}</codAgNoc>
        <dscAgNoc>${xmlEscape(dto.riskDescription)} ${intensityText} dB(A)</dscAgNoc>
        <tpAval>1</tpAval>
        <intConc>${intensity}</intConc><unMed>4</unMed><tecMedicao>Dosimetria ocupacional</tecMedicao>
        <epcEpi><utilizEPC>1</utilizEPC><utilizEPI>2</utilizEPI><eficEpi>S</eficEpi><epi><docAval>12345</docAval></epi><epiCompl><medProtecao>S</medProtecao><condFuncto>S</condFuncto><usoInint>S</usoInint><przValid>S</przValid><periodicTroca>S</periodicTroca><higienizacao>S</higienizacao></epiCompl></epcEpi>
      </agNoc>
      <respReg><cpfResp>${cpf(dto.responsibleCpf)}</cpfResp><ideOC>4</ideOC><nrOC>0001</nrOC><ufOC>SP</ufOC></respReg>
      <obs><obsCompl>S-2240 ${dto.operation.toUpperCase()} gerado pelo inventario ambiental SGP.</obsCompl></obs>
    </infoExpRisco>`);
  return builtXml(xml, metadata, [id]);
}

function buildS2298Xml(dto: S2298ReintegrationDto, ctx: BuilderContext): BuiltXml {
  validateRequired(dto, ['tenantId', 'sourceEventId', 'employerCnpj', 'employeeId', 'cpf', 'registration', 'kind', 'reinstatementDate', 'decisionDate', 'originalS2299Receipt']);
  assertPromotedWorkerVariantHandled('S-2298', dto.kind);
  const id = dto.eventId ?? eventId('S-2298', dto.tenantId, dto.sourceEventId);
  const type = dto.kind === 'judicial' ? '1' : dto.kind === 'amnesty' ? '2' : '9';
  const processXml = type === '1' ? `<nrProcJud>${xmlEscape(dto.processNumber ?? '12345678901234567890')}</nrProcJud>` : '';
  const amnestyXml = type === '2' ? `<nrLeiAnistia>${xmlEscape(dto.processNumber ?? 'ANISTIA2026')}</nrLeiAnistia>` : '';
  const metadata = WORKER_EVENT_METADATA['S-2298'];
  const xml = envelope(metadata, id, ctx, dto.employerCnpj, `
    ${ideVinculo(dto.cpf, dto.registration)}
    <infoReintegr>
      <tpReint>${type}</tpReint>
      ${processXml}${amnestyXml}
      <dtEfetRetorno>${xmlEscape(dto.reinstatementDate)}</dtEfetRetorno>
      <dtEfeito>${xmlEscape(dto.reinstatementDate)}</dtEfeito>
    </infoReintegr>`, `<indRetif>1</indRetif><nrRecibo>${xmlEscape(dto.originalS2299Receipt)}</nrRecibo>`);
  return builtXml(xml, metadata, [id]);
}

function buildS2299Xml(dto: S2299TerminationDto, ctx: BuilderContext): BuiltXml {
  validateRequired(dto, ['tenantId', 'sourceEventId', 'employerCnpj', 'employeeId', 'cpf', 'registration', 'kind', 'terminationDate', 'terminationReasonCode', 'ideDmDev']);
  assertPromotedWorkerVariantHandled('S-2299', dto.kind);
  const rubrics = dto.rubrics.map(terminationRubricXml).join('\n              ');
  const id = dto.eventId ?? eventId('S-2299', dto.tenantId, `${dto.employeeId}:${dto.kind}`);
  const metadata = WORKER_EVENT_METADATA['S-2299'];
  const xml = envelope(metadata, id, ctx, dto.employerCnpj, `
    ${ideVinculo(dto.cpf, dto.registration)}
    <infoDeslig>
      <mtvDeslig>${xmlEscape(dto.terminationReasonCode)}</mtvDeslig>
      <dtDeslig>${xmlEscape(dto.terminationDate)}</dtDeslig>
      <indPagtoAPI>${dto.kind === 'with-notice' ? 'S' : 'N'}</indPagtoAPI>
      ${dto.projectedNoticeEndDate ? `<dtProjFimAPI>${xmlEscape(dto.projectedNoticeEndDate)}</dtProjFimAPI>` : ''}
      <verbasResc>
        <dmDev>
          <ideDmDev>${xmlEscape(dto.ideDmDev)}</ideDmDev>
          <infoPerApur>
            <ideEstabLot>
              <tpInsc>1</tpInsc>
              <nrInsc>${fullRegistration(dto.establishmentRegistrationNumber ?? dto.employerCnpj)}</nrInsc>
              <codLotacao>${xmlEscape(dto.lotationCode ?? 'LOT01')}</codLotacao>
              ${rubrics}
            </ideEstabLot>
          </infoPerApur>
        </dmDev>
      </verbasResc>
    </infoDeslig>`);
  return builtXml(xml, metadata, [id]);
}

function buildS2300Xml(dto: S2300TsvStartDto, ctx: BuilderContext): BuiltXml {
  validateRequired(dto, ['tenantId', 'sourceEventId', 'employerCnpj', 'workerId', 'cpf', 'name', 'birthDate', 'registration', 'categoryCode', 'startDate', 'role']);
  assertPromotedWorkerVariantHandled('S-2300', dto.kind);
  const id = dto.eventId ?? eventId('S-2300', dto.tenantId, dto.workerId);
  const complement = tsvComplement(dto);
  const metadata = WORKER_EVENT_METADATA['S-2300'];
  const xml = envelope(metadata, id, ctx, dto.employerCnpj, `
    ${tsvWorkerXml(dto.cpf, dto.name, dto.birthDate, dto.kind === 'council-member' ? 'M' : 'F', dto.email ?? `${dto.kind}@example.test`)}
    <infoTSVInicio>
      <cadIni>N</cadIni>
      <matricula>${xmlEscape(dto.registration)}</matricula>
      <codCateg>${xmlEscape(dto.categoryCode)}</codCateg>
      <dtInicio>${xmlEscape(dto.startDate)}</dtInicio>
      ${complement}
    </infoTSVInicio>`);
  return builtXml(xml, metadata, [id]);
}

function buildS2306Xml(dto: S2306TsvContractChangeDto, ctx: BuilderContext): BuiltXml {
  validateRequired(dto, ['tenantId', 'sourceEventId', 'employerCnpj', 'kind', 'contractId', 'cpf', 'registration', 'changeDate']);
  assertPromotedWorkerVariantHandled('S-2306', dto.kind);
  const id = dto.eventId ?? eventId('S-2306', dto.tenantId, dto.contractId);
  const metadata = WORKER_EVENT_METADATA['S-2306'];
  const info = dto.kind === 'role'
    ? `<cargoFuncao><nmCargo>${xmlEscape(dto.role ?? 'TSV Alterado')}</nmCargo></cargoFuncao>`
    : dto.kind === 'pay'
      ? `<remuneracao><vrSalFx>${money(dto.salaryAmount ?? 0)}</vrSalFx><undSalFixo>5</undSalFixo></remuneracao>`
      : dto.kind === 'internship'
        ? `<infoEstagiario><natEstagio>N</natEstagio><nivEstagio>4</nivEstagio><areaAtuacao>${xmlEscape(dto.role ?? 'Estagio')}</areaAtuacao><dtPrevTerm>2026-12-31</dtPrevTerm><instEnsino><nmRazao>${xmlEscape(dto.educationInstitution ?? 'Universidade Municipal')}</nmRazao><dscLograd>Nao informado</dscLograd><nrLograd>S/N</nrLograd><bairro>Centro</bairro><cep>70000000</cep><codMunic>5300108</codMunic><uf>DF</uf></instEnsino></infoEstagiario>`
        : `<localTrabGeral><tpInsc>1</tpInsc><nrInsc>${fullRegistration(dto.workplaceRegistrationNumber ?? dto.employerCnpj)}</nrInsc></localTrabGeral>`;
  const xml = envelope(metadata, id, ctx, dto.employerCnpj, `
    <ideTrabSemVinculo><cpfTrab>${cpf(dto.cpf)}</cpfTrab><matricula>${xmlEscape(dto.registration)}</matricula></ideTrabSemVinculo>
    <infoTSVAlteracao>
      <dtAlteracao>${xmlEscape(dto.changeDate)}</dtAlteracao>
      <infoComplementares>${info}</infoComplementares>
    </infoTSVAlteracao>`);
  return builtXml(xml, metadata, [id]);
}

function buildS2399Xml(dto: S2399TsvTerminationDto, ctx: BuilderContext): BuiltXml {
  validateRequired(dto, ['tenantId', 'sourceEventId', 'employerCnpj', 'kind', 'contractId', 'cpf', 'registration', 'terminationDate', 'acceptedS2300Receipt']);
  assertPromotedWorkerVariantHandled('S-2399', dto.kind);
  const id = dto.eventId ?? eventId('S-2399', dto.tenantId, dto.contractId);
  const metadata = WORKER_EVENT_METADATA['S-2399'];
  const xml = envelope(metadata, id, ctx, dto.employerCnpj, `
    <ideTrabSemVinculo><cpfTrab>${cpf(dto.cpf)}</cpfTrab><matricula>${xmlEscape(dto.registration)}</matricula></ideTrabSemVinculo>
    <infoTSVTermino>
      <dtTerm>${xmlEscape(dto.terminationDate)}</dtTerm>
    </infoTSVTermino>`);
  return builtXml(xml, metadata, [id]);
}

function envelope(
  metadata: WorkerMetadata,
  id: string,
  ctx: BuilderContext,
  employerCnpj: string,
  body: string,
  ideEventoOverride?: string,
): string {
  const ideEventoXml = ideEventoOverride
    ? `<ideEvento>${ideEventoOverride}<tpAmb>${ctx.environment === 'production' ? '1' : '2'}</tpAmb><procEmi>1</procEmi><verProc>${xmlEscape(ctx.processVersion ?? 'SGP-0.0.1')}</verProc></ideEvento>`
    : ideEvento(ctx, { includeRetification: true });
  return withFinalNewline(`<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="${metadata.namespace}">
  <${metadata.eventElement} Id="${id}">
    ${ideEventoXml}
    ${ideEmpregadorXml(employerCnpj)}
${body}
  </${metadata.eventElement}>
</eSocial>`);
}

function metadata(
  eventCode: EsocialPromotedWorkerDtoEventClass,
  eventElement: WorkerMetadata['eventElement'],
  xsdFile: string,
  receiptDependencies: readonly string[] = ['S-2200'],
): WorkerMetadata {
  return {
    eventCode,
    leiauteVersion: 'S-1.3',
    xmlRoot: 'eSocial',
    eventElement,
    namespace: `http://www.esocial.gov.br/schema/evt/${eventElement}/v_S_01_03_00`,
    xsdBinding: `${XSD_ROOT}/${xsdFile}`,
    tableVersionDependencies: ['S-1000'],
    receiptDependencies,
  };
}

function ideVinculo(cpfValue: string, registration: string): string {
  return `<ideVinculo><cpfTrab>${cpf(cpfValue)}</cpfTrab><matricula>${xmlEscape(registration)}</matricula></ideVinculo>`;
}

function dependentXml(dependent: S2205DependentChangeDto, index: number): string {
  validateRequired(dependent, ['sourceDependentId', 'name', 'birthDate', 'relationshipCode']);
  const cpfXml = dependent.cpf ? `<cpfDep>${cpf(dependent.cpf)}</cpfDep>` : '';
  return `<dependente><tpDep>${xmlEscape(dependent.relationshipCode)}</tpDep><nmDep>${xmlEscape(dependent.name)}</nmDep><dtNascto>${xmlEscape(dependent.birthDate)}</dtNascto>${cpfXml}<depIRRF>${index === 0 ? 'S' : 'N'}</depIRRF><depSF>N</depSF><incTrab>N</incTrab></dependente>`;
}

function terminationRubricXml(rubric: S2299TerminationRubricDto): string {
  validateRequired(rubric, ['rubricCode', 'quantity', 'amount']);
  return `<detVerbas><codRubr>${xmlEscape(rubric.rubricCode)}</codRubr><ideTabRubr>${xmlEscape(rubric.rubricTableId ?? 'SGP')}</ideTabRubr><qtdRubr>${money(rubric.quantity)}</qtdRubr><vrRubr>${money(rubric.amount)}</vrRubr><indApurIR>0</indApurIR></detVerbas>`;
}

function tsvWorkerXml(
  cpfValue: string,
  name: string,
  birthDate: string,
  sex: 'F' | 'M',
  email: string,
): string {
  return `<trabalhador>
      <cpfTrab>${cpf(cpfValue)}</cpfTrab>
      <nmTrab>${xmlEscape(name)}</nmTrab>
      <sexo>${sex}</sexo>
      <racaCor>1</racaCor>
      <estCiv>1</estCiv>
      <grauInstr>09</grauInstr>

      <nascimento><dtNascto>${xmlEscape(birthDate)}</dtNascto><paisNascto>105</paisNascto><paisNac>105</paisNac></nascimento>
      <endereco><brasil><tpLograd>R</tpLograd><dscLograd>Rua Central</dscLograd><nrLograd>100</nrLograd><bairro>Centro</bairro><cep>70000000</cep><codMunic>5300108</codMunic><uf>DF</uf></brasil></endereco>

      <contato><fonePrinc>61999998888</fonePrinc><emailPrinc>${xmlEscape(email)}</emailPrinc></contato>
    </trabalhador>`;
}

function tsvComplement(dto: S2300TsvStartDto): string {
  const pay = `<remuneracao><vrSalFx>${money(dto.salaryAmount)}</vrSalFx><undSalFixo>5</undSalFixo></remuneracao>`;
  if (dto.kind === 'intern') {
    return `<infoComplementares>${pay}<infoEstagiario><natEstagio>N</natEstagio><nivEstagio>4</nivEstagio><areaAtuacao>${xmlEscape(dto.role)}</areaAtuacao><dtPrevTerm>2026-12-31</dtPrevTerm><instEnsino><nmRazao>Universidade Municipal</nmRazao><dscLograd>Nao informado</dscLograd><nrLograd>S/N</nrLograd><bairro>Centro</bairro><cep>70000000</cep><codMunic>5300108</codMunic><uf>DF</uf></instEnsino><supervisorEstagio><cpfSupervisor>22255588804</cpfSupervisor></supervisorEstagio></infoEstagiario><localTrabGeral><tpInsc>1</tpInsc><nrInsc>${fullRegistration(dto.workplaceRegistrationNumber ?? '12345678000270')}</nrInsc></localTrabGeral></infoComplementares>`;
  }
  if (dto.kind === 'council-member') {
    return `<infoComplementares><cargoFuncao><nmCargo>${xmlEscape(dto.role)}</nmCargo></cargoFuncao>${pay}<infoTrabCedido><categOrig>301</categOrig><cnpjCednt>98765432000188</cnpjCednt><matricCed>${xmlEscape(dto.registration)}</matricCed><dtAdmCed>${xmlEscape(dto.startDate)}</dtAdmCed><tpRegTrab>2</tpRegTrab><tpRegPrev>2</tpRegPrev></infoTrabCedido><localTrabGeral><tpInsc>1</tpInsc><nrInsc>${fullRegistration(dto.workplaceRegistrationNumber ?? '12345678000270')}</nrInsc></localTrabGeral></infoComplementares>`;
  }
  return `<infoComplementares><cargoFuncao><nmCargo>${xmlEscape(dto.role)}</nmCargo></cargoFuncao>${pay}</infoComplementares>`;
}

function money(value: string | number): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : String(value);
}
