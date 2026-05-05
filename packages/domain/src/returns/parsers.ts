import {
  ReturnXmlParseError,
  attributeText,
  childElements,
  directChildElement,
  directChildElements,
  directChildText,
  firstElement,
  firstOptionalText,
  firstText,
  parseReturnXmlDocument,
  serializeXmlNode,
} from './xml-tree.js';
import type { ReturnXmlNode } from './xml-tree.js';

export { ReturnXmlParseError } from './xml-tree.js';

export type ParsedIdentity = Readonly<{
  type: 'CNPJ' | 'CPF' | 'CAEPF' | 'CNO';
  registration: string;
  cnpj?: string | undefined;
  cpf?: string | undefined;
  caepf?: string | undefined;
  cno?: string | undefined;
}>;

export type ProtocolParseResult = Readonly<{
  protocol: string;
  responseCode: string | null;
  responseDescription: string | null;
  receivedAt: string | null;
  employer: ParsedIdentity | null;
  transmitter: ParsedIdentity | null;
}>;

export type ReturnOccurrence = Readonly<{
  type: 'ERROR' | 'WARNING' | 'HISTORY';
  code: string;
  description: string;
  location: string | null;
}>;

export type EventProcessingReturn = Readonly<{
  eventReference: string;
  duplicate: boolean;
  responseCode: string;
  responseDescription: string;
  receipt: string | null;
  processedAt: string | null;
  errors: readonly ReturnOccurrence[];
  rawXml: string;
}>;

export type BatchProcessingReturn = Readonly<{
  protocol: string | null;
  responseCode: string;
  responseDescription: string;
  estimatedConclusionSeconds: number | null;
  receivedAt: string | null;
  processedAt: string | null;
  employer: ParsedIdentity | null;
  transmitter: ParsedIdentity | null;
  occurrences: readonly ReturnOccurrence[];
  events: readonly EventProcessingReturn[];
}>;

export type ESocialTotalizerKind =
  | 'S-5001'
  | 'S-5002'
  | 'S-5011'
  | 'S-5012'
  | 'S-5013';

export type ParsedTotalizerReturn = Readonly<{
  competence: string;
  kind: ESocialTotalizerKind;
  eventElement: string;
  eventId: string | null;
  sourceEventReceipt: string;
  payload: Record<string, unknown>;
}>;

export type ParsedEsocialReturn =
  | Readonly<{
      kind: 'protocol';
      responseCode: string | null;
      responseDescription: string | null;
      protocol: string;
      receipt: null;
      protocolReturn: ProtocolParseResult;
    }>
  | Readonly<{
      kind: 'processing';
      responseCode: string;
      responseDescription: string;
      protocol: string | null;
      receipt: string | null;
      processingReturn: BatchProcessingReturn;
    }>
  | Readonly<{
      kind: 'totalizer';
      responseCode: '201';
      responseDescription: 'Totalizer received.';
      protocol: string | null;
      receipt: string;
      totalizer: ParsedTotalizerReturn;
    }>
  | Readonly<{
      kind: 'soap_fault';
      responseCode: 'SOAP_FAULT';
      responseDescription: string;
      protocol: null;
      receipt: null;
      fault: string;
    }>;

type MoneyText = string;

const IDENTITY_FIELD_BY_TPINSC = {
  '1': ['CNPJ', 'cnpj'],
  '2': ['CPF', 'cpf'],
  '3': ['CAEPF', 'caepf'],
  '4': ['CNO', 'cno'],
} as const;

const KIND_BY_EVENT_ELEMENT: Readonly<Record<string, ESocialTotalizerKind>> = {
  evtBasesTrab: 'S-5001',
  evtIrrfBenef: 'S-5002',
  evtCS: 'S-5011',
  evtIrrf: 'S-5012',
  evtFGTS: 'S-5013',
};

export function parseEsocialReturnXml(xml: string): ParsedEsocialReturn {
  const document = parseReturnXmlDocument(xml, 'eSocial return');
  const fault = soapFaultText(document);
  if (fault) {
    return {
      kind: 'soap_fault',
      responseCode: 'SOAP_FAULT',
      responseDescription: fault,
      protocol: null,
      receipt: null,
      fault,
    };
  }

  const totalizerElement = totalizerEventElement(document);
  if (totalizerElement) {
    const totalizer = parseTotalizerDocument(document, xml, totalizerElement);
    return {
      kind: 'totalizer',
      responseCode: '201',
      responseDescription: 'Totalizer received.',
      protocol: null,
      receipt: totalizer.sourceEventReceipt,
      totalizer,
    };
  }

  if (firstElement(document, 'retornoEventos')) {
    const processingReturn = parseProcessingDocument(document);
    const primaryEvent = processingReturn.events[0];
    return {
      kind: 'processing',
      responseCode: primaryEvent?.responseCode ?? processingReturn.responseCode,
      responseDescription:
        primaryEvent?.responseDescription ?? processingReturn.responseDescription,
      protocol: processingReturn.protocol,
      receipt: primaryEvent?.receipt ?? null,
      processingReturn,
    };
  }

  if (firstElement(document, 'retornoEnvioLoteEventos')) {
    const protocolReturn = parseProtocolDocument(document);
    return {
      kind: 'protocol',
      responseCode: protocolReturn.responseCode,
      responseDescription: protocolReturn.responseDescription,
      protocol: protocolReturn.protocol,
      receipt: null,
      protocolReturn,
    };
  }

  throw new ReturnXmlParseError(
    'Unsupported eSocial return XML; expected protocol, processing, SOAP fault, or S-50xx totalizer.',
  );
}

export function parseProtocolResponseXml(xml: string): ProtocolParseResult {
  const document = parseReturnXmlDocument(xml, 'eSocial protocol response');
  const fault = soapFaultText(document);
  if (fault) {
    throw new ReturnXmlParseError(`eSocial protocol SOAP fault: ${fault}`);
  }
  return parseProtocolDocument(document);
}

export function protocolFromXml(xml: string): string {
  return firstText(
    parseReturnXmlDocument(xml, 'eSocial protocol response'),
    'protocoloEnvio',
  );
}

export function parseProcessingResponseXml(xml: string): BatchProcessingReturn {
  const document = parseReturnXmlDocument(xml, 'eSocial processing response');
  const fault = soapFaultText(document);
  if (fault) {
    throw new ReturnXmlParseError(`eSocial processing SOAP fault: ${fault}`);
  }
  return parseProcessingDocument(document);
}

export function parseTotalizerXml(xml: string): ParsedTotalizerReturn {
  const document = parseReturnXmlDocument(xml, 'eSocial totalizer');
  const eventElement = totalizerEventElement(document);
  if (!eventElement) {
    throw new ReturnXmlParseError(
      'Unsupported eSocial totalizer kind; expected S-5001, S-5002, S-5011, S-5012, or S-5013.',
    );
  }
  return parseTotalizerDocument(document, xml, eventElement);
}

function parseProtocolDocument(document: ReturnXmlNode): ProtocolParseResult {
  const protocol =
    firstOptionalText(document, 'protocoloEnvio') ??
    firstOptionalText(document, 'nrRecibo');
  if (!protocol) {
    throw new ReturnXmlParseError(
      'eSocial protocol return is missing protocoloEnvio.',
    );
  }

  const status = firstElement(document, 'status');
  return {
    protocol,
    responseCode: status ? firstOptionalText(status, 'cdResposta') : null,
    responseDescription: status
      ? firstOptionalText(status, 'descResposta')
      : null,
    receivedAt:
      firstOptionalText(document, 'dhRecepcao') ??
      firstOptionalText(document, 'dhProcessamento'),
    employer: parseIdentity(firstElement(document, 'ideEmpregador')),
    transmitter: parseIdentity(firstElement(document, 'ideTransmissor')),
  };
}

function parseProcessingDocument(document: ReturnXmlNode): BatchProcessingReturn {
  const status = firstElement(document, 'status');
  if (!status) {
    throw new ReturnXmlParseError('eSocial processing return is missing status.');
  }
  const responseCode = firstText(status, 'cdResposta');
  const responseDescription = firstText(status, 'descResposta');

  return {
    protocol:
      firstOptionalText(document, 'protocoloEnvio') ??
      firstOptionalText(document, 'nrRecibo'),
    responseCode,
    responseDescription,
    estimatedConclusionSeconds: numberOrNull(
      firstOptionalText(status, 'tempoEstimadoConclusao') ??
        firstOptionalText(status, 'tempoEstimado'),
    ),
    receivedAt:
      firstOptionalText(document, 'dhRecepcao') ??
      firstOptionalText(document, 'dhRecepcaoLote'),
    processedAt:
      firstOptionalText(document, 'dhProcessamento') ??
      firstOptionalText(document, 'dhProcessamentoLote'),
    employer: parseIdentity(firstElement(document, 'ideEmpregador')),
    transmitter: parseIdentity(firstElement(document, 'ideTransmissor')),
    occurrences: parseOccurrences(document),
    events: parseEventReturns(document),
  };
}

function parseEventReturns(document: ReturnXmlNode): EventProcessingReturn[] {
  const retornoEventos = firstElement(document, 'retornoEventos');
  if (!retornoEventos) return [];

  return directChildElements(retornoEventos, 'evento').map((eventNode) => {
    const retornoEvento = firstElement(eventNode, 'retornoEvento');
    const processing = retornoEvento
      ? firstElement(retornoEvento, 'processamento')
      : null;
    const eventReference = attributeText(eventNode, 'Id');
    if (!eventReference) {
      throw new ReturnXmlParseError(
        'eSocial processing event return is missing Id.',
      );
    }
    if (!processing) {
      throw new ReturnXmlParseError(
        `eSocial processing event ${eventReference} is missing processamento.`,
      );
    }

    return {
      eventReference,
      duplicate: ['true', '1'].includes(
        (attributeText(eventNode, 'evtDupl') ?? '').toLowerCase(),
      ),
      responseCode: firstText(processing, 'cdResposta'),
      responseDescription: firstText(processing, 'descResposta'),
      receipt: firstOptionalText(eventNode, 'nrRecibo'),
      processedAt: firstOptionalText(processing, 'dhProcessamento'),
      errors: parseOccurrences(processing),
      rawXml: serializeXmlNode(retornoEvento ?? eventNode),
    };
  });
}

function parseOccurrences(node: ReturnXmlNode): ReturnOccurrence[] {
  return childElements(node, 'ocorrencias').flatMap((container) =>
    directChildElements(container, 'ocorrencia').map((occurrence) => {
      const code = directChildText(occurrence, 'codigo');
      const description = directChildText(occurrence, 'descricao');
      if (!code || !description) {
        throw new ReturnXmlParseError(
          'eSocial occurrence is missing codigo or descricao.',
        );
      }
      return {
        type: occurrenceType(directChildText(occurrence, 'tipo')),
        code,
        description,
        location: directChildText(occurrence, 'localizacao'),
      };
    }),
  );
}

function parseTotalizerDocument(
  document: ReturnXmlNode,
  xml: string,
  eventElement: string,
): ParsedTotalizerReturn {
  const kind = KIND_BY_EVENT_ELEMENT[eventElement];
  if (!kind) {
    throw new ReturnXmlParseError(
      'Unsupported eSocial totalizer kind; expected S-5001, S-5002, S-5011, S-5012, or S-5013.',
    );
  }

  const competence = monthCompetence(firstText(document, 'perApur'));
  const sourceEventReceipt =
    firstOptionalText(document, 'nrRecArqBase') ??
    firstOptionalText(document, 'nrRecEvt') ??
    firstOptionalText(document, 'nrRecibo');
  if (!sourceEventReceipt) {
    throw new ReturnXmlParseError(
      'eSocial totalizer return is missing source event receipt.',
    );
  }

  const eventId = attributeText(firstElement(document, eventElement)!, 'Id');
  const payload = {
    kind,
    eventElement,
    eventId,
    sourceEventReceipt,
    competence,
    ...structuredPayload(kind, document),
    rawXml: xml,
  };

  return {
    competence,
    kind,
    eventElement,
    eventId,
    sourceEventReceipt,
    payload,
  };
}

function structuredPayload(
  kind: ESocialTotalizerKind,
  document: ReturnXmlNode,
): Record<string, unknown> {
  switch (kind) {
    case 'S-5001':
      return structuredS5001Payload(document);
    case 'S-5002':
      return structuredS5002Payload(document);
    case 'S-5012':
      return structuredS5012Payload(document);
    case 'S-5011':
    case 'S-5013':
      return {
        employer: employerInfo(document),
      };
  }
}

function structuredS5001Payload(document: ReturnXmlNode): Record<string, unknown> {
  const workers = childElements(document, 'ideTrabalhador').map((worker) => {
    const bases = childElements(worker, 'infoBaseCS').map((base) => ({
      valueType: directChildText(base, 'tpValor'),
      amount: moneyText(directChildText(base, 'valor')),
    }));
    const pisPasepBases = childElements(worker, 'basesPisPasep').map((base) => ({
      valueType: directChildText(base, 'tpValorPisPasep'),
      amount: moneyText(directChildText(base, 'valorPisPasep')),
    }));
    return {
      cpfTrab: directChildText(worker, 'cpfTrab'),
      bases,
      pisPasepBases,
      baseTotal: sumMoneyText(bases.map((base) => base.amount)),
      pisPasepBaseTotal: sumMoneyText(
        pisPasepBases.map((base) => base.amount),
      ),
      seguradoContribution: sumDescendantElementMoney(worker, ['vrDescSeg']),
      calculatedContribution: sumDescendantElementMoney(worker, ['vrCpSeg']),
    };
  });

  return {
    workers,
    baseTotal: sumMoneyText(workers.map((worker) => worker.baseTotal)),
    pisPasepBaseTotal: sumMoneyText(
      workers.map((worker) => worker.pisPasepBaseTotal),
    ),
    seguradoContributionTotal: sumMoneyText(
      workers.map((worker) => worker.seguradoContribution),
    ),
  };
}

function structuredS5002Payload(
  document: ReturnXmlNode,
): Record<string, unknown> {
  const workers = childElements(document, 'ideTrabalhador').map(
    structuredS5002Worker,
  );
  const retroactiveAdjustments = workers.flatMap(
    (worker) => worker.retroactiveAdjustments,
  );

  return {
    employer: employerInfo(document),
    workers,
    retroactiveAdjustments,
    irrfTotal: sumMoneyText(workers.map((worker) => worker.irrfTotal)),
    taxableIncomeTotal: sumMoneyText(
      workers.map((worker) => worker.taxableIncomeTotal),
    ),
    officialPensionTotal: sumMoneyText(
      workers.map((worker) => worker.officialPensionTotal),
    ),
  };
}

function structuredS5002Worker(worker: ReturnXmlNode): {
  cpfBenef: string | null;
  demonstratives: ReturnType<typeof structuredS5002Demonstrative>[];
  consolidatedMonthlyRows: ReturnType<typeof s5002MonthlyRow>[];
  complementaryInfo: ReturnType<typeof structuredS5002ComplementaryInfo>[];
  retroactiveAdjustments: Array<Record<string, string | null>>;
  consolidatedIrrfTotal: MoneyText;
  consolidatedTaxableIncomeTotal: MoneyText;
  consolidatedOfficialPensionTotal: MoneyText;
  irrfTotal: MoneyText;
  taxableIncomeTotal: MoneyText;
  officialPensionTotal: MoneyText;
} {
  const demonstratives = directChildElements(worker, 'dmDev').map(
    structuredS5002Demonstrative,
  );
  const totalInfo = directChildElement(worker, 'totInfoIR');
  const consolidatedMonthlyRows = totalInfo
    ? directChildElements(totalInfo, 'consolidApurMen').map(s5002MonthlyRow)
    : [];
  const complementaryInfo = directChildElements(worker, 'infoIRComplem').map(
    structuredS5002ComplementaryInfo,
  );
  const retroactiveAdjustments = complementaryInfo
    .map((info) => info.previousPeriodAdjustment)
    .filter(isPresent);
  const demonstrativeIrrfTotal = sumMoneyText(
    demonstratives.map((demonstrative) => demonstrative.irrfTotal),
  );
  const demonstrativeTaxableIncomeTotal = sumMoneyText(
    demonstratives.map((demonstrative) => demonstrative.taxableIncomeTotal),
  );
  const demonstrativeOfficialPensionTotal = sumMoneyText(
    demonstratives.map((demonstrative) => demonstrative.officialPensionTotal),
  );
  const consolidatedIrrfTotal = sumMoneyText(
    consolidatedMonthlyRows.map((row) => row.irrf),
  );
  const consolidatedTaxableIncomeTotal = sumMoneyText(
    consolidatedMonthlyRows.flatMap((row) => [
      row.taxableIncome,
      row.thirteenthTaxableIncome,
    ]),
  );
  const consolidatedOfficialPensionTotal = sumMoneyText(
    consolidatedMonthlyRows.flatMap((row) => [
      row.officialPension,
      row.officialPension13,
    ]),
  );

  return {
    cpfBenef: directChildText(worker, 'cpfBenef'),
    demonstratives,
    consolidatedMonthlyRows,
    complementaryInfo,
    retroactiveAdjustments,
    consolidatedIrrfTotal,
    consolidatedTaxableIncomeTotal,
    consolidatedOfficialPensionTotal,
    irrfTotal:
      demonstratives.length > 0
        ? demonstrativeIrrfTotal
        : consolidatedIrrfTotal,
    taxableIncomeTotal:
      demonstratives.length > 0
        ? demonstrativeTaxableIncomeTotal
        : consolidatedTaxableIncomeTotal,
    officialPensionTotal:
      demonstratives.length > 0
        ? demonstrativeOfficialPensionTotal
        : consolidatedOfficialPensionTotal,
  };
}

function structuredS5002Demonstrative(dmDev: ReturnXmlNode): Record<string, unknown> & {
  irrfTotal: MoneyText;
  taxableIncomeTotal: MoneyText;
  officialPensionTotal: MoneyText;
} {
  const incomeRows = directChildElements(dmDev, 'infoIR').map((row) => ({
    infoType: directChildText(row, 'tpInfoIR'),
    amount: moneyText(directChildText(row, 'valor')),
    incomeDescription: directChildText(row, 'descRendimento'),
    judicialRubricProcesses: directChildElements(row, 'infoProcJudRub').map(
      (process) => ({
        processNumber: directChildText(process, 'nrProc'),
        courtState: directChildText(process, 'ufVara'),
        cityCode: directChildText(process, 'codMunic'),
        courtId: directChildText(process, 'idVara'),
      }),
    ),
  }));
  const monthlyRows = directChildElements(dmDev, 'totApurMen').map(
    s5002MonthlyRow,
  );
  const dailyRows = directChildElements(dmDev, 'totApurDia').map((total) => ({
    day: directChildText(total, 'perApurDia'),
    revenueCode: directChildText(total, 'CRDia'),
    taxationForm: directChildText(total, 'frmTribut'),
    foreignResidenceCountry: directChildText(total, 'paisResidExt'),
    paidAmount: moneyText(directChildText(total, 'vlrPagoDia')),
    irrf: moneyText(directChildText(total, 'vlrCRDia')),
  }));

  return {
    perRef: directChildText(dmDev, 'perRef'),
    ideDmDev: directChildText(dmDev, 'ideDmDev'),
    paymentType: directChildText(dmDev, 'tpPgto'),
    paymentDate: directChildText(dmDev, 'dtPgto'),
    categoryCode: directChildText(dmDev, 'codCateg'),
    incomeRows,
    monthlyRows,
    dailyRows,
    rraInfo: structuredS5002RraInfo(directChildElement(dmDev, 'infoRRA')),
    foreignPayment: structuredS5002ForeignPayment(
      directChildElement(dmDev, 'infoPgtoExt'),
    ),
    irrfTotal: sumMoneyText([
      ...monthlyRows.map((row) => row.irrf),
      ...dailyRows.map((row) => row.irrf),
    ]),
    taxableIncomeTotal: sumMoneyText(
      monthlyRows.flatMap((row) => [
        row.taxableIncome,
        row.thirteenthTaxableIncome,
      ]),
    ),
    officialPensionTotal: sumMoneyText(
      monthlyRows.flatMap((row) => [
        row.officialPension,
        row.officialPension13,
      ]),
    ),
  };
}

function s5002MonthlyRow(total: ReturnXmlNode): Record<string, MoneyText | string | null> & {
  taxableIncome: MoneyText;
  thirteenthTaxableIncome: MoneyText;
  officialPension: MoneyText;
  officialPension13: MoneyText;
  irrf: MoneyText;
} {
  const irrfMonthly = moneyText(directChildText(total, 'vlrCRMen'));
  const irrf13 = moneyText(directChildText(total, 'vlrCR13Men'));

  return {
    revenueCode: directChildText(total, 'CRMen'),
    taxableIncome: moneyText(directChildText(total, 'vlrRendTrib')),
    thirteenthTaxableIncome: moneyText(
      directChildText(total, 'vlrRendTrib13'),
    ),
    officialPension: moneyText(directChildText(total, 'vlrPrevOficial')),
    officialPension13: moneyText(directChildText(total, 'vlrPrevOficial13')),
    irrf: sumMoneyText([irrfMonthly, irrf13]),
    irrfMonthly,
    irrf13,
    exemptOver65: moneyText(directChildText(total, 'vlrParcIsenta65')),
    exemptOver65Thirteenth: moneyText(
      directChildText(total, 'vlrParcIsenta65Dec'),
    ),
    dailyAllowances: moneyText(directChildText(total, 'vlrDiarias')),
    costAllowance: moneyText(directChildText(total, 'vlrAjudaCusto')),
    contractTerminationIndemnity: moneyText(
      directChildText(total, 'vlrIndResContrato'),
    ),
    vacationBonus: moneyText(directChildText(total, 'vlrAbonoPec')),
    severeIllnessIncome: moneyText(directChildText(total, 'vlrRendMoleGrave')),
    severeIllnessThirteenth: moneyText(
      directChildText(total, 'vlrRendMoleGrave13'),
    ),
    housingAid: moneyText(directChildText(total, 'vlrAuxMoradia')),
    medicalGrant: moneyText(directChildText(total, 'vlrBolsaMedico')),
    medicalGrantThirteenth: moneyText(directChildText(total, 'vlrBolsaMedico13')),
    lateInterest: moneyText(directChildText(total, 'vlrJurosMora')),
    otherExempt: moneyText(directChildText(total, 'vlrIsenOutros')),
    incomeDescription: directChildText(total, 'descRendimento'),
  };
}

function structuredS5002RraInfo(node: ReturnXmlNode | null): Record<string, unknown> | null {
  if (!node) return null;
  const judicialExpenses = directChildElement(node, 'despProcJud');

  return {
    processType: directChildText(node, 'tpProcRRA'),
    processNumber: directChildText(node, 'nrProcRRA'),
    description: directChildText(node, 'descRRA'),
    monthCount: directChildText(node, 'qtdMesesRRA'),
    judicialExpenses: judicialExpenses
      ? {
          courtCosts: moneyText(directChildText(judicialExpenses, 'vlrDespCustas')),
          attorneys: moneyText(
            directChildText(judicialExpenses, 'vlrDespAdvogados'),
          ),
        }
      : null,
    attorneys: directChildElements(node, 'ideAdv').map((attorney) => ({
      registrationType: directChildText(attorney, 'tpInsc'),
      registrationNumber: directChildText(attorney, 'nrInsc'),
      amount: directChildText(attorney, 'vlrAdv'),
    })),
  };
}

function structuredS5002ForeignPayment(
  node: ReturnXmlNode | null,
): Record<string, unknown> | null {
  if (!node) return null;
  const address = directChildElement(node, 'endExt');

  return {
    foreignResidenceCountry: directChildText(node, 'paisResidExt'),
    nifIndicator: directChildText(node, 'indNIF'),
    nif: directChildText(node, 'nifBenef'),
    taxationForm: directChildText(node, 'frmTribut'),
    address: address
      ? {
          street: directChildText(address, 'endDscLograd'),
          number: directChildText(address, 'endNrLograd'),
          complement: directChildText(address, 'endComplem'),
          district: directChildText(address, 'endBairro'),
          city: directChildText(address, 'endCidade'),
          state: directChildText(address, 'endEstado'),
          postalCode: directChildText(address, 'endCodPostal'),
          phone: directChildText(address, 'telef'),
        }
      : null,
  };
}

function structuredS5002ComplementaryInfo(node: ReturnXmlNode): {
  medicalReportDate: string | null;
  previousPeriodAdjustment: Record<string, string | null> | null;
  dependents: Array<Record<string, string | null>>;
  revenueDetails: Array<Record<string, unknown>>;
  healthPlans: Array<Record<string, unknown>>;
} {
  const previousPeriod = directChildElement(node, 'perAnt');

  return {
    medicalReportDate: directChildText(node, 'dtLaudo'),
    previousPeriodAdjustment: previousPeriod
      ? {
          perRefAjuste: directChildText(previousPeriod, 'perRefAjuste'),
          nrRec1210Orig: directChildText(previousPeriod, 'nrRec1210Orig'),
        }
      : null,
    dependents: directChildElements(node, 'ideDep').map((dependent) => ({
      cpfDep: directChildText(dependent, 'cpfDep'),
      depIrrf: directChildText(dependent, 'depIRRF'),
      birthDate: directChildText(dependent, 'dtNascto'),
      name: directChildText(dependent, 'nome'),
      relationshipType: directChildText(dependent, 'tpDep'),
      description: directChildText(dependent, 'descrDep'),
    })),
    revenueDetails: directChildElements(node, 'infoIRCR').map(
      structuredS5002RevenueDetail,
    ),
    healthPlans: directChildElements(node, 'planSaude').map((plan) => ({
      operatorCnpj: directChildText(plan, 'cnpjOper'),
      ansRegistry: directChildText(plan, 'regANS'),
      holderAmount: moneyText(directChildText(plan, 'vlrSaudeTit')),
      dependents: directChildElements(plan, 'infoDepSau').map((dependent) => ({
        cpfDep: directChildText(dependent, 'cpfDep'),
        amount: moneyText(directChildText(dependent, 'vlrSaudeDep')),
      })),
    })),
  };
}

function structuredS5002RevenueDetail(node: ReturnXmlNode): Record<string, unknown> {
  return {
    revenueType: directChildText(node, 'tpCR'),
    dependentDeductions: directChildElements(node, 'dedDepen').map(
      (deduction) => ({
        incomeType: directChildText(deduction, 'tpRend'),
        cpfDep: directChildText(deduction, 'cpfDep'),
        amount: moneyText(directChildText(deduction, 'vlrDedDep')),
      }),
    ),
    alimony: directChildElements(node, 'penAlim').map((alimony) => ({
      incomeType: directChildText(alimony, 'tpRend'),
      cpfDep: directChildText(alimony, 'cpfDep'),
      amount: moneyText(directChildText(alimony, 'vlrDedPenAlim')),
    })),
    complementaryPension: directChildElements(node, 'previdCompl').map(
      (pension) => ({
        pensionType: directChildText(pension, 'tpPrev'),
        entityCnpj: directChildText(pension, 'cnpjEntidPC'),
        monthlyDeduction: moneyText(directChildText(pension, 'vlrDedPC')),
        thirteenthDeduction: moneyText(directChildText(pension, 'vlrDedPC13')),
        sponsorContribution: moneyText(directChildText(pension, 'vlrPatrocFunp')),
        sponsorThirteenthContribution: moneyText(
          directChildText(pension, 'vlrPatrocFunp13'),
        ),
      }),
    ),
    retentionProcesses: directChildElements(node, 'infoProcRet').map(
      structuredS5002RetentionProcess,
    ),
  };
}

function structuredS5002RetentionProcess(node: ReturnXmlNode): Record<string, unknown> {
  return {
    processType: directChildText(node, 'tpProcRet'),
    processNumber: directChildText(node, 'nrProcRet'),
    suspensionCode: directChildText(node, 'codSusp'),
    values: directChildElements(node, 'infoValores').map((value) => ({
      assessmentType: directChildText(value, 'indApuracao'),
      notWithheldAmount: moneyText(directChildText(value, 'vlrNRetido')),
      judicialDeposit: moneyText(directChildText(value, 'vlrDepJud')),
      currentYearCompensation: moneyText(directChildText(value, 'vlrCmpAnoCal')),
      previousYearCompensation: moneyText(directChildText(value, 'vlrCmpAnoAnt')),
      suspendedIncome: moneyText(directChildText(value, 'vlrRendSusp')),
      suspendedDeductions: directChildElements(value, 'dedSusp').map(
        (deduction) => ({
          deductionType: directChildText(deduction, 'indTpDeducao'),
          amount: moneyText(directChildText(deduction, 'vlrDedSusp')),
          entityCnpj: directChildText(deduction, 'cnpjEntidPC'),
          sponsorContribution: moneyText(
            directChildText(deduction, 'vlrPatrocFunp'),
          ),
          beneficiaries: directChildElements(deduction, 'benefPen').map(
            (beneficiary) => ({
              cpfDep: directChildText(beneficiary, 'cpfDep'),
              amount: moneyText(directChildText(beneficiary, 'vlrDepenSusp')),
            }),
          ),
        }),
      ),
    })),
  };
}

function structuredS5012Payload(
  document: ReturnXmlNode,
): Record<string, unknown> {
  const infoIrrf = firstElement(document, 'infoIRRF');
  const monthlyRows = infoIrrf
    ? directChildElements(infoIrrf, 'infoCRMen').map(s5012MonthlyRow)
    : [];
  const dailyRows = infoIrrf
    ? directChildElements(infoIrrf, 'infoCRDia').map(s5012DailyRow)
    : [];
  const monthlyIrrfTotal = sumMoneyText(monthlyRows.map((row) => row.irrf));
  const dailyIrrfTotal = sumMoneyText(dailyRows.map((row) => row.irrf));

  return {
    employer: employerInfo(document),
    sourceEventReceipt: infoIrrf ? directChildText(infoIrrf, 'nrRecArqBase') : null,
    informationIndicator: infoIrrf
      ? directChildText(infoIrrf, 'indExistInfo')
      : null,
    monthlyRows,
    dailyRows,
    items: [
      ...monthlyRows.map((row) => s5012DebitItem(row, 'MONTHLY', null)),
      ...dailyRows.map((row) => s5012DebitItem(row, 'DAILY', row.day)),
    ],
    monthlyIrrfTotal,
    dailyIrrfTotal,
    irrfTotal: sumMoneyText([monthlyIrrfTotal, dailyIrrfTotal]),
  };
}

function s5012MonthlyRow(row: ReturnXmlNode): {
  revenueCode: string | null;
  irrf: MoneyText;
} {
  return {
    revenueCode: directChildText(row, 'CRMen'),
    irrf: moneyText(directChildText(row, 'vrCRMen')),
  };
}

function s5012DailyRow(row: ReturnXmlNode): {
  day: string | null;
  revenueCode: string | null;
  irrf: MoneyText;
} {
  return {
    day: directChildText(row, 'perApurDia'),
    revenueCode: directChildText(row, 'CRDia'),
    irrf: moneyText(directChildText(row, 'vrCRDia')),
  };
}

function s5012DebitItem(
  row: { revenueCode: string | null; irrf: MoneyText },
  period: 'MONTHLY' | 'DAILY',
  day: string | null,
): Record<string, string | null> {
  return {
    debitCode: row.revenueCode ?? 'IRRF',
    baseAmount: '0.00',
    amount: row.irrf,
    period,
    day,
  };
}

function parseIdentity(node: ReturnXmlNode | null): ParsedIdentity | null {
  if (!node) return null;
  const tpInsc = directChildText(node, 'tpInsc');
  const nrInsc = directChildText(node, 'nrInsc');
  if (!tpInsc || !nrInsc) return null;
  const mapped =
    IDENTITY_FIELD_BY_TPINSC[tpInsc as keyof typeof IDENTITY_FIELD_BY_TPINSC];
  if (!mapped) {
    throw new ReturnXmlParseError(`Unsupported eSocial tpInsc: ${tpInsc}`);
  }
  const [type, field] = mapped;
  return {
    type,
    registration: nrInsc,
    [field]: nrInsc,
  };
}

function employerInfo(document: ReturnXmlNode): Record<string, string | null> {
  const employerNode = firstElement(document, 'ideEmpregador');
  return {
    registrationType: employerNode
      ? directChildText(employerNode, 'tpInsc')
      : null,
    registrationNumber: employerNode
      ? directChildText(employerNode, 'nrInsc')
      : null,
  };
}

function soapFaultText(document: ReturnXmlNode): string | null {
  const fault = firstElement(document, 'Fault');
  if (!fault) return null;
  return (
    firstOptionalText(fault, 'faultstring') ??
    firstOptionalText(fault, 'Reason') ??
    firstOptionalText(fault, 'Text') ??
    'SOAP Fault'
  );
}

function totalizerEventElement(document: ReturnXmlNode): string | null {
  return (
    Object.keys(KIND_BY_EVENT_ELEMENT).find((name) =>
      Boolean(firstElement(document, name)),
    ) ?? null
  );
}

function occurrenceType(value: string | null): ReturnOccurrence['type'] {
  if (value === '2') return 'WARNING';
  if (value === '3') return 'HISTORY';
  return 'ERROR';
}

function numberOrNull(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function monthCompetence(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}$/u.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) return trimmed.slice(0, 7);
  throw new ReturnXmlParseError(`Invalid eSocial competence: ${value}`);
}

function sumDescendantElementMoney(
  node: ReturnXmlNode,
  names: readonly string[],
): string {
  return sumMoneyText(
    names.flatMap((name) =>
      childElements(node, name).map((child) => directText(child)),
    ),
  );
}

function directText(node: ReturnXmlNode): string {
  return node.text.trim();
}

function sumMoneyText(values: Array<string | null>): string {
  return centsToMoney(
    values.reduce((sum, value) => sum + moneyToCents(value), 0n),
  );
}

function moneyText(value: string | null): string {
  return centsToMoney(moneyToCents(value));
}

function moneyToCents(value: string | null): bigint {
  if (!value) return 0n;
  const normalized = value.trim().replace(',', '.');
  const sign = normalized.startsWith('-') ? -1n : 1n;
  const unsigned = normalized.replace(/^-/, '');
  const [reais, cents = ''] = unsigned.split('.');
  return (
    sign *
    (BigInt(reais || '0') * 100n +
      BigInt((cents.padEnd(2, '0').slice(0, 2) || '0').replace(/\D/gu, '0')))
  );
}

function centsToMoney(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
