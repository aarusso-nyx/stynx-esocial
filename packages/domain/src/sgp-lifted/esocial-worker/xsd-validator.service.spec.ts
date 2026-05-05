import { S1000_VALID_XML } from './testing/esocial-fixtures';
import { XsdValidatorService } from './xsd/xsd-validator.service';

const BUILDER_XSD_REFERENCES: Record<string, string[]> = {
  'builders/s1000.builder.ts': ['evtInfoEmpregador.xsd'],
  'builders/s1010.builder.ts': ['evtTabRubrica.xsd'],
  'builders/s1200.builder.ts': ['evtRemun.xsd'],
  'builders/s1207.builder.ts': ['evtBenPrRP.xsd'],
  'builders/s1210.builder.ts': ['evtPgtos.xsd'],
  'builders/s1298.builder.ts': ['evtReabreEvPer.xsd'],
  'builders/s1299.builder.ts': ['evtFechaEvPer.xsd'],
  'builders/s2501.builder.ts': ['evtContProc.xsd'],
  'builders/s2200.builder.ts': ['evtAdmissao.xsd'],
  'builders/s2205.builder.ts': ['evtAltCadastral.xsd'],
  'builders/s2206.builder.ts': ['evtAltContratual.xsd'],
  'builders/s2210.builder.ts': ['evtCAT.xsd'],
  'builders/s2220.builder.ts': ['evtMonit.xsd'],
  'builders/s2230.builder.ts': ['evtAfastTemp.xsd'],
  'builders/s2240.builder.ts': ['evtExpRisco.xsd'],
  'builders/s2299.builder.ts': ['evtDeslig.xsd'],
  'builders/s2300.builder.ts': ['evtTSVInicio.xsd'],
  'builders/s2399.builder.ts': ['evtTSVTermino.xsd'],
  'builders/s2400.builder.ts': ['evtCdBenefIn.xsd'],
  'builders/s2405.builder.ts': ['evtCdBenefAlt.xsd'],
  'builders/s2410.builder.ts': ['evtCdBenIn.xsd'],
  'builders/s2416.builder.ts': ['evtCdBenAlt.xsd'],
  'builders/s2418.builder.ts': ['evtReativBen.xsd'],
  'builders/s2420.builder.ts': ['evtCdBenTerm.xsd'],
  'builders/s3000.builder.ts': ['evtExclusao.xsd'],
  's2298/s2298.builder.ts': ['evtReintegr.xsd'],
  's2306/s2306.builder.ts': ['evtTSVAltContr.xsd'],
};

const PARSER_XSD_REFERENCES: Record<string, string[]> = {
  'parsers/totalizer.parser.ts': ['evtIrrfBenef.xsd'],
};

const FUTURE_EVENT_STUB_XSDS = new Set([
  'evtAdmPrelim.xsd',
  'evtAnotJud.xsd',
  'evtBaixa.xsd',
  'evtBasesFGTS.xsd',
  'evtBasesTrab.xsd',
  'evtCessao.xsd',
  'evtComProd.xsd',
  'evtConsolidContProc.xsd',
  'evtContratAvNP.xsd',
  'evtCS.xsd',
  'evtExcProcTrab.xsd',
  'evtFGTS.xsd',
  'evtFGTSProcTrab.xsd',
  'evtInfoComplPer.xsd',
  'evtIrrf.xsd',
  'evtProcTrab.xsd',
  'evtRmnRPPS.xsd',
  'evtToxic.xsd',
  'evtTribProcTrab.xsd',
  'tipos.xsd',
  'xmldsig-core-schema.xsd',
]);

describe('XsdValidatorService', () => {
  it('validates an eSocial S-1.3 S-1000 golden XML against the committed XSD bundle', () => {
    const service = new XsdValidatorService();

    expect(service.manifestFileCount()).toBe(service.xsdFileNames().length);
    expect(service.bundleHash('evtInfoEmpregador.xsd')).toBe(
      '80ca0aaf6980aaf7b549bcb0201fc49b7b094a50619962618f6768534c0cf26a',
    );
    expect(
      service.validate('S-1000', S1000_VALID_XML, { allowUnsigned: true }),
    ).toMatchObject({
      valid: true,
      eventKind: 'S-1000',
    });
  });

  it('rejects a deliberate XML mutation before queue insertion', () => {
    const service = new XsdValidatorService();
    const invalidXml = S1000_VALID_XML.replace(
      '<iniValid>2026-01</iniValid>',
      '<iniValid>2026-13</iniValid>',
    );

    expect(() =>
      service.assertValid('S-1000', invalidXml, { allowUnsigned: true }),
    ).toThrow('failed XSD validation');
  });

  it('classifies each committed XSD as one source reference or a future-event-stub', () => {
    const service = new XsdValidatorService();
    const sourceReferences = new Map<string, string[]>();

    for (const [sourcePath, xsdFiles] of Object.entries({
      ...BUILDER_XSD_REFERENCES,
      ...PARSER_XSD_REFERENCES,
    })) {
      for (const xsdFile of xsdFiles) {
        sourceReferences.set(xsdFile, [
          ...(sourceReferences.get(xsdFile) ?? []),
          sourcePath,
        ]);
      }
    }

    const duplicateSourceReferences = [...sourceReferences.entries()]
      .filter(([, sourcePaths]) => sourcePaths.length !== 1)
      .map(([xsdFile, sourcePaths]) => ({ xsdFile, sourcePaths }));
    const manifestCoverage = service.xsdFileNames().map((xsdFile) => ({
      xsdFile,
      sourcePaths: sourceReferences.get(xsdFile) ?? [],
      futureEventStub: FUTURE_EVENT_STUB_XSDS.has(xsdFile),
    }));

    expect(duplicateSourceReferences).toEqual([]);
    expect(
      manifestCoverage.filter(
        ({ sourcePaths, futureEventStub }) =>
          sourcePaths.length + Number(futureEventStub) !== 1,
      ),
    ).toEqual([]);
  });
});
