import { createHash } from 'node:crypto';

export const PROMOTED_PERIODIC_EVENT_CLASSES = [
  'S-1200',
  'S-1202',
  'S-1207',
  'S-1210',
  'S-1298',
  'S-1299',
] as const;

export type PromotedPeriodicEventClass =
  (typeof PROMOTED_PERIODIC_EVENT_CLASSES)[number];

export type EsocialPeriodicOperation = 'original';
export type EsocialEnvironment = '1' | '2';
export type PeriodicRubricKind =
  | 'EARNING'
  | 'DEDUCTION'
  | 'INFORMATION'
  | 'BASE';
export type PeriodicSourceEntityKind =
  | 'worker-remuneration'
  | 'rpps-worker-remuneration'
  | 'rpps-benefit-payment'
  | 'labor-income-payment'
  | 'periodic-reopening'
  | 'periodic-closure';
export type PeriodicTableVersionDependency =
  | 'S-1000'
  | 'S-1005'
  | 'S-1010'
  | 'S-1020';
export type PeriodicReceiptDependency =
  | 'S-1200'
  | 'S-1202'
  | 'S-1207'
  | 'S-1210'
  | 'S-1299'
  | 'S-2410';

export type PeriodicEventMetadata = Readonly<{
  eventCode: PromotedPeriodicEventClass;
  leiauteVersion: 'S-1.3';
  rootElement: 'eSocial';
  eventElement:
    | 'evtRemun'
    | 'evtRmnRPPS'
    | 'evtBenPrRP'
    | 'evtPgtos'
    | 'evtReabreEvPer'
    | 'evtFechaEvPer';
  namespace: string;
  xsdPath: string;
  tableVersionDependencies: readonly PeriodicTableVersionDependency[];
  receiptDependencies: readonly PeriodicReceiptDependency[];
}>;

export type PeriodicRubricDto = Readonly<{
  code: string;
  tableCode?: string;
  amount: string | number;
  quantity?: string | number | null;
  kind: PeriodicRubricKind;
}>;

export type PeriodicEventDtoBase<
  EventClass extends PromotedPeriodicEventClass,
> = Readonly<{
  eventClass: EventClass;
  tenantId: string;
  sourceEventId?: string;
  competence: string;
  employerRegistrationNumber: string;
  operation?: EsocialPeriodicOperation;
  environment?: EsocialEnvironment;
  processEmitter?: string;
  processVersion?: string;
}>;

export type S1200WorkerRemunerationDto = Readonly<{
  employeeId: string;
  registration: string;
  cpf: string;
  categoryCode: string;
  establishmentRegistrationNumber?: string;
  lotationCode?: string;
  ideDmDev?: string;
  eventId?: string;
  rubrics: readonly PeriodicRubricDto[];
}>;

export type S1200PeriodicDto = PeriodicEventDtoBase<'S-1200'> &
  Readonly<{
    payrollRunId: string;
    payrollRunStatus: string;
    workers: readonly S1200WorkerRemunerationDto[];
  }>;

export type S1202WorkerRemunerationDto = Readonly<{
  employeeId: string;
  registration: string;
  cpf: string;
  categoryCode: string;
  establishmentRegistrationNumber?: string;
  ideDmDev?: string;
  eventId?: string;
  rubrics: readonly PeriodicRubricDto[];
}>;

export type S1202PeriodicDto = PeriodicEventDtoBase<'S-1202'> &
  Readonly<{
    payrollRunId: string;
    payrollRunStatus: string;
    workers: readonly S1202WorkerRemunerationDto[];
  }>;

export type S1207BenefitSourceKind = 'RETIREMENT' | 'PENSION';

export type S1207BenefitPaymentDto = Readonly<{
  employeeId: string;
  beneficiaryCpf: string;
  benefitSourceKind: S1207BenefitSourceKind;
  benefitSourceId: string;
  benefitNumber: string;
  activeBenefitCount: number;
  establishmentRegistrationNumber?: string;
  ideDmDev?: string;
  eventId?: string;
  rubrics: readonly PeriodicRubricDto[];
}>;

export type S1207PeriodicDto = PeriodicEventDtoBase<'S-1207'> &
  Readonly<{
    payrollRunId: string;
    payrollRunStatus: string;
    benefits: readonly S1207BenefitPaymentDto[];
  }>;

export type S1210PaymentDto = Readonly<{
  employeeId: string;
  cpf: string;
  amount: string | number;
  paymentDate: string | Date;
  payrollRunId?: string | null;
  ideDmDev?: string;
  eventId?: string;
}>;

export type S1210PeriodicDto = PeriodicEventDtoBase<'S-1210'> &
  Readonly<{
    paymentBatchId: string;
    paymentBatchStatus: string;
    payrollRunId?: string | null;
    confirmedTotal: string | number;
    payments: readonly S1210PaymentDto[];
  }>;

export type S1298PeriodicDto = PeriodicEventDtoBase<'S-1298'> &
  Readonly<{
    sourceEntityId?: string;
    acceptedClosureReceipt: string;
    acceptedClosureAt: string | Date;
    eventId?: string;
  }>;

export type S1299PendingPeriodicDto = Readonly<{
  eventClass: 'S-1200' | 'S-1202' | 'S-1207' | 'S-1210';
  sourceEntityId: string;
  employeeId?: string;
  reason: string;
}>;

export type S1299PeriodicDto = PeriodicEventDtoBase<'S-1299'> &
  Readonly<{
    sourceEntityId?: string;
    pendingPeriodicEvents: readonly S1299PendingPeriodicDto[];
    acceptedEventCounts: Readonly<{
      remuneration: string | number;
      payments: string | number;
    }>;
    eventId?: string;
  }>;

export type PeriodicEventDto =
  | S1200PeriodicDto
  | S1202PeriodicDto
  | S1207PeriodicDto
  | S1210PeriodicDto
  | S1298PeriodicDto
  | S1299PeriodicDto;

export type BuiltPeriodicXmlEvent = Readonly<{
  eventClass: PromotedPeriodicEventClass;
  operation: EsocialPeriodicOperation;
  source: Readonly<{
    tenantId: string;
    sourceEventId?: string;
    sourceEntityId: string;
    sourceEntityKind: PeriodicSourceEntityKind;
    payrollRunId?: string;
    paymentBatchId?: string;
    employeeId?: string;
    benefitSourceId?: string;
  }>;
  eventId: string;
  reference: string;
  competence: string;
  xml: string;
  xmlSha256: string;
  metadata: PeriodicEventMetadata;
  payload: Record<string, unknown>;
}>;

const XSD_ROOT = 'packages/domain/src/sgp-lifted/esocial-worker/xsd';
const DEFAULT_ENVIRONMENT: EsocialEnvironment = '2';
const DEFAULT_PROCESS_EMITTER = '1';
const DEFAULT_PROCESS_VERSION = 'SGP-0.0.1';

export const PERIODIC_EVENT_METADATA: Readonly<
  Record<PromotedPeriodicEventClass, PeriodicEventMetadata>
> = {
  'S-1200': {
    eventCode: 'S-1200',
    leiauteVersion: 'S-1.3',
    rootElement: 'eSocial',
    eventElement: 'evtRemun',
    namespace: 'http://www.esocial.gov.br/schema/evt/evtRemun/v_S_01_03_00',
    xsdPath: `${XSD_ROOT}/evtRemun.xsd`,
    tableVersionDependencies: ['S-1000', 'S-1005', 'S-1010', 'S-1020'],
    receiptDependencies: [],
  },
  'S-1202': {
    eventCode: 'S-1202',
    leiauteVersion: 'S-1.3',
    rootElement: 'eSocial',
    eventElement: 'evtRmnRPPS',
    namespace: 'http://www.esocial.gov.br/schema/evt/evtRmnRPPS/v_S_01_03_00',
    xsdPath: `${XSD_ROOT}/evtRmnRPPS.xsd`,
    tableVersionDependencies: ['S-1000', 'S-1005', 'S-1010'],
    receiptDependencies: [],
  },
  'S-1207': {
    eventCode: 'S-1207',
    leiauteVersion: 'S-1.3',
    rootElement: 'eSocial',
    eventElement: 'evtBenPrRP',
    namespace: 'http://www.esocial.gov.br/schema/evt/evtBenPrRP/v_S_01_03_00',
    xsdPath: `${XSD_ROOT}/evtBenPrRP.xsd`,
    tableVersionDependencies: ['S-1000', 'S-1010'],
    receiptDependencies: ['S-2410'],
  },
  'S-1210': {
    eventCode: 'S-1210',
    leiauteVersion: 'S-1.3',
    rootElement: 'eSocial',
    eventElement: 'evtPgtos',
    namespace: 'http://www.esocial.gov.br/schema/evt/evtPgtos/v_S_01_03_00',
    xsdPath: `${XSD_ROOT}/evtPgtos.xsd`,
    tableVersionDependencies: ['S-1000'],
    receiptDependencies: ['S-1200', 'S-1202', 'S-1207'],
  },
  'S-1298': {
    eventCode: 'S-1298',
    leiauteVersion: 'S-1.3',
    rootElement: 'eSocial',
    eventElement: 'evtReabreEvPer',
    namespace:
      'http://www.esocial.gov.br/schema/evt/evtReabreEvPer/v_S_01_03_00',
    xsdPath: `${XSD_ROOT}/evtReabreEvPer.xsd`,
    tableVersionDependencies: ['S-1000'],
    receiptDependencies: ['S-1299'],
  },
  'S-1299': {
    eventCode: 'S-1299',
    leiauteVersion: 'S-1.3',
    rootElement: 'eSocial',
    eventElement: 'evtFechaEvPer',
    namespace:
      'http://www.esocial.gov.br/schema/evt/evtFechaEvPer/v_S_01_03_00',
    xsdPath: `${XSD_ROOT}/evtFechaEvPer.xsd`,
    tableVersionDependencies: ['S-1000'],
    receiptDependencies: ['S-1200', 'S-1202', 'S-1207', 'S-1210'],
  },
} as const;

export function isPromotedPeriodicEventClass(
  value: string,
): value is PromotedPeriodicEventClass {
  return PROMOTED_PERIODIC_EVENT_CLASSES.includes(
    value as PromotedPeriodicEventClass,
  );
}

export function buildPeriodicEvents(
  inputs: readonly PeriodicEventDto[],
): BuiltPeriodicXmlEvent[] {
  return inputs.flatMap((input) => buildPeriodicEvent(input));
}

export function buildPeriodicEvent(
  input: PeriodicEventDto,
): BuiltPeriodicXmlEvent[] {
  assertBaseDto(input);

  switch (input.eventClass) {
    case 'S-1200':
      return buildS1200(input);
    case 'S-1202':
      return buildS1202(input);
    case 'S-1207':
      return buildS1207(input);
    case 'S-1210':
      return buildS1210(input);
    case 'S-1298':
      return [buildS1298(input)];
    case 'S-1299':
      return [buildS1299(input)];
    default:
      return assertNever(input);
  }
}

export class PeriodicBuilderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PeriodicBuilderValidationError';
  }
}

export function buildPeriodicEsocialEventId(
  eventClass: PromotedPeriodicEventClass,
  tenantId: string,
  sourceId: string,
): string {
  const digits = sha256(`${eventClass}:${tenantId}:${sourceId}`)
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) - 97))
    .slice(0, 34);
  return `ID${digits}`;
}

function buildS1200(input: S1200PeriodicDto): BuiltPeriodicXmlEvent[] {
  requireGeneratedStatus(input.payrollRunStatus, 'S-1200');
  const payrollRunId = requireString(input.payrollRunId, 'payrollRunId');
  const workers = requireNonEmptyArray(input.workers, 'workers');
  return workers.map((worker) =>
    buildS1200Worker(input, payrollRunId, worker),
  );
}

function buildS1200Worker(
  input: S1200PeriodicDto,
  payrollRunId: string,
  worker: S1200WorkerRemunerationDto,
): BuiltPeriodicXmlEvent {
  const employeeId = requireString(worker.employeeId, 'workers.employeeId');
  const rubrics = requireNonEmptyArray(worker.rubrics, 'workers.rubrics');
  const eventId = resolveLeafEventId(
    input,
    worker.eventId,
    `${payrollRunId}:${employeeId}`,
  );
  const ideDmDev =
    worker.ideDmDev ?? demoId(payrollRunId, employeeId);
  const itemsXml = rubrics.map((rubric) => rubricXml(rubric)).join('\n            ');
  const metadata = PERIODIC_EVENT_METADATA['S-1200'];
  const xml = withFinalNewline(`<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="${metadata.namespace}">
  <evtRemun Id="${eventId}">
    ${ideEventoFolha(input)}
    ${ideEmpregadorXml(input.employerRegistrationNumber)}
    <ideTrabalhador><cpfTrab>${cpf(worker.cpf)}</cpfTrab></ideTrabalhador>
    <dmDev>
      <ideDmDev>${xmlEscape(ideDmDev)}</ideDmDev>
      <codCateg>${xmlEscape(requireString(worker.categoryCode, 'workers.categoryCode'))}</codCateg>
      <infoPerApur>
        <ideEstabLot>
          <tpInsc>1</tpInsc>
          <nrInsc>${fullRegistration(worker.establishmentRegistrationNumber ?? input.employerRegistrationNumber)}</nrInsc>
          <codLotacao>${xmlEscape(worker.lotationCode ?? 'LOT01')}</codLotacao>
          <remunPerApur>
            <matricula>${cleanText(worker.registration, employeeId).slice(0, 30)}</matricula>
            ${itemsXml}
          </remunPerApur>
        </ideEstabLot>
      </infoPerApur>
    </dmDev>
  </evtRemun>
</eSocial>`);

  return builtEvent(input, {
    sourceEntityId: employeeId,
    sourceEntityKind: 'worker-remuneration',
    payrollRunId,
    employeeId,
    eventId,
    xml,
    metadata,
    payload: {
      payrollRunId,
      employeeId,
      ideDmDev,
      rubricCount: rubrics.length,
      totalsByTpRubrica: totalsByKind(rubrics),
    },
  });
}

function buildS1202(input: S1202PeriodicDto): BuiltPeriodicXmlEvent[] {
  requireGeneratedStatus(input.payrollRunStatus, 'S-1202');
  const payrollRunId = requireString(input.payrollRunId, 'payrollRunId');
  const workers = requireNonEmptyArray(input.workers, 'workers');
  return workers.map((worker) =>
    buildS1202Worker(input, payrollRunId, worker),
  );
}

function buildS1202Worker(
  input: S1202PeriodicDto,
  payrollRunId: string,
  worker: S1202WorkerRemunerationDto,
): BuiltPeriodicXmlEvent {
  const employeeId = requireString(worker.employeeId, 'workers.employeeId');
  const rubrics = requireNonEmptyArray(worker.rubrics, 'workers.rubrics');
  const categoryCode = requireString(worker.categoryCode, 'workers.categoryCode');
  const eventId = resolveLeafEventId(
    input,
    worker.eventId,
    `${payrollRunId}:${employeeId}`,
  );
  const ideDmDev =
    worker.ideDmDev ?? demoId(payrollRunId, employeeId);
  const itemsXml = rubrics.map((rubric) => rubricXml(rubric)).join('');
  const metadata = PERIODIC_EVENT_METADATA['S-1202'];
  const xml = withFinalNewline(`<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="${metadata.namespace}">
  <evtRmnRPPS Id="${eventId}">
    ${ideEventoFolha(input)}
    ${ideEmpregadorXml(input.employerRegistrationNumber)}
    <ideTrabalhador><cpfTrab>${cpf(worker.cpf)}</cpfTrab></ideTrabalhador>
    <dmDev>
      <ideDmDev>${xmlEscape(ideDmDev)}</ideDmDev>
      <codCateg>${xmlEscape(categoryCode)}</codCateg>
      <infoPerApur>
        <ideEstab>
          <tpInsc>1</tpInsc>
          <nrInsc>${fullRegistration(worker.establishmentRegistrationNumber ?? input.employerRegistrationNumber)}</nrInsc>
          <remunPerApur>
            <matricula>${cleanText(worker.registration, employeeId).slice(0, 30)}</matricula>
            ${itemsXml}
          </remunPerApur>
        </ideEstab>
      </infoPerApur>
    </dmDev>
  </evtRmnRPPS>
</eSocial>`);

  return builtEvent(input, {
    sourceEntityId: employeeId,
    sourceEntityKind: 'rpps-worker-remuneration',
    payrollRunId,
    employeeId,
    eventId,
    xml,
    metadata,
    payload: {
      payrollRunId,
      employeeId,
      ideDmDev,
      codCateg: categoryCode,
      rubricCount: rubrics.length,
      totalsByRubric: totalsByRubric(rubrics),
      totalsByTpRubrica: totalsByKind(rubrics),
    },
  });
}

function buildS1207(input: S1207PeriodicDto): BuiltPeriodicXmlEvent[] {
  requireGeneratedStatus(input.payrollRunStatus, 'S-1207');
  const payrollRunId = requireString(input.payrollRunId, 'payrollRunId');
  const benefits = requireNonEmptyArray(input.benefits, 'benefits');
  return benefits.map((benefit) =>
    buildS1207Benefit(input, payrollRunId, benefit),
  );
}

function buildS1207Benefit(
  input: S1207PeriodicDto,
  payrollRunId: string,
  benefit: S1207BenefitPaymentDto,
): BuiltPeriodicXmlEvent {
  if (benefit.activeBenefitCount !== 1) {
    throw new PeriodicBuilderValidationError(
      'S-1207 emission requires exactly one active S-2410 benefit per beneficiary payroll row.',
    );
  }
  const employeeId = requireString(benefit.employeeId, 'benefits.employeeId');
  const benefitSourceId = requireString(
    benefit.benefitSourceId,
    'benefits.benefitSourceId',
  );
  const benefitSourceKind = requireBenefitSourceKind(
    benefit.benefitSourceKind,
    'benefits.benefitSourceKind',
  );
  const rubrics = requireNonEmptyArray(benefit.rubrics, 'benefits.rubrics');
  const eventId = resolveLeafEventId(
    input,
    benefit.eventId,
    `${payrollRunId}:${benefitSourceKind}:${benefitSourceId}`,
  );
  const ideDmDev =
    benefit.ideDmDev ?? demoId(payrollRunId, benefitSourceId);
  const benefitNumber = requireString(
    benefit.benefitNumber,
    'benefits.benefitNumber',
  );
  const itemsXml = rubrics.map((rubric) => rubricXml(rubric)).join('');
  const metadata = PERIODIC_EVENT_METADATA['S-1207'];
  const xml = withFinalNewline(`<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="${metadata.namespace}">
  <evtBenPrRP Id="${eventId}">
    ${ideEventoFolha(input)}
    ${ideEmpregadorXml(input.employerRegistrationNumber)}
    <ideBenef><cpfBenef>${cpf(benefit.beneficiaryCpf)}</cpfBenef></ideBenef>
    <dmDev>
      <ideDmDev>${xmlEscape(ideDmDev)}</ideDmDev>
      <nrBeneficio>${xmlEscape(benefitNumber)}</nrBeneficio>
      <infoPerApur>
        <ideEstab>
          <tpInsc>1</tpInsc>
          <nrInsc>${fullRegistration(benefit.establishmentRegistrationNumber ?? input.employerRegistrationNumber)}</nrInsc>
          ${itemsXml}
        </ideEstab>
      </infoPerApur>
    </dmDev>
  </evtBenPrRP>
</eSocial>`);

  return builtEvent(input, {
    sourceEntityId: benefitSourceId,
    sourceEntityKind: 'rpps-benefit-payment',
    payrollRunId,
    employeeId,
    benefitSourceId,
    eventId,
    xml,
    metadata,
    payload: {
      payrollRunId,
      employeeId,
      sourceKind: benefitSourceKind,
      benefitSourceId,
      nrBeneficio: benefitNumber,
      cpfBenef: onlyDigits(benefit.beneficiaryCpf),
      ideDmDev,
      rubricCount: rubrics.length,
      totalsByTpRubrica: totalsByKind(rubrics),
    },
  });
}

function buildS1210(input: S1210PeriodicDto): BuiltPeriodicXmlEvent[] {
  requirePaidStatus(input.paymentBatchStatus, 'S-1210');
  const paymentBatchId = requireString(input.paymentBatchId, 'paymentBatchId');
  const payments = requireNonEmptyArray(input.payments, 'payments');
  const emittedTotal = payments.reduce(
    (total, payment) => total + cents(payment.amount),
    0n,
  );
  const expectedTotal = cents(input.confirmedTotal);
  if (emittedTotal !== expectedTotal) {
    throw new PeriodicBuilderValidationError(
      `S-1210 vrLiq total ${moneyFromCents(
        emittedTotal,
      )} does not reconcile with confirmedTotal ${moneyFromCents(expectedTotal)}.`,
    );
  }
  return payments.map((payment) =>
    buildS1210Payment(input, paymentBatchId, payment),
  );
}

function buildS1210Payment(
  input: S1210PeriodicDto,
  paymentBatchId: string,
  payment: S1210PaymentDto,
): BuiltPeriodicXmlEvent {
  const employeeId = requireString(payment.employeeId, 'payments.employeeId');
  const payrollRunId = payment.payrollRunId ?? input.payrollRunId ?? undefined;
  const sourceId = `${paymentBatchId}:${employeeId}`;
  const eventId = resolveLeafEventId(input, payment.eventId, sourceId);
  const ideDmDev =
    payment.ideDmDev ?? demoId(payrollRunId ?? paymentBatchId, employeeId);
  const amount = money(payment.amount);
  const metadata = PERIODIC_EVENT_METADATA['S-1210'];
  const xml = withFinalNewline(`<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="${metadata.namespace}">
  <evtPgtos Id="${eventId}">
    ${ideEventoFolhaMensal(input)}
    ${ideEmpregadorXml(input.employerRegistrationNumber)}
    <ideBenef>
      <cpfBenef>${cpf(payment.cpf)}</cpfBenef>
      <infoPgto>
        <dtPgto>${dateOnly(payment.paymentDate)}</dtPgto>
        <tpPgto>1</tpPgto>
        <perRef>${input.competence}</perRef>
        <ideDmDev>${xmlEscape(ideDmDev)}</ideDmDev>
        <vrLiq>${amount}</vrLiq>
      </infoPgto>
    </ideBenef>
  </evtPgtos>
</eSocial>`);

  return builtEvent(input, {
    sourceEntityId: employeeId,
    sourceEntityKind: 'labor-income-payment',
    paymentBatchId,
    payrollRunId,
    employeeId,
    eventId,
    xml,
    metadata,
    payload: {
      paymentBatchId,
      payrollRunId: payrollRunId ?? null,
      employeeId,
      ideDmDev,
      vrLiq: amount,
    },
  });
}

function buildS1298(input: S1298PeriodicDto): BuiltPeriodicXmlEvent {
  const receipt = requireString(
    input.acceptedClosureReceipt,
    'acceptedClosureReceipt',
  ).trim();
  requireDateValue(input.acceptedClosureAt, 'acceptedClosureAt');
  const eventId =
    input.eventId ??
    buildPeriodicEsocialEventId(input.eventClass, input.tenantId, input.competence);
  assertEventId(eventId, 'eventId');
  const sourceEntityId = input.sourceEntityId ?? input.competence;
  const metadata = PERIODIC_EVENT_METADATA['S-1298'];
  const xml = withFinalNewline(`<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="${metadata.namespace}">
  <evtReabreEvPer Id="${eventId}">
    ${ideEventoFolhaSemRetificacao(input)}
    ${ideEmpregadorXml(input.employerRegistrationNumber)}
  </evtReabreEvPer>
</eSocial>`);

  return builtEvent(input, {
    sourceEntityId,
    sourceEntityKind: 'periodic-reopening',
    eventId,
    xml,
    metadata,
    payload: {
      competence: input.competence,
      employerRegistration: fullRegistration(input.employerRegistrationNumber),
      reopenedFromS1299Receipt: receipt,
    },
  });
}

function buildS1299(input: S1299PeriodicDto): BuiltPeriodicXmlEvent {
  const pendingPeriodicEvents = requireArray(
    input.pendingPeriodicEvents,
    'pendingPeriodicEvents',
  );
  if (pendingPeriodicEvents.length > 0) {
    throw new PeriodicBuilderValidationError(
      'S-1299 closure requires all S-1200/S-1202/S-1207/S-1210 periodics to have accepted receipts.',
    );
  }
  const sourceEntityId = input.sourceEntityId ?? input.competence;
  const eventId =
    input.eventId ??
    buildPeriodicEsocialEventId(input.eventClass, input.tenantId, input.competence);
  assertEventId(eventId, 'eventId');
  const remunerationCount = requireNonNegativeCount(
    input.acceptedEventCounts?.remuneration,
    'acceptedEventCounts.remuneration',
  );
  const paymentCount = requireNonNegativeCount(
    input.acceptedEventCounts?.payments,
    'acceptedEventCounts.payments',
  );
  const hasRemuneration = remunerationCount > 0;
  const hasPayments = paymentCount > 0;
  const metadata = PERIODIC_EVENT_METADATA['S-1299'];
  const xml = withFinalNewline(`<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="${metadata.namespace}">
  <evtFechaEvPer Id="${eventId}">
    ${ideEventoFolhaSemRetificacao(input)}
    ${ideEmpregadorXml(input.employerRegistrationNumber)}
    <infoFech>
      <evtRemun>${hasRemuneration ? 'S' : 'N'}</evtRemun>
      <evtPgtos>${hasPayments ? 'S' : 'N'}</evtPgtos>
      <evtComProd>N</evtComProd>
      <evtContratAvNP>N</evtContratAvNP>
      <evtInfoComplPer>N</evtInfoComplPer>
    </infoFech>
  </evtFechaEvPer>
</eSocial>`);

  return builtEvent(input, {
    sourceEntityId,
    sourceEntityKind: 'periodic-closure',
    eventId,
    xml,
    metadata,
    payload: {
      competence: input.competence,
      employerRegistration: fullRegistration(input.employerRegistrationNumber),
      remunerationCount: String(input.acceptedEventCounts.remuneration),
      paymentCount: String(input.acceptedEventCounts.payments),
    },
  });
}

function builtEvent(
  input: PeriodicEventDto,
  output: Readonly<{
    sourceEntityId: string;
    sourceEntityKind: PeriodicSourceEntityKind;
    payrollRunId?: string;
    paymentBatchId?: string;
    employeeId?: string;
    benefitSourceId?: string;
    eventId: string;
    xml: string;
    metadata: PeriodicEventMetadata;
    payload: Record<string, unknown>;
  }>,
): BuiltPeriodicXmlEvent {
  return {
    eventClass: input.eventClass,
    operation: input.operation ?? 'original',
    source: {
      tenantId: input.tenantId,
      sourceEventId: input.sourceEventId,
      sourceEntityId: output.sourceEntityId,
      sourceEntityKind: output.sourceEntityKind,
      payrollRunId: output.payrollRunId,
      paymentBatchId: output.paymentBatchId,
      employeeId: output.employeeId,
      benefitSourceId: output.benefitSourceId,
    },
    eventId: output.eventId,
    reference: output.eventId,
    competence: input.competence,
    xml: output.xml,
    xmlSha256: sha256(output.xml),
    metadata: output.metadata,
    payload: output.payload,
  };
}

function assertBaseDto(input: PeriodicEventDto): void {
  if (!isPromotedPeriodicEventClass(input.eventClass)) {
    throw new PeriodicBuilderValidationError(
      `Unsupported periodic eventClass: ${String(input.eventClass)}`,
    );
  }
  requireString(input.tenantId, 'tenantId');
  requireString(input.competence, 'competence');
  if (!/^\d{4}-\d{2}$/.test(input.competence)) {
    throw new PeriodicBuilderValidationError(
      'Periodic builder DTO field competence must be YYYY-MM.',
    );
  }
  requireString(input.employerRegistrationNumber, 'employerRegistrationNumber');
  if (input.operation && input.operation !== 'original') {
    throw new PeriodicBuilderValidationError(
      `Unsupported periodic operation: ${input.operation}`,
    );
  }
  if (input.environment && !/^[12]$/.test(input.environment)) {
    throw new PeriodicBuilderValidationError(
      `Unsupported eSocial environment: ${input.environment}`,
    );
  }
}

function resolveLeafEventId(
  input: PeriodicEventDto,
  eventId: string | undefined,
  sourceId: string,
): string {
  const resolved =
    eventId ?? buildPeriodicEsocialEventId(input.eventClass, input.tenantId, sourceId);
  assertEventId(resolved, 'eventId');
  return resolved;
}

function assertEventId(value: string, field: string): void {
  if (!/^ID\d{34}$/.test(value)) {
    throw new PeriodicBuilderValidationError(
      `Periodic builder DTO field ${field} must match ID plus 34 digits.`,
    );
  }
}

function requireGeneratedStatus(value: string, eventClass: string): void {
  if (requireString(value, 'payrollRunStatus') !== 'GENERATED') {
    throw new PeriodicBuilderValidationError(
      `${eventClass} emission requires payrollRunStatus=GENERATED.`,
    );
  }
}

function requirePaidStatus(value: string, eventClass: string): void {
  if (requireString(value, 'paymentBatchStatus') !== 'PAID') {
    throw new PeriodicBuilderValidationError(
      `${eventClass} emission requires paymentBatchStatus=PAID.`,
    );
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PeriodicBuilderValidationError(
      `Periodic builder DTO field ${field} is required.`,
    );
  }
  return value;
}

function requireBenefitSourceKind(
  value: unknown,
  field: string,
): S1207BenefitSourceKind {
  if (value === 'RETIREMENT' || value === 'PENSION') return value;
  throw new PeriodicBuilderValidationError(
    `Periodic builder DTO field ${field} must be RETIREMENT or PENSION.`,
  );
}

function requireDateValue(value: unknown, field: string): Date {
  const date = value instanceof Date
    ? value
    : typeof value === 'string'
      ? new Date(value)
      : undefined;
  if (!date || Number.isNaN(date.getTime())) {
    throw new PeriodicBuilderValidationError(
      `Periodic builder DTO field ${field} must be a valid date.`,
    );
  }
  return date;
}

function requireNonNegativeCount(value: unknown, field: string): number {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : Number.NaN;
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new PeriodicBuilderValidationError(
      `Periodic builder DTO field ${field} must be a non-negative integer.`,
    );
  }
  return numeric;
}

function requireNonEmptyArray<T>(
  value: readonly T[] | undefined,
  field: string,
): readonly T[] {
  const array = requireArray(value, field);
  if (array.length === 0) {
    throw new PeriodicBuilderValidationError(
      `Periodic builder DTO field ${field} must contain at least one item.`,
    );
  }
  return array;
}

function requireArray<T>(
  value: readonly T[] | undefined,
  field: string,
): readonly T[] {
  if (!Array.isArray(value) || value.length === 0) {
    if (Array.isArray(value)) return value;
    throw new PeriodicBuilderValidationError(
      `Periodic builder DTO field ${field} must be an array.`,
    );
  }
  return value;
}

function ideEventoFolha(input: PeriodicEventDto): string {
  return `<ideEvento><indRetif>1</indRetif><indApuracao>1</indApuracao><perApur>${input.competence}</perApur><tpAmb>${input.environment ?? DEFAULT_ENVIRONMENT}</tpAmb><procEmi>${xmlEscape(input.processEmitter ?? DEFAULT_PROCESS_EMITTER)}</procEmi><verProc>${xmlEscape(input.processVersion ?? DEFAULT_PROCESS_VERSION)}</verProc></ideEvento>`;
}

function ideEventoFolhaMensal(input: PeriodicEventDto): string {
  return `<ideEvento><indRetif>1</indRetif><perApur>${input.competence}</perApur><tpAmb>${input.environment ?? DEFAULT_ENVIRONMENT}</tpAmb><procEmi>${xmlEscape(input.processEmitter ?? DEFAULT_PROCESS_EMITTER)}</procEmi><verProc>${xmlEscape(input.processVersion ?? DEFAULT_PROCESS_VERSION)}</verProc></ideEvento>`;
}

function ideEventoFolhaSemRetificacao(input: PeriodicEventDto): string {
  return `<ideEvento><indApuracao>1</indApuracao><perApur>${input.competence}</perApur><tpAmb>${input.environment ?? DEFAULT_ENVIRONMENT}</tpAmb><procEmi>${xmlEscape(input.processEmitter ?? DEFAULT_PROCESS_EMITTER)}</procEmi><verProc>${xmlEscape(input.processVersion ?? DEFAULT_PROCESS_VERSION)}</verProc></ideEvento>`;
}

function ideEmpregadorXml(registrationNumber: string): string {
  return `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${employerRegistration(registrationNumber)}</nrInsc></ideEmpregador>`;
}

function requireRubricKind(
  value: unknown,
  field: string,
): PeriodicRubricKind {
  if (
    value === 'EARNING' ||
    value === 'DEDUCTION' ||
    value === 'INFORMATION' ||
    value === 'BASE'
  ) {
    return value;
  }
  throw new PeriodicBuilderValidationError(
    `Periodic builder DTO field ${field} must be a supported rubric kind.`,
  );
}

function rubricXml(rubric: PeriodicRubricDto): string {
  requireRubricKind(rubric.kind, 'rubrics.kind');
  const quantity =
    rubric.quantity === null || rubric.quantity === undefined
      ? ''
      : `<qtdRubr>${decimal(rubric.quantity, 4)}</qtdRubr>`;
  return `<itensRemun><codRubr>${xmlEscape(
    requireString(rubric.code, 'rubrics.code'),
  ).slice(0, 30)}</codRubr><ideTabRubr>${xmlEscape(
    rubric.tableCode ?? 'SGP',
  ).slice(0, 8)}</ideTabRubr>${quantity}<vrRubr>${money(
    rubric.amount,
  )}</vrRubr><indApurIR>0</indApurIR></itensRemun>`;
}

function totalsByKind(
  rubrics: readonly PeriodicRubricDto[],
): Record<string, string> {
  return rubrics.reduce<Record<string, string>>((totals, rubric) => {
    const kind = requireRubricKind(rubric.kind, 'rubrics.kind');
    totals[kind] = moneyFromCents(
      cents(totals[kind] ?? '0.00') + cents(rubric.amount),
    );
    return totals;
  }, {});
}

function totalsByRubric(
  rubrics: readonly PeriodicRubricDto[],
): Record<string, string> {
  return rubrics.reduce<Record<string, string>>((totals, rubric) => {
    const code = requireString(rubric.code, 'rubrics.code');
    totals[code] = moneyFromCents(
      cents(totals[code] ?? '0.00') + cents(rubric.amount),
    );
    return totals;
  }, {});
}

function cpf(value: string | null | undefined): string {
  return onlyDigits(value).padStart(11, '0').slice(0, 11);
}

function cleanText(value: string | null | undefined, fallback: string): string {
  const cleaned = String(value ?? fallback).trim();
  return xmlEscape(cleaned || fallback);
}

function employerRegistration(value: string | null | undefined): string {
  const digits = onlyDigits(value);
  return (digits.length >= 8 ? digits.slice(0, 8) : '12345678').padStart(
    8,
    '0',
  );
}

function fullRegistration(value: string | null | undefined): string {
  const digits = onlyDigits(value);
  return (
    digits.length >= 14 ? digits.slice(0, 14) : '12345678000199'
  ).padStart(14, '0');
}

function onlyDigits(value: string | number | boolean | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function demoId(sourceId: string, entityId: string): string {
  return `DM${sourceId.replace(/\D/g, '').slice(0, 10)}${entityId
    .replace(/\D/g, '')
    .slice(0, 10)}`.slice(0, 30);
}

function dateOnly(value: Date | string): string {
  return requireDateValue(value, 'paymentDate').toISOString().slice(0, 10);
}

function money(value: string | number): string {
  return decimal(value, 2);
}

function decimal(value: string | number, scale: number): string {
  const [wholeRaw = '0', fractionRaw = ''] = String(value).split('.');
  const whole = wholeRaw.replace(/[^\d-]/g, '') || '0';
  const fraction = fractionRaw
    .replace(/\D/g, '')
    .padEnd(scale, '0')
    .slice(0, scale);
  return `${whole}.${fraction}`;
}

function cents(value: string | number): bigint {
  const [wholeRaw = '0', fractionRaw = ''] = money(value).split('.');
  return (
    BigInt(wholeRaw) * 100n + BigInt(fractionRaw.padEnd(2, '0').slice(0, 2))
  );
}

function moneyFromCents(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function withFinalNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}

function assertNever(value: never): never {
  throw new PeriodicBuilderValidationError(
    `Unhandled periodic DTO: ${JSON.stringify(value)}`,
  );
}
