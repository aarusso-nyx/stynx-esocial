import { BadRequestException, Injectable } from '@nestjs/common';

import {
  ParsedIdentity,
  attributeText,
  childElements,
  directChildElements,
  directChildText,
  firstElement,
  firstOptionalText,
  firstText,
  parseIdentity,
  parseXmlDocument,
  soapFaultText,
} from './xml-parser-utils';

export interface ReturnOccurrence {
  type: 'ERROR' | 'WARNING' | 'HISTORY';
  code: string;
  description: string;
  location: string | null;
}

export interface EventProcessingReturn {
  eventReference: string;
  duplicate: boolean;
  responseCode: string;
  responseDescription: string;
  receipt: string | null;
  processedAt: string | null;
  errors: ReturnOccurrence[];
  rawXml: string;
}

export interface BatchProcessingReturn {
  protocol: string | null;
  responseCode: string;
  responseDescription: string;
  estimatedConclusionSeconds: number | null;
  receivedAt: string | null;
  processedAt: string | null;
  employer: ParsedIdentity | null;
  transmitter: ParsedIdentity | null;
  occurrences: ReturnOccurrence[];
  events: EventProcessingReturn[];
}

@Injectable()
export class ProcessingParser {
  parse(xml: string): BatchProcessingReturn {
    return parseProcessingResponseXml(xml);
  }
}

export function parseProcessingResponseXml(xml: string): BatchProcessingReturn {
  const document = parseXmlDocument(xml, 'eSocial processing response');
  const fault = soapFaultText(document);
  if (fault) {
    throw new BadRequestException(`eSocial processing SOAP fault: ${fault}`);
  }

  const status = firstElement(document, 'status');
  if (!status) {
    throw new BadRequestException(
      'eSocial processing return is missing status',
    );
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

function parseEventReturns(
  document: ReturnType<typeof parseXmlDocument>,
): EventProcessingReturn[] {
  const retornoEventos = firstElement(document, 'retornoEventos');
  if (!retornoEventos) return [];
  return directChildElements(retornoEventos, 'evento').map((eventNode) => {
    const retornoEvento = firstElement(eventNode, 'retornoEvento');
    const processing = retornoEvento
      ? firstElement(retornoEvento, 'processamento')
      : null;
    const eventReference = attributeText(eventNode, 'Id');
    if (!eventReference) {
      throw new BadRequestException(
        'eSocial processing event return is missing Id',
      );
    }
    if (!processing) {
      throw new BadRequestException(
        `eSocial processing event ${eventReference} is missing processamento`,
      );
    }
    const rawXml = retornoEvento?.toString() ?? eventNode.toString();
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
      rawXml,
    };
  });
}

function parseOccurrences(
  node:
    | ReturnType<typeof parseXmlDocument>
    | Parameters<typeof firstElement>[0],
): ReturnOccurrence[] {
  const containers = childElements(node, 'ocorrencias');
  return containers.flatMap((container) =>
    directChildElements(container, 'ocorrencia').map((occurrence) => {
      const code = directChildText(occurrence, 'codigo');
      const description = directChildText(occurrence, 'descricao');
      if (!code || !description) {
        throw new BadRequestException(
          'eSocial occurrence is missing codigo or descricao',
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
