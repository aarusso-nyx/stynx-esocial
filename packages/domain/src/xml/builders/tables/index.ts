import { createHash } from 'node:crypto';

import { assertNever } from '../../../internal/exhaustive.js';

export const PROMOTED_TABLE_EVENT_CLASSES = [
  'S-1000',
  'S-1005',
  'S-1010',
  'S-1020',
  'S-1050',
  'S-1070',
] as const;

export type PromotedTableEventClass =
  (typeof PROMOTED_TABLE_EVENT_CLASSES)[number];

export type EsocialTableOperation = 'inclusao';
export type EsocialEnvironment = '1' | '2';
export type TableSourceEntityKind =
  | 'employer'
  | 'establishment'
  | 'rubric'
  | 'tax-lotation'
  | 'work-schedule'
  | 'process';

export type TableVersionDependency =
  | 'S-1000'
  | 'S-1005'
  | 'S-1010'
  | 'S-1020'
  | 'S-1050'
  | 'S-1070';

export type TableEventMetadata = Readonly<{
  eventCode: PromotedTableEventClass;
  leiauteVersion: 'S-1.3';
  rootElement: 'eSocial';
  eventElement:
    | 'evtInfoEmpregador'
    | 'evtTabEstab'
    | 'evtTabRubrica'
    | 'evtTabLotacao'
    | 'evtTabJornada'
    | 'evtTabProcesso';
  namespace: string;
  xsdPath: string;
  tableVersionDependencies: readonly TableVersionDependency[];
}>;

export type TableEventDtoBase<EventClass extends PromotedTableEventClass> =
  Readonly<{
    eventClass: EventClass;
    tenantId: string;
    sourceEntityId: string;
    sourceEventId?: string | undefined;
    competence: string;
    operation?: EsocialTableOperation | undefined;
    environment?: EsocialEnvironment | undefined;
    processEmitter?: string | undefined;
    processVersion?: string | undefined;
    eventId?: string | undefined;
  }>;

export type S1000TableDto = TableEventDtoBase<'S-1000'> &
  Readonly<{
    employer: Readonly<{
      registrationNumber: string;
      classTrib?: string | undefined;
      cooperativeIndicator?: string | undefined;
      constructionIndicator?: string | undefined;
      payrollExemptionIndicator?: string | undefined;
      electronicRecordOption?: string | undefined;
    }>;
  }>;

export type S1005TableDto = TableEventDtoBase<'S-1005'> &
  Readonly<{
    establishment: Readonly<{
      registrationNumber: string;
      employerRegistrationNumber: string;
      cnaePreponderante?: string | undefined;
    }>;
  }>;

export type S1010TableDto = TableEventDtoBase<'S-1010'> &
  Readonly<{
    rubric: Readonly<{
      code: string;
      tableId?: string | undefined;
      description: string;
      natureCode?: string | undefined;
      type: 'earning' | 'deduction' | 'informational' | 'informational-deduction';
      incidences?: Readonly<{
        codIncCP?: string | undefined;
        codIncIRRF?: string | undefined;
        codIncFGTS?: string | undefined;
        codIncCPRP?: string | undefined;
        codIncPisPasep?: string | number | boolean | undefined;
      }>;
      remunerationCeiling?: 'S' | 'N' | undefined;
      employerRegistrationNumber: string;
    }>;
  }>;

export type S1020TableDto = TableEventDtoBase<'S-1020'> &
  Readonly<{
    taxLotation: Readonly<{
      code: string;
      employerRegistrationNumber: string;
      typeCode?: string | undefined;
      fpasCode?: string | undefined;
      thirdPartyCode?: string | undefined;
    }>;
  }>;

export type S1050TableDto = TableEventDtoBase<'S-1050'> &
  Readonly<{
    workSchedule: Readonly<{
      code: string;
      description: string;
      dailyHours: string | number;
      employerRegistrationNumber: string;
    }>;
  }>;

export type S1070TableDto = TableEventDtoBase<'S-1070'> &
  Readonly<{
    process: Readonly<{
      processNumber: string;
      subject: string;
      employerRegistrationNumber: string;
      processType?: string | undefined;
      matterIndicator?: string | undefined;
    }>;
  }>;

export type TableEventDto =
  | S1000TableDto
  | S1005TableDto
  | S1010TableDto
  | S1020TableDto
  | S1050TableDto
  | S1070TableDto;

export type BuiltTableXmlEvent = Readonly<{
  eventClass: PromotedTableEventClass;
  operation: EsocialTableOperation;
  source: Readonly<{
    tenantId: string;
    sourceEventId?: string | undefined;
    sourceEntityId: string;
    sourceEntityKind: TableSourceEntityKind;
  }>;
  eventId: string;
  reference: string;
  competence: string;
  xml: string;
  xmlSha256: string;
  metadata: TableEventMetadata;
}>;

const XSD_ROOT = 'packages/domain/src/xml/xsd/bundle';
const DEFAULT_ENVIRONMENT: EsocialEnvironment = '2';
const DEFAULT_PROCESS_EMITTER = '1';
const DEFAULT_PROCESS_VERSION = 'SGP-0.0.1';

export const TABLE_EVENT_METADATA: Readonly<
  Record<PromotedTableEventClass, TableEventMetadata>
> = {
  'S-1000': {
    eventCode: 'S-1000',
    leiauteVersion: 'S-1.3',
    rootElement: 'eSocial',
    eventElement: 'evtInfoEmpregador',
    namespace:
      'http://www.esocial.gov.br/schema/evt/evtInfoEmpregador/v_S_01_03_00',
    xsdPath: `${XSD_ROOT}/evtInfoEmpregador.xsd`,
    tableVersionDependencies: [],
  },
  'S-1005': {
    eventCode: 'S-1005',
    leiauteVersion: 'S-1.3',
    rootElement: 'eSocial',
    eventElement: 'evtTabEstab',
    namespace: 'http://www.esocial.gov.br/schema/evt/evtTabEstab/v_S_01_03_00',
    xsdPath: `${XSD_ROOT}/evtTabEstab.xsd`,
    tableVersionDependencies: ['S-1000'],
  },
  'S-1010': {
    eventCode: 'S-1010',
    leiauteVersion: 'S-1.3',
    rootElement: 'eSocial',
    eventElement: 'evtTabRubrica',
    namespace:
      'http://www.esocial.gov.br/schema/evt/evtTabRubrica/v_S_01_03_00',
    xsdPath: `${XSD_ROOT}/evtTabRubrica.xsd`,
    tableVersionDependencies: ['S-1000'],
  },
  'S-1020': {
    eventCode: 'S-1020',
    leiauteVersion: 'S-1.3',
    rootElement: 'eSocial',
    eventElement: 'evtTabLotacao',
    namespace:
      'http://www.esocial.gov.br/schema/evt/evtTabLotacao/v_S_01_03_00',
    xsdPath: `${XSD_ROOT}/evtTabLotacao.xsd`,
    tableVersionDependencies: ['S-1000'],
  },
  'S-1050': {
    eventCode: 'S-1050',
    leiauteVersion: 'S-1.3',
    rootElement: 'eSocial',
    eventElement: 'evtTabJornada',
    namespace:
      'http://www.esocial.gov.br/schema/evt/evtTabJornada/v_S_01_03_00',
    xsdPath: `${XSD_ROOT}/evtTabJornada.xsd`,
    tableVersionDependencies: ['S-1000'],
  },
  'S-1070': {
    eventCode: 'S-1070',
    leiauteVersion: 'S-1.3',
    rootElement: 'eSocial',
    eventElement: 'evtTabProcesso',
    namespace:
      'http://www.esocial.gov.br/schema/evt/evtTabProcesso/v_S_01_03_00',
    xsdPath: `${XSD_ROOT}/evtTabProcesso.xsd`,
    tableVersionDependencies: ['S-1000'],
  },
} as const;

export function isPromotedTableEventClass(
  value: string,
): value is PromotedTableEventClass {
  return PROMOTED_TABLE_EVENT_CLASSES.includes(
    value as PromotedTableEventClass,
  );
}

export function buildTableEvents(
  inputs: readonly TableEventDto[],
): BuiltTableXmlEvent[] {
  return inputs.map((input) => buildTableEvent(input));
}

export function buildTableEvent(input: TableEventDto): BuiltTableXmlEvent {
  assertBaseDto(input);

  switch (input.eventClass) {
    case 'S-1000':
      return buildS1000(input);
    case 'S-1005':
      return buildS1005(input);
    case 'S-1010':
      return buildS1010(input);
    case 'S-1020':
      return buildS1020(input);
    case 'S-1050':
      return buildS1050(input);
    case 'S-1070':
      return buildS1070(input);
    default:
      return assertNever(input);
  }
}

export class TableBuilderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TableBuilderValidationError';
  }
}

export function buildEsocialEventId(
  eventClass: PromotedTableEventClass,
  tenantId: string,
  sourceEntityId: string,
): string {
  const digits = sha256(`${eventClass}:${tenantId}:${sourceEntityId}`)
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) - 97))
    .slice(0, 34);
  return `ID${digits}`;
}

function buildS1000(input: S1000TableDto): BuiltTableXmlEvent {
  const employer = requireObject(input.employer, 'employer');
  const nrInsc = employerRegistration(
    requireString(employer.registrationNumber, 'employer.registrationNumber'),
  );
  const metadata = TABLE_EVENT_METADATA['S-1000'];
  const eventId = resolveEventId(input);
  const xml = withFinalNewline(`<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="${metadata.namespace}">
  <evtInfoEmpregador Id="${eventId}">
    ${ideEvento(input)}
    <ideEmpregador><tpInsc>1</tpInsc><nrInsc>${nrInsc}</nrInsc></ideEmpregador>
    <infoEmpregador>
      <inclusao>
        <idePeriodo><iniValid>${input.competence}</iniValid></idePeriodo>
        <infoCadastro>
          <classTrib>${xmlEscape(employer.classTrib ?? '85')}</classTrib>
          <indCoop>${xmlEscape(employer.cooperativeIndicator ?? '0')}</indCoop>
          <indConstr>${xmlEscape(employer.constructionIndicator ?? '0')}</indConstr>
          <indDesFolha>${xmlEscape(employer.payrollExemptionIndicator ?? '0')}</indDesFolha>
          <indOptRegEletron>${xmlEscape(employer.electronicRecordOption ?? '0')}</indOptRegEletron>
        </infoCadastro>
      </inclusao>
    </infoEmpregador>
  </evtInfoEmpregador>
</eSocial>`);
  return builtEvent(input, 'employer', eventId, xml, metadata);
}

function buildS1005(input: S1005TableDto): BuiltTableXmlEvent {
  const establishment = requireObject(input.establishment, 'establishment');
  const metadata = TABLE_EVENT_METADATA['S-1005'];
  const eventId = resolveEventId(input);
  const employer = employerRegistration(
    requireString(
      establishment.employerRegistrationNumber,
      'establishment.employerRegistrationNumber',
    ),
  );
  const estab = fullRegistration(
    requireString(
      establishment.registrationNumber,
      'establishment.registrationNumber',
    ),
  );
  const cnae = onlyDigits(establishment.cnaePreponderante ?? '8411600').slice(
    0,
    7,
  );
  const xml = withFinalNewline(`<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="${metadata.namespace}">
  <evtTabEstab Id="${eventId}">
    ${ideEvento(input)}
    ${ideEmpregador(employer)}
    <infoEstab>
      <inclusao>
        <ideEstab><tpInsc>1</tpInsc><nrInsc>${estab}</nrInsc><iniValid>${input.competence}</iniValid></ideEstab>
        <dadosEstab><cnaePrep>${cnae || '8411600'}</cnaePrep></dadosEstab>
      </inclusao>
    </infoEstab>
  </evtTabEstab>
</eSocial>`);
  return builtEvent(input, 'establishment', eventId, xml, metadata);
}

function buildS1010(input: S1010TableDto): BuiltTableXmlEvent {
  const rubric = requireObject(input.rubric, 'rubric');
  const metadata = TABLE_EVENT_METADATA['S-1010'];
  const eventId = resolveEventId(input);
  const employer = employerRegistration(
    requireString(
      rubric.employerRegistrationNumber,
      'rubric.employerRegistrationNumber',
    ),
  );
  const code = xmlEscape(requireString(rubric.code, 'rubric.code'));
  const description = xmlEscape(
    requireString(rubric.description, 'rubric.description'),
  ).slice(0, 100);
  const natureCode = xmlEscape(rubric.natureCode ?? '1000');
  const incidence = rubric.incidences ?? {};
  const codIncPisPasep = pisPasepIncidence(
    incidence.codIncPisPasep,
    rubric.type,
  );
  const xml = withFinalNewline(`<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="${metadata.namespace}">
  <evtTabRubrica Id="${eventId}">
    ${ideEvento(input)}
    ${ideEmpregador(employer)}
    <infoRubrica>
      <inclusao>
        <ideRubrica><codRubr>${code}</codRubr><ideTabRubr>${xmlEscape(rubric.tableId ?? 'SGP')}</ideTabRubr><iniValid>${input.competence}</iniValid></ideRubrica>
        <dadosRubrica>
          <dscRubr>${description}</dscRubr>
          <natRubr>${natureCode}</natRubr>
          <tpRubr>${rubricType(rubric.type)}</tpRubr>
          <codIncCP>${xmlEscape(incidence.codIncCP ?? '00')}</codIncCP>
          <codIncIRRF>${xmlEscape(incidence.codIncIRRF ?? '9')}</codIncIRRF>
          <codIncFGTS>${xmlEscape(incidence.codIncFGTS ?? '00')}</codIncFGTS>
          <codIncCPRP>${xmlEscape(incidence.codIncCPRP ?? '00')}</codIncCPRP>
          <codIncPisPasep>${codIncPisPasep}</codIncPisPasep>
          <tetoRemun>${xmlEscape(rubric.remunerationCeiling ?? 'N')}</tetoRemun>
        </dadosRubrica>
      </inclusao>
    </infoRubrica>
  </evtTabRubrica>
</eSocial>`);
  return builtEvent(input, 'rubric', eventId, xml, metadata);
}

function buildS1020(input: S1020TableDto): BuiltTableXmlEvent {
  const taxLotation = requireObject(input.taxLotation, 'taxLotation');
  const metadata = TABLE_EVENT_METADATA['S-1020'];
  const eventId = resolveEventId(input);
  const employer = employerRegistration(
    requireString(
      taxLotation.employerRegistrationNumber,
      'taxLotation.employerRegistrationNumber',
    ),
  );
  const code = xmlEscape(requireString(taxLotation.code, 'taxLotation.code')).slice(
    0,
    30,
  );
  const fpas = (taxLotation.fpasCode ?? '582').padStart(3, '0').slice(0, 3);
  const thirdPartyCode = (taxLotation.thirdPartyCode ?? '0000')
    .padStart(4, '0')
    .slice(0, 4);
  const xml = withFinalNewline(`<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="${metadata.namespace}">
  <evtTabLotacao Id="${eventId}">
    ${ideEvento(input)}
    ${ideEmpregador(employer)}
    <infoLotacao>
      <inclusao>
        <ideLotacao><codLotacao>${code}</codLotacao><iniValid>${input.competence}</iniValid></ideLotacao>
        <dadosLotacao>
          <tpLotacao>${xmlEscape(taxLotation.typeCode ?? '01')}</tpLotacao>
          <fpasLotacao><fpas>${fpas}</fpas><codTercs>${thirdPartyCode}</codTercs></fpasLotacao>
        </dadosLotacao>
      </inclusao>
    </infoLotacao>
  </evtTabLotacao>
</eSocial>`);
  return builtEvent(input, 'tax-lotation', eventId, xml, metadata);
}

function buildS1050(input: S1050TableDto): BuiltTableXmlEvent {
  const workSchedule = requireObject(input.workSchedule, 'workSchedule');
  const metadata = TABLE_EVENT_METADATA['S-1050'];
  const eventId = resolveEventId(input);
  const employer = employerRegistration(
    requireString(
      workSchedule.employerRegistrationNumber,
      'workSchedule.employerRegistrationNumber',
    ),
  );
  const code = xmlEscape(
    requireString(workSchedule.code, 'workSchedule.code'),
  );
  const description = xmlEscape(
    requireString(workSchedule.description, 'workSchedule.description'),
  ).slice(0, 100);
  const duration = workDuration(workSchedule.dailyHours);
  const xml = withFinalNewline(`<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="${metadata.namespace}">
  <evtTabJornada Id="${eventId}">
    ${ideEvento(input)}
    ${ideEmpregador(employer)}
    <infoJornada>
      <inclusao>
        <ideJornada><codJornada>${code}</codJornada><iniValid>${input.competence}</iniValid></ideJornada>
        <dadosJornada><dscJornada>${description}</dscJornada><durJornada>${duration}</durJornada></dadosJornada>
      </inclusao>
    </infoJornada>
  </evtTabJornada>
</eSocial>`);
  return builtEvent(input, 'work-schedule', eventId, xml, metadata);
}

function buildS1070(input: S1070TableDto): BuiltTableXmlEvent {
  const process = requireObject(input.process, 'process');
  const metadata = TABLE_EVENT_METADATA['S-1070'];
  const eventId = resolveEventId(input);
  const employer = employerRegistration(
    requireString(
      process.employerRegistrationNumber,
      'process.employerRegistrationNumber',
    ),
  );
  const processNumber = normalizedProcessNumber(
    requireString(process.processNumber, 'process.processNumber'),
  );
  const subject = xmlEscape(requireString(process.subject, 'process.subject')).slice(
    0,
    255,
  );
  const xml = withFinalNewline(`<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="${metadata.namespace}">
  <evtTabProcesso Id="${eventId}">
    ${ideEvento(input)}
    ${ideEmpregador(employer)}
    <infoProcesso>
      <inclusao>
        <ideProcesso><tpProc>${xmlEscape(process.processType ?? '1')}</tpProc><nrProc>${processNumber}</nrProc><iniValid>${input.competence}</iniValid></ideProcesso>
        <dadosProc><indMatProc>${xmlEscape(process.matterIndicator ?? '1')}</indMatProc><observacao>${subject}</observacao></dadosProc>
      </inclusao>
    </infoProcesso>
  </evtTabProcesso>
</eSocial>`);
  return builtEvent(input, 'process', eventId, xml, metadata);
}

function builtEvent(
  input: TableEventDto,
  sourceEntityKind: TableSourceEntityKind,
  eventId: string,
  xml: string,
  metadata: TableEventMetadata,
): BuiltTableXmlEvent {
  return {
    eventClass: input.eventClass,
    operation: input.operation ?? 'inclusao',
    source: {
      tenantId: input.tenantId,
      sourceEventId: input.sourceEventId,
      sourceEntityId: input.sourceEntityId,
      sourceEntityKind,
    },
    eventId,
    reference: eventId,
    competence: input.competence,
    xml,
    xmlSha256: sha256(xml),
    metadata,
  };
}

function assertBaseDto(input: TableEventDto): void {
  if (!isPromotedTableEventClass(input.eventClass)) {
    throw new TableBuilderValidationError(
      `Unsupported table eventClass: ${String(input.eventClass)}`,
    );
  }
  requireString(input.tenantId, 'tenantId');
  requireString(input.sourceEntityId, 'sourceEntityId');
  requireString(input.competence, 'competence');
  if (!/^\d{4}-\d{2}$/.test(input.competence)) {
    throw new TableBuilderValidationError(
      'Table builder DTO field competence must be YYYY-MM.',
    );
  }
  if (input.operation && input.operation !== 'inclusao') {
    throw new TableBuilderValidationError(
      `Unsupported table operation: ${input.operation}`,
    );
  }
  if (input.environment && !/^[12]$/.test(input.environment)) {
    throw new TableBuilderValidationError(
      `Unsupported eSocial environment: ${input.environment}`,
    );
  }
  if (input.eventId && !/^ID\d{34}$/.test(input.eventId)) {
    throw new TableBuilderValidationError(
      'Table builder DTO field eventId must match ID plus 34 digits.',
    );
  }
}

function resolveEventId(input: TableEventDto): string {
  return (
    input.eventId ??
    buildEsocialEventId(input.eventClass, input.tenantId, input.sourceEntityId)
  );
}

function ideEvento(input: TableEventDto): string {
  return `<ideEvento><tpAmb>${input.environment ?? DEFAULT_ENVIRONMENT}</tpAmb><procEmi>${xmlEscape(input.processEmitter ?? DEFAULT_PROCESS_EMITTER)}</procEmi><verProc>${xmlEscape(input.processVersion ?? DEFAULT_PROCESS_VERSION)}</verProc></ideEvento>`;
}

function ideEmpregador(cnpjRoot: string): string {
  return `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${cnpjRoot}</nrInsc></ideEmpregador>`;
}

function employerRegistration(value: string): string {
  const digits = onlyDigits(value);
  return (digits.length >= 8 ? digits.slice(0, 8) : '12345678').padStart(
    8,
    '0',
  );
}

function fullRegistration(value: string): string {
  const digits = onlyDigits(value);
  return (
    digits.length >= 14 ? digits.slice(0, 14) : '12345678000199'
  ).padStart(14, '0');
}

function onlyDigits(value: string | number | boolean): string {
  return String(value).replace(/\D/g, '');
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function rubricType(
  value: S1010TableDto['rubric']['type'],
): '1' | '2' | '3' | '4' {
  switch (value) {
    case 'earning':
      return '1';
    case 'deduction':
      return '2';
    case 'informational':
      return '3';
    case 'informational-deduction':
      return '4';
  }
}

function pisPasepIncidence(
  raw: string | number | boolean | undefined,
  rubricKind: S1010TableDto['rubric']['type'],
): string {
  const value =
    typeof raw === 'string' ||
    typeof raw === 'number' ||
    typeof raw === 'boolean'
      ? String(raw).trim()
      : '';
  if (/^(00|0|false|none|nao|nao_base)$/i.test(value)) return '00';
  if (/^(12|13)$/i.test(value)) return value;
  if (/^(11|true|1|base|monthly|mensal)$/i.test(value)) return '11';
  return rubricKind === 'earning' || rubricKind === 'informational'
    ? '11'
    : '00';
}

function workDuration(value: string | number): string {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0) {
    throw new TableBuilderValidationError(
      'Table builder DTO field workSchedule.dailyHours must be a positive number.',
    );
  }
  const wholeHours = Math.trunc(hours);
  const minutes = Math.trunc((hours - wholeHours) * 60);
  return `PT${wholeHours}H${minutes}M`;
}

function normalizedProcessNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 17 ? digits.slice(0, 17) : '12345678901234567';
}

function requireString(value: unknown, path: string): string {
  if (typeof value === 'string' && value.trim() !== '') return value;
  throw new TableBuilderValidationError(
    `Table builder DTO missing required field: ${path}`,
  );
}

function requireObject<T extends object>(value: T | undefined, path: string): T {
  if (value && typeof value === 'object') return value;
  throw new TableBuilderValidationError(
    `Table builder DTO missing required field: ${path}`,
  );
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function withFinalNewline(xml: string): string {
  return `${xml}\n`;
}
