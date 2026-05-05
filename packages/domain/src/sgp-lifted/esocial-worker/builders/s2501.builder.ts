import { UnprocessableEntityException } from '@nestjs/common';

import { cpf, ideEmpregadorXml } from './s22xx-common';
import { onlyDigits, sha256, xmlEscape } from './s1xxx-common';

export interface S2501ContributionInput {
  revenueCode: string;
  amount: string | number;
}

export interface S2501IrrfInput {
  revenueCode: '593656' | '056152' | '188951';
  amount: string | number;
  thirteenthAmount?: string | number | null;
}

export interface S2501CalcTribInput {
  referencePeriod: string;
  monthlyBase: string | number;
  thirteenthBase: string | number;
  contributions?: S2501ContributionInput[];
}

export interface S2501WorkerInput {
  cpf: string;
  calcTrib?: S2501CalcTribInput[];
  irrf?: S2501IrrfInput[];
}

export interface S2501BuildInput {
  tenantId: string;
  employerRegistration: string | null;
  processNumber: string;
  paymentPeriod: string;
  sequenceNumber?: number | null;
  observation?: string | null;
  workers: S2501WorkerInput[];
}

export interface S2501BuildResult {
  tenantId: string;
  xml: string;
  reference: string;
  competence: string;
  processNumber: string;
  paymentPeriod: string;
  payload: Record<string, unknown>;
}

export class S2501Builder {
  readonly eventKind = 'S-2501' as const;

  build(input: S2501BuildInput): S2501BuildResult {
    const processNumber = nrProcTrab(input.processNumber);
    const paymentPeriod = period(input.paymentPeriod, 'perApurPgto');
    const workers = input.workers.map(normalizeWorker);
    if (workers.length === 0) {
      throw new UnprocessableEntityException(
        'S-2501 emission requires at least one worker tax fact',
      );
    }

    const reference = eventId(input, processNumber, paymentPeriod, workers);
    const sequenceXml =
      input.sequenceNumber == null
        ? ''
        : `<ideSeqProc>${sequenceNumber(input.sequenceNumber)}</ideSeqProc>`;
    const observationXml = input.observation
      ? `<obs>${xmlEscape(input.observation.trim()).slice(0, 999)}</obs>`
      : '';
    const workerXml = workers.map(workerXmlFragment).join('\n    ');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtContProc/v_S_01_03_00">
  <evtContProc Id="${reference}">
    <ideEvento><indRetif>1</indRetif><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>SGP-0.0.1</verProc></ideEvento>
    ${ideEmpregadorXml(input.employerRegistration)}
    <ideProc>
      <nrProcTrab>${processNumber}</nrProcTrab>
      <perApurPgto>${paymentPeriod}</perApurPgto>
      ${sequenceXml}${observationXml}
    </ideProc>
    ${workerXml}
  </evtContProc>
</eSocial>`;

    return {
      tenantId: input.tenantId,
      xml,
      reference,
      competence: paymentPeriod,
      processNumber,
      paymentPeriod,
      payload: {
        processNumber,
        paymentPeriod,
        sequenceNumber: input.sequenceNumber ?? null,
        workerCount: workers.length,
        contributionTotal: totalContributions(workers),
        irrfTotal: totalIrrf(workers),
      },
    };
  }
}

interface NormalizedWorker {
  cpf: string;
  calcTrib: NormalizedCalcTrib[];
  irrf: NormalizedIrrf[];
}

interface NormalizedCalcTrib {
  referencePeriod: string;
  monthlyBase: string;
  thirteenthBase: string;
  contributions: NormalizedContribution[];
}

interface NormalizedContribution {
  revenueCode: string;
  amount: string;
}

interface NormalizedIrrf {
  revenueCode: string;
  amount: string;
  thirteenthAmount: string | null;
}

function normalizeWorker(worker: S2501WorkerInput): NormalizedWorker {
  const calcTrib = (worker.calcTrib ?? []).map((item) => ({
    referencePeriod: period(item.referencePeriod, 'perRef'),
    monthlyBase: money(item.monthlyBase),
    thirteenthBase: money(item.thirteenthBase),
    contributions: (item.contributions ?? []).map((contribution) => ({
      revenueCode: revenueCode(contribution.revenueCode),
      amount: positiveMoney(contribution.amount, 'infoCRContrib.vrCR'),
    })),
  }));
  const irrf = (worker.irrf ?? []).map((item) => ({
    revenueCode: item.revenueCode,
    amount: money(item.amount),
    thirteenthAmount:
      item.thirteenthAmount == null
        ? null
        : positiveMoney(item.thirteenthAmount, 'infoCRIRRF.vrCR13'),
  }));
  if (calcTrib.length + irrf.length === 0) {
    throw new UnprocessableEntityException(
      'S-2501 worker requires calcTrib or infoCRIRRF facts',
    );
  }
  return {
    cpf: cpf(worker.cpf),
    calcTrib,
    irrf,
  };
}

function workerXmlFragment(worker: NormalizedWorker): string {
  const calcTribXml = worker.calcTrib.map(calcTribXmlFragment).join('');
  const irrfXml = worker.irrf.map(irrfXmlFragment).join('');
  return `<ideTrab cpfTrab="${worker.cpf}">${calcTribXml}${irrfXml}</ideTrab>`;
}

function calcTribXmlFragment(calcTrib: NormalizedCalcTrib): string {
  const contributions = calcTrib.contributions
    .map(
      (item) =>
        `<infoCRContrib tpCR="${item.revenueCode}" vrCR="${item.amount}"/>`,
    )
    .join('');
  return `<calcTrib perRef="${calcTrib.referencePeriod}" vrBcCpMensal="${calcTrib.monthlyBase}" vrBcCp13="${calcTrib.thirteenthBase}">${contributions}</calcTrib>`;
}

function irrfXmlFragment(irrf: NormalizedIrrf): string {
  const thirteenth = irrf.thirteenthAmount
    ? ` vrCR13="${irrf.thirteenthAmount}"`
    : '';
  return `<infoCRIRRF tpCR="${irrf.revenueCode}" vrCR="${irrf.amount}"${thirteenth}/>`;
}

function eventId(
  input: S2501BuildInput,
  processNumber: string,
  paymentPeriod: string,
  workers: NormalizedWorker[],
): string {
  const source = [
    'S-2501',
    input.tenantId,
    processNumber,
    paymentPeriod,
    input.sequenceNumber ?? '',
    workers.map((worker) => worker.cpf).join(','),
  ].join(':');
  const digits = sha256(source)
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) - 97))
    .slice(0, 34);
  return `ID${digits}`;
}

function nrProcTrab(value: string): string {
  const digits = onlyDigits(value);
  if (digits.length !== 15 && digits.length !== 20) {
    throw new UnprocessableEntityException(
      'S-2501 nrProcTrab must contain 15 or 20 digits',
    );
  }
  return digits;
}

function period(value: string, field: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new UnprocessableEntityException(
      `S-2501 ${field} must be in YYYY-MM format`,
    );
  }
  return value;
}

function sequenceNumber(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 999) {
    throw new UnprocessableEntityException(
      'S-2501 ideSeqProc must be an integer from 1 to 999',
    );
  }
  return String(value);
}

function revenueCode(value: string): string {
  const digits = onlyDigits(value);
  if (!/^\d{6}$/.test(digits)) {
    throw new UnprocessableEntityException(
      'S-2501 contribution revenue code must contain 6 digits',
    );
  }
  return digits;
}

function money(value: string | number): string {
  const amount = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(amount) || amount < 0) {
    throw new UnprocessableEntityException(
      'S-2501 monetary values must be non-negative numbers',
    );
  }
  return amount.toFixed(2);
}

function positiveMoney(value: string | number, field: string): string {
  const amount = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new UnprocessableEntityException(
      `S-2501 ${field} must be greater than zero`,
    );
  }
  return amount.toFixed(2);
}

function totalContributions(workers: NormalizedWorker[]): string {
  return workers
    .flatMap((worker) => worker.calcTrib)
    .flatMap((item) => item.contributions)
    .reduce((total, item) => total + Number(item.amount), 0)
    .toFixed(2);
}

function totalIrrf(workers: NormalizedWorker[]): string {
  return workers
    .flatMap((worker) => worker.irrf)
    .reduce(
      (total, item) =>
        total + Number(item.amount) + Number(item.thirteenthAmount ?? '0.00'),
      0,
    )
    .toFixed(2);
}
