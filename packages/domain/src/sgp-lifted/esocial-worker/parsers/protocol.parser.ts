import { BadRequestException, Injectable } from '@nestjs/common';

import {
  ParsedIdentity,
  firstElement,
  firstOptionalText,
  firstText,
  parseIdentity,
  parseXmlDocument,
  soapFaultText,
} from './xml-parser-utils';

export interface ProtocolParseResult {
  protocol: string;
  responseCode: string | null;
  responseDescription: string | null;
  receivedAt: string | null;
  employer: ParsedIdentity | null;
  transmitter: ParsedIdentity | null;
}

@Injectable()
export class ProtocolParser {
  parse(xml: string): ProtocolParseResult {
    return parseProtocolResponseXml(xml);
  }
}

export function parseProtocolResponseXml(xml: string): ProtocolParseResult {
  const document = parseXmlDocument(xml, 'eSocial protocol response');
  const fault = soapFaultText(document);
  if (fault) {
    throw new BadRequestException(`eSocial protocol SOAP fault: ${fault}`);
  }

  const protocol =
    firstOptionalText(document, 'protocoloEnvio') ??
    firstOptionalText(document, 'nrRecibo');
  if (!protocol) {
    throw new BadRequestException(
      'eSocial protocol return is missing protocoloEnvio',
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

export function protocolFromXml(xml: string): string {
  return firstText(
    parseXmlDocument(xml, 'eSocial protocol response'),
    'protocoloEnvio',
  );
}
