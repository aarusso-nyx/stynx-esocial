import type {
  EsocialPromotedBenefitProcessDto,
  EsocialPromotedBenefitProcessDtoEventClass,
  S2400BeneficiaryRegistrationDto,
  S2405BeneficiaryChangeDto,
  S2410BenefitStartDto,
  S2416BenefitChangeDto,
  S2418BenefitReactivationDto,
  S2420BenefitTerminationDto,
  S2501ProcessTaxDto,
  S2501ProcessTaxBaseDto,
  S3000ExclusionDto,
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
  ideEmpregadorXml,
  ideEvento,
  onlyDigits,
  validateRequired,
  withFinalNewline,
  xmlEscape,
} from './common.js';

type BenefitProcessMetadata = BuilderMetadata & Readonly<{
  eventCode: EsocialPromotedBenefitProcessDtoEventClass;
}>;

const XSD_ROOT = 'packages/domain/src/xml/xsd/bundle';

export const BENEFIT_PROCESS_EVENT_METADATA: Readonly<Record<
  EsocialPromotedBenefitProcessDtoEventClass,
  BenefitProcessMetadata
>> = {
  'S-2400': metadata('S-2400', 'evtCdBenefIn', 'evtCdBenefIn.xsd'),
  'S-2405': metadata('S-2405', 'evtCdBenefAlt', 'evtCdBenefAlt.xsd', ['S-2400']),
  'S-2410': metadata('S-2410', 'evtCdBenIn', 'evtCdBenIn.xsd', ['S-2400']),
  'S-2416': metadata('S-2416', 'evtCdBenAlt', 'evtCdBenAlt.xsd', ['S-2410']),
  'S-2418': metadata('S-2418', 'evtReativBen', 'evtReativBen.xsd', [
    'S-2410',
    'S-2420',
  ]),
  'S-2420': metadata('S-2420', 'evtCdBenTerm', 'evtCdBenTerm.xsd', ['S-2410']),
  'S-2501': metadata('S-2501', 'evtContProc', 'evtContProc.xsd'),
  'S-3000': metadata('S-3000', 'evtExclusao', 'evtExclusao.xsd'),
};

export function buildPromotedBenefitProcessXml(
  dto: EsocialPromotedBenefitProcessDto,
  ctx: BuilderContext = {},
): BuiltXml {
  switch (dto.eventClass) {
    case 'S-2400':
      return buildS2400Xml(dto, ctx);
    case 'S-2405':
      return buildS2405Xml(dto, ctx);
    case 'S-2410':
      return buildS2410Xml(dto, ctx);
    case 'S-2416':
      return buildS2416Xml(dto, ctx);
    case 'S-2418':
      return buildS2418Xml(dto, ctx);
    case 'S-2420':
      return buildS2420Xml(dto, ctx);
    case 'S-2501':
      return buildS2501Xml(dto, ctx);
    case 'S-3000':
      return buildS3000Xml(dto, ctx);
    default:
      return assertNever(dto);
  }
}

export function dispatchExclusionByOriginalClass(
  dto: S3000ExclusionDto,
): Readonly<{
  targetClassFamily: 'table' | 'periodic' | 'worker' | 'benefit' | 'process';
  identityXml: string;
}> {
  validateRequired(dto, ['originalEventClass', 'originalReceipt', 'exclusionReason']);

  if (dto.originalEventClass.startsWith('S-10')) {
    return { targetClassFamily: 'table', identityXml: '' };
  }

  if (
    dto.originalEventClass.startsWith('S-12') ||
    dto.originalEventClass === 'S-1298' ||
    dto.originalEventClass === 'S-1299'
  ) {
    validateRequired(dto, ['originalCompetence']);
    return {
      targetClassFamily: 'periodic',
      identityXml: `<ideFolhaPagto><indApuracao>1</indApuracao><perApur>${xmlEscape(
        dto.originalCompetence ?? '',
      )}</perApur></ideFolhaPagto>`,
    };
  }

  if (dto.originalEventClass.startsWith('S-22') || dto.originalEventClass.startsWith('S-23')) {
    validateRequired(dto, ['cpf']);
    return {
      targetClassFamily: 'worker',
      identityXml: `<ideTrabalhador><cpfTrab>${cpf(dto.cpf ?? '')}</cpfTrab></ideTrabalhador>`,
    };
  }

  if (dto.originalEventClass.startsWith('S-24')) {
    validateRequired(dto, ['beneficiaryCpf']);
    const benefit = dto.benefitNumber
      ? `<nrBeneficio>${xmlEscape(dto.benefitNumber)}</nrBeneficio>`
      : '';
    return {
      targetClassFamily: 'benefit',
      identityXml: `<ideBeneficio><cpfBenef>${cpf(dto.beneficiaryCpf ?? '')}</cpfBenef>${benefit}</ideBeneficio>`,
    };
  }

  if (dto.originalEventClass === 'S-2501') {
    return { targetClassFamily: 'process', identityXml: '' };
  }

  throw new DtoValidationError(['originalEventClass']);
}

export function assertPromotedBenefitProcessVariantHandled(
  eventClass: EsocialPromotedBenefitProcessDtoEventClass,
  variant: string,
): true {
  const variants: Readonly<Record<
    EsocialPromotedBenefitProcessDtoEventClass,
    readonly string[]
  >> = {
    'S-2400': ['default'],
    'S-2405': ['default'],
    'S-2410': ['retirement', 'pension'],
    'S-2416': ['pension-founder'],
    'S-2418': ['retirement', 'pension'],
    'S-2420': ['pension'],
    'S-2501': ['process-tax'],
    'S-3000': ['table', 'worker', 'periodic', 'benefit', 'process'],
  };
  if (!variants[eventClass].includes(variant)) {
    throw new DtoValidationError([`${eventClass}.kind`]);
  }
  return true;
}

function buildS2400Xml(
  dto: S2400BeneficiaryRegistrationDto,
  ctx: BuilderContext,
): BuiltXml {
  validateRequired(dto, [
    'tenantId',
    'sourceEventId',
    'employerCnpj',
    'beneficiaryId',
    'cpf',
    'name',
    'birthDate',
    'startDate',
    'sex',
  ]);
  const id = dto.eventId ?? eventId('S-2400', dto.tenantId, dto.beneficiaryId);
  const metadata = BENEFIT_PROCESS_EVENT_METADATA['S-2400'];
  const dependents = (dto.dependents ?? []).map(dependentXml).join('\n        ');
  const xml = envelope(metadata, id, ctx, dto.employerCnpj, `
    <beneficiario>
      <cpfBenef>${cpf(dto.cpf)}</cpfBenef>
      <nmBenefic>${xmlEscape(dto.name).slice(0, 70)}</nmBenefic>
      <dtNascto>${xmlEscape(dto.birthDate)}</dtNascto>
      <dtInicio>${xmlEscape(dto.startDate)}</dtInicio>
      <sexo>${xmlEscape(dto.sex)}</sexo>
      <racaCor>1</racaCor>
      <estCiv>${xmlEscape(dto.maritalStatus ?? '2')}</estCiv>
      <incFisMen>N</incFisMen>
      <endereco><brasil><tpLograd>R</tpLograd><dscLograd>Rua Central</dscLograd><nrLograd>100</nrLograd><bairro>Centro</bairro><cep>70000000</cep><codMunic>5300108</codMunic><uf>DF</uf></brasil></endereco>
      ${dependents}
    </beneficiario>`);
  return builtXml(xml, metadata, [id]);
}

function buildS2405Xml(dto: S2405BeneficiaryChangeDto, ctx: BuilderContext): BuiltXml {
  validateRequired(dto, [
    'tenantId',
    'sourceEventId',
    'employerCnpj',
    'beneficiaryId',
    'cpf',
    'name',
    'changeDate',
    'acceptedS2400Receipt',
  ]);
  const id = dto.eventId ?? eventId('S-2405', dto.tenantId, dto.sourceEventId);
  const metadata = BENEFIT_PROCESS_EVENT_METADATA['S-2405'];
  const xml = envelope(metadata, id, ctx, dto.employerCnpj, `
    <ideBenef><cpfBenef>${cpf(dto.cpf)}</cpfBenef></ideBenef>
    <alteracao>
      <dtAlteracao>${xmlEscape(dto.changeDate)}</dtAlteracao>
      <dadosBenef>
        <nmBenefic>${xmlEscape(dto.name).slice(0, 70)}</nmBenefic>
        <sexo>${xmlEscape(dto.sex ?? 'F')}</sexo>
        <racaCor>1</racaCor>
        <estCiv>${xmlEscape(dto.maritalStatus ?? '2')}</estCiv>
        <incFisMen>N</incFisMen>
        <endereco><brasil><tpLograd>R</tpLograd><dscLograd>Rua Alteracao</dscLograd><nrLograd>200</nrLograd><bairro>Centro</bairro><cep>70000000</cep><codMunic>5300108</codMunic><uf>DF</uf></brasil></endereco>
      </dadosBenef>
    </alteracao>`);
  return builtXml(xml, metadata, [id]);
}

function buildS2410Xml(dto: S2410BenefitStartDto, ctx: BuilderContext): BuiltXml {
  validateRequired(dto, [
    'tenantId',
    'sourceEventId',
    'employerCnpj',
    'benefitKind',
    'benefitIdentifier',
    'beneficiaryCpf',
    'benefitNumber',
    'startDate',
    'benefitType',
  ]);
  assertPromotedBenefitProcessVariantHandled(
    'S-2410',
    dto.benefitKind === 'PENSION' ? 'pension' : 'retirement',
  );
  const id = dto.eventId ?? eventId('S-2410', dto.tenantId, dto.benefitIdentifier);
  const metadata = BENEFIT_PROCESS_EVENT_METADATA['S-2410'];
  const registration = dto.registration
    ? `<matricula>${xmlEscape(dto.registration)}</matricula>`
    : '';
  const deathXml = dto.benefitKind === 'PENSION'
    ? `<infoPenMorte><tpPenMorte>${xmlEscape(dto.pensionDeathType ?? '1')}</tpPenMorte><instPenMorte><tpDepInst>${xmlEscape(dto.dependentTypeCode ?? '03')}</tpDepInst></instPenMorte></infoPenMorte>`
    : '';
  const deathGroupXml = deathXml ? `\n        ${deathXml}` : '';
  const xml = envelope(metadata, id, ctx, dto.employerCnpj, `
    <beneficiario><cpfBenef>${cpf(dto.beneficiaryCpf)}</cpfBenef>${registration}</beneficiario>
    <infoBenInicio>
      <cadIni>N</cadIni>
      <indSitBenef>1</indSitBenef>
      <nrBeneficio>${xmlEscape(dto.benefitNumber)}</nrBeneficio>
      <dtIniBeneficio>${xmlEscape(dto.startDate)}</dtIniBeneficio>
      <dadosBeneficio>
        <tpBeneficio>${xmlEscape(dto.benefitType)}</tpBeneficio>
        <tpPlanRP>${xmlEscape(dto.planType ?? '0')}</tpPlanRP>
        <dsc>${xmlEscape(dto.description ?? `${dto.benefitKind} ${dto.benefitIdentifier}`).slice(0, 255)}</dsc>
        <indDecJud>${xmlEscape(dto.judicialDecision ?? 'N')}</indDecJud>${deathGroupXml}
      </dadosBeneficio>
    </infoBenInicio>`);
  return builtXml(xml, metadata, [id]);
}

function buildS2416Xml(dto: S2416BenefitChangeDto, ctx: BuilderContext): BuiltXml {
  validateRequired(dto, [
    'tenantId',
    'sourceEventId',
    'employerCnpj',
    'benefitIdentifier',
    'beneficiaryCpf',
    'benefitNumber',
    'changeDate',
    'acceptedS2410Receipt',
    'benefitType',
  ]);
  const id = dto.eventId ?? eventId('S-2416', dto.tenantId, dto.sourceEventId);
  const metadata = BENEFIT_PROCESS_EVENT_METADATA['S-2416'];
  const xml = envelope(metadata, id, ctx, dto.employerCnpj, `
    <ideBeneficio><cpfBenef>${cpf(dto.beneficiaryCpf)}</cpfBenef><nrBeneficio>${xmlEscape(dto.benefitNumber)}</nrBeneficio></ideBeneficio>
    <infoBenAlteracao>
      <dtAltBeneficio>${xmlEscape(dto.changeDate)}</dtAltBeneficio>
      <dadosBeneficio>
        <tpBeneficio>${xmlEscape(dto.benefitType)}</tpBeneficio>
        <tpPlanRP>${xmlEscape(dto.planType ?? '0')}</tpPlanRP>
        <dsc>${xmlEscape(dto.description ?? `Alteracao ${dto.benefitIdentifier}`).slice(0, 255)}</dsc>
        <indSuspensao>${xmlEscape(dto.suspensionIndicator ?? 'N')}</indSuspensao>
        <infoPenMorte><tpPenMorte>${xmlEscape(dto.pensionDeathType ?? '1')}</tpPenMorte><instPenMorte><tpDepInst>${xmlEscape(dto.dependentTypeCode ?? '03')}</tpDepInst></instPenMorte></infoPenMorte>
      </dadosBeneficio>
    </infoBenAlteracao>`);
  return builtXml(xml, metadata, [id]);
}

function buildS2418Xml(
  dto: S2418BenefitReactivationDto,
  ctx: BuilderContext,
): BuiltXml {
  validateRequired(dto, [
    'tenantId',
    'sourceEventId',
    'employerCnpj',
    'benefitKind',
    'benefitIdentifier',
    'beneficiaryCpf',
    'benefitNumber',
    'effectiveReactivationDate',
    'financialEffectDate',
    'acceptedS2410Receipt',
    'suspendedOrTerminatedBenefitReceipt',
  ]);
  assertPromotedBenefitProcessVariantHandled(
    'S-2418',
    dto.benefitKind === 'PENSION' ? 'pension' : 'retirement',
  );
  const id = dto.eventId ?? eventId('S-2418', dto.tenantId, dto.sourceEventId);
  const metadata = BENEFIT_PROCESS_EVENT_METADATA['S-2418'];
  const xml = envelope(metadata, id, ctx, dto.employerCnpj, `
    <ideBeneficio><cpfBenef>${cpf(dto.beneficiaryCpf)}</cpfBenef><nrBeneficio>${xmlEscape(dto.benefitNumber)}</nrBeneficio></ideBeneficio>
    <infoReativ>
      <dtEfetReativ>${xmlEscape(dto.effectiveReactivationDate)}</dtEfetReativ>
      <dtEfeito>${xmlEscape(dto.financialEffectDate)}</dtEfeito>
    </infoReativ>`);
  return builtXml(xml, metadata, [id]);
}

function buildS2420Xml(
  dto: S2420BenefitTerminationDto,
  ctx: BuilderContext,
): BuiltXml {
  validateRequired(dto, [
    'tenantId',
    'sourceEventId',
    'employerCnpj',
    'benefitIdentifier',
    'beneficiaryCpf',
    'benefitNumber',
    'terminationDate',
    'terminationReasonCode',
    'acceptedS2410Receipt',
  ]);
  const id = dto.eventId ?? eventId('S-2420', dto.tenantId, dto.sourceEventId);
  const metadata = BENEFIT_PROCESS_EVENT_METADATA['S-2420'];
  const xml = envelope(metadata, id, ctx, dto.employerCnpj, `
    <ideBeneficio><cpfBenef>${cpf(dto.beneficiaryCpf)}</cpfBenef><nrBeneficio>${xmlEscape(dto.benefitNumber)}</nrBeneficio></ideBeneficio>
    <infoBenTermino>
      <dtTermBeneficio>${xmlEscape(dto.terminationDate)}</dtTermBeneficio>
      <mtvTermino>${xmlEscape(dto.terminationReasonCode)}</mtvTermino>
    </infoBenTermino>`);
  return builtXml(xml, metadata, [id]);
}

function buildS2501Xml(dto: S2501ProcessTaxDto, ctx: BuilderContext): BuiltXml {
  validateRequired(dto, [
    'tenantId',
    'sourceEventId',
    'employerCnpj',
    'processNumber',
    'paymentPeriod',
  ]);
  if (!Array.isArray(dto.processTaxBases) || dto.processTaxBases.length === 0) {
    throw new DtoValidationError(['processTaxBases']);
  }
  assertUniqueProcessNumbers(dto);
  const processNumber = processNumberDigits(dto.processNumber);
  const id = dto.eventId ?? eventId('S-2501', dto.tenantId, `${processNumber}:${dto.paymentPeriod}`);
  const metadata = BENEFIT_PROCESS_EVENT_METADATA['S-2501'];
  const basesByWorker = groupBasesByWorker(dto.processTaxBases);
  const sequenceXml =
    dto.sequenceNumber == null
      ? ''
      : `<ideSeqProc>${xmlEscape(dto.sequenceNumber)}</ideSeqProc>`;
  const observationXml = dto.observation
    ? `<obs>${xmlEscape(dto.observation).slice(0, 999)}</obs>`
    : '';
  const workers = [...basesByWorker.entries()].map(([workerCpf, bases]) =>
    `<ideTrab cpfTrab="${cpf(workerCpf)}">${bases.map(processTaxBaseXml).join('')}</ideTrab>`,
  ).join('\n    ');
  const xml = envelope(metadata, id, ctx, dto.employerCnpj, `
    <ideProc>
      <nrProcTrab>${processNumber}</nrProcTrab>
      <perApurPgto>${xmlEscape(dto.paymentPeriod)}</perApurPgto>
      ${sequenceXml}${observationXml}
    </ideProc>
    ${workers}`);
  return builtXml(xml, metadata, [id]);
}

function buildS3000Xml(dto: S3000ExclusionDto, ctx: BuilderContext): BuiltXml {
  validateRequired(dto, [
    'tenantId',
    'sourceEventId',
    'employerCnpj',
    'originalEventClass',
    'originalReceipt',
    'exclusionReason',
  ]);
  const route = dispatchExclusionByOriginalClass(dto);
  const id = dto.eventId ?? eventId('S-3000', dto.tenantId, dto.sourceEventId);
  const metadata = BENEFIT_PROCESS_EVENT_METADATA['S-3000'];
  const xml = envelope(metadata, id, ctx, dto.employerCnpj, `
    <infoExclusao>
      <tpEvento>${xmlEscape(dto.originalEventClass)}</tpEvento>
      <nrRecEvt>${xmlEscape(dto.originalReceipt)}</nrRecEvt>
      ${route.identityXml}
      <justificativa>${xmlEscape(dto.exclusionReason).slice(0, 255)}</justificativa>
    </infoExclusao>`);
  return builtXml(xml, metadata, [id]);
}

function metadata(
  eventCode: EsocialPromotedBenefitProcessDtoEventClass,
  eventElement: BenefitProcessMetadata['eventElement'],
  xsdFile: string,
  receiptDependencies: readonly string[] = [],
): BenefitProcessMetadata {
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

function envelope(
  metadata: BenefitProcessMetadata,
  id: string,
  ctx: BuilderContext,
  employerCnpj: string,
  body: string,
): string {
  return withFinalNewline(`<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="${metadata.namespace}">
  <${metadata.eventElement} Id="${id}">
    ${ideEvento(ctx, { includeRetification: metadata.eventCode !== 'S-3000' })}
    ${ideEmpregadorXml(employerCnpj)}
${body}
  </${metadata.eventElement}>
</eSocial>`);
}

function dependentXml(
  dependent: NonNullable<S2400BeneficiaryRegistrationDto['dependents']>[number],
): string {
  validateRequired(dependent, [
    'sourceDependentId',
    'name',
    'birthDate',
    'relationshipCode',
  ]);
  const cpfXml = dependent.cpf ? `<cpfDep>${cpf(dependent.cpf)}</cpfDep>` : '';
  return `<dependente><tpDep>${xmlEscape(dependent.relationshipCode)}</tpDep><nmDep>${xmlEscape(dependent.name)}</nmDep><dtNascto>${xmlEscape(dependent.birthDate)}</dtNascto>${cpfXml}</dependente>`;
}

function processTaxBaseXml(base: S2501ProcessTaxBaseDto): string {
  validateRequired(base, ['workerCpf', 'referencePeriod']);
  const calcTrib = `<calcTrib perRef="${xmlEscape(base.referencePeriod)}" vrBcCpMensal="${money(base.monthlyBase)}" vrBcCp13="${money(base.thirteenthBase)}">${(base.contributions ?? []).map((item) => `<infoCRContrib tpCR="${revenueCode(item.revenueCode)}" vrCR="${positiveMoney(item.amount, 'contributions.amount')}"/>`).join('')}</calcTrib>`;
  const irrf = (base.irrf ?? []).map((item) => {
    const thirteenth = item.thirteenthAmount == null
      ? ''
      : ` vrCR13="${positiveMoney(item.thirteenthAmount, 'irrf.thirteenthAmount')}"`;
    return `<infoCRIRRF tpCR="${xmlEscape(item.revenueCode)}" vrCR="${money(item.amount)}"${thirteenth}/>`;
  }).join('');
  return `${calcTrib}${irrf}`;
}

function groupBasesByWorker(
  bases: readonly S2501ProcessTaxBaseDto[],
): Map<string, readonly S2501ProcessTaxBaseDto[]> {
  const grouped = new Map<string, S2501ProcessTaxBaseDto[]>();
  for (const base of bases) {
    const key = cpf(base.workerCpf);
    grouped.set(key, [...(grouped.get(key) ?? []), base]);
  }
  return grouped;
}

function assertUniqueProcessNumbers(dto: S2501ProcessTaxDto): void {
  const numbers = [dto.processNumber, ...(dto.linkedProcessNumbers ?? [])]
    .map(processNumberDigits);
  if (new Set(numbers).size !== numbers.length) {
    throw new DtoValidationError(['linkedProcessNumbers']);
  }
}

function processNumberDigits(value: string): string {
  const digits = onlyDigits(value);
  if (digits.length !== 15 && digits.length !== 20) {
    throw new DtoValidationError(['processNumber']);
  }
  return digits;
}

function revenueCode(value: string): string {
  const digits = onlyDigits(value);
  if (!/^\d{6}$/u.test(digits)) throw new DtoValidationError(['revenueCode']);
  return digits;
}

function money(value: string | number): string {
  const amount = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(amount) || amount < 0) {
    throw new DtoValidationError(['amount']);
  }
  return amount.toFixed(2);
}

function positiveMoney(value: string | number, fieldPath: string): string {
  const amount = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new DtoValidationError([fieldPath]);
  }
  return amount.toFixed(2);
}
