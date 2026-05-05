import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { UnprocessableEntityException } from '@nestjs/common';
import Decimal from 'decimal.js';

import {
  ConsignmentLoanKind,
  ConsignmentMargin,
  MarginCalculatorService,
} from '../../backend/src/folha-pagamento/operations/consignment/margin-calculator.service';

interface GoldenFixture {
  caseId: string;
  legalAnchor: string;
  competence: string;
  employee: {
    id: string;
    registration: string;
    name: string;
    netBase: string;
  };
  activeConsignments: ConsignmentFixture[];
  proposedConsignments: {
    accepted: ProposedConsignment[];
    rejected: ProposedConsignment[];
  };
}

interface ConsignmentFixture {
  id: string;
  kind: ConsignmentLoanKind;
  monthlyAmount: string;
  status: 'ACTIVE';
}

interface ProposedConsignment {
  kind: ConsignmentLoanKind;
  monthlyAmount: string;
}

const fixtureDir = join(__dirname, 'golden', 'margem-consignavel-v01');
const fixture = readJson<GoldenFixture>('input.json');

describe('R4-04 Lei 14.509/2022 consignment margin golden', () => {
  const service = new MarginCalculatorService({
    configured: false,
  } as never);

  it('matches the three separated legal buckets and 45 percent total cap', () => {
    const margin = calculateGoldenMargin(service, fixture);
    const actual = buildGoldenOutput(fixture, margin);
    const actualBytes = `${JSON.stringify(actual, null, 2)}\n`;
    const expectedBytes = readFileSync(
      join(fixtureDir, 'expected.json'),
      'utf8',
    );

    expect(actual.legalBuckets.general).toEqual({
      percent: '0.350000',
      cap: '3500.00',
      used: '2000.00',
      available: '1500.00',
    });
    expect(actual.legalBuckets.creditCard).toEqual({
      percent: '0.050000',
      cap: '500.00',
      used: '300.00',
      available: '200.00',
    });
    expect(actual.legalBuckets.benefitCard).toEqual({
      percent: '0.050000',
      cap: '500.00',
      used: '125.50',
      available: '374.50',
    });
    expect(actual.total).toEqual({
      percent: '0.450000',
      cap: '4500.00',
      used: '2425.50',
      available: '2074.50',
      usedPlusAvailable: '4500.00',
    });
    expect(actualBytes).toBe(expectedBytes);
  });

  it('rejects proposed consignments that exceed their own legal bucket', () => {
    const margin = calculateGoldenMargin(service, fixture);

    for (const proposal of fixture.proposedConsignments.accepted) {
      expect(() =>
        service.assertAmountFits(margin, proposal.kind, proposal.monthlyAmount),
      ).not.toThrow();
    }

    for (const proposal of fixture.proposedConsignments.rejected) {
      expect(() =>
        service.assertAmountFits(margin, proposal.kind, proposal.monthlyAmount),
      ).toThrow(UnprocessableEntityException);
    }
  });
});

function calculateGoldenMargin(
  service: MarginCalculatorService,
  goldenFixture: GoldenFixture,
): ConsignmentMargin {
  const used = summarizeActiveConsignments(goldenFixture.activeConsignments);
  return service.calculate({
    employeeId: goldenFixture.employee.id,
    competence: goldenFixture.competence,
    netBase: goldenFixture.employee.netBase,
    usedGeneral: used.PAYROLL_LOAN,
    usedCreditCard: used.CARD,
    usedBenefitCard: used.OTHER,
  });
}

function summarizeActiveConsignments(
  consignments: ConsignmentFixture[],
): Record<ConsignmentLoanKind, string> {
  const totals: Record<ConsignmentLoanKind, Decimal> = {
    PAYROLL_LOAN: new Decimal(0),
    CARD: new Decimal(0),
    OTHER: new Decimal(0),
  };

  for (const consignment of consignments) {
    totals[consignment.kind] = totals[consignment.kind].plus(
      consignment.monthlyAmount,
    );
  }

  return {
    PAYROLL_LOAN: money(totals.PAYROLL_LOAN),
    CARD: money(totals.CARD),
    OTHER: money(totals.OTHER),
  };
}

function buildGoldenOutput(
  goldenFixture: GoldenFixture,
  margin: ConsignmentMargin,
): Record<string, unknown> {
  const generalCap = cap(goldenFixture.employee.netBase, margin.generalPercent);
  const creditCardCap = cap(
    goldenFixture.employee.netBase,
    margin.creditCardPercent,
  );
  const benefitCardCap = cap(
    goldenFixture.employee.netBase,
    margin.benefitCardPercent,
  );
  const totalCap = decimalSum(generalCap, creditCardCap, benefitCardCap);
  const totalUsed = decimalSum(
    margin.usedGeneral,
    margin.usedCreditCard,
    margin.usedBenefitCard,
  );
  const totalAvailable = decimalSum(
    margin.availableGeneral,
    margin.availableCreditCard,
    margin.availableBenefitCard,
  );

  return {
    caseId: goldenFixture.caseId,
    employeeId: goldenFixture.employee.id,
    competence: goldenFixture.competence,
    legalAnchor: goldenFixture.legalAnchor,
    legalBuckets: {
      general: {
        percent: margin.generalPercent,
        cap: generalCap,
        used: margin.usedGeneral,
        available: margin.availableGeneral,
      },
      creditCard: {
        percent: margin.creditCardPercent,
        cap: creditCardCap,
        used: margin.usedCreditCard,
        available: margin.availableCreditCard,
      },
      benefitCard: {
        percent: margin.benefitCardPercent,
        cap: benefitCardCap,
        used: margin.usedBenefitCard,
        available: margin.availableBenefitCard,
      },
    },
    total: {
      percent: decimalSumFixed(
        6,
        margin.generalPercent,
        margin.creditCardPercent,
        margin.benefitCardPercent,
      ),
      cap: totalCap,
      used: totalUsed,
      available: totalAvailable,
      usedPlusAvailable: decimalSum(totalUsed, totalAvailable),
    },
    margin,
  };
}

function cap(netBase: string, percent: string): string {
  return new Decimal(netBase).mul(percent).toDecimalPlaces(2).toFixed(2);
}

function decimalSum(...values: string[]): string {
  return decimalSumFixed(2, ...values);
}

function decimalSumFixed(decimalPlaces: number, ...values: string[]): string {
  return values
    .reduce((total, value) => total.plus(value), new Decimal(0))
    .toFixed(decimalPlaces);
}

function money(value: Decimal): string {
  return value.toDecimalPlaces(2).toFixed(2);
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixtureDir, name), 'utf8')) as T;
}
