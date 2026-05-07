import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DtoValidationError,
  MissingReceiptReference,
  assertPromotedBenefitProcessVariantHandled,
  assertPromotedWorkerVariantHandled,
  buildS1000,
  buildS1005,
  buildS1010,
  buildS1020,
  buildS1050,
  buildS1070,
  buildS1200,
  buildS1202,
  buildS1207,
  buildS1210,
  buildS1298,
  buildS1299,
  buildS2200,
  buildS2205,
  buildS2206,
  buildS2210,
  buildS2220,
  buildS2230,
  buildS2240,
  buildS2298Worker,
  buildS2299Worker,
  buildS2300,
  buildS2306,
  buildS2399,
  buildS2400,
  buildS2405,
  buildS2410,
  buildS2416,
  buildS2418,
  buildS2420,
  buildS2501,
  buildS3000,
  dispatchByEventClass,
  dispatchExclusionByOriginalClass,
} from '../../../packages/domain/src/index.js';

const root = new URL('../../..', import.meta.url).pathname;

type BuiltXml = ReturnType<typeof buildS1000>;
type Builder = (
  dto: unknown,
  ctx?: { readonly environment?: 'qualification' | 'restricted-production' | 'production' },
) => BuiltXml;

const builderSpecs: Array<{
  eventClass: string;
  fixture: string;
  golden: string;
  build: Builder;
  eventElement: string;
  tableDependencies: readonly string[];
  receiptDependencies?: readonly string[];
}> = [
  ['S-1000', 's1000.dto.json', 's1000.golden.xml', buildS1000, 'evtInfoEmpregador', []],
  ['S-1005', 's1005.dto.json', 's1005.golden.xml', buildS1005, 'evtTabEstab', ['S-1000']],
  ['S-1010', 's1010.dto.json', 's1010.golden.xml', buildS1010, 'evtTabRubrica', ['S-1000']],
  ['S-1020', 's1020.dto.json', 's1020.golden.xml', buildS1020, 'evtTabLotacao', ['S-1000']],
  ['S-1050', 's1050.dto.json', 's1050.golden.xml', buildS1050, 'evtTabJornada', ['S-1000']],
  ['S-1070', 's1070.dto.json', 's1070.golden.xml', buildS1070, 'evtTabProcesso', ['S-1000']],
  ['S-1200', 's1200.dto.json', 's1200-three-workers.golden.xml', buildS1200, 'evtRemun', ['S-1000', 'S-1005', 'S-1010', 'S-1020']],
  ['S-1202', 's1202.dto.json', 's1202-rpps-workers.golden.xml', buildS1202, 'evtRmnRPPS', ['S-1000', 'S-1005', 'S-1010']],
  ['S-1207', 's1207.dto.json', 's1207-rpps-benefit.golden.xml', buildS1207, 'evtBenPrRP', ['S-1000', 'S-1010'], ['S-2410']],
  ['S-1210', 's1210.dto.json', 's1210-confirmed-payments.golden.xml', buildS1210, 'evtPgtos', ['S-1000'], ['S-1200', 'S-1202', 'S-1207']],
  ['S-1298', 's1298.dto.json', 's1298.golden.xml', buildS1298, 'evtReabreEvPer', ['S-1000'], ['S-1299']],
  ['S-1299', 's1299.dto.json', 's1299.golden.xml', buildS1299, 'evtFechaEvPer', ['S-1000'], ['S-1200', 'S-1202', 'S-1207', 'S-1210']],
  ['S-2200', 's2200.dto.json', 's2200.golden.xml', buildS2200, 'evtAdmissao', ['S-1000', 'S-1030', 'S-1050']],
  ['S-2205', 's2205.dto.json', 's2205.golden.xml', buildS2205, 'evtAltCadastral', ['S-1000'], ['S-2200']],
  ['S-2206', 's2206.dto.json', 's2206-promotion.golden.xml', buildS2206, 'evtAltContratual', ['S-1000'], ['S-2200']],
  ['S-2210', 's2210.dto.json', 's2210-inicial.golden.xml', buildS2210, 'evtCAT', ['S-1000'], ['S-2200']],
  ['S-2220', 's2220.dto.json', 's2220-periodico.golden.xml', buildS2220, 'evtMonit', ['S-1000'], ['S-2200']],
  ['S-2230', 's2230.dto.json', 's2230-medical-leave.golden.xml', buildS2230, 'evtAfastTemp', ['S-1000'], ['S-2200']],
  ['S-2240', 's2240.dto.json', 's2240-noise-start.golden.xml', buildS2240, 'evtExpRisco', ['S-1000'], ['S-2200']],
  ['S-2298', 's2298.dto.json', 's2298.golden.xml', buildS2298Worker, 'evtReintegr', ['S-1000'], ['S-2299']],
  ['S-2299', 's2299.dto.json', 's2299-with-notice.golden.xml', buildS2299Worker, 'evtDeslig', ['S-1000'], ['S-2200']],
  ['S-2300', 's2300.dto.json', 's2300-estagiario.golden.xml', buildS2300, 'evtTSVInicio', ['S-1000'], ['S-2200']],
  ['S-2306', 's2306.dto.json', 's2306.golden.xml', buildS2306, 'evtTSVAltContr', ['S-1000'], ['S-2300']],
  ['S-2399', 's2399.dto.json', 's2399-estagiario.golden.xml', buildS2399, 'evtTSVTermino', ['S-1000'], ['S-2300', 'S-2306']],
  ['S-2400', 's2400.dto.json', 's2400.golden.xml', buildS2400, 'evtCdBenefIn', ['S-1000']],
  ['S-2405', 's2405.dto.json', 's2405.golden.xml', buildS2405, 'evtCdBenefAlt', ['S-1000'], ['S-2400']],
  ['S-2410', 's2410-retirement.dto.json', 's2410-retirement.golden.xml', buildS2410, 'evtCdBenIn', ['S-1000'], ['S-2400']],
  ['S-2416', 's2416.dto.json', 's2416-pension-founder.golden.xml', buildS2416, 'evtCdBenAlt', ['S-1000'], ['S-2410']],
  ['S-2418', 's2418-retirement.dto.json', 's2418-retirement.golden.xml', buildS2418, 'evtReativBen', ['S-1000'], ['S-2410', 'S-2420']],
  ['S-2420', 's2420.dto.json', 's2420-pension.golden.xml', buildS2420, 'evtCdBenTerm', ['S-1000'], ['S-2410']],
  ['S-2501', 's2501.dto.json', 's2501.golden.xml', buildS2501, 'evtContProc', ['S-1000']],
  ['S-3000', 's3000-worker.dto.json', 's3000.golden.xml', buildS3000, 'evtExclusao', ['S-1000']],
].map(([eventClass, fixture, golden, build, eventElement, tableDependencies, receiptDependencies]) => ({
  eventClass,
  fixture,
  golden,
  build,
  eventElement,
  tableDependencies,
  receiptDependencies,
}));

describe('builder mutation harness', () => {
  it('matches every active builder source output to committed golden XML', () => {
    for (const spec of builderSpecs) {
      const built = spec.build(fixture(spec.fixture));

      expect(built.metadata.eventCode, spec.eventClass).toBe(spec.eventClass);
      expect(built.metadata.xmlRoot, spec.eventClass).toBe('eSocial');
      expect(built.metadata.eventElement, spec.eventClass).toBe(spec.eventElement);
      expect([...built.metadata.tableVersionDependencies], spec.eventClass).toEqual(spec.tableDependencies);
      expect([...(built.metadata.receiptDependencies ?? [])], spec.eventClass).toEqual(spec.receiptDependencies ?? []);
      expect(built.eventIds.length, spec.eventClass).toBeGreaterThan(0);
      expect(built.xmlSha256, spec.eventClass).toMatch(/^[a-f0-9]{64}$/u);
      expect(built.xml, spec.eventClass).toBe(golden(spec.golden));
    }
  });

  it('emits production environment codes when builder context is production', () => {
    for (const spec of builderSpecs) {
      const built = spec.build(fixture(spec.fixture), { environment: 'production' });
      expect(built.xml, spec.eventClass).toContain('<tpAmb>1</tpAmb>');
      expect(built.xml, spec.eventClass).not.toContain('<tpAmb>2</tpAmb>');
    }
  });

  it('rejects representative invalid DTO shapes with typed errors', () => {
    expect(() => buildS1000({ ...fixture('s1000.dto.json'), employerCnpj: '' })).toThrow(DtoValidationError);
    expect(() => buildS1005({ ...fixture('s1005.dto.json'), establishmentRegistrationNumber: '' })).toThrow(
      /establishmentRegistrationNumber/u,
    );
    expect(() => buildS1010({ ...fixture('s1010.dto.json'), rubricCode: '' })).toThrow(/rubricCode/u);
    expect(() => buildS1020({ ...fixture('s1020.dto.json'), lotationCode: '' })).toThrow(/lotationCode/u);
    expect(() => buildS1050({ ...fixture('s1050.dto.json'), dailyHours: '' })).toThrow(/dailyHours/u);
    expect(() => buildS1070({ ...fixture('s1070.dto.json'), processNumber: '' })).toThrow(/processNumber/u);
    expect(() => buildS1200({ ...fixture('s1200.dto.json'), payrollRunStatus: 'APPROVED' })).toThrow(
      /payrollRunStatus/u,
    );
    expect(() => buildS1207({ ...fixture('s1207.dto.json'), benefits: [] })).toThrow(/benefits/u);
    expect(() =>
      buildS1210({
        ...fixture('s1210.dto.json'),
        payments: [{ ...fixture('s1210.dto.json').payments[0], receiptReference: '' }],
      }),
    ).toThrow(MissingReceiptReference);
    expect(() => buildS1298({ ...fixture('s1298.dto.json'), acceptedClosureReceipt: '' })).toThrow(
      /acceptedClosureReceipt/u,
    );
    expect(() => buildS1299({ ...fixture('s1299.dto.json'), pendingPeriodicEvents: ['S-1200'] })).toThrow(
      /pendingPeriodicEvents/u,
    );
    expect(() => buildS2200({ ...fixture('s2200.dto.json'), cpf: '' })).toThrow(/cpf/u);
    expect(() => buildS2405({ ...fixture('s2405.dto.json'), acceptedS2400Receipt: '' })).toThrow(
      /acceptedS2400Receipt/u,
    );
    expect(() => buildS2501({ ...fixture('s2501.dto.json'), processTaxBases: [] })).toThrow(/processTaxBases/u);
    expect(() => buildS3000({ ...fixture('s3000-worker.dto.json'), originalReceipt: '' })).toThrow(
      /originalReceipt/u,
    );
  });

  it('keeps active variant discriminants and dispatcher routing exhaustive', () => {
    expect(assertPromotedWorkerVariantHandled('S-2210', 'death')).toBe(true);
    expect(assertPromotedWorkerVariantHandled('S-2220', 'termination')).toBe(true);
    expect(assertPromotedWorkerVariantHandled('S-2240', 'end')).toBe(true);
    expect(assertPromotedWorkerVariantHandled('S-2300', 'council-member')).toBe(true);
    expect(assertPromotedBenefitProcessVariantHandled('S-2410', 'pension')).toBe(true);
    expect(assertPromotedBenefitProcessVariantHandled('S-3000', 'process')).toBe(true);
    expect(() => assertPromotedWorkerVariantHandled('S-2210', 'unknown')).toThrow(/kind/u);
    expect(() => assertPromotedBenefitProcessVariantHandled('S-3000', 'unknown')).toThrow(/kind/u);

    const submission = dispatchByEventClass(fixture('s2200.dto.json'), {
      occurredAt: '2026-05-05T12:00:00.000Z',
      request: { event_class: 'S-2200', environment: 'QUALIFICATION' },
    });
    expect(submission.builderReady).toBe(true);
    expect(submission.builtXml.xml).toBe(golden('s2200.golden.xml'));

    const exclusion = dispatchExclusionByOriginalClass(fixture('s3000-worker.dto.json'));
    expect(exclusion.targetClassFamily).toBe('worker');
    expect(exclusion.identityXml).toContain('<cpfTrab>12345678901</cpfTrab>');
  });

  it('covers branch-specific XML for promoted worker and benefit variants', () => {
    expect(buildS1000({
      ...fixture('s1000.dto.json'),
      cooperativeIndicator: '1',
      constructionIndicator: '1',
      payrollExemptionIndicator: '1',
      electronicRecordOption: '1',
    }).xml).toContain('<indCoop>1</indCoop>');
    expect(buildS1000({
      ...fixture('s1000.dto.json'),
      cooperativeIndicator: '1',
      constructionIndicator: '1',
      payrollExemptionIndicator: '1',
      electronicRecordOption: '1',
    }).xml).toContain('<indOptRegEletron>1</indOptRegEletron>');

    expect(buildS1010({ ...fixture('s1010.dto.json'), rubricType: 'deduction' }).xml).toContain('<tpRubr>2</tpRubr>');
    expect(buildS1010({ ...fixture('s1010.dto.json'), rubricType: 'informational' }).xml).toContain('<tpRubr>3</tpRubr>');
    expect(buildS1010({ ...fixture('s1010.dto.json'), rubricType: 'informational-deduction' }).xml).toContain(
      '<tpRubr>4</tpRubr>',
    );
    expect(buildS1010({ ...fixture('s1010.dto.json'), unionContributionIncidence: '99' }).xml).toContain(
      '<codIncPisPasep>99</codIncPisPasep>',
    );

    const longRegistration = 'MAT-REGISTRATION-12345678901234567890';
    const s1200Defaults = cloneFixture('s1200.dto.json');
    s1200Defaults.workers[0].registration = longRegistration;
    delete s1200Defaults.workers[0].establishmentRegistrationNumber;
    delete s1200Defaults.workers[0].lotationCode;
    delete s1200Defaults.workers[0].rubrics[0].rubricTableId;
    const s1200Xml = buildS1200(s1200Defaults).xml;
    expect(s1200Xml).toContain('<matricula>MAT-REGISTRATION-1234567890123</matricula>');
    expect(s1200Xml).toContain('<nrInsc>12345678000199</nrInsc>');
    expect(s1200Xml).toContain('<codLotacao>LOT01</codLotacao>');
    expect(s1200Xml).toContain('<ideTabRubr>SGP</ideTabRubr>');

    const s1299NoEvents = cloneFixture('s1299.dto.json');
    s1299NoEvents.acceptedEventCounts = { remuneration: 0, payments: 0 };
    const s1299Xml = buildS1299(s1299NoEvents).xml;
    expect(s1299Xml).toContain('<evtRemun>N</evtRemun>');
    expect(s1299Xml).toContain('<evtPgtos>N</evtPgtos>');

    const deathCat = buildS2210({
      ...fixture('s2210.dto.json'),
      kind: 'death',
      originalReceipt: '1.1.0000000000000002210',
      deathDate: '2026-05-03',
    }).xml;
    expect(deathCat).toContain('<tpCat>3</tpCat>');
    expect(deathCat).toContain('<indCatObito>S</indCatObito>');
    expect(deathCat).toContain('<dtObito>2026-05-03</dtObito>');
    expect(deathCat).toContain('<catOrigem><nrRecCatOrig>1.1.0000000000000002210</nrRecCatOrig></catOrigem>');
    expect(buildS2210({
      ...fixture('s2210.dto.json'),
      kind: 'reopening',
      originalReceipt: '1.1.0000000000000002210',
    }).xml).toContain('<tpCat>2</tpCat>');

    expect(buildS2220({ ...fixture('s2220.dto.json'), kind: 'admission' }).xml).toContain('<tpExameOcup>0</tpExameOcup>');
    expect(buildS2220({ ...fixture('s2220.dto.json'), kind: 'return-to-work' }).xml).toContain(
      '<tpExameOcup>2</tpExameOcup>',
    );
    expect(buildS2220({ ...fixture('s2220.dto.json'), kind: 'termination' }).xml).toContain('<tpExameOcup>9</tpExameOcup>');
    expect(buildS2230({ ...fixture('s2230.dto.json'), kind: 'vacation' }).xml).toContain('<perAquis>');
    expect(buildS2240({ ...fixture('s2240.dto.json'), operation: 'end', endDate: '2026-05-30' }).xml).toContain(
      '<dtFimCondicao>2026-05-30</dtFimCondicao>',
    );

    expect(buildS2298Worker({ ...fixture('s2298.dto.json'), kind: 'amnesty', processNumber: 'ANISTIA2026' }).xml).toContain(
      '<tpReint>2</tpReint>',
    );
    expect(buildS2298Worker({ ...fixture('s2298.dto.json'), kind: 'other' }).xml).toContain('<tpReint>9</tpReint>');
    expect(buildS2299Worker({ ...fixture('s2299.dto.json'), kind: 'without-notice' }).xml).toContain(
      '<indPagtoAPI>N</indPagtoAPI>',
    );

    expect(buildS2300({ ...fixture('s2300.dto.json'), kind: 'council-member' }).xml).toContain('<sexo>M</sexo>');
    expect(buildS2300({ ...fixture('s2300.dto.json'), kind: 'autonomous' }).xml).not.toContain('<infoEstagiario>');
    expect(buildS2306({ ...fixture('s2306.dto.json'), kind: 'pay', salaryAmount: 1234.56 }).xml).toContain(
      '<remuneracao><vrSalFx>1234.56</vrSalFx>',
    );
    expect(buildS2306({ ...fixture('s2306.dto.json'), kind: 'internship' }).xml).toContain('<infoEstagiario>');
    expect(buildS2306({ ...fixture('s2306.dto.json'), kind: 'workplace' }).xml).toContain('<localTrabGeral>');

    expect(buildS2410(fixture('s2410-pension.dto.json')).xml).toContain('<infoPenMorte>');
    expect(buildS2410(fixture('s2410-retirement.dto.json')).xml).not.toContain('<infoPenMorte>');
    expect(buildS2501({ ...fixture('s2501.dto.json'), sequenceNumber: '2', observation: 'Observed' }).xml).toContain(
      '<ideSeqProc>2</ideSeqProc><obs>Observed</obs>',
    );
    expect(buildS3000({
      ...fixture('s3000-worker.dto.json'),
      originalEventClass: 'S-1299',
      originalCompetence: '2026-01',
    }).xml).toContain('<ideFolhaPagto><indApuracao>1</indApuracao><perApur>2026-01</perApur></ideFolhaPagto>');
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fixture(fileName: string): any {
  return JSON.parse(readFileSync(join(root, 'tests/golden/fixtures', fileName), 'utf8'));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cloneFixture(fileName: string): any {
  return JSON.parse(JSON.stringify(fixture(fileName)));
}

function golden(fileName: string): string {
  return readFileSync(join(root, 'docs/templates/golden/builders', fileName), 'utf8');
}
