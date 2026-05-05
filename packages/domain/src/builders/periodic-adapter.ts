import {
  type BuiltPeriodicXmlEvent,
  type PeriodicEventDto,
  buildPeriodicEvent,
} from '../xml/builders/periodic/index.js';

import {
  type BuilderMetadata,
  type BuiltXml,
  DtoValidationError,
  builtXml,
} from './common.js';

export class MissingReceiptReference extends DtoValidationError {
  constructor(fieldPath: string) {
    super([fieldPath]);
    this.name = 'MissingReceiptReference';
  }
}

export function buildPromotedPeriodicXml(dto: PeriodicEventDto): BuiltXml {
  const built = buildPeriodicEvent(dto);
  if (built.length === 0) throw new DtoValidationError(['periodicEvents']);
  const first = built[0];
  if (!first) throw new DtoValidationError(['periodicEvents']);
  const xml = `${built.map((record) => record.xml.trimEnd()).join('\n---\n')}\n`;
  return builtXml(
    xml,
    metadataFromPeriodicEvent(first),
    built.map((record) => record.eventId),
  );
}

export function metadataFromPeriodicEvent(
  built: BuiltPeriodicXmlEvent,
): BuilderMetadata {
  return {
    eventCode: built.metadata.eventCode,
    leiauteVersion: built.metadata.leiauteVersion,
    xmlRoot: built.metadata.rootElement,
    eventElement: built.metadata.eventElement,
    namespace: built.metadata.namespace,
    xsdBinding: built.metadata.xsdPath,
    tableVersionDependencies: built.metadata.tableVersionDependencies,
    receiptDependencies: built.metadata.receiptDependencies,
  };
}
