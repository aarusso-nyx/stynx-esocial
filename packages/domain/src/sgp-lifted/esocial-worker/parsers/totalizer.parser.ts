import { BadRequestException, Injectable } from '@nestjs/common';
import * as libxml from 'libxmljs2';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import { dateCompetence, monthCompetence } from '../builders/s1299.builder';

export type ESocialTotalizerKind =
  | 'S-5001'
  | 'S-5002'
  | 'S-5003'
  | 'S-5011'
  | 'S-5012'
  | 'S-5013';

export interface ESocialTotalizerRecord {
  tenantId: string;
  competence: string;
  kind: ESocialTotalizerKind;
  sourceEventRecibo: string;
  payload: Record<string, unknown>;
  receivedAt: string;
}

interface TotalizerRow extends QueryResultRow {
  tenant_id: string;
  competence: Date | string;
  kind: ESocialTotalizerKind;
  source_event_recibo: string;
  payload: Record<string, unknown> | string;
  received_at: Date | string;
}

type MoneyText = string;

interface ESocialEmployerInfo extends Record<string, unknown> {
  registrationType: string | null;
  registrationNumber: string | null;
}

interface ESocialS5002InfoIrRow extends Record<string, unknown> {
  infoType: string | null;
  amount: MoneyText;
  incomeDescription: string | null;
  judicialRubricProcesses: Array<Record<string, string | null>>;
}

interface ESocialS5002MonthlyRow extends Record<string, unknown> {
  revenueCode: string | null;
  taxableIncome: MoneyText;
  thirteenthTaxableIncome: MoneyText;
  officialPension: MoneyText;
  officialPension13: MoneyText;
  irrf: MoneyText;
  irrfMonthly: MoneyText;
  irrf13: MoneyText;
  exemptOver65: MoneyText;
  exemptOver65Thirteenth: MoneyText;
  dailyAllowances: MoneyText;
  costAllowance: MoneyText;
  contractTerminationIndemnity: MoneyText;
  vacationBonus: MoneyText;
  severeIllnessIncome: MoneyText;
  severeIllnessThirteenth: MoneyText;
  housingAid: MoneyText;
  medicalGrant: MoneyText;
  medicalGrantThirteenth: MoneyText;
  lateInterest: MoneyText;
  otherExempt: MoneyText;
  incomeDescription: string | null;
}

interface ESocialS5002DailyRow extends Record<string, unknown> {
  day: string | null;
  revenueCode: string | null;
  taxationForm: string | null;
  foreignResidenceCountry: string | null;
  paidAmount: MoneyText;
  irrf: MoneyText;
}

interface ESocialS5002RraInfo extends Record<string, unknown> {
  processType: string | null;
  processNumber: string | null;
  description: string | null;
  monthCount: string | null;
  judicialExpenses: Record<string, MoneyText> | null;
  attorneys: Array<Record<string, string | null>>;
}

interface ESocialS5002RetroactiveAdjustment extends Record<string, unknown> {
  perRefAjuste: string | null;
  nrRec1210Orig: string | null;
}

interface ESocialS5002ComplementaryInfo extends Record<string, unknown> {
  medicalReportDate: string | null;
  previousPeriodAdjustment: ESocialS5002RetroactiveAdjustment | null;
  dependents: Array<Record<string, string | null>>;
  revenueDetails: Array<Record<string, unknown>>;
  healthPlans: Array<Record<string, unknown>>;
}

interface ESocialS5002Demonstrative extends Record<string, unknown> {
  perRef: string | null;
  ideDmDev: string | null;
  paymentType: string | null;
  paymentDate: string | null;
  categoryCode: string | null;
  incomeRows: ESocialS5002InfoIrRow[];
  monthlyRows: ESocialS5002MonthlyRow[];
  dailyRows: ESocialS5002DailyRow[];
  rraInfo: ESocialS5002RraInfo | null;
  foreignPayment: Record<string, unknown> | null;
  irrfTotal: MoneyText;
  taxableIncomeTotal: MoneyText;
  officialPensionTotal: MoneyText;
}

interface ESocialS5002WorkerTotalizer extends Record<string, unknown> {
  cpfBenef: string | null;
  demonstratives: ESocialS5002Demonstrative[];
  consolidatedMonthlyRows: ESocialS5002MonthlyRow[];
  complementaryInfo: ESocialS5002ComplementaryInfo[];
  retroactiveAdjustments: ESocialS5002RetroactiveAdjustment[];
  consolidatedIrrfTotal: MoneyText;
  consolidatedTaxableIncomeTotal: MoneyText;
  consolidatedOfficialPensionTotal: MoneyText;
  irrfTotal: MoneyText;
  taxableIncomeTotal: MoneyText;
  officialPensionTotal: MoneyText;
}

export interface ESocialS5002TotalizerPayload extends Record<string, unknown> {
  employer: ESocialEmployerInfo;
  workers: ESocialS5002WorkerTotalizer[];
  retroactiveAdjustments: ESocialS5002RetroactiveAdjustment[];
  irrfTotal: MoneyText;
  taxableIncomeTotal: MoneyText;
  officialPensionTotal: MoneyText;
}

interface ESocialS5012MonthlyRow extends Record<string, unknown> {
  revenueCode: string | null;
  irrf: MoneyText;
}

interface ESocialS5012DailyRow extends Record<string, unknown> {
  day: string | null;
  revenueCode: string | null;
  irrf: MoneyText;
}

interface ESocialS5012DebitItem extends Record<string, unknown> {
  debitCode: string;
  baseAmount: MoneyText;
  amount: MoneyText;
  period: 'MONTHLY' | 'DAILY';
  day: string | null;
}

export interface ESocialS5012TotalizerPayload extends Record<string, unknown> {
  employer: ESocialEmployerInfo;
  sourceEventRecibo: string | null;
  informationIndicator: string | null;
  monthlyRows: ESocialS5012MonthlyRow[];
  dailyRows: ESocialS5012DailyRow[];
  items: ESocialS5012DebitItem[];
  monthlyIrrfTotal: MoneyText;
  dailyIrrfTotal: MoneyText;
  irrfTotal: MoneyText;
}

const KIND_BY_EVENT_ELEMENT: Record<string, ESocialTotalizerKind> = {
  evtBasesTrab: 'S-5001',
  evtIrrfBenef: 'S-5002',
  evtBasesFGTS: 'S-5003',
  evtCS: 'S-5011',
  evtIrrf: 'S-5012',
  evtFGTS: 'S-5013',
};

@Injectable()
export class TotalizerParser {
  constructor(private readonly databaseService: DatabaseService) {}

  async ingest(
    tenantId: string,
    xml: string,
    receivedAt = new Date(),
  ): Promise<ESocialTotalizerRecord> {
    const parsed = parseTotalizerXml(xml);
    const rows = await this.databaseService.transaction(async (client) => {
      const result = await client.query<TotalizerRow>(
        `
        INSERT INTO esocial.esocial_totalizer (
          tenant_id,
          competence,
          kind,
          source_event_recibo,
          payload,
          received_at
        )
        VALUES ($1::uuid, $2::date, $3::esocial.esocial_totalizer_kind, $4, $5::jsonb, $6::timestamptz)
        ON CONFLICT (tenant_id, competence, kind, source_event_recibo)
        DO UPDATE
        SET payload = EXCLUDED.payload,
            received_at = EXCLUDED.received_at,
            updated_at = now()
        RETURNING
          tenant_id::text,
          competence,
          kind::text,
          source_event_recibo,
          payload,
          received_at
        `,
        [
          tenantId,
          dateCompetence(parsed.competence),
          parsed.kind,
          parsed.sourceEventRecibo,
          JSON.stringify(parsed.payload),
          receivedAt.toISOString(),
        ],
      );

      await client.query(
        `
        UPDATE esocial.s1299_emission_state
        SET status = 'ACCEPTED'::esocial.s1299_emission_status,
            accepted_at = COALESCE(accepted_at, $4::timestamptz),
            updated_at = now()
        WHERE tenant_id = $1::uuid
          AND competence = $2::date
          AND recibo = $3
        `,
        [
          tenantId,
          dateCompetence(parsed.competence),
          parsed.sourceEventRecibo,
          receivedAt.toISOString(),
        ],
      );

      return result.rows;
    });
    return mapRow(rows[0]!);
  }
}

export function parseTotalizerXml(
  xml: string,
): Omit<ESocialTotalizerRecord, 'tenantId' | 'receivedAt'> {
  let document: libxml.Document;
  try {
    document = libxml.parseXml(xml);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BadRequestException(`Invalid eSocial totalizer XML: ${message}`);
  }

  const eventElement = Object.keys(KIND_BY_EVENT_ELEMENT).find((name) =>
    hasElement(document, name),
  );
  if (!eventElement) {
    throw new BadRequestException(
      'Unsupported eSocial totalizer kind; expected S-5001..S-5013',
    );
  }

  const kind = KIND_BY_EVENT_ELEMENT[eventElement]!;
  const competence = monthCompetence(firstText(document, 'perApur'));
  const sourceEventRecibo =
    firstOptionalText(document, 'nrRecArqBase') ??
    firstOptionalText(document, 'nrRecEvt') ??
    firstOptionalText(document, 'nrRecibo');
  if (!sourceEventRecibo) {
    throw new BadRequestException(
      'eSocial totalizer return is missing source event receipt',
    );
  }

  return {
    competence,
    kind,
    sourceEventRecibo,
    payload: {
      kind,
      eventElement,
      eventId: firstAttribute(document, eventElement, 'Id'),
      sourceEventRecibo,
      competence,
      ...structuredPayload(kind, document),
      rawXml: xml,
    },
  };
}

function structuredPayload(
  kind: ESocialTotalizerKind,
  document: libxml.Document,
): Record<string, unknown> {
  if (kind === 'S-5001') {
    return structuredS5001Payload(document);
  }
  if (kind === 'S-5012') {
    return structuredS5012Payload(document);
  }
  if (kind !== 'S-5002') return {};
  return structuredS5002Payload(document);
}

function structuredS5001Payload(document: libxml.Document) {
  const workers = childElements(document, 'ideTrabalhador').map((worker) => {
    const bases = childElements(worker, 'infoBaseCS').map((base) => ({
      valueType: optionalChildText(base, 'tpValor'),
      amount: moneyText(optionalChildText(base, 'valor')),
    }));
    const pisPasepBases = childElements(worker, 'basesPisPasep').map(
      (base) => ({
        valueType: optionalChildText(base, 'tpValorPisPasep'),
        amount: moneyText(optionalChildText(base, 'valorPisPasep')),
      }),
    );
    return {
      cpfTrab: optionalChildText(worker, 'cpfTrab'),
      bases,
      pisPasepBases,
      baseTotal: sumMoneyText(bases.map((base) => base.amount)),
      pisPasepBaseTotal: sumMoneyText(pisPasepBases.map((base) => base.amount)),
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
  document: libxml.Document,
): ESocialS5002TotalizerPayload {
  const employerNode = firstElement(document, 'ideEmpregador');
  const employer = {
    registrationType: employerNode
      ? optionalChildText(employerNode, 'tpInsc')
      : null,
    registrationNumber: employerNode
      ? optionalChildText(employerNode, 'nrInsc')
      : null,
  };
  const workers = childElements(document, 'ideTrabalhador').map(
    structuredS5002Worker,
  );
  const retroactiveAdjustments = workers.flatMap(
    (worker) => worker.retroactiveAdjustments,
  );

  return {
    employer,
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

function structuredS5002Worker(worker: XmlNode): ESocialS5002WorkerTotalizer {
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
    cpfBenef: optionalChildText(worker, 'cpfBenef'),
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

function structuredS5002Demonstrative(
  dmDev: XmlNode,
): ESocialS5002Demonstrative {
  const incomeRows = directChildElements(dmDev, 'infoIR').map((row) => ({
    infoType: optionalChildText(row, 'tpInfoIR'),
    amount: moneyText(optionalChildText(row, 'valor')),
    incomeDescription: optionalChildText(row, 'descRendimento'),
    judicialRubricProcesses: directChildElements(row, 'infoProcJudRub').map(
      (process) => ({
        processNumber: optionalChildText(process, 'nrProc'),
        courtState: optionalChildText(process, 'ufVara'),
        cityCode: optionalChildText(process, 'codMunic'),
        courtId: optionalChildText(process, 'idVara'),
      }),
    ),
  }));
  const monthlyRows = directChildElements(dmDev, 'totApurMen').map(
    s5002MonthlyRow,
  );
  const dailyRows = directChildElements(dmDev, 'totApurDia').map((total) => ({
    day: optionalChildText(total, 'perApurDia'),
    revenueCode: optionalChildText(total, 'CRDia'),
    taxationForm: optionalChildText(total, 'frmTribut'),
    foreignResidenceCountry: optionalChildText(total, 'paisResidExt'),
    paidAmount: moneyText(optionalChildText(total, 'vlrPagoDia')),
    irrf: moneyText(optionalChildText(total, 'vlrCRDia')),
  }));

  return {
    perRef: optionalChildText(dmDev, 'perRef'),
    ideDmDev: optionalChildText(dmDev, 'ideDmDev'),
    paymentType: optionalChildText(dmDev, 'tpPgto'),
    paymentDate: optionalChildText(dmDev, 'dtPgto'),
    categoryCode: optionalChildText(dmDev, 'codCateg'),
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

function s5002MonthlyRow(total: XmlNode): ESocialS5002MonthlyRow {
  const irrfMonthly = moneyText(optionalChildText(total, 'vlrCRMen'));
  const irrf13 = moneyText(optionalChildText(total, 'vlrCR13Men'));

  return {
    revenueCode: optionalChildText(total, 'CRMen'),
    taxableIncome: moneyText(optionalChildText(total, 'vlrRendTrib')),
    thirteenthTaxableIncome: moneyText(
      optionalChildText(total, 'vlrRendTrib13'),
    ),
    officialPension: moneyText(optionalChildText(total, 'vlrPrevOficial')),
    officialPension13: moneyText(optionalChildText(total, 'vlrPrevOficial13')),
    irrf: sumMoneyText([irrfMonthly, irrf13]),
    irrfMonthly,
    irrf13,
    exemptOver65: moneyText(optionalChildText(total, 'vlrParcIsenta65')),
    exemptOver65Thirteenth: moneyText(
      optionalChildText(total, 'vlrParcIsenta65Dec'),
    ),
    dailyAllowances: moneyText(optionalChildText(total, 'vlrDiarias')),
    costAllowance: moneyText(optionalChildText(total, 'vlrAjudaCusto')),
    contractTerminationIndemnity: moneyText(
      optionalChildText(total, 'vlrIndResContrato'),
    ),
    vacationBonus: moneyText(optionalChildText(total, 'vlrAbonoPec')),
    severeIllnessIncome: moneyText(
      optionalChildText(total, 'vlrRendMoleGrave'),
    ),
    severeIllnessThirteenth: moneyText(
      optionalChildText(total, 'vlrRendMoleGrave13'),
    ),
    housingAid: moneyText(optionalChildText(total, 'vlrAuxMoradia')),
    medicalGrant: moneyText(optionalChildText(total, 'vlrBolsaMedico')),
    medicalGrantThirteenth: moneyText(
      optionalChildText(total, 'vlrBolsaMedico13'),
    ),
    lateInterest: moneyText(optionalChildText(total, 'vlrJurosMora')),
    otherExempt: moneyText(optionalChildText(total, 'vlrIsenOutros')),
    incomeDescription: optionalChildText(total, 'descRendimento'),
  };
}

function structuredS5002RraInfo(
  node: XmlNode | null,
): ESocialS5002RraInfo | null {
  if (!node) return null;
  const judicialExpenses = directChildElement(node, 'despProcJud');

  return {
    processType: optionalChildText(node, 'tpProcRRA'),
    processNumber: optionalChildText(node, 'nrProcRRA'),
    description: optionalChildText(node, 'descRRA'),
    monthCount: optionalChildText(node, 'qtdMesesRRA'),
    judicialExpenses: judicialExpenses
      ? {
          courtCosts: moneyText(
            optionalChildText(judicialExpenses, 'vlrDespCustas'),
          ),
          attorneys: moneyText(
            optionalChildText(judicialExpenses, 'vlrDespAdvogados'),
          ),
        }
      : null,
    attorneys: directChildElements(node, 'ideAdv').map((attorney) => ({
      registrationType: optionalChildText(attorney, 'tpInsc'),
      registrationNumber: optionalChildText(attorney, 'nrInsc'),
      amount: optionalChildText(attorney, 'vlrAdv'),
    })),
  };
}

function structuredS5002ForeignPayment(
  node: XmlNode | null,
): Record<string, unknown> | null {
  if (!node) return null;
  const address = directChildElement(node, 'endExt');

  return {
    foreignResidenceCountry: optionalChildText(node, 'paisResidExt'),
    nifIndicator: optionalChildText(node, 'indNIF'),
    nif: optionalChildText(node, 'nifBenef'),
    taxationForm: optionalChildText(node, 'frmTribut'),
    address: address
      ? {
          street: optionalChildText(address, 'endDscLograd'),
          number: optionalChildText(address, 'endNrLograd'),
          complement: optionalChildText(address, 'endComplem'),
          district: optionalChildText(address, 'endBairro'),
          city: optionalChildText(address, 'endCidade'),
          state: optionalChildText(address, 'endEstado'),
          postalCode: optionalChildText(address, 'endCodPostal'),
          phone: optionalChildText(address, 'telef'),
        }
      : null,
  };
}

function structuredS5002ComplementaryInfo(
  node: XmlNode,
): ESocialS5002ComplementaryInfo {
  const previousPeriod = directChildElement(node, 'perAnt');

  return {
    medicalReportDate: optionalChildText(node, 'dtLaudo'),
    previousPeriodAdjustment: previousPeriod
      ? {
          perRefAjuste: optionalChildText(previousPeriod, 'perRefAjuste'),
          nrRec1210Orig: optionalChildText(previousPeriod, 'nrRec1210Orig'),
        }
      : null,
    dependents: directChildElements(node, 'ideDep').map((dependent) => ({
      cpfDep: optionalChildText(dependent, 'cpfDep'),
      depIrrf: optionalChildText(dependent, 'depIRRF'),
      birthDate: optionalChildText(dependent, 'dtNascto'),
      name: optionalChildText(dependent, 'nome'),
      relationshipType: optionalChildText(dependent, 'tpDep'),
      description: optionalChildText(dependent, 'descrDep'),
    })),
    revenueDetails: directChildElements(node, 'infoIRCR').map(
      structuredS5002RevenueDetail,
    ),
    healthPlans: directChildElements(node, 'planSaude').map((plan) => ({
      operatorCnpj: optionalChildText(plan, 'cnpjOper'),
      ansRegistry: optionalChildText(plan, 'regANS'),
      holderAmount: moneyText(optionalChildText(plan, 'vlrSaudeTit')),
      dependents: directChildElements(plan, 'infoDepSau').map((dependent) => ({
        cpfDep: optionalChildText(dependent, 'cpfDep'),
        amount: moneyText(optionalChildText(dependent, 'vlrSaudeDep')),
      })),
    })),
  };
}

function structuredS5002RevenueDetail(node: XmlNode): Record<string, unknown> {
  return {
    revenueType: optionalChildText(node, 'tpCR'),
    dependentDeductions: directChildElements(node, 'dedDepen').map(
      (deduction) => ({
        incomeType: optionalChildText(deduction, 'tpRend'),
        cpfDep: optionalChildText(deduction, 'cpfDep'),
        amount: moneyText(optionalChildText(deduction, 'vlrDedDep')),
      }),
    ),
    alimony: directChildElements(node, 'penAlim').map((alimony) => ({
      incomeType: optionalChildText(alimony, 'tpRend'),
      cpfDep: optionalChildText(alimony, 'cpfDep'),
      amount: moneyText(optionalChildText(alimony, 'vlrDedPenAlim')),
    })),
    complementaryPension: directChildElements(node, 'previdCompl').map(
      (pension) => ({
        pensionType: optionalChildText(pension, 'tpPrev'),
        entityCnpj: optionalChildText(pension, 'cnpjEntidPC'),
        monthlyDeduction: moneyText(optionalChildText(pension, 'vlrDedPC')),
        thirteenthDeduction: moneyText(
          optionalChildText(pension, 'vlrDedPC13'),
        ),
        sponsorContribution: moneyText(
          optionalChildText(pension, 'vlrPatrocFunp'),
        ),
        sponsorThirteenthContribution: moneyText(
          optionalChildText(pension, 'vlrPatrocFunp13'),
        ),
      }),
    ),
    retentionProcesses: directChildElements(node, 'infoProcRet').map(
      structuredS5002RetentionProcess,
    ),
  };
}

function structuredS5002RetentionProcess(
  node: XmlNode,
): Record<string, unknown> {
  return {
    processType: optionalChildText(node, 'tpProcRet'),
    processNumber: optionalChildText(node, 'nrProcRet'),
    suspensionCode: optionalChildText(node, 'codSusp'),
    values: directChildElements(node, 'infoValores').map((value) => ({
      assessmentType: optionalChildText(value, 'indApuracao'),
      notWithheldAmount: moneyText(optionalChildText(value, 'vlrNRetido')),
      judicialDeposit: moneyText(optionalChildText(value, 'vlrDepJud')),
      currentYearCompensation: moneyText(
        optionalChildText(value, 'vlrCmpAnoCal'),
      ),
      previousYearCompensation: moneyText(
        optionalChildText(value, 'vlrCmpAnoAnt'),
      ),
      suspendedIncome: moneyText(optionalChildText(value, 'vlrRendSusp')),
      suspendedDeductions: directChildElements(value, 'dedSusp').map(
        (deduction) => ({
          deductionType: optionalChildText(deduction, 'indTpDeducao'),
          amount: moneyText(optionalChildText(deduction, 'vlrDedSusp')),
          entityCnpj: optionalChildText(deduction, 'cnpjEntidPC'),
          sponsorContribution: moneyText(
            optionalChildText(deduction, 'vlrPatrocFunp'),
          ),
          beneficiaries: directChildElements(deduction, 'benefPen').map(
            (beneficiary) => ({
              cpfDep: optionalChildText(beneficiary, 'cpfDep'),
              amount: moneyText(optionalChildText(beneficiary, 'vlrDepenSusp')),
            }),
          ),
        }),
      ),
    })),
  };
}

function structuredS5012Payload(
  document: libxml.Document,
): ESocialS5012TotalizerPayload {
  const employerNode = firstElement(document, 'ideEmpregador');
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
    employer: {
      registrationType: employerNode
        ? optionalChildText(employerNode, 'tpInsc')
        : null,
      registrationNumber: employerNode
        ? optionalChildText(employerNode, 'nrInsc')
        : null,
    },
    sourceEventRecibo: infoIrrf
      ? optionalChildText(infoIrrf, 'nrRecArqBase')
      : null,
    informationIndicator: infoIrrf
      ? optionalChildText(infoIrrf, 'indExistInfo')
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

function s5012MonthlyRow(row: XmlNode): ESocialS5012MonthlyRow {
  return {
    revenueCode: optionalChildText(row, 'CRMen'),
    irrf: moneyText(optionalChildText(row, 'vrCRMen')),
  };
}

function s5012DailyRow(row: XmlNode): ESocialS5012DailyRow {
  return {
    day: optionalChildText(row, 'perApurDia'),
    revenueCode: optionalChildText(row, 'CRDia'),
    irrf: moneyText(optionalChildText(row, 'vrCRDia')),
  };
}

function s5012DebitItem(
  row: ESocialS5012MonthlyRow | ESocialS5012DailyRow,
  period: ESocialS5012DebitItem['period'],
  day: string | null,
): ESocialS5012DebitItem {
  return {
    debitCode: row.revenueCode ?? 'IRRF',
    baseAmount: '0.00',
    amount: row.irrf,
    period,
    day,
  };
}

function hasElement(document: libxml.Document, name: string): boolean {
  return Boolean(document.get(`//*[local-name() = '${name}']`));
}

function firstElement(
  document: libxml.Document | XmlNode,
  name: string,
): XmlNode | null {
  return (
    ((document as { get(xpath: string): unknown }).get(
      `.//*[local-name() = '${name}']`,
    ) as XmlNode | undefined) ?? null
  );
}

function firstText(document: libxml.Document, name: string): string {
  const value = firstOptionalText(document, name);
  if (!value) {
    throw new BadRequestException(
      `eSocial totalizer return is missing ${name}`,
    );
  }
  return value;
}

function firstOptionalText(
  document: libxml.Document,
  name: string,
): string | null {
  const node = document.get(`//*[local-name() = '${name}']`) as
    | { text(): string }
    | undefined;
  const value = node?.text().trim();
  return value || null;
}

type XmlNode = {
  find(xpath: string): unknown[];
  get(xpath: string): unknown;
  text(): string;
};

function childElements(
  node: libxml.Document | XmlNode,
  name: string,
): XmlNode[] {
  return (node as { find(xpath: string): unknown[] }).find(
    `.//*[local-name() = '${name}']`,
  ) as XmlNode[];
}

function directChildElements(
  node: libxml.Document | XmlNode,
  name: string,
): XmlNode[] {
  return (node as { find(xpath: string): unknown[] }).find(
    `./*[local-name() = '${name}']`,
  ) as XmlNode[];
}

function directChildElement(
  node: libxml.Document | XmlNode,
  name: string,
): XmlNode | null {
  return directChildElements(node, name)[0] ?? null;
}

function optionalChildText(node: XmlNode, name: string): string | null {
  const selected = node.get(`./*[local-name() = '${name}']`) as
    | { text(): string }
    | undefined;
  const value = selected?.text().trim();
  return value || null;
}

function sumDescendantElementMoney(node: XmlNode, names: string[]): string {
  return sumMoneyText(
    names.flatMap((name) =>
      childElements(node, name).map((child) => child.text().trim()),
    ),
  );
}

function sumMoneyText(values: Array<string | null>): string {
  return centsToMoney(
    values.reduce((sum, value) => sum + moneyToCents(value), 0n),
  );
}

function moneyText(value: string | null): string {
  return centsToMoney(moneyToCents(value));
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
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
      BigInt((cents.padEnd(2, '0').slice(0, 2) || '0').replace(/\D/g, '0')))
  );
}

function centsToMoney(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

function firstAttribute(
  document: libxml.Document,
  elementName: string,
  attributeName: string,
): string | null {
  const node = document.get(`//*[local-name() = '${elementName}']`) as
    | { attr(name: string): { value(): string } | undefined }
    | undefined;
  const value = node?.attr(attributeName)?.value();
  return value || null;
}

function mapRow(row: TotalizerRow): ESocialTotalizerRecord {
  const competence =
    row.competence instanceof Date
      ? row.competence.toISOString().slice(0, 7)
      : String(row.competence).slice(0, 7);
  return {
    tenantId: row.tenant_id,
    competence,
    kind: row.kind,
    sourceEventRecibo: row.source_event_recibo,
    payload:
      typeof row.payload === 'string'
        ? (JSON.parse(row.payload) as Record<string, unknown>)
        : row.payload,
    receivedAt: new Date(row.received_at).toISOString(),
  };
}
