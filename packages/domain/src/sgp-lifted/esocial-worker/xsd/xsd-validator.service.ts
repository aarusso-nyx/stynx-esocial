import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BadRequestException, Injectable } from '@nestjs/common';
import * as libxml from 'libxmljs2';

interface ESocialXsdManifest {
  layoutVersion: string;
  fileCount: number;
  files: Record<string, string>;
}

export interface XsdValidationResult {
  valid: boolean;
  eventKind: string;
  xsdPath: string;
  errors: XsdValidationError[];
}

export interface XsdValidationError {
  message: string;
  line?: number;
  column?: number;
}

const XSD_BY_EVENT_KIND: Record<string, string> = {
  'S-1000': 'evtInfoEmpregador.xsd',
  'S-1005': 'evtTabEstab.xsd',
  'S-1010': 'evtTabRubrica.xsd',
  'S-1020': 'evtTabLotacao.xsd',
  'S-1050': 'evtTabJornada.xsd',
  'S-1070': 'evtTabProcesso.xsd',
  'S-1200': 'evtRemun.xsd',
  'S-1202': 'evtRmnRPPS.xsd',
  'S-1207': 'evtBenPrRP.xsd',
  'S-1210': 'evtPgtos.xsd',
  'S-1298': 'evtReabreEvPer.xsd',
  'S-1299': 'evtFechaEvPer.xsd',
  'S-2200': 'evtAdmissao.xsd',
  'S-2205': 'evtAltCadastral.xsd',
  'S-2206': 'evtAltContratual.xsd',
  'S-2210': 'evtCAT.xsd',
  'S-2220': 'evtMonit.xsd',
  'S-2221': 'evtToxic.xsd',
  'S-2230': 'evtAfastTemp.xsd',
  'S-2231': 'evtCessao.xsd',
  'S-2240': 'evtExpRisco.xsd',
  'S-2298': 'evtReintegr.xsd',
  'S-2299': 'evtDeslig.xsd',
  'S-2300': 'evtTSVInicio.xsd',
  'S-2306': 'evtTSVAltContr.xsd',
  'S-2399': 'evtTSVTermino.xsd',
  'S-2400': 'evtCdBenefIn.xsd',
  'S-2405': 'evtCdBenefAlt.xsd',
  'S-2410': 'evtCdBenIn.xsd',
  'S-2416': 'evtCdBenAlt.xsd',
  'S-2418': 'evtReativBen.xsd',
  'S-2420': 'evtCdBenTerm.xsd',
  'S-2500': 'evtProcTrab.xsd',
  'S-2501': 'evtContProc.xsd',
  'S-2555': 'evtConsolidContProc.xsd',
  'S-3000': 'evtExclusao.xsd',
  'S-3500': 'evtExcProcTrab.xsd',
};

const SIGNATURE_STUB = `
<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <ds:SignedInfo>
    <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315" />
    <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256" />
    <ds:Reference URI="#ID0000000000000000000000000000000000">
      <ds:Transforms>
        <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature" />
        <ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315" />
      </ds:Transforms>
      <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256" />
      <ds:DigestValue>AA==</ds:DigestValue>
    </ds:Reference>
  </ds:SignedInfo>
  <ds:SignatureValue>AA==</ds:SignatureValue>
  <ds:KeyInfo>
    <ds:X509Data>
      <ds:X509Certificate>AA==</ds:X509Certificate>
    </ds:X509Data>
  </ds:KeyInfo>
</ds:Signature>`;

@Injectable()
export class XsdValidatorService {
  private readonly xsdDir = this.resolveXsdDir();
  private readonly schemaCache = new Map<string, libxml.Document>();
  private readonly manifest: ESocialXsdManifest;

  constructor() {
    this.manifest = JSON.parse(
      readFileSync(join(this.xsdDir, 'xsd-bundle.manifest.json'), 'utf8'),
    ) as ESocialXsdManifest;
  }

  validate(
    eventKind: string,
    xml: string,
    options: { allowUnsigned?: boolean } = {},
  ): XsdValidationResult {
    const normalizedEventKind = this.normalizeEventKind(eventKind);
    const xsdFile = XSD_BY_EVENT_KIND[normalizedEventKind];
    if (!xsdFile) {
      throw new BadRequestException(
        `Unsupported eSocial event kind for S-1.3 XSD validation: ${eventKind}`,
      );
    }

    const xsdPath = join(this.xsdDir, xsdFile);
    this.assertBundleIntegrity(xsdFile);
    const candidateXml = options.allowUnsigned
      ? this.withSignatureStub(xml)
      : xml;
    const document = libxml.parseXml(candidateXml, { baseUrl: xsdPath });
    const schema = this.schemaFor(xsdPath);
    const valid = document.validate(schema);
    return {
      valid,
      eventKind: normalizedEventKind,
      xsdPath,
      errors: document.validationErrors.map((error) => ({
        message: error.message.trim(),
        line: error.line ?? undefined,
        column: error.column ?? undefined,
      })),
    };
  }

  assertValid(
    eventKind: string,
    xml: string,
    options: { allowUnsigned?: boolean } = {},
  ): XsdValidationResult {
    const result = this.validate(eventKind, xml, options);
    if (!result.valid) {
      throw new BadRequestException(
        `eSocial ${result.eventKind} XML failed XSD validation: ${result.errors
          .map((error) => error.message)
          .join('; ')}`,
      );
    }
    return result;
  }

  bundleHash(fileName: string): string {
    return this.sha256(join(this.xsdDir, fileName));
  }

  manifestFileCount(): number {
    return this.xsdFileNames().length;
  }

  xsdFileNames(): string[] {
    return readdirSync(this.xsdDir)
      .filter((fileName) => fileName.endsWith('.xsd'))
      .sort();
  }

  private schemaFor(xsdPath: string): libxml.Document {
    const cached = this.schemaCache.get(xsdPath);
    if (cached) return cached;
    const schema = libxml.parseXml(readFileSync(xsdPath, 'utf8'), {
      baseUrl: xsdPath,
    });
    this.schemaCache.set(xsdPath, schema);
    return schema;
  }

  private withSignatureStub(xml: string): string {
    if (/<(?:\w+:)?Signature\b/.test(xml)) return xml;
    return xml.replace(/<\/eSocial>\s*$/u, `${SIGNATURE_STUB}</eSocial>`);
  }

  private normalizeEventKind(eventKind: string): string {
    return eventKind.trim().toUpperCase();
  }

  private assertBundleIntegrity(xsdFile: string): void {
    const hash = this.manifest.files[xsdFile];
    if (hash && this.sha256(join(this.xsdDir, xsdFile)) !== hash) {
      throw new Error(
        `eSocial XSD bundle integrity check failed for ${xsdFile}`,
      );
    }
  }

  private sha256(path: string): string {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  }

  private resolveXsdDir(): string {
    const candidates = [
      join(process.cwd(), 'src/esocial-worker/xsd'),
      join(process.cwd(), 'backend/src/esocial-worker/xsd'),
    ];
    const found = candidates.find((candidate) =>
      existsSync(join(candidate, 'xsd-bundle.manifest.json')),
    );
    if (!found) {
      throw new Error(
        'eSocial XSD bundle was not found in the local source tree',
      );
    }
    return found;
  }
}
